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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/utils";
import type { PipelineStage, AuditEngineResult } from "@/types/audit";

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
  onRunAIOcr,
  isAnalyzingOcr = false,
  ocrAuditResult = null,
}: StatementStagingCardProps) {
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db" ||
    isAnalyzingOcr;

  if (pageCount === 0) return null;

  // View after Gemini AI OCR Analysis has completed
  if (ocrAuditResult) {
    return (
      <Card className="border-[#CBD5E1] bg-white shadow-soft animate-in fade-in duration-300">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-[#1E293B]">
                    AI OCR & PhilHealth Audit Complete!
                  </h4>
                  <Badge variant="primary" dot>
                    Gemini Flash
                  </Badge>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5 font-medium">
                  Extracted {ocrAuditResult.line_items.length} line items from{" "}
                  <strong className="text-[#1E293B]">{ocrAuditResult.hospital_name}</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar matching Design System */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="p-3 rounded-2xl bg-[#F3F4F6] border border-[#CBD5E1]">
              <span className="text-[10px] font-bold text-[#64748B] uppercase block">
                Total Billed
              </span>
              <span className="text-sm sm:text-base font-extrabold text-[#1E293B]">
                {formatPHP(ocrAuditResult.gross_total)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-300/80">
              <span className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Disputed Overcharges
              </span>
              <span className="text-sm sm:text-base font-extrabold text-amber-900">
                {formatPHP(ocrAuditResult.disputed_overcharge_total + ocrAuditResult.senior_pwd_savings)}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-300/80">
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <Link
              href={
                ocrAuditResult.audit_id.startsWith("audit-")
                  ? "/audits"
                  : `/audits/${ocrAuditResult.audit_id}`
              }
              className="flex-1"
            >
              <Button variant="primary" size="md" className="w-full font-bold bg-[#2563EB] hover:bg-[#1D4ED8]">
                <span>Open in Audit Studio</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onResetAll}
              className="font-bold border-[#CBD5E1] text-[#1E293B]"
            >
              <Camera className="w-4 h-4 text-[#2563EB]" />
              <span>Scan Another</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // View after Upload to Storage is complete, ready for AI Analysis
  if (stage === "completed") {
    return (
      <Card className="border-[#CBD5E1] bg-white shadow-soft animate-in fade-in duration-300">
        <CardContent className="p-4 sm:p-5 space-y-3.5">
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
                <code className="px-1.5 py-0.5 rounded bg-[#F3F4F6] border border-[#CBD5E1] text-[11px] font-bold text-[#1E293B]">
                  bill-uploads
                </code>
                {stagedAuditId && (
                  <span>
                    {" "}
                    as Draft{" "}
                    <code className="px-1.5 py-0.5 rounded bg-[#F3F4F6] border border-[#CBD5E1] text-[11px] font-bold text-[#1E293B]">
                      #{stagedAuditId.slice(0, 8)}
                    </code>
                  </span>
                )}
                . Ready for AI Vision extraction!
              </p>
            </div>
          </div>

          {/* Senior / PWD Toggle */}
          {setIsSeniorOrPwd && (
            <div className="p-3 bg-[#F3F4F6] rounded-2xl border border-[#CBD5E1] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="senior-pwd-checkbox"
                  checked={isSeniorOrPwd}
                  onChange={(e) => setIsSeniorOrPwd(e.target.checked)}
                  disabled={isBusy}
                  className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] border-[#CBD5E1]"
                />
                <label
                  htmlFor="senior-pwd-checkbox"
                  className="text-xs font-bold text-[#1E293B] cursor-pointer"
                >
                  Apply Senior Citizen (60+) or PWD 20% + 12% VAT Audit (RA 9994 / RA 10754)
                </label>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
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
                className="flex-1 font-bold bg-[#2563EB] hover:bg-[#1D4ED8] shadow-sm h-11"
              >
                {isAnalyzingOcr ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
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
              className="border-[#CBD5E1] text-[#1E293B] font-bold"
            >
              <Trash2 className="w-4 h-4 text-[#64748B]" />
              <span>Clear</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pre-upload view (Staging review)
  return (
    <Card className="border-[#CBD5E1] bg-white shadow-soft animate-in fade-in duration-200">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div>
          <label
            htmlFor="hospital-name-input"
            className="flex items-center gap-1.5 text-xs font-bold text-[#1E293B] mb-1.5"
          >
            <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>
              Hospital / Healthcare Facility{" "}
              <span className="font-normal text-[#64748B]">
                (Optional — auto-detected in Week 3 OCR)
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
            className="w-full rounded-full bg-[#F3F4F6] border border-[#CBD5E1] px-4 py-2.5 text-xs sm:text-sm text-[#1E293B] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
          />
        </div>

        {/* Senior / PWD Toggle */}
        {setIsSeniorOrPwd && (
          <div className="p-3 bg-[#F3F4F6] rounded-2xl border border-[#CBD5E1] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pre-senior-pwd-checkbox"
                checked={isSeniorOrPwd}
                onChange={(e) => setIsSeniorOrPwd(e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] border-[#CBD5E1]"
              />
              <label
                htmlFor="pre-senior-pwd-checkbox"
                className="text-xs font-bold text-[#1E293B] cursor-pointer"
              >
                Patient is a Senior Citizen (60+) or PWD
              </label>
            </div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase">
              RA 9994 / RA 10754
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={isBusy}
            onClick={onUploadAndStage}
            className="flex-1 font-bold bg-[#2563EB] hover:bg-[#1D4ED8] h-11"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
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
            className="border-[#CBD5E1] text-[#1E293B] font-bold"
          >
            <Trash2 className="w-4 h-4 text-[#64748B]" />
            <span>Clear</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
