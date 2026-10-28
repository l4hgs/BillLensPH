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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/types/audit";

interface StatementStagingCardProps {
  pageCount: number;
  stage: PipelineStage;
  statusMessage: string;
  hospitalName: string;
  setHospitalName: (name: string) => void;
  stagedAuditId: string | null;
  onUploadAndStage: () => void;
  onResetAll: () => void;
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
}: StatementStagingCardProps) {
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db";

  if (pageCount === 0) return null;

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
                Statement Uploaded & Staged in Supabase
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Stored securely in{" "}
                <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[11px]">
                  bill-uploads
                </code>{" "}
                and linked to draft audit{" "}
                {stagedAuditId && (
                  <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[11px]">
                    #{stagedAuditId.slice(0, 8)}
                  </code>
                )}
                .
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <Link href="/audits" className="flex-1">
              <Button variant="primary" size="md" className="w-full font-bold">
                <span>View Staged Bill in Audits</span>
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
              <span>Scan Another Bill</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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

