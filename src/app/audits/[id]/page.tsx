"use client";

import React, {
  use,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuditLineItemRow } from "@/components/audit/AuditLineItemRow";
import { OverrideModal } from "@/components/audit/OverrideModal";
import {
  TIER_META,
  TrafficLightSummary,
} from "@/components/audit/TrafficLight";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { runAuditEngine, toMatchedPackage } from "@/lib/auditEngine";
import {
  applyOverridesToBill,
  countOverrides,
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { cn, formatPHP } from "@/lib/utils";
import type {
  AuditOverrides,
  AuditTier,
  ExtractedBillData,
  ItemOverride,
  MatchedCasePackage,
} from "@/types/audit";

type LoadState = "loading" | "ready" | "not_found" | "error";

function isExtractedBill(value: unknown): value is ExtractedBillData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ExtractedBillData).line_items)
  );
}

function isOverrides(value: unknown): value is AuditOverrides {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function AuditStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<Record<string, Json | undefined>>({});
  const [ocr, setOcr] = useState<ExtractedBillData | null>(null);
  const [packages, setPackages] = useState<MatchedCasePackage[]>([]);

  const [overrides, setOverrides] = useState<AuditOverrides>({});
  const [isSenior, setIsSenior] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const [activeTier, setActiveTier] = useState<AuditTier | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: row, error } = await supabase
        .from("audits")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
        setLoadState("error");
        return;
      }
      if (!row) {
        setLoadState("not_found");
        return;
      }

      const raw = (row.raw_extracted_data ?? {}) as Record<string, Json | undefined>;
      const loadedOcr = isExtractedBill(raw.ocr) ? raw.ocr : null;
      const loadedOverrides = isOverrides(raw.overrides) ? raw.overrides : {};
      const loadedSenior =
        typeof raw.is_senior_or_pwd === "boolean"
          ? raw.is_senior_or_pwd
          : Boolean(loadedOcr?.is_senior_or_pwd);

      // Reference packages power the unbundling checks; the engine falls back to
      // its built-in set if the table is empty or unreachable.
      const { data: pkgRows } = await supabase
        .from("philhealth_packages")
        .select("*");

      if (cancelled) return;

      setRawData(raw);
      setOcr(loadedOcr);
      setOverrides(loadedOverrides);
      setIsSenior(loadedSenior);
      setSavedSnapshot(JSON.stringify({ o: loadedOverrides, s: loadedSenior }));
      setPackages((pkgRows ?? []).map(toMatchedPackage));
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, id, reloadKey]);

  // Effective bill = pristine OCR + user edits. The audit is recomputed from it
  // on every change, so edits give instant feedback with no network round trip.
  const result = useMemo(() => {
    if (!ocr) return null;
    return runAuditEngine(applyOverridesToBill(ocr, overrides), {
      auditId: id,
      isSeniorOrPwdOverride: isSenior,
      referencePackages: packages,
      manualStatusOverrides: statusOverridesFrom(overrides),
    });
  }, [ocr, overrides, isSenior, packages, id]);

  const isDirty =
    savedSnapshot !== "" &&
    JSON.stringify({ o: overrides, s: isSenior }) !== savedSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const visibleItems = useMemo(() => {
    if (!result) return [];
    return activeTier
      ? result.line_items.filter((item) => item.status === activeTier)
      : result.line_items;
  }, [result, activeTier]);

  const billLevelFlags = useMemo(
    () => result?.flags.filter((flag) => !flag.item_id) ?? [],
    [result]
  );

  const editingItem = useMemo(
    () => result?.line_items.find((item) => item.id === editingId) ?? null,
    [result, editingId]
  );
  const editingOriginal = useMemo(
    () => ocr?.line_items.find((item) => item.id === editingId),
    [ocr, editingId]
  );

  const handleSaveOverride = (override: ItemOverride | null) => {
    if (!editingId) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (override) next[editingId] = override;
      else delete next[editingId];
      return next;
    });
    setSavedNotice(false);
    setEditingId(null);
  };

  const handleDiscard = () => {
    try {
      const snapshot = JSON.parse(savedSnapshot) as {
        o: AuditOverrides;
        s: boolean;
      };
      setOverrides(snapshot.o);
      setIsSenior(snapshot.s);
    } catch {
      setOverrides({});
    }
    setActionError(null);
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    setActionError(null);

    const { data, error } = await supabase
      .from("audits")
      .update({
        hospital_name: result.hospital_name,
        total_billed: result.gross_total,
        estimated_out_of_pocket: result.fair_out_of_pocket,
        raw_extracted_data: {
          ...rawData,
          overrides: overrides as unknown as Json,
          is_senior_or_pwd: isSenior,
        },
        audit_results: result as unknown as Json,
      })
      .eq("id", id)
      .select("id");

    setIsSaving(false);

    if (error) {
      setActionError(`Could not save changes: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setActionError(
        "Changes were not saved. Please make sure you are signed in to the account that owns this audit."
      );
      return;
    }

    setRawData((prev) => ({
      ...prev,
      overrides: overrides as unknown as Json,
      is_senior_or_pwd: isSenior,
    }));
    setSavedSnapshot(JSON.stringify({ o: overrides, s: isSenior }));
    setSavedNotice(true);
  };

  const handleAnalyze = async () => {
    if (
      ocr &&
      countOverrides(overrides) > 0 &&
      !window.confirm(
        "Re-analyzing replaces the AI reading and clears your edits. Continue?"
      )
    ) {
      return;
    }

    setIsAnalyzing(true);
    setActionError(null);
    try {
      const res = await fetch("/api/audit/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: id, isSeniorOrPwd: isSenior }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "AI analysis failed.");
      }
      setLoadState("loading");
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "AI analysis failed."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const backLink = (
    <Link
      href="/audits"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-blue-600"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Document Archive
    </Link>
  );

  if (loadState === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {backLink}
        <div
          className="flex items-center justify-center gap-2 rounded-3xl border border-slate-100 bg-white p-12 text-xs text-slate-600"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Loading audit...
        </div>
      </div>
    );
  }

  if (loadState === "not_found" || loadState === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {backLink}
        <Card className="bg-white">
          <CardContent className="space-y-3 p-6 text-center md:p-6">
            <AlertCircle className="mx-auto h-7 w-7 text-slate-400" />
            <h1 className="text-base font-bold text-slate-900">
              {loadState === "error"
                ? "We couldn't load this audit"
                : "Audit not found"}
            </h1>
            <p className="text-xs leading-relaxed text-slate-600">
              {loadState === "error"
                ? loadError
                : "It may have been deleted, or it belongs to a different account. Make sure you are signed in with the account that scanned this bill."}
            </p>
            <div className="flex flex-col justify-center gap-2 pt-1 sm:flex-row">
              <Link href={`/auth?next=/audits/${id}`}>
                <Button variant="primary" size="md" className="w-full">
                  Sign in
                </Button>
              </Link>
              <Link href="/audits">
                <Button variant="outline" size="md" className="w-full">
                  Back to archive
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Staged but never analyzed: offer to run the AI instead of an empty studio.
  if (!ocr || !result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 animate-in fade-in duration-300">
        {backLink}
        <Card className="bg-white">
          <CardContent className="space-y-4 p-6 text-center md:p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-bold text-slate-900">
                This bill hasn&apos;t been analyzed yet
              </h1>
              <p className="text-xs leading-relaxed text-slate-600">
                Your statement is uploaded securely. Run the AI audit to extract
                every line item and check it against PhilHealth case rates.
              </p>
            </div>

            <label className="mx-auto flex max-w-sm cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={isSenior}
                onChange={(e) => setIsSenior(e.target.checked)}
                disabled={isAnalyzing}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Patient is a Senior Citizen (60+) or PWD
            </label>

            {actionError && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {actionError}
              </p>
            )}

            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={isAnalyzing}
              onClick={handleAnalyze}
              className="font-bold"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing with Gemini Flash...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Analyze with AI OCR</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const potentialSavings =
    result.disputed_overcharge_total + result.senior_pwd_savings;
  const hasMatchedPackage = result.detected_case_packages.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-in fade-in duration-300 sm:space-y-5">
      {backLink}

      {/* Bill header */}
      <Card className="bg-white">
        <CardContent className="space-y-3 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900">
                  {result.hospital_name}
                </h1>
                <p className="mt-0.5 text-xs text-slate-600">
                  {[
                    result.statement_number && `Statement #${result.statement_number}`,
                    result.patient_name,
                    ocr.admission_date &&
                      `${ocr.admission_date}${ocr.discharge_date ? ` – ${ocr.discharge_date}` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Itemized Statement of Account"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAnalyze}
              disabled={isAnalyzing || isSaving}
              aria-label="Re-analyze with AI"
              className="shrink-0 text-slate-600"
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Re-analyze</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {hasMatchedPackage ? (
              result.detected_case_packages.map((pkg) => (
                <span
                  key={pkg.code}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {pkg.keyword} · {pkg.code} · {formatPHP(pkg.total_rate)}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                No PhilHealth case package matched
              </span>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-800">
              Senior Citizen (60+) or PWD
              <span className="ml-1.5 font-normal text-slate-500">
                RA 9994 / RA 10754
              </span>
            </span>
            <input
              type="checkbox"
              checked={isSenior}
              onChange={(e) => {
                setIsSenior(e.target.checked);
                setSavedNotice(false);
              }}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </CardContent>
      </Card>

      {/* Money summary */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Total billed
          </span>
          <span className="text-lg font-black text-slate-900">
            {formatPHP(result.gross_total)}
          </span>
          <span className="block text-[11px] text-slate-600">
            Hospital asks you to pay {formatPHP(result.actual_out_of_pocket)}
          </span>
        </div>
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Potential savings
          </span>
          <span className="text-lg font-black text-amber-900">
            {formatPHP(potentialSavings)}
          </span>
          <span className="block text-[11px] text-amber-800/80">
            Unbundled charges and missed discounts
          </span>
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            Fair balance due
          </span>
          <span className="text-lg font-black text-emerald-900">
            {formatPHP(result.fair_out_of_pocket)}
          </span>
          <span className="block text-[11px] text-emerald-800/80">
            If every flagged item is corrected
          </span>
        </div>
      </div>

      {/* Traffic-light breakdown */}
      <TrafficLightSummary
        items={result.line_items}
        activeTier={activeTier}
        onSelectTier={setActiveTier}
      />

      {/* Bill-level findings */}
      {billLevelFlags.length > 0 && (
        <div className="space-y-2">
          {billLevelFlags.map((flag, index) => (
            <div
              key={`${flag.type}-${index}`}
              className={cn(
                "rounded-2xl border px-3.5 py-3 text-xs leading-relaxed",
                TIER_META.review_worthy.callout
              )}
            >
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {flag.title}
              </p>
              <p className="mt-1">{flag.description}</p>
              {flag.potential_savings > 0 && (
                <p className="mt-1 font-bold">
                  Potential savings: {formatPHP(flag.potential_savings)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasMatchedPackage && (
        <p className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs leading-relaxed text-slate-600">
          No PhilHealth case package was matched to this bill, so unbundling
          checks were skipped. Only statutory Senior/PWD checks and your own
          overrides apply.
        </p>
      )}

      {/* Line items */}
      <section className="space-y-3" aria-labelledby="line-items-heading">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2
            id="line-items-heading"
            className="text-sm font-bold text-slate-900"
          >
            Line items{" "}
            <span className="font-normal text-slate-500">
              ({visibleItems.length}
              {activeTier ? ` of ${result.line_items.length}` : ""})
            </span>
          </h2>
          {activeTier && (
            <button
              type="button"
              onClick={() => setActiveTier(null)}
              className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline"
            >
              Show all
            </button>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-xs text-slate-600">
            {result.line_items.length === 0
              ? "No line items were detected on this statement. Try re-analyzing with a clearer photo."
              : `No items are classified as ${activeTier ? TIER_META[activeTier].label : "this tier"}.`}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visibleItems.map((item) => (
              <AuditLineItemRow
                key={item.id}
                item={item}
                original={ocr.line_items.find((o) => o.id === item.id)}
                override={overrides[item.id]}
                onEdit={() => setEditingId(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Save bar */}
      {(isDirty || savedNotice || actionError) && (
        <div className="sticky bottom-24 z-30 md:bottom-6">
          <div
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p
              className={cn(
                "px-1 text-xs font-semibold",
                actionError
                  ? "text-rose-700"
                  : isDirty
                    ? "text-slate-800"
                    : "text-emerald-700"
              )}
            >
              {actionError
                ? actionError
                : isDirty
                  ? "You have unsaved changes"
                  : "Changes saved"}
            </p>
            {isDirty && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 font-bold sm:flex-none"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save changes
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {editingItem && editingOriginal && (
        <OverrideModal
          key={editingItem.id}
          item={editingItem}
          original={editingOriginal}
          existing={overrides[editingItem.id]}
          onSave={handleSaveOverride}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
