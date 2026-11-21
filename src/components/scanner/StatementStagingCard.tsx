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
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  BedDouble,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  stagedAuditId: string | null;
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
  stagedAuditId,
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
  const [showEligibilityDrawer, setShowEligibilityDrawer] =
    React.useState<boolean>(false);
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

  const handleUpdateEligibility = (patch: Partial<EligibilitySnapshot>) => {
    const next = { ...activeEligibility, ...patch };
    setLocalEligibility(next);
    setEligibilitySnapshot?.(next);
  };

  const handleSelectPrivilege = (next: StatutoryDiscountType) => {
    setLocalPrivilege(next);
    setStatutoryDiscountType?.(next);
    setIsSeniorOrPwd?.(next !== "regular");
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
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB] shrink-0" />
            <span>{statusMessage || steps[Math.max(0, activeStepIndex)].label}</span>
          </div>
          <span className="text-[11px] font-semibold text-[#2563EB] bg-blue-100/70 px-2 py-0.5 rounded-full">
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

  // PhilHealth & Ward information disclosure drawer with accessible segmented controls
  const renderEligibilityDrawer = () => (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setShowEligibilityDrawer((prev) => !prev)}
        aria-expanded={showEligibilityDrawer}
        className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-100/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <BedDouble className="w-4 h-4 text-[#2563EB] shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-slate-900">
            PhilHealth Membership &amp; Ward Info
          </span>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
            {activeEligibility.contributor_type === "indirect_nbb"
              ? "Indirect (NBB)"
              : activeEligibility.contributor_type === "direct"
                ? "Direct"
                : activeEligibility.contributor_type === "lifetime"
                  ? "Lifetime"
                  : "Auto / Not Sure"}
          </span>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
            {activeEligibility.accommodation_type === "basic_ward"
              ? "Basic / Ward"
              : activeEligibility.accommodation_type === "non_basic_private"
                ? "Private Room"
                : "Auto / Not Sure"}
          </span>
          {!activeEligibility.has_mdr_or_pin && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800">
              MDR Reminder
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          <span className="hidden sm:inline font-medium">
            {showEligibilityDrawer ? "Hide" : "Customize"}
          </span>
          {showEligibilityDrawer ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {showEligibilityDrawer && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-200/80 space-y-4 bg-white">
          {/* Contributor Category */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              PhilHealth Contributor Category (NBB Eligibility)
            </label>
            <div
              role="radiogroup"
              aria-label="PhilHealth Contributor Category"
              className="grid grid-cols-2 sm:grid-cols-4 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
            >
              {(
                [
                  { id: "unknown", label: "Auto / Not Sure" },
                  { id: "direct", label: "Direct Contributor" },
                  { id: "indirect_nbb", label: "Indirect / NBB" },
                  { id: "lifetime", label: "Lifetime Member" },
                ] as const
              ).map((opt) => {
                const isSelected = activeEligibility.contributor_type === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    disabled={isBusy}
                    onClick={() =>
                      handleUpdateEligibility({ contributor_type: opt.id })
                    }
                    className={`min-h-[44px] py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                      isSelected
                        ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              NBB covers Indigent, Sponsored, Kasambahay, Senior (RA 10645), Solo Parent (PC 2026-0015), and PWD (PC 2026-0017).
            </p>
          </div>

          {/* Accommodation Type */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Room / Ward Accommodation Type
            </label>
            <div
              role="radiogroup"
              aria-label="Room / Ward Accommodation Type"
              className="grid grid-cols-3 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
            >
              {(
                [
                  { id: "unknown", label: "Auto / Not Sure" },
                  { id: "basic_ward", label: "Basic / Ward (NBB)" },
                  { id: "non_basic_private", label: "Private Room" },
                ] as const
              ).map((opt) => {
                const isSelected = activeEligibility.accommodation_type === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    disabled={isBusy}
                    onClick={() =>
                      handleUpdateEligibility({ accommodation_type: opt.id })
                    }
                    className={`min-h-[44px] py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                      isSelected
                        ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MDR & Facility Level Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                MDR / PIN Presented at Billing?
              </label>
              <div
                role="radiogroup"
                aria-label="MDR / PIN Presented"
                className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { val: true, label: "Yes, Presented" },
                    { val: false, label: "Not Yet" },
                  ] as const
                ).map((opt) => {
                  const isSelected = activeEligibility.has_mdr_or_pin === opt.val;
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      disabled={isBusy}
                      onClick={() =>
                        handleUpdateEligibility({ has_mdr_or_pin: opt.val })
                      }
                      className={`min-h-[44px] py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      }`}
                    >
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="facility-level-select"
                className="block text-xs font-bold text-slate-700"
              >
                Hospital Facility Level
              </label>
              <select
                id="facility-level-select"
                value={activeEligibility.facility_level}
                disabled={isBusy}
                onChange={(e) =>
                  handleUpdateEligibility({
                    facility_level: e.target
                      .value as EligibilitySnapshot["facility_level"],
                  })
                }
                className="w-full min-h-[44px] rounded-xl bg-slate-100/80 border border-slate-200/80 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <option value="unknown">Auto / Not Sure</option>
                <option value="level_1">Level 1 Hospital</option>
                <option value="level_2">Level 2 Hospital</option>
                <option value="level_3">Level 3 Teaching / Tertiary</option>
                <option value="asc">Ambulatory Surgical / Dialysis (ASC)</option>
              </select>
            </div>
          </div>

          {!activeEligibility.has_mdr_or_pin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Pre-Discharge Reminder:</strong> Present digital MDR/PIN via PhilHealth Portal or eGovPH app before paying at the cashier to ensure Case Rate deduction.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (pageCount === 0) return null;

  // View after Gemini AI OCR Analysis has completed (Clean, Full-Width, Non-Bento Layout)
  if (ocrAuditResult) {
    const disputedTotal =
      ocrAuditResult.disputed_overcharge_total +
      ocrAuditResult.senior_pwd_savings +
      (ocrAuditResult.case_rate_shortfall ?? 0) +
      (ocrAuditResult.nbb_savings ?? 0);

    return (
      <div className="w-full border-t border-slate-200/80 pt-6 mt-6 space-y-6">
        {/* Status Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                AI OCR &amp; PhilHealth Audit Complete!
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Extracted {ocrAuditResult.line_items.length} line items from{" "}
                <strong className="text-slate-900">{ocrAuditResult.hospital_name}</strong>.
              </p>
            </div>
          </div>

          <Badge variant="primary" dot className="shrink-0 mt-0.5">
            Gemini Flash
          </Badge>
        </div>

        {/* Full-Width Editorial Financial Summary Band (Non-Bento Layout with Hairline Dividers) */}
        <div className="w-full border-y border-slate-200/80 py-5 my-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
            {/* Total Billed */}
            <div className="pb-4 sm:pb-0 sm:pr-6">
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

            {/* Disputed Overcharges */}
            <div className="py-4 sm:py-0 sm:px-6">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Disputed Overcharges
              </span>
              <span className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight tabular-nums block mt-1">
                {formatPHP(disputedTotal)}
              </span>
              <span className="text-xs text-amber-700/80 mt-1 block">
                {disputedTotal > 0
                  ? "Overcharges & uncredited discounts"
                  : "No illegal overcharges detected"}
              </span>
            </div>

            {/* Fair Balance Due */}
            <div className="pt-4 sm:pt-0 sm:pl-6">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Fair Balance Due
              </span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-900 tracking-tight tabular-nums block mt-1">
                {formatPHP(ocrAuditResult.fair_out_of_pocket)}
              </span>
              <span className="text-xs text-emerald-700/80 mt-1 block">
                Lawful out-of-pocket after deductions
              </span>
            </div>
          </div>
        </div>

        {/* Action Row: Open in Audit Studio is dominant, Scan Another is quiet secondary */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <Link
            href={
              ocrAuditResult.audit_id.startsWith("audit-")
                ? "/audits"
                : `/audits/${ocrAuditResult.audit_id}`
            }
            className="flex-1"
          >
            <button
              type="button"
              className="w-full min-h-[52px] sm:min-h-[56px] px-8 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm sm:text-base shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <span>Open in Audit Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>

          <button
            type="button"
            onClick={onResetAll}
            className="min-h-[44px] px-5 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <Camera className="w-4 h-4 text-slate-400" />
            <span>Scan Another</span>
          </button>
        </div>
      </div>
    );
  }

  // Pre-upload or In-Progress Staging Section (Clean, Full-Width, Non-Bento Layout)
  return (
    <div className="w-full border-t border-slate-200/80 pt-6 mt-6 space-y-5">
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

      {/* Mutually Exclusive Statutory Privilege Selector (Segmented Radio Group, No Competing Blue Buttons) */}
      {(setStatutoryDiscountType || setIsSeniorOrPwd) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">
              Patient Statutory Privilege
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              RA 9994 / RA 10754
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Patient Statutory Privilege"
            className="grid grid-cols-3 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
          >
            {(
              [
                { id: "regular", label: "Regular" },
                { id: "senior", label: "Senior Citizen (60+)" },
                { id: "pwd", label: "PWD (RA 10754)" },
              ] as const
            ).map((opt) => {
              const isSelected = activePrivilege === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  disabled={isBusy}
                  onClick={() => handleSelectPrivilege(opt.id)}
                  className={`min-h-[44px] py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                    isSelected
                      ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            RA 9994 / RA 10754 &amp; Advisory 2023-0036: Senior/PWD claim one 20% discount + 12% VAT exemption deducted before PhilHealth.
          </p>
        </div>
      )}

      {/* Progressive Disclosure: PhilHealth & Ward Accommodation Info */}
      {renderEligibilityDrawer()}

      {/* Active Pipeline Progress Tracker */}
      {renderMultiStepProgress()}

      {/* Primary CTA Row: Scan & Audit dominates, secondary actions quiet */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={hasError && onRetryScan ? onRetryScan : (stage === "completed" && onRunAIOcr ? onRunAIOcr : onUploadAndStage)}
          className="flex-1 min-h-[52px] sm:min-h-[56px] px-8 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm sm:text-base shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
              <span>{statusMessage || "Auditing statement..."}</span>
            </>
          ) : hasError ? (
            <>
              <RotateCcw className="w-4 h-4 mr-1" />
              <span>Retry Scan</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 mr-1" />
              <span>
                Scan &amp; Audit Statement ({pageCount}{" "}
                {pageCount === 1 ? "Page" : "Pages"})
              </span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={onResetAll}
          className="min-h-[44px] px-4 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 font-semibold text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-label="Clear all staged statement pages"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>
    </div>
  );
}
