"use client";

import React from "react";
import Link from "next/link";
import {
  Building2,
  Loader2,
  UploadCloud,
  Trash2,
  Check,
  ArrowRight,
  Camera,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { AuditParametersModal } from "@/components/audit/AuditParametersModal";
import { formatPHP } from "@/lib/utils";
import { DEFAULT_ELIGIBILITY_SNAPSHOT } from "@/lib/auditEngine";
import type {
  PipelineStage,
  AuditEngineResult,
  StatutoryDiscountType,
  EligibilitySnapshot,
} from "@/types/audit";

interface StatementStagingCardProps {
  pageCount: number;
  stage: PipelineStage;
  statusMessage: string;
  hospitalName: string;
  setHospitalName: (name: string) => void;
  onUploadAndStage: () => void;
  onResetAll: () => void;
  isSeniorOrPwd?: boolean;
  setIsSeniorOrPwd?: (val: boolean) => void;
  statutoryDiscountType?: StatutoryDiscountType;
  setStatutoryDiscountType?: (val: StatutoryDiscountType) => void;
  eligibilitySnapshot?: EligibilitySnapshot;
  setEligibilitySnapshot?: (val: EligibilitySnapshot) => void;
  onRunAIOcr?: () => void;
  onRetryScan?: () => void;
  hasError?: boolean;
  isAnalyzingOcr?: boolean;
  ocrAuditResult?: AuditEngineResult | null;
}

export function StatementStagingCard({
  pageCount,
  stage,
  statusMessage,
  hospitalName,
  setHospitalName,
  onUploadAndStage,
  onResetAll,
  isSeniorOrPwd = false,
  setIsSeniorOrPwd,
  statutoryDiscountType,
  setStatutoryDiscountType,
  eligibilitySnapshot,
  setEligibilitySnapshot,
  onRunAIOcr,
  onRetryScan,
  hasError = false,
  isAnalyzingOcr = false,
  ocrAuditResult = null,
}: StatementStagingCardProps) {
  const [localPrivilege, setLocalPrivilege] =
    React.useState<StatutoryDiscountType>(isSeniorOrPwd ? "senior" : "regular");
  const [showParamsModal, setShowParamsModal] = React.useState<boolean>(false);
  const [localEligibility, setLocalEligibility] =
    React.useState<EligibilitySnapshot>(DEFAULT_ELIGIBILITY_SNAPSHOT);

  const activePrivilege: StatutoryDiscountType =
    statutoryDiscountType ??
    (isSeniorOrPwd
      ? localPrivilege === "regular"
        ? "senior"
        : localPrivilege
      : "regular");

  const activeEligibility: EligibilitySnapshot =
    eligibilitySnapshot ?? localEligibility;

  const handleApplyParams = (
    nextPrivilege: StatutoryDiscountType,
    nextEligibility: EligibilitySnapshot
  ) => {
    setLocalPrivilege(nextPrivilege);
    setStatutoryDiscountType?.(nextPrivilege);
    setIsSeniorOrPwd?.(nextPrivilege !== "regular");
    setLocalEligibility(nextEligibility);
    setEligibilitySnapshot?.(nextEligibility);
    setShowParamsModal(false);
  };

  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db" ||
    stage === "analyzing_ocr" ||
    isAnalyzingOcr;

  const activeStepIndex =
    stage === "compressing"
      ? 0
      : stage === "uploading" || stage === "staging_db"
        ? 1
        : stage === "analyzing_ocr" || isAnalyzingOcr
          ? statusMessage.toLowerCase().includes("cross-referencing")
            ? 2
            : 1
          : -1;

  // Multi-step progress tracker (HCI: non-button, cohesive system status)
  const renderMultiStepProgress = () => {
    if (!isBusy) return null;
    const steps = [
      { label: "Compressing image...", short: "Compressing" },
      { label: "Extracting line items with Gemini Vision...", short: "AI Extraction" },
      { label: "Cross-referencing PhilHealth ACR & statutory rules...", short: "Auditing ACR" },
    ];

    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 min-w-0">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB] shrink-0" />
            <span className="leading-snug">{statusMessage || steps[Math.max(0, activeStepIndex)].label}</span>
          </div>
          <span className="text-[10px] sm:text-[11px] font-semibold text-[#2563EB] bg-blue-100/70 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            Step {Math.max(1, activeStepIndex + 1)} of 3
          </span>
        </div>

        {/* Clean, cohesive timeline track without button-like pill shapes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {steps.map((step, idx) => {
            const isDone = activeStepIndex > idx;
            const isCurrent = activeStepIndex === idx;

            return (
              <div
                key={step.label}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-colors ${
                  isCurrent
                    ? "bg-white border border-blue-300 shadow-xs text-blue-950 font-bold"
                    : isDone
                      ? "bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 font-medium"
                      : "bg-slate-100/50 border border-slate-200/50 text-slate-400 font-medium"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    isCurrent
                      ? "bg-[#2563EB] text-white"
                      : isDone
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span className="truncate">{step.short}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (pageCount === 0 && !isBusy) return null;

  if (pageCount === 0 && isBusy) {
    return <div className="w-full pt-2">{renderMultiStepProgress()}</div>;
  }

  // View after Gemini AI OCR Analysis has completed (Clean, Full-Width, Non-Bento Layout)
  if (ocrAuditResult) {
    const disputedTotal =
      ocrAuditResult.disputed_overcharge_total +
      ocrAuditResult.senior_pwd_savings +
      (ocrAuditResult.case_rate_shortfall ?? 0) +
      (ocrAuditResult.nbb_savings ?? 0);

    return (
      <div className="w-full border-t border-slate-200/80 pt-4 sm:pt-5 pb-20 lg:pb-24 space-y-5">
        {/* Status Header (Editorial, No Decorative Icon Box or Badge) */}
        <div className="space-y-1">
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
            AI OCR &amp; PhilHealth Audit Complete
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Extracted {ocrAuditResult.line_items.length} line items from{" "}
            <strong className="font-semibold text-slate-900">
              {ocrAuditResult.hospital_name}
            </strong>
            .
          </p>
        </div>

        {/* Full-Width Editorial Financial Summary Band (Matches Audit Studio: Only Peso Figures Colored) */}
        <div className="w-full border-y border-slate-200/80 py-4 sm:py-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
            {/* Total Billed */}
            <div className="pb-3.5 sm:pb-0 sm:pr-6">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Billed
              </span>
              <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums block mt-1">
                {formatPHP(ocrAuditResult.gross_total)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Original hospital statement charge
              </span>
            </div>

            {/* Potential Savings / Disputed Overcharges */}
            <div className="py-3.5 sm:py-0 sm:px-6">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Disputed Overcharges
              </span>
              <span className="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight tabular-nums block mt-1">
                {formatPHP(disputedTotal)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                {disputedTotal > 0
                  ? "Overcharges & uncredited discounts"
                  : "No illegal overcharges detected"}
              </span>
            </div>

            {/* Fair Balance Due */}
            <div className="pt-3.5 sm:pt-0 sm:pl-6">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Fair Balance Due
              </span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight tabular-nums block mt-1">
                {formatPHP(ocrAuditResult.fair_out_of_pocket)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Lawful out-of-pocket after deductions
              </span>
            </div>
          </div>
        </div>

        {/* Fixed Action Dock: Open in Audit Studio + Scan Another */}
        <div className="fixed bottom-[88px] sm:bottom-[94px] lg:bottom-6 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.25rem)] max-w-md sm:max-w-2xl lg:max-w-3xl rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 p-1.5 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.12),0_4px_12px_-2px_rgba(15,23,42,0.05)] flex items-center gap-1.5 sm:gap-2">
          <Link
            href={
              ocrAuditResult.audit_id.startsWith("audit-")
                ? "/audits"
                : `/audits/${ocrAuditResult.audit_id}`
            }
            className="flex-1 min-w-0"
          >
            <button
              type="button"
              className="w-full min-h-[46px] sm:min-h-[50px] px-4 sm:px-6 lg:px-8 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs sm:text-sm lg:text-base shadow-md shadow-blue-500/25 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <span className="whitespace-nowrap">Open in Audit Studio</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </Link>

          <button
            type="button"
            onClick={onResetAll}
            className="shrink-0 min-h-[44px] px-3 sm:px-4 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Scan Another</span>
          </button>
        </div>
      </div>
    );
  }

  // Pre-upload or In-Progress Staging Section (Clean, Full-Width, Non-Bento Layout)
  return (
    <div className="w-full border-t border-slate-200/80 pt-4 sm:pt-5 pb-20 lg:pb-24 space-y-4">
      {/* Hospital Name (Optional) */}
      <div className="space-y-1.5">
        <label
          htmlFor="hospital-name-input"
          className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
        >
          <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>
            Hospital / Healthcare Facility{" "}
            <span className="font-normal text-slate-500">
              (Optional — auto-detected)
            </span>
          </span>
        </label>
        <input
          id="hospital-name-input"
          type="text"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
          disabled={isBusy}
          placeholder="e.g., St. Luke's Medical Center, PGH, The Medical City..."
          className="w-full min-h-[44px] rounded-xl bg-slate-50/80 border border-slate-200/80 px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
        />
      </div>

      {/* Compact Privilege & PhilHealth Summary + Edit Modal Trigger */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-3 text-[11px] sm:text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-0.5 min-w-0 leading-relaxed">
          <span className="whitespace-nowrap">
            Privilege:{" "}
            <strong className="font-semibold text-slate-900">
              {activePrivilege === "senior"
                ? "Senior (60+)"
                : activePrivilege === "pwd"
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
              {activeEligibility.contributor_type === "indirect_nbb"
                ? "Indirect (NBB)"
                : activeEligibility.contributor_type === "direct"
                  ? "Direct"
                  : activeEligibility.contributor_type === "lifetime"
                    ? "Lifetime"
                    : "Auto"}
            </strong>
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="whitespace-nowrap">
            Facility:{" "}
            <strong className="font-semibold text-slate-900">
              {activeEligibility.facility_ownership === "government"
                ? "Government"
                : "Private"}
            </strong>
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="whitespace-nowrap">
            Ward:{" "}
            <strong className="font-semibold text-slate-900">
              {activeEligibility.accommodation_type === "basic_ward"
                ? "Basic / Ward"
                : activeEligibility.accommodation_type === "non_basic_private"
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
              {activeEligibility.has_mdr_or_pin ? "Yes" : "Not Yet"}
            </strong>
          </span>

          {!activeEligibility.has_mdr_or_pin && (
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
          disabled={isBusy}
          onClick={() => setShowParamsModal(true)}
          aria-label="Edit privilege and PhilHealth membership details"
          className="shrink-0 min-h-[44px] sm:min-h-[32px] px-1.5 sm:px-2.5 -mr-1.5 sm:-mr-2 rounded-lg text-[11px] sm:text-xs font-semibold text-[#2563EB] hover:bg-blue-50/70 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <Pencil className="h-3 w-3 shrink-0" />
          <span>Edit</span>
        </button>
      </div>

      {/* Active Pipeline Progress Tracker */}
      {renderMultiStepProgress()}

      {/* Primary CTA Bar: Fixed floating dock across mobile, tablet, and desktop */}
      <div className="fixed bottom-[88px] sm:bottom-[94px] lg:bottom-6 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.25rem)] max-w-md sm:max-w-2xl lg:max-w-3xl rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 p-1.5 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.12),0_4px_12px_-2px_rgba(15,23,42,0.05)] flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={hasError && onRetryScan ? onRetryScan : (stage === "completed" && onRunAIOcr ? onRunAIOcr : onUploadAndStage)}
          className="flex-1 min-h-[46px] sm:min-h-[50px] px-4 sm:px-6 lg:px-8 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs sm:text-sm lg:text-base shadow-md shadow-blue-500/25 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="whitespace-nowrap">Processing...</span>
            </>
          ) : hasError ? (
            <>
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Retry Scan</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Scan &amp; Audit</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={onResetAll}
          className="shrink-0 min-h-[44px] px-3 sm:px-4 rounded-full text-slate-500 lg:text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 font-semibold text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 whitespace-nowrap"
          aria-label="Clear all staged statement pages"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>Clear All</span>
        </button>
      </div>

      <AuditParametersModal
        open={showParamsModal}
        privilege={activePrivilege}
        eligibility={activeEligibility}
        onClose={() => setShowParamsModal(false)}
        onApply={handleApplyParams}
        subtitle="Set patient privilege and PhilHealth ward details before running the audit."
        applyLabel="Apply"
      />
    </div>
  );
}
