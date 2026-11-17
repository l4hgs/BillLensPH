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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/utils";
import type {
  PipelineStage,
  AuditEngineResult,
  StatutoryDiscountType,
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
  onRunAIOcr?: () => void;
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
  onRunAIOcr,
  isAnalyzingOcr = false,
  ocrAuditResult = null,
}: StatementStagingCardProps) {
  const [localPrivilege, setLocalPrivilege] =
    React.useState<StatutoryDiscountType>(isSeniorOrPwd ? "senior" : "none");

  const activePrivilege: StatutoryDiscountType =
    statutoryDiscountType ?? (isSeniorOrPwd ? (localPrivilege === "none" ? "senior" : localPrivilege) : "none");

  const handleSelectPrivilege = (next: StatutoryDiscountType) => {
    setLocalPrivilege(next);
    setStatutoryDiscountType?.(next);
    setIsSeniorOrPwd?.(next !== "none");
  };
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db" ||
    isAnalyzingOcr;

  if (pageCount === 0) return null;

  // View after Gemini AI OCR Analysis has completed
  if (ocrAuditResult) {
    return (
      <div className="w-full rounded-[28px] bg-white border border-[#CBD5E1]/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-7 space-y-4 animate-in fade-in duration-300">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm sm:text-base text-[#1E293B]">
                AI OCR & PhilHealth Audit Complete!
              </h4>
              <p className="text-xs text-[#64748B] mt-0.5 font-medium">
                Extracted {ocrAuditResult.line_items.length} line items from{" "}
                <strong className="text-[#1E293B]">{ocrAuditResult.hospital_name}</strong>.
              </p>
            </div>
          </div>

          <Badge variant="primary" dot className="shrink-0 mt-0.5">
            Gemini Flash
          </Badge>
        </div>

        {/* Quick Metrics Bar matching Design System */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3.5 rounded-2xl bg-[#F4F4F5] border border-[#E5E7EB]">
            <span className="text-[10px] font-bold text-[#64748B] uppercase block">
              Total Billed
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[#1E293B]">
              {formatPHP(ocrAuditResult.gross_total)}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-300/80">
            <span className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Disputed Overcharges
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-900">
              {formatPHP(ocrAuditResult.disputed_overcharge_total + ocrAuditResult.senior_pwd_savings)}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-300/80">
            <span className="text-[10px] font-bold text-emerald-800 uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Fair Balance Due
            </span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-900">
              {formatPHP(ocrAuditResult.fair_out_of_pocket)}
            </span>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
          <Link
            href={
              ocrAuditResult.audit_id.startsWith("audit-")
                ? "/audits"
                : `/audits/${ocrAuditResult.audit_id}`
            }
            className="flex-1"
          >
            <Button variant="primary" size="md" className="w-full font-bold bg-[#2563EB] hover:bg-[#1D4ED8] h-12 rounded-full">
              <span>Open in Audit Studio</span>
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onResetAll}
            className="font-bold border-[#CBD5E1] text-[#1E293B] h-12 rounded-full px-5"
          >
            <Camera className="w-4 h-4 text-[#2563EB]" />
            <span>Scan Another</span>
          </Button>
        </div>
      </div>
    );
  }

  // View after Upload to Storage is complete, ready for AI Analysis
  if (stage === "completed") {
    return (
      <div className="w-full rounded-[28px] bg-white border border-[#CBD5E1]/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-7 space-y-4 animate-in fade-in duration-300">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm sm:text-base text-[#1E293B]">
              Statement Staged in Supabase Storage
            </h4>
            <p className="text-xs text-[#64748B] mt-0.5">
              Saved securely in{" "}
              <code className="px-1.5 py-0.5 rounded bg-[#F4F4F5] border border-[#E5E7EB] text-[11px] font-bold text-[#1E293B]">
                bill-uploads
              </code>
              {stagedAuditId && (
                <span>
                  {" "}
                  as Draft{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[#F4F4F5] border border-[#E5E7EB] text-[11px] font-bold text-[#1E293B]">
                    #{stagedAuditId.slice(0, 8)}
                  </code>
                </span>
              )}
              . Ready for AI Vision extraction!
            </p>
          </div>
        </div>

        {/* Mutually Exclusive Statutory Privilege Selector (RA 9994 vs RA 10754) */}
        {setIsSeniorOrPwd && (
          <div className="p-3.5 bg-[#F4F4F5] rounded-2xl border border-[#E5E7EB] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1E293B]">
                Statutory Privilege (Mutually Exclusive — No Double-Stacking)
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "none", label: "Regular" },
                  { id: "senior", label: "Senior Citizen (60+)" },
                  { id: "pwd", label: "PWD (RA 10754)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleSelectPrivilege(opt.id)}
                  className={`py-2 px-2.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    activePrivilege === opt.id
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "bg-white text-[#64748B] border border-[#CBD5E1] hover:text-[#1E293B]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#64748B]">
              Per PhilHealth Advisory 2023-0036 &amp; RA 9994 IRR: 12% VAT
              exemption + 20% discount are deducted FIRST before PhilHealth.
            </p>
          </div>
        )}

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
          {onRunAIOcr && (
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={isBusy}
              onClick={onRunAIOcr}
              className="flex-1 font-bold bg-[#2563EB] hover:bg-[#1D4ED8] h-12 rounded-full"
            >
              {isAnalyzingOcr ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  <span>Analyzing with Gemini Flash OCR...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  <span>Analyze Bill with AI OCR</span>
                </>
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="md"
            disabled={isBusy}
            onClick={onResetAll}
            className="border-[#CBD5E1] text-[#1E293B] font-bold h-12 rounded-full px-5"
          >
            <Trash2 className="w-4 h-4 text-[#64748B]" />
            <span>Clear</span>
          </Button>
        </div>
      </div>
    );
  }

  // Pre-upload view (Staging review)
  return (
    <div className="w-full rounded-[28px] bg-white border border-[#CBD5E1]/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-7 space-y-4 animate-in fade-in duration-200">
      <div>
        <label
          htmlFor="hospital-name-input"
          className="flex items-center gap-1.5 text-xs font-bold text-[#1E293B] mb-1.5"
        >
          <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>
            Hospital / Healthcare Facility{" "}
            <span className="font-normal text-[#64748B]">
              (Optional — auto-detected by AI OCR)
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
          className="w-full rounded-full bg-[#F4F4F5] border border-[#E5E7EB] px-4 py-3 text-xs sm:text-sm text-[#1E293B] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
        />
      </div>

      {/* Mutually Exclusive Statutory Privilege Selector (RA 9994 vs RA 10754) */}
      {setIsSeniorOrPwd && (
        <div className="p-3.5 bg-[#F4F4F5] rounded-2xl border border-[#E5E7EB] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1E293B]">
              Patient Statutory Privilege (Choose One — Mutually Exclusive)
            </span>
            <span className="text-[10px] font-bold text-[#64748B] uppercase">
              RA 9994 / RA 10754
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: "none", label: "Regular" },
                { id: "senior", label: "Senior Citizen (60+)" },
                { id: "pwd", label: "PWD (RA 10754)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={isBusy}
                onClick={() => handleSelectPrivilege(opt.id)}
                className={`py-2 px-2.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                  activePrivilege === opt.id
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-white text-[#64748B] border border-[#CBD5E1] hover:text-[#1E293B]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#64748B]">
            A patient who is both a Senior Citizen and PWD may claim one 20%
            statutory discount (applied BEFORE PhilHealth per Advisory
            2023-0036).
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={isBusy}
          onClick={onUploadAndStage}
          className="flex-1 font-bold bg-[#2563EB] hover:bg-[#1D4ED8] h-12 rounded-full"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              <span>{statusMessage || "Processing..."}</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4 mr-1.5" />
              <span>
                Upload & Stage for AI Audit ({pageCount}{" "}
                {pageCount === 1 ? "Page" : "Pages"})
              </span>
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="md"
          disabled={isBusy}
          onClick={onResetAll}
          className="border-[#CBD5E1] text-[#1E293B] font-bold h-12 rounded-full px-5"
        >
          <Trash2 className="w-4 h-4 text-[#64748B]" />
          <span>Clear</span>
        </Button>
      </div>
    </div>
  );
}
