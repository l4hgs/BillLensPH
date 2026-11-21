"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Printer,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  NegotiationBriefDocument,
  buildPlainTextNegotiationBrief,
  type NegotiationBriefMeta,
} from "@/components/audit/NegotiationBriefDocument";
import { AuditChatbotDrawer } from "@/components/audit/AuditChatbotDrawer";
import { NegotiationBriefSkeleton } from "@/components/audit/AuditSkeletons";
import { useToast } from "@/components/providers/ToastProvider";
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
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { getSampleBillById } from "@/lib/sampleAudits";
import type {
  AuditOverrides,
  CatalogPackage,
  EligibilitySnapshot,
  ExtractedBillData,
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

export default function NegotiationBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<ExtractedBillData | null>(null);
  const [overrides, setOverrides] = useState<AuditOverrides>({});
  const [statutoryDiscountType, setStatutoryDiscountType] =
    useState<StatutoryDiscountType>("regular");
  const [eligibilitySnapshot, setEligibilitySnapshot] =
    useState<EligibilitySnapshot>(DEFAULT_ELIGIBILITY_SNAPSHOT);
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [statutoryRule, setStatutoryRule] = useState<StatutoryRule | undefined>(
    undefined
  );
  const [statutoryRules, setStatutoryRules] = useState<StatutoryRule[]>([]);

  // Customizable signatory metadata for the formal brief
  const [representativeName, setRepresentativeName] = useState("");
  const [relationship, setRelationship] = useState(
    "Patient / Authorized Family Representative"
  );
  const [contactInfo, setContactInfo] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!showCustomize) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCustomize(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCustomize]);

  const preparedDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Check built-in sample statements first (doc-1 .. doc-5)
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
        setOcr(sampleBill);
        setOverrides(sampleOverrides);
        setStatutoryDiscountType(sampleDiscountType);
        setEligibilitySnapshot(sampleEligibility);
        setRepresentativeName(sampleBill.patient_name || "");
        setPackages(catalog.packages);
        setStatutoryRule(catalog.statutoryRule);
        setStatutoryRules(catalog.statutoryRules ?? []);
        setLoadState("ready");
        return;
      }

      // 2. Otherwise fetch from Supabase `audits` table
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

      const raw = (row.raw_extracted_data ?? {}) as Record<
        string,
        Json | undefined
      >;
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

      if (cancelled) return;

      setOcr(loadedOcr);
      setOverrides(loadedOverrides);
      setStatutoryDiscountType(loadedDiscountType);
      setEligibilitySnapshot(loadedEligibility);
      setRepresentativeName(loadedOcr?.patient_name || "");
      setPackages(catalog.packages);
      setStatutoryRule(catalog.statutoryRule);
      setStatutoryRules(catalog.statutoryRules ?? []);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

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

  const briefMeta: NegotiationBriefMeta = useMemo(
    () => ({
      representativeName: representativeName.trim(),
      relationship: relationship.trim(),
      contactInfo: contactInfo.trim(),
      preparedDate,
      admissionDate: ocr?.admission_date,
      dischargeDate: ocr?.discharge_date,
      isSeniorOrPwd: statutoryDiscountType !== "regular",
      statutoryDiscountType,
    }),
    [
      representativeName,
      relationship,
      contactInfo,
      preparedDate,
      ocr?.admission_date,
      ocr?.discharge_date,
      statutoryDiscountType,
    ]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleCopyPlainText = async () => {
    if (!result) return;
    const text = buildPlainTextNegotiationBrief(result, briefMeta);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Brief copied to clipboard");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("Could not copy brief to clipboard");
    }
  };

  if (loadState === "loading") {
    return <NegotiationBriefSkeleton />;
  }

  if (loadState === "not_found" || loadState === "error" || !ocr || !result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/audits/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#2563EB]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Audit Studio
        </Link>
        <Card className="bg-white">
          <CardContent className="space-y-3 p-6 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-[#64748B]" />
            <h1 className="text-base font-bold text-[#1E293B]">
              {loadError
                ? "Could not load negotiation brief"
                : "Statement not yet analyzed"}
            </h1>
            <p className="text-xs leading-relaxed text-[#64748B]">
              {loadError ||
                "Please run the AI OCR analysis in the Audit Studio first to generate your itemized negotiation brief."}
            </p>
            <div className="flex justify-center pt-1">
              <Link href={`/audits/${id}`}>
                <Button variant="primary" size="md">
                  Return to Audit Studio
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-6 print:space-y-0">
      {/* Clean Sticky Top Action Strip (No Card Wrapper, Hidden When Printing) */}
      <header className="no-print print:hidden sticky top-[60px] sm:top-[68px] z-30 w-full bg-[#F8FAFC] border-b border-slate-200/80 pt-2 pb-3.5 -mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/audits/${id}`}
            aria-label="Back to Audit Studio"
            title="Back to Audit Studio"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#2563EB] hover:text-[#2563EB] hover:bg-blue-50/40 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
              Formal Negotiation &amp; Subsidy Brief
            </h2>
            <p className="text-xs text-slate-500 truncate">
              Ready for hospital Billing / PhilHealth desk or Malasakit Center
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="min-h-[44px] px-3.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
            <span>Customize Signatory</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPlainText}
            className="min-h-[44px] px-3.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied Brief!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                <span>Copy Text</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[44px] px-5 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-sm shadow-blue-500/20 inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </header>

      {/* Signatory & Statutory Details Modal Popup (Portal, NO backdrop-blur, Escape key supported) */}
      {showCustomize &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Customize letter signatory and statutory details"
            className="no-print print:hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6 transition-opacity duration-150"
            onClick={() => setShowCustomize(false)}
          >
            <div
              className="relative w-full max-w-xl max-h-[90dvh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="shrink-0 px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between gap-3 bg-white">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Customize Letter Signatory
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update representative and contact details on the formal letter.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close signatory modal"
                  onClick={() => setShowCustomize(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 bg-white">
                <div className="space-y-1.5">
                  <label
                    htmlFor="brief-rep-name"
                    className="block text-xs font-bold text-slate-800"
                  >
                    Representative / Patient Name
                  </label>
                  <input
                    id="brief-rep-name"
                    type="text"
                    value={representativeName}
                    onChange={(e) => setRepresentativeName(e.target.value)}
                    placeholder="e.g., Juan Dela Cruz"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="brief-relationship"
                      className="block text-xs font-bold text-slate-800"
                    >
                      Role / Relationship to Patient
                    </label>
                    <input
                      id="brief-relationship"
                      type="text"
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      placeholder="e.g., Spouse / Authorized Representative"
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="brief-contact"
                      className="block text-xs font-bold text-slate-800"
                    >
                      Mobile Number / Email (Optional)
                    </label>
                    <input
                      id="brief-contact"
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="e.g., 0917-XXX-XXXX"
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="shrink-0 px-5 py-3 border-t border-slate-200/80 bg-slate-50/70 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowCustomize(false)}
                  className="min-h-[44px] px-6 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Printable Formal Letter Document */}
      <NegotiationBriefDocument audit={result} ocr={ocr} meta={briefMeta} />

      {/* Floating Chatbot Drawer (hidden during print) */}
      <AuditChatbotDrawer auditId={id} auditResult={result} />
    </div>
  );
}
