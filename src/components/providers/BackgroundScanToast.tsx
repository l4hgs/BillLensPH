"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { useScanBackground } from "./ScanBackgroundProvider";
import { cn } from "@/lib/utils";

/**
 * Minimal editorial background scan status toast.
 * Automatically dismisses completed notices after 4000ms (pauses on hover/focus).
 */
export function BackgroundScanToast() {
  const pathname = usePathname();
  const { scanState, isBusy, dismissNotice } = useScanBackground();
  const timerRef = useRef<number | null>(null);

  const isOnScanner = pathname === "/scanner";
  const isVisible =
    scanState.stage !== "idle" && !(isOnScanner && isBusy);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startAutoDismiss = () => {
    if (scanState.stage !== "completed") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      dismissNotice();
    }, 4000);
  };

  useEffect(() => {
    if (isVisible && scanState.stage === "completed") {
      startAutoDismiss();
      return clearTimer;
    }
    clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, scanState.stage]);

  if (!isVisible) return null;

  const isError = scanState.stage === "error";
  const isCompleted = scanState.stage === "completed";

  return (
    <aside
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-label="Background scan status"
      onMouseEnter={clearTimer}
      onMouseLeave={startAutoDismiss}
      onFocus={clearTimer}
      onBlur={startAutoDismiss}
      className="no-print print:hidden fixed z-[115] top-[72px] sm:top-[80px] lg:top-auto lg:bottom-24 right-4 left-4 sm:left-auto sm:w-full sm:max-w-xs"
    >
      <div className="animate-fade-slide-in motion-reduce:animate-none rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-slate-900 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isBusy && "bg-[#2563EB] animate-pulse motion-reduce:animate-none",
                isCompleted && "bg-emerald-500",
                isError && "bg-rose-500"
              )}
            />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold leading-tight truncate text-slate-900">
                  {isBusy && "Auditing statement"}
                  {isCompleted && "Audit ready"}
                  {isError && "Audit interrupted"}
                </span>
                {isBusy && (
                  <span className="text-[10px] font-mono font-bold text-[#2563EB] tabular-nums">
                    {scanState.progress}%
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 line-clamp-1">
                {scanState.statusMessage ||
                  scanState.errorMessage ||
                  scanState.hospitalName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss scan notice"
            className="min-w-[44px] min-h-[44px] -mr-2 -my-1.5 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {isBusy && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-[#2563EB] transition-all duration-300 motion-reduce:transition-none"
              style={{ width: `${scanState.progress}%` }}
            />
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2 pt-1.5 border-t border-slate-200/80">
          {isBusy && (
            <Link
              href="/scanner"
              className="min-h-[36px] px-2.5 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline"
            >
              <span>Scan Hub</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}

          {isCompleted && scanState.auditId && (
            <Link
              href={`/audits/${scanState.auditId}`}
              onClick={dismissNotice}
              className="min-h-[36px] px-2.5 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline"
            >
              <span>Open Studio</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}

          {isError && (
            <Link
              href="/scanner"
              onClick={dismissNotice}
              className="min-h-[36px] px-2.5 inline-flex items-center text-xs font-bold text-rose-600 hover:underline"
            >
              <span>Retry in Scan Hub</span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
