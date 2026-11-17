"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  NegotiationBriefDocument,
  buildPlainTextNegotiationBrief,
  type NegotiationBriefMeta,
} from "@/components/audit/NegotiationBriefDocument";
import { AuditCopilotDrawer } from "@/components/audit/AuditCopilotDrawer";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { runAuditEngine } from "@/lib/auditEngine";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import {
  applyOverridesToBill,
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { getSampleBillById } from "@/lib/sampleAudits";
import type {
  AuditOverrides,
  CatalogPackage,
  ExtractedBillData,
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
  const [isSenior, setIsSenior] = useState(false);
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [statutoryRule, setStatutoryRule] = useState<StatutoryRule | undefined>(
    undefined
  );

  // Customizable signatory metadata for the formal brief
  const [representativeName, setRepresentativeName] = useState("");
  const [relationship, setRelationship] = useState(
    "Patient / Authorized Family Representative"
  );
  const [contactInfo, setContactInfo] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);
  const [copied, setCopied] = useState(false);

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
        let sampleSenior = Boolean(sampleBill.is_senior_or_pwd);
        try {
          const cached = sessionStorage.getItem(
            `billlens-sample-overrides-${id}`
          );
          if (cached) {
            const parsed = JSON.parse(cached) as {
              o?: AuditOverrides;
              s?: boolean;
            };
            if (isOverrides(parsed.o)) sampleOverrides = parsed.o;
            if (typeof parsed.s === "boolean") sampleSenior = parsed.s;
          }
        } catch {
          // Ignore storage parse error
        }
        setOcr(sampleBill);
        setOverrides(sampleOverrides);
        setIsSenior(sampleSenior);
        setRepresentativeName(sampleBill.patient_name || "");
        setPackages(catalog.packages);
        setStatutoryRule(catalog.statutoryRule);
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

      const catalog = await loadPackageCatalog(supabase);

      if (cancelled) return;

      setOcr(loadedOcr);
      setOverrides(loadedOverrides);
      setIsSenior(loadedSenior);
      setRepresentativeName(loadedOcr?.patient_name || "");
      setPackages(catalog.packages);
      setStatutoryRule(catalog.statutoryRule);
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
      isSeniorOrPwdOverride: isSenior,
      referencePackages: packages,
      statutoryRule,
      manualStatusOverrides: statusOverridesFrom(overrides),
    });
  }, [ocr, overrides, isSenior, packages, statutoryRule, id]);

  const briefMeta: NegotiationBriefMeta = useMemo(
    () => ({
      representativeName: representativeName.trim(),
      relationship: relationship.trim(),
      contactInfo: contactInfo.trim(),
      preparedDate,
      admissionDate: ocr?.admission_date,
      dischargeDate: ocr?.discharge_date,
      isSeniorOrPwd: isSenior,
    }),
    [
      representativeName,
      relationship,
      contactInfo,
      preparedDate,
      ocr?.admission_date,
      ocr?.discharge_date,
      isSenior,
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
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API fallback not needed on modern browsers
    }
  };

  if (loadState === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          className="flex items-center justify-center gap-2 rounded-2xl border border-[#CBD5E1] bg-white p-12 text-xs text-[#64748B]"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
          Preparing formal negotiation brief...
        </div>
      </div>
    );
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
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none print:space-y-0">
      {/* Top Interactive Toolbar (Hidden when printing) */}
      <div className="no-print print:hidden space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-[#CBD5E1] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/audits/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#CBD5E1] bg-[#F3F4F6] px-3 py-1.5 text-xs font-bold text-[#1E293B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Audit Studio</span>
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-xs font-extrabold text-[#1E293B] sm:text-sm">
                Formal Negotiation &amp; Subsidy Brief
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Ready for hospital Billing / PhilHealth desk or Malasakit Center
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCustomize((prev) => !prev)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Customize Signatory</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyPlainText}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied Brief!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="font-bold"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </Button>
          </div>
        </div>

        {/* Optional Signatory Customization Panel */}
        {showCustomize && (
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4 space-y-3 animate-in fade-in duration-150">
            <p className="text-xs font-bold text-[#1E293B]">
              Customize Letter Signatory &amp; Statutory Details
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="brief-rep-name"
                  className="mb-1 block text-[11px] font-bold text-[#64748B]"
                >
                  Representative / Patient Name
                </label>
                <input
                  id="brief-rep-name"
                  type="text"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="e.g., Juan Dela Cruz"
                  className="w-full rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] px-3 py-2 text-xs text-[#1E293B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="brief-relationship"
                  className="mb-1 block text-[11px] font-bold text-[#64748B]"
                >
                  Role / Relationship to Patient
                </label>
                <input
                  id="brief-relationship"
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g., Spouse / Authorized Representative"
                  className="w-full rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] px-3 py-2 text-xs text-[#1E293B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="brief-contact"
                  className="mb-1 block text-[11px] font-bold text-[#64748B]"
                >
                  Mobile Number / Email (Optional)
                </label>
                <input
                  id="brief-contact"
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="e.g., 0917-XXX-XXXX"
                  className="w-full rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] px-3 py-2 text-xs text-[#1E293B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-semibold text-[#1E293B]">
              <input
                type="checkbox"
                checked={isSenior}
                onChange={(e) => setIsSenior(e.target.checked)}
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
              />
              <span>
                Include Senior Citizen (RA 9994) / PWD (RA 10754) 20% + 12% VAT
                statutory citation
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Printable Formal Letter Document */}
      <NegotiationBriefDocument audit={result} ocr={ocr} meta={briefMeta} />

      {/* Floating Copilot Drawer (hidden during print) */}
      <AuditCopilotDrawer auditId={id} auditResult={result} />
    </div>
  );
}
