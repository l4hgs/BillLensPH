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
  Eye,
  EyeOff,
  Loader2,
  Pencil,
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
import { AuditDetailSkeleton } from "@/components/audit/AuditSkeletons";
import { AuditChatbotDrawer } from "@/components/audit/AuditChatbotDrawer";
import { AuditParametersModal } from "@/components/audit/AuditParametersModal";
import { OverrideModal } from "@/components/audit/OverrideModal";
import { useToast } from "@/components/providers/ToastProvider";
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
  const toast = useToast();
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const openParamsModal = () => {
    setShowParamsModal(true);
  };

  const handleApplyParamsModal = (
    nextPrivilege: StatutoryDiscountType,
    nextEligibility: EligibilitySnapshot
  ) => {
    setStatutoryDiscountType(nextPrivilege);
    setEligibilitySnapshot(nextEligibility);
    setShowParamsModal(false);
    toast.success("Audit parameters updated");
  };

  const [activeTier, setActiveTier] = useState<AuditTier | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [billImages, setBillImages] = useState<BillImagePage[]>([]);
  const [showSideBySide, setShowSideBySide] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setEditingId(null);
    toast.success(override ? "Line item updated" : "Line item reset");
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
    toast.info("Changes discarded");
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
      toast.success("Changes saved");
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
      const msg = `Could not save changes: ${error.message}`;
      setActionError(msg);
      toast.error(msg);
      return;
    }
    if (!data || data.length === 0) {
      const msg =
        "Changes were not saved. Please make sure you are signed in to the account that owns this audit.";
      setActionError(msg);
      toast.error(msg);
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
    toast.success("Changes saved");
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
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-md"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Document Archive</span>
    </Link>
  );

  if (loadState === "loading") {
    return <AuditDetailSkeleton />;
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

  // Staged but never analyzed: full-width editorial layout with Archive-style header + Edit modal.
  if (!ocr || !result) {
    return (
      <div className="w-full max-w-none space-y-4 sm:space-y-5">
        {/* Editorial Header */}
        <div className="space-y-2.5 sm:space-y-3 border-b border-slate-200/80 pb-4 sm:pb-5">
          {backLink}

          <div className="space-y-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900">
              This bill hasn&apos;t been analyzed yet
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-500 max-w-2xl">
              Your statement is uploaded securely. Set patient privilege or
              PhilHealth ward details if needed, then run the AI audit to
              extract every line item and check it against PhilHealth case rates.
            </p>
          </div>

          {/* Compact Privilege & PhilHealth Summary + Right-Aligned Edit Action */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-0.5 text-[11px] sm:text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-0.5 min-w-0 leading-relaxed">
              <span className="whitespace-nowrap">
                Privilege:{" "}
                <strong className="font-semibold text-slate-900">
                  {statutoryDiscountType === "senior"
                    ? "Senior (60+)"
                    : statutoryDiscountType === "pwd"
                      ? "PWD (RA 10754)"
                      : "Regular"}
                </strong>
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                Member:{" "}
                <strong className="font-semibold text-slate-900">
                  {eligibilitySnapshot.contributor_type === "indirect_nbb"
                    ? "Indirect (NBB)"
                    : eligibilitySnapshot.contributor_type === "direct"
                      ? "Direct"
                      : eligibilitySnapshot.contributor_type === "lifetime"
                        ? "Lifetime"
                        : "Auto"}
                </strong>
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                Ward:{" "}
                <strong className="font-semibold text-slate-900">
                  {eligibilitySnapshot.accommodation_type === "basic_ward"
                    ? "Basic / Ward"
                    : eligibilitySnapshot.accommodation_type === "non_basic_private"
                      ? "Private"
                      : "Auto"}
                </strong>
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="whitespace-nowrap">
                MDR:{" "}
                <strong className="font-semibold text-slate-900">
                  {eligibilitySnapshot.has_mdr_or_pin ? "Yes" : "Not Yet"}
                </strong>
              </span>

              {!eligibilitySnapshot.has_mdr_or_pin && (
                <>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-semibold text-amber-700 whitespace-nowrap">MDR Needed</span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={openParamsModal}
              aria-label="Edit privilege and PhilHealth membership details"
              className="shrink-0 min-h-[44px] sm:min-h-[32px] px-1.5 sm:px-2 -mr-1.5 sm:-mr-2 rounded-lg text-[11px] sm:text-xs font-semibold text-[#2563EB] hover:bg-blue-50/70 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <Pencil className="h-3 w-3 shrink-0" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800"
          >
            {actionError}
          </p>
        )}

        {/* Inline Analyze CTA below the parameters divider */}
        <div>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={isAnalyzing}
            onClick={handleAnalyze}
            className="w-full sm:w-auto min-h-[46px] px-7 font-bold text-xs sm:text-sm"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <span>Analyze</span>
            )}
          </Button>
        </div>

        <AuditParametersModal
          open={showParamsModal}
          privilege={statutoryDiscountType}
          eligibility={eligibilitySnapshot}
          onClose={() => setShowParamsModal(false)}
          onApply={handleApplyParamsModal}
          subtitle="Set patient privilege and PhilHealth ward details before running the audit."
          applyLabel="Apply"
        />
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
    <div className="w-full max-w-none space-y-4 sm:space-y-5 -mb-24 lg:mb-0">
      {backLink}

      {/* Full-Width Editorial Header & Audit Parameters */}
      <header className="w-full border-b border-slate-200/80 pb-3.5 sm:pb-4 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold leading-tight tracking-[-0.025em] text-slate-900 break-words">
              {result.hospital_name}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 font-medium leading-snug break-words">
              {[
                result.statement_number && `Statement #${result.statement_number}`,
                result.patient_name,
                ocr.admission_date &&
                  `${ocr.admission_date}${ocr.discharge_date ? ` – ${ocr.discharge_date}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Itemized Statement of Account"}
            </p>

            {/* Compact Case Rate Context Tag */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {hasMatchedPackage ? (
                result.detected_case_packages.map((pkg) => {
                  const isUnverified =
                    pkg.is_verified === false ||
                    Boolean(pkg.source_url?.startsWith("ai_grounded"));
                  return (
                    <React.Fragment key={pkg.code}>
                      <span className="inline-flex items-center rounded-md bg-blue-50/80 px-2 py-0.5 text-[11px] font-semibold text-[#2563EB]">
                        {pkg.keyword} · {pkg.code} · {formatPHP(pkg.total_rate)}
                      </span>
                      {isUnverified && (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          AI-Estimated (Unverified)
                        </span>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  No PhilHealth case package matched
                </span>
              )}
            </div>
          </div>

          {/* Clean Header Action Controls (Export Brief is primary CTA; Photo toggle & Re-analyze are subtle) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:shrink-0">
            <Link
              href={`/audits/${id}/brief`}
              className="min-h-[40px] sm:min-h-[44px] px-3 sm:px-5 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] sm:text-xs font-bold shadow-sm shadow-blue-500/20 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <Printer className="h-3.5 w-3.5 shrink-0" />
              <span>Export Brief</span>
            </Link>

            {billImages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSideBySide((prev) => !prev)}
                aria-label={
                  showSideBySide
                    ? `Hide statement photo (${billImages.length})`
                    : `Show statement photo (${billImages.length})`
                }
                title={showSideBySide ? "Hide statement photo" : "Show statement photo"}
                className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                {showSideBySide ? (
                  <EyeOff className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                )}
                <span>
                  {showSideBySide ? "Hide Photo" : "Show Photo"}
                  {billImages.length > 1 && (
                    <span className="hidden sm:inline">{` (${billImages.length})`}</span>
                  )}
                </span>
              </button>
            )}

            {!getSampleBillById(id) && (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing || isSaving}
                aria-label="Re-analyze with AI"
                className="min-h-[40px] sm:min-h-[44px] px-2 sm:px-3 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>Re-analyze</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact Privilege & PhilHealth Summary + Right-Aligned Edit Action */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-0.5 text-[11px] sm:text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-0.5 min-w-0 leading-relaxed">
            <span className="whitespace-nowrap">
              Privilege:{" "}
              <strong className="font-semibold text-slate-900">
                {statutoryDiscountType === "senior"
                  ? "Senior (60+)"
                  : statutoryDiscountType === "pwd"
                    ? "PWD (RA 10754)"
                    : "Regular"}
              </strong>
            </span>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="whitespace-nowrap">
              Member:{" "}
              <strong className="font-semibold text-slate-900">
                {eligibilitySnapshot.contributor_type === "indirect_nbb"
                  ? "Indirect (NBB)"
                  : eligibilitySnapshot.contributor_type === "direct"
                    ? "Direct"
                    : eligibilitySnapshot.contributor_type === "lifetime"
                      ? "Lifetime"
                      : "Auto"}
              </strong>
            </span>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="whitespace-nowrap">
              Ward:{" "}
              <strong className="font-semibold text-slate-900">
                {eligibilitySnapshot.accommodation_type === "basic_ward"
                  ? "Basic / Ward"
                  : eligibilitySnapshot.accommodation_type === "non_basic_private"
                    ? "Private"
                    : "Auto"}
              </strong>
            </span>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="whitespace-nowrap">
              MDR:{" "}
              <strong className="font-semibold text-slate-900">
                {eligibilitySnapshot.has_mdr_or_pin ? "Yes" : "Not Yet"}
              </strong>
            </span>

            {!eligibilitySnapshot.has_mdr_or_pin && (
              <>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-semibold text-amber-700 whitespace-nowrap">MDR Needed</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openParamsModal}
            aria-label="Edit privilege and PhilHealth membership details"
            className="shrink-0 min-h-[44px] sm:min-h-[32px] px-1.5 sm:px-2 -mr-1.5 sm:-mr-2 rounded-lg text-[11px] sm:text-xs font-semibold text-[#2563EB] hover:bg-blue-50/70 transition-colors inline-flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Pencil className="h-3 w-3 shrink-0" />
            <span>Edit</span>
          </button>
        </div>
      </header>

      {/* Side-by-Side Split View Container (Smooth Expand/Collapse Animation) */}
      <div className="flex flex-col lg:flex-row lg:items-start transition-all duration-300 ease-out motion-reduce:transition-none">
        {/* Left Column: Original Hospital Statement Document Viewer (Sticky on Desktop) */}
        {billImages.length > 0 && (
          <div
            aria-hidden={!showSideBySide}
            className={cn(
              "transition-[width,margin,opacity,max-height] duration-300 ease-out motion-reduce:transition-none shrink-0",
              showSideBySide
                ? "w-full lg:w-[42%] lg:mr-8 mb-5 lg:mb-0 opacity-100 max-h-[850px] lg:max-h-none lg:sticky lg:top-24 z-10"
                : "w-full lg:w-0 lg:mr-0 mb-0 opacity-0 max-h-0 overflow-hidden pointer-events-none invisible"
            )}
          >
            <SideBySideBillViewer
              images={billImages}
              hospitalName={result.hospital_name}
              onClose={() => setShowSideBySide(false)}
            />
          </div>
        )}

        {/* Right Column: Sticky Financial Summary + Independently Scrollable Line Items */}
        <div
          className={cn(
            "flex-1 min-w-0 flex flex-col space-y-3 sm:space-y-4 sticky top-[68px] sm:top-[76px] lg:top-24 h-[calc(100dvh-4.75rem)] sm:h-[calc(100dvh-5.25rem)] lg:h-[calc(100vh-9.5rem)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          )}
        >
          {/* Unified Financial Summary & Traffic-Light Triage Dashboard */}
          <div className="shrink-0">
            <TrafficLightSummary
              items={result.line_items}
              activeTier={activeTier}
              onSelectTier={setActiveTier}
              grossTotal={result.gross_total}
              actualOutOfPocket={result.actual_out_of_pocket}
              potentialSavings={potentialSavings}
              fairOutOfPocket={result.fair_out_of_pocket}
            />
          </div>

      {/* Bill-level findings (Clean Editorial Left-Accent Callout, No Box) */}
      {billLevelFlags.length > 0 && (
        <div className="shrink-0 space-y-3 border-b border-slate-200/80 pb-4">
          {billLevelFlags.map((flag, index) => (
            <div
              key={`${flag.type}-${index}`}
              className="border-l-2 border-amber-500 pl-3.5 py-0.5 text-xs leading-relaxed"
            >
              <p className="font-bold text-slate-900">{flag.title}</p>
              <p className="mt-0.5 text-slate-600">{flag.description}</p>
              {flag.potential_savings > 0 && (
                <p className="mt-1 text-slate-500">
                  Potential savings:{" "}
                  <span className="font-bold text-amber-700 font-mono tabular-nums">
                    {formatPHP(flag.potential_savings)}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasMatchedPackage && (
        <p className="shrink-0 border-y border-slate-200/80 py-2.5 px-1 text-xs text-slate-500">
          Unbundling checks skipped (no PhilHealth case package matched); statutory discounts and overrides still apply.
        </p>
      )}

      {/* Line items (Independently Scrollable Across Mobile, Tablet, and Desktop; Hidden Scrollbar) */}
      <section
        className="flex-1 flex flex-col space-y-2 sm:space-y-2.5 min-h-0"
        aria-labelledby="line-items-heading"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-1 min-h-[36px]">
          <h2
            id="line-items-heading"
            className="text-sm sm:text-base font-bold text-slate-900"
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
              className="cursor-pointer min-h-[36px] px-2 t-xs font-semibold text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-md"
            >
              Show all
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none pb-28 lg:pb-0">
          {visibleItems.length === 0 ? (
            <div
              key={`empty-${activeTier ?? "all"}`}
              className="animate-fade-slide-in border-y border-slate-200/80 py-10 text-center text-xs text-slate-600"
            >
              {result.line_items.length === 0
                ? "No line items were detected on this statement. Try re-analyzing with a clearer photo."
                : `No items are classified as ${activeTier ? TIER_META[activeTier].label : "this tier"}.`}
            </div>
          ) : (
            <ul
              key={activeTier ?? "all"}
              className="animate-fade-slide-in divide-y divide-slate-200/80 border-y border-slate-200/80"
            >
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
        </div>
      </section>
        </div>
      </div>

      {/* Compact Floating Unsaved Changes Action Pill (No blur, stays only while dirty) */}
      {isDirty && (
        <div className="sticky bottom-24 z-30 flex justify-center px-4 lg:bottom-5 pointer-events-none">
          <div
            className="pointer-events-auto inline-flex flex-wrap items-center justify-between gap-3 rounded-full border border-slate-200/90 bg-white px-4 py-2 shadow-lg max-w-md"
            role="status"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <p className="text-xs font-semibold whitespace-nowrap text-slate-800">
                You have unsaved changes
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={isSaving}
                className="h-8 rounded-full px-3 text-[11px] font-semibold"
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
                className="h-8 rounded-full px-3.5 text-[11px] font-bold"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save changes
              </Button>
            </div>
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

      {/* Focused Audit Parameters Modal Popup */}
      <AuditParametersModal
        open={showParamsModal}
        privilege={statutoryDiscountType}
        eligibility={eligibilitySnapshot}
        onClose={() => setShowParamsModal(false)}
        onApply={handleApplyParamsModal}
      />

      <AuditChatbotDrawer auditId={id} auditResult={result} />
    </div>
  );
}
