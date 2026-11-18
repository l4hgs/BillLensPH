"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useScanBackground } from "./ScanBackgroundProvider";
import { cn } from "@/lib/utils";

export function BackgroundScanToast() {
  const pathname = usePathname();
  const { scanState, isBusy, dismissNotice } = useScanBackground();

  // If user is already on /scanner, the page itself renders the full primary UI
  const isOnScanner = pathname === "/scanner";

  // Hide toast when idle or when on the scanner page during active upload (to prevent duplicate progress indicators)
  if (scanState.stage === "idle") return null;
  if (isOnScanner && isBusy) return null;

  return (
    <aside
      aria-label="Background scan status"
      className="fixed bottom-20 sm:bottom-5 right-4 sm:right-5 z-50 max-w-xs w-[calc(100vw-2rem)]"
    >
      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-md transition-all",
          isBusy && "bg-slate-900/95 border-blue-500/40 text-white",
          scanState.stage === "completed" &&
            "bg-emerald-950/95 border-emerald-500/50 text-white",
          scanState.stage === "error" &&
            "bg-rose-950/95 border-rose-500/50 text-white"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                isBusy && "bg-blue-600/30 text-blue-400",
                scanState.stage === "completed" &&
                  "bg-emerald-600/30 text-emerald-400",
                scanState.stage === "error" && "bg-rose-600/30 text-rose-400"
              )}
            >
              {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {scanState.stage === "completed" && (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {scanState.stage === "error" && (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold leading-tight truncate">
                  {isBusy && "Bill Audit in Progress"}
                  {scanState.stage === "completed" && "Audit Ready"}
                  {scanState.stage === "error" && "Audit Interrupted"}
                </span>
                {isBusy && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300">
                    {scanState.progress}%
                  </span>
                )}
              </div>

              <p className="text-[10px] text-slate-300 line-clamp-1">
                {scanState.statusMessage ||
                  scanState.errorMessage ||
                  scanState.hospitalName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss notice"
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Progress bar while scanning */}
        {isBusy && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-300"
              style={{ width: `${scanState.progress}%` }}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-2 flex items-center justify-end gap-1.5 pt-1.5 border-t border-white/10">
          {isBusy && (
            <Link
              href="/scanner"
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-xs transition-colors"
            >
              <span>Scan Hub</span>
              <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )}

          {scanState.stage === "completed" && scanState.auditId && (
            <Link
              href={`/audits/${scanState.auditId}`}
              onClick={dismissNotice}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-black shadow-xs transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              <span>Open Studio</span>
              <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )}

          {scanState.stage === "error" && (
            <Link
              href="/scanner"
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors"
            >
              <span>Retry</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
