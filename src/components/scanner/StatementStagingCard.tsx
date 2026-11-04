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
      <Card className="border-blue-200 bg-blue-50/40 shadow-soft animate-in fade-in duration-300">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-slate-900">
                    AI OCR & PhilHealth Audit Complete!
                  </h4>
                  <Badge variant="primary" dot>
                    Gemini Flash
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Extracted {ocrAuditResult.line_items.length} line items from{" "}
                  <strong>{ocrAuditResult.hospital_name}</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                Total Billed
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900">
                {formatPHP(ocrAuditResult.gross_total)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-amber-200/80 bg-amber-50/20">
              <span className="text-[10px] font-bold text-amber-700 uppercase block flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                Overcharges Flagged
              </span>
              <span className="text-sm sm:text-base font-black text-amber-900">
                {formatPHP(ocrAuditResult.disputed_overcharge_total + ocrAuditResult.senior_pwd_savings)}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-white border border-emerald-200/80 bg-emerald-50/20">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Fair Balance Due
              </span>
              <span className="text-sm sm:text-base font-black text-emerald-900">
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
              <Button variant="primary" size="md" className="w-full font-bold">
                <span>Open in Audit Studio</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onResetAll}
            >
              <Camera className="w-4 h-4 text-blue-600" />
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
      <Card className="border-emerald-200 bg-emerald-50/40 shadow-soft animate-in fade-in duration-300">
        <CardContent className="p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm sm:text-base text-slate-900">
                Statement Staged in Supabase Storage
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Saved securely in{" "}
                <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[11px]">
                  bill-uploads
                </code>
                {stagedAuditId && (
                  <span>
                    {" "}
                    as Draft{" "}
                    <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[11px]">
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
            <div className="p-3 bg-white rounded-2xl border border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="senior-pwd-checkbox"
                  checked={isSeniorOrPwd}
                  onChange={(e) => setIsSeniorOrPwd(e.target.checked)}
                  disabled={isBusy}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <label
                  htmlFor="senior-pwd-checkbox"
                  className="text-xs font-semibold text-slate-800 cursor-pointer"
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
                className="flex-1 font-bold bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {isAnalyzingOcr ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing with Gemini Flash OCR...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
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
            >
              <Trash2 className="w-4 h-4 text-slate-500" />
              <span>Clear</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pre-upload view (Staging review)
  return (
    <Card className="border-blue-100 bg-white shadow-soft animate-in fade-in duration-200">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div>
          <label
            htmlFor="hospital-name-input"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5"
          >
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Hospital / Healthcare Facility{" "}
              <span className="font-normal text-slate-400">
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
            className="w-full rounded-full bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Senior / PWD Toggle */}
        {setIsSeniorOrPwd && (
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pre-senior-pwd-checkbox"
                checked={isSeniorOrPwd}
                onChange={(e) => setIsSeniorOrPwd(e.target.checked)}
                disabled={isBusy}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <label
                htmlFor="pre-senior-pwd-checkbox"
                className="text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Patient is a Senior Citizen (60+) or PWD
              </label>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase">
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
            className="flex-1 font-bold"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{statusMessage || "Processing..."}</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
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
          >
            <Trash2 className="w-4 h-4 text-slate-500" />
            <span>Clear</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
