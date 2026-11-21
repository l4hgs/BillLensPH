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
  BedDouble,
  Building2,
  ChevronDown,
  ChevronUp,
  Columns2,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuditLineItemRow } from "@/components/audit/AuditLineItemRow";
import { AuditChatbotDrawer } from "@/components/audit/AuditChatbotDrawer";
import { OverrideModal } from "@/components/audit/OverrideModal";
import {
  SideBySideBillViewer,
  type BillImagePage,
} from "@/components/audit/SideBySideBillViewer";
import {
  TIER_META,
  TrafficLightSummary,
} from "@/components/audit/TrafficLight";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import {
  DEFAULT_ELIGIBILITY_SNAPSHOT,
  normalizeEligibilitySnapshot,
  normalizeStatutoryDiscountType,
  runAuditEngine,
} from "@/lib/auditEngine";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import {
  applyOverridesToBill,
  countOverrides,
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { getSampleBillById } from "@/lib/sampleAudits";
import { cn, formatPHP } from "@/lib/utils";
import type {
  AuditOverrides,
  AuditTier,
  CatalogPackage,
  EligibilitySnapshot,
  ExtractedBillData,
  ItemOverride,
  StatutoryDiscountType,
  StatutoryRule,
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
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [statutoryRule, setStatutoryRule] = useState<StatutoryRule | undefined>(
    undefined
  );
  const [statutoryRules, setStatutoryRules] = useState<StatutoryRule[]>([]);

  const [overrides, setOverrides] = useState<AuditOverrides>({});
  const [statutoryDiscountType, setStatutoryDiscountType] =
    useState<StatutoryDiscountType>("regular");
  const [eligibilitySnapshot, setEligibilitySnapshot] =
    useState<EligibilitySnapshot>(DEFAULT_ELIGIBILITY_SNAPSHOT);
  const [showEligibilityDrawer, setShowEligibilityDrawer] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const [activeTier, setActiveTier] = useState<AuditTier | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [billImages, setBillImages] = useState<BillImagePage[]>([]);
  const [showSideBySide, setShowSideBySide] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const sampleBill = getSampleBillById(id);
      if (sampleBill) {
        const catalog = await loadPackageCatalog(supabase);
        if (cancelled) return;
        let sampleOverrides: AuditOverrides = {};
        let sampleDiscountType: StatutoryDiscountType =
          normalizeStatutoryDiscountType(
            sampleBill.statutory_discount_type,
            Boolean(sampleBill.is_senior_or_pwd)
          );
        let sampleEligibility: EligibilitySnapshot =
          normalizeEligibilitySnapshot(sampleBill.eligibility_snapshot);
        try {
          const cached = sessionStorage.getItem(
            `billlens-sample-overrides-${id}`
          );
          if (cached) {
            const parsed = JSON.parse(cached) as {
              o?: AuditOverrides;
              s?: boolean;
              d?: StatutoryDiscountType;
              e?: EligibilitySnapshot;
            };
            if (isOverrides(parsed.o)) sampleOverrides = parsed.o;
            if (parsed.d) {
              sampleDiscountType = normalizeStatutoryDiscountType(parsed.d);
            } else if (typeof parsed.s === "boolean") {
              sampleDiscountType = parsed.s ? "senior" : "regular";
            }
            if (parsed.e) {
              sampleEligibility = normalizeEligibilitySnapshot(parsed.e);
            }
          }
        } catch {
          // Ignore storage parse error
        }
        setRawData({});
        setOcr(sampleBill);
        setOverrides(sampleOverrides);
        setStatutoryDiscountType(sampleDiscountType);
        setEligibilitySnapshot(sampleEligibility);
        setSavedSnapshot(
          JSON.stringify({
            o: sampleOverrides,
            d: sampleDiscountType,
            e: sampleEligibility,
          })
        );
        setPackages(catalog.packages);
        setStatutoryRule(catalog.statutoryRule);
        setStatutoryRules(catalog.statutoryRules ?? []);
        setLoadState("ready");
        return;
      }

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
      const loadedDiscountType = normalizeStatutoryDiscountType(
        raw.statutory_discount_type ?? loadedOcr?.statutory_discount_type,
        loadedSenior
      );
      const loadedEligibility = normalizeEligibilitySnapshot(
        (row as Record<string, unknown>).eligibility_snapshot ??
          raw.eligibility_snapshot ??
          loadedOcr?.eligibility_snapshot
      );

      const catalog = await loadPackageCatalog(supabase);

      // Extract storage paths for bill images / PDFs
      const files = Array.isArray(raw.files)
        ? (raw.files as Array<Record<string, unknown>>)
        : [];
      const storagePaths: string[] = [];
      for (const f of files) {
        if (typeof f?.path === "string" && f.path.trim()) {
          storagePaths.push(f.path);
        }
      }
      if (storagePaths.length === 0 && Array.isArray(raw.storage_paths)) {
        for (const p of raw.storage_paths) {
          if (typeof p === "string" && p.trim()) {
            storagePaths.push(p);
          }
        }
      }

      let loadedImages: BillImagePage[] = [];
      if (storagePaths.length > 0) {
        try {
          const { data: signedResults } = await supabase.storage
            .from("bill-uploads")
            .createSignedUrls(storagePaths, 3600);

          if (signedResults) {
            loadedImages = signedResults
              .filter((res) => Boolean(res.signedUrl))
              .map((res, idx) => ({
                url: res.signedUrl!,
                name: (files[idx]?.original_name as string) || `Page ${idx + 1}`,
                mimeType: (files[idx]?.mime_type as string) || "image/jpeg",
              }));
          }
        } catch (err) {
          console.warn("Could not load signed URLs for side-by-side bill view:", err);
        }
      }

      if (loadedImages.length === 0 && files.length > 0) {
        loadedImages = files
          .filter((f) => typeof f.signed_url === "string" && f.signed_url.trim())
          .map((f, idx) => ({
            url: f.signed_url as string,
            name: (f.original_name as string) || `Page ${idx + 1}`,
            mimeType: (f.mime_type as string) || "image/jpeg",
          }));
      }

      if (cancelled) return;

      setBillImages(loadedImages);
      setRawData(raw);
      setOcr(loadedOcr);
      setOverrides(loadedOverrides);
      setStatutoryDiscountType(loadedDiscountType);
      setEligibilitySnapshot(loadedEligibility);
      setSavedSnapshot(
        JSON.stringify({
          o: loadedOverrides,
          d: loadedDiscountType,
          e: loadedEligibility,
        })
      );
      setPackages(catalog.packages);
      setStatutoryRule(catalog.statutoryRule);
      setStatutoryRules(catalog.statutoryRules ?? []);
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
      statutoryDiscountType,
      isSeniorOrPwdOverride: statutoryDiscountType !== "regular",
      eligibilitySnapshot,
      referencePackages: packages,
      statutoryRule,
      statutoryRules,
      manualStatusOverrides: statusOverridesFrom(overrides),
    });
  }, [
    ocr,
    overrides,
    statutoryDiscountType,
    eligibilitySnapshot,
    packages,
    statutoryRule,
    statutoryRules,
    id,
  ]);

  const isDirty =
    savedSnapshot !== "" &&
    JSON.stringify({
      o: overrides,
      d: statutoryDiscountType,
      e: eligibilitySnapshot,
    }) !== savedSnapshot;

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
        d?: StatutoryDiscountType;
        s?: boolean;
        e?: EligibilitySnapshot;
      };
      setOverrides(snapshot.o);
      setStatutoryDiscountType(
        normalizeStatutoryDiscountType(snapshot.d, snapshot.s)
      );
      setEligibilitySnapshot(normalizeEligibilitySnapshot(snapshot.e));
    } catch {
      setOverrides({});
    }
    setActionError(null);
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    setActionError(null);

    if (getSampleBillById(id)) {
      try {
        sessionStorage.setItem(
          `billlens-sample-overrides-${id}`,
          JSON.stringify({
            o: overrides,
            d: statutoryDiscountType,
            s: statutoryDiscountType !== "regular",
            e: eligibilitySnapshot,
          })
        );
      } catch {
        // Ignore storage error
      }
      setIsSaving(false);
      setSavedSnapshot(
        JSON.stringify({
          o: overrides,
          d: statutoryDiscountType,
          e: eligibilitySnapshot,
        })
      );
      setSavedNotice(true);
      return;
    }

    const updatedRaw = {
      ...rawData,
      overrides: overrides as unknown as Json,
      statutory_discount_type: statutoryDiscountType,
      is_senior_or_pwd: statutoryDiscountType !== "regular",
      eligibility_snapshot: eligibilitySnapshot as unknown as Json,
    };

    const fullPayload = {
      hospital_name: result.hospital_name,
      total_billed: result.gross_total,
      estimated_out_of_pocket: result.fair_out_of_pocket,
      eligibility_snapshot: eligibilitySnapshot as unknown as Json,
      raw_extracted_data: updatedRaw,
      audit_results: result as unknown as Json,
    };

    let { data, error } = await supabase
      .from("audits")
      .update(fullPayload)
      .eq("id", id)
      .select("id");

    if (error && /eligibility_snapshot/i.test(error.message)) {
      const fallbackPayload = { ...fullPayload };
      delete (fallbackPayload as Record<string, unknown>).eligibility_snapshot;
      const retry = await supabase
        .from("audits")
        .update(fallbackPayload)
        .eq("id", id)
        .select("id");
      data = retry.data;
      error = retry.error;
    }

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

    setRawData(updatedRaw);
    setSavedSnapshot(
      JSON.stringify({
        o: overrides,
        d: statutoryDiscountType,
        e: eligibilitySnapshot,
      })
    );
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
        body: JSON.stringify({
          auditId: id,
          statutoryDiscountType,
          isSeniorOrPwd: statutoryDiscountType !== "regular",
          eligibilitySnapshot,
        }),
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
      <div className="w-full max-w-5xl mx-auto space-y-6">
        {backLink}
        <Card className="bg-white">
          <CardContent className="space-y-4 p-6 text-center md:p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
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

            <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left">
              <span className="block text-[11px] font-bold text-slate-800">
                Patient Statutory Privilege (RA 9994 / RA 10754)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "regular", label: "Regular" },
                    { id: "senior", label: "Senior (60+)" },
                    { id: "pwd", label: "PWD (RA 10754)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setStatutoryDiscountType(opt.id)}
                    className={cn(
                      "cursor-pointer rounded-full px-2.5 py-2 text-[11px] font-bold transition-all",
                      statutoryDiscountType === opt.id
                        ? "bg-blue-600 text-white shadow-xs"
                        : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

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
    result.disputed_overcharge_total +
    result.senior_pwd_savings +
    (result.case_rate_shortfall ?? 0) +
    (result.nbb_savings ?? 0) +
    Math.max(0, result.arithmetic_discrepancy ?? 0);
  const hasMatchedPackage = result.detected_case_packages.length > 0;

  return (
    <div
      className={cn(
        "w-full mx-auto space-y-6 transition-all duration-200",
        showSideBySide && billImages.length > 0
          ? "max-w-7xl px-3 sm:px-6"
          : "max-w-5xl px-4 sm:px-6"
      )}
    >
      {backLink}

      {/* Bill header */}
      <Card className="bg-white">
        <CardContent className="space-y-3 p-4 sm:p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-3">
            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600">
                <Building2 className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-lg font-bold leading-snug tracking-tight text-slate-900 break-words">
                  {result.hospital_name}
                </h1>
                <p className="mt-0.5 text-[11px] sm:text-xs text-slate-600 leading-relaxed break-words">
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
            <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
              {billImages.length > 0 && (
                <Button
                  type="button"
                  variant={showSideBySide ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setShowSideBySide((prev) => !prev)}
                  className="font-bold flex items-center gap-1.5 cursor-pointer shadow-soft"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {showSideBySide ? "Hide Statement Photo" : "Side-by-Side Bill"}
                  </span>
                  <span className="sm:hidden">
                    {showSideBySide ? "Hide Bill" : "View Bill"}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-bold ml-0.5",
                      showSideBySide
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    )}
                  >
                    {billImages.length}
                  </span>
                </Button>
              )}
              <Link href={`/audits/${id}/brief`}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-bold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export Brief</span>
                  <span className="sm:hidden">Brief</span>
                </Button>
              </Link>
              {!getSampleBillById(id) && (
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
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {hasMatchedPackage ? (
              result.detected_case_packages.map((pkg) => {
                const isUnverified =
                  pkg.is_verified === false ||
                  Boolean(pkg.source_url?.startsWith("ai_grounded"));
                return (
                  <React.Fragment key={pkg.code}>
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      <ShieldCheck className="h-3 w-3" />
                      {pkg.keyword} · {pkg.code} · {formatPHP(pkg.total_rate)}
                    </span>
                    {isUnverified && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                        <Sparkles className="h-2.5 w-2.5 text-amber-600" />
                        AI-Estimated (Unverified)
                      </span>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                No PhilHealth case package matched
              </span>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Patient Statutory Privilege
                <span className="ml-1.5 font-normal text-slate-500">
                  RA 9994 (OSCA) / RA 10754 (PDAO)
                </span>
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Mutually Exclusive
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "regular", label: "Regular" },
                  { id: "senior", label: "Senior Citizen (60+)" },
                  { id: "pwd", label: "PWD (RA 10754)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setStatutoryDiscountType(opt.id);
                    setSavedNotice(false);
                  }}
                  className={cn(
                    "cursor-pointer rounded-full px-2.5 py-2 text-[11px] font-bold transition-all",
                    statutoryDiscountType === opt.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Collapsible PhilHealth Membership & Ward Info Drawer (Migration 007) */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowEligibilityDrawer((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <BedDouble className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="text-xs font-semibold text-slate-800">
                  PhilHealth Membership &amp; Ward Info
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {eligibilitySnapshot.contributor_type === "indirect_nbb"
                    ? "Indirect (NBB)"
                    : eligibilitySnapshot.contributor_type === "direct"
                      ? "Direct"
                      : eligibilitySnapshot.contributor_type === "lifetime"
                        ? "Lifetime"
                        : "Member: Auto"}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {eligibilitySnapshot.accommodation_type === "basic_ward"
                    ? "Basic / Ward"
                    : eligibilitySnapshot.accommodation_type ===
                        "non_basic_private"
                      ? "Private Room"
                      : "Ward: Auto"}
                </span>
                {!eligibilitySnapshot.has_mdr_or_pin && (
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    MDR Needed
                  </span>
                )}
              </div>
              {showEligibilityDrawer ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              )}
            </button>

            {showEligibilityDrawer && (
              <div className="space-y-3 border-t border-slate-200/80 bg-white/70 p-3.5">
                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                    Contributor Type (NBB Eligibility)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {(
                      [
                        { id: "unknown", label: "Not Sure" },
                        { id: "direct", label: "Direct" },
                        { id: "indirect_nbb", label: "Indirect / NBB" },
                        { id: "lifetime", label: "Lifetime" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setEligibilitySnapshot((prev) => ({
                            ...prev,
                            contributor_type: opt.id,
                          }));
                          setSavedNotice(false);
                        }}
                        className={cn(
                          "cursor-pointer rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-all",
                          eligibilitySnapshot.contributor_type === opt.id
                            ? "bg-blue-600 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                    Room / Ward Accommodation
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: "unknown", label: "Not Sure" },
                        { id: "basic_ward", label: "Basic / Ward (NBB)" },
                        { id: "non_basic_private", label: "Private Room" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setEligibilitySnapshot((prev) => ({
                            ...prev,
                            accommodation_type: opt.id,
                          }));
                          setSavedNotice(false);
                        }}
                        className={cn(
                          "cursor-pointer rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-all",
                          eligibilitySnapshot.accommodation_type === opt.id
                            ? "bg-blue-600 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                      PhilHealth MDR / PIN Presented?
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { val: true, label: "Yes, Presented" },
                          { val: false, label: "Not Yet" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={String(opt.val)}
                          type="button"
                          onClick={() => {
                            setEligibilitySnapshot((prev) => ({
                              ...prev,
                              has_mdr_or_pin: opt.val,
                            }));
                            setSavedNotice(false);
                          }}
                          className={cn(
                            "cursor-pointer rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-all",
                            eligibilitySnapshot.has_mdr_or_pin === opt.val
                              ? "bg-blue-600 text-white"
                              : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
                      Hospital Facility Level
                    </span>
                    <select
                      value={eligibilitySnapshot.facility_level}
                      onChange={(e) => {
                        setEligibilitySnapshot((prev) => ({
                          ...prev,
                          facility_level: e.target
                            .value as EligibilitySnapshot["facility_level"],
                        }));
                        setSavedNotice(false);
                      }}
                      className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800"
                    >
                      <option value="unknown">Auto / Not Sure</option>
                      <option value="level_1">Level 1 Hospital</option>
                      <option value="level_2">Level 2 Hospital</option>
                      <option value="level_3">Level 3 Tertiary</option>
                      <option value="asc">ASC / Dialysis Center</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!eligibilitySnapshot.has_mdr_or_pin && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <p className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                Pre-Discharge Checklist: Pull Your PhilHealth MDR / PIN Before Paying
              </p>
              <p className="mt-1">
                Sign in to the <strong>PhilHealth Member Portal</strong> (
                <code>memberinquiry.philhealth.gov.ph</code>) or open the{" "}
                <strong>eGovPH Super App</strong> on your phone to download your
                Member Data Record (MDR) and present your PIN to the hospital
                billing desk before final settlement.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side-by-Side Split View Container */}
      <div
        className={cn(
          "grid gap-6 items-start",
          showSideBySide && billImages.length > 0
            ? "grid-cols-1 lg:grid-cols-12"
            : "grid-cols-1"
        )}
      >
        {/* Left Column: Original Hospital Statement Document Viewer (Sticky on Desktop) */}
        {showSideBySide && billImages.length > 0 && (
          <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-20 z-10">
            <SideBySideBillViewer
              images={billImages}
              hospitalName={result.hospital_name}
              onClose={() => setShowSideBySide(false)}
              className="h-[calc(100vh-6.5rem)]"
            />
          </div>
        )}

        {/* Right Column: Financial Summaries & Itemized Line Items */}
        <div
          className={cn(
            "space-y-5 min-w-0",
            showSideBySide && billImages.length > 0
              ? "lg:col-span-7 xl:col-span-7"
              : "w-full"
          )}
        >
          {/* Unified Financial Summary & Traffic-Light Triage Dashboard */}
          <TrafficLightSummary
            items={result.line_items}
            activeTier={activeTier}
            onSelectTier={setActiveTier}
            grossTotal={result.gross_total}
            actualOutOfPocket={result.actual_out_of_pocket}
            potentialSavings={potentialSavings}
            fairOutOfPocket={result.fair_out_of_pocket}
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
        <p className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600 shadow-2xs">
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
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-xs text-slate-600 shadow-2xs">
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
        </div>
      </div>

      {/* Compact Floating Save / Confirmation Status Pill */}
      {(isDirty || savedNotice || actionError) && (
        <div className="sticky bottom-24 z-30 flex justify-center px-4 md:bottom-5 pointer-events-none">
          <div
            className="pointer-events-auto inline-flex flex-wrap items-center justify-between gap-3 rounded-full border border-slate-200/90 bg-white/95 px-4 py-2 shadow-lg backdrop-blur-md max-w-md"
            role="status"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  actionError
                    ? "bg-rose-500"
                    : isDirty
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                )}
              />
              <p
                className={cn(
                  "text-xs font-semibold whitespace-nowrap",
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
            </div>
            {isDirty && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="h-7 rounded-full px-3 text-[11px] font-semibold"
                >
                  <Undo2 className="h-3 w-3" />
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-7 rounded-full px-3.5 text-[11px] font-bold"
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
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

      <AuditChatbotDrawer auditId={id} auditResult={result} />
    </div>
  );
}
