"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BillImagePage {
  url: string;
  name?: string;
  mimeType?: string;
}

export interface SideBySideBillViewerProps {
  images: BillImagePage[];
  hospitalName?: string;
  onClose?: () => void;
  className?: string;
}

/**
 * Clean, borderless statement image viewer with page steppers when multi-page.
 * Tapping an image opens a simple fullscreen lightbox for closer inspection.
 */
export function SideBySideBillViewer({
  images,
  hospitalName,
  onClose,
  className,
}: SideBySideBillViewerProps) {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!isFullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white p-6 text-center text-slate-500",
          className
        )}
      >
        <ImageIcon className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-xs font-bold text-slate-700">
          No statement photo available
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 min-h-[44px] px-3 text-xs font-bold text-[#2563EB] hover:underline cursor-pointer rounded-lg"
          >
            Hide photo
          </button>
        )}
      </div>
    );
  }

  const currentPage = images[Math.min(activePageIndex, images.length - 1)];
  const isPdf =
    currentPage.mimeType === "application/pdf" ||
    currentPage.url.toLowerCase().includes(".pdf");

  const renderPageStepper = () => {
    if (images.length <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-1.5 pt-2">
        <button
          type="button"
          disabled={activePageIndex === 0}
          onClick={() => setActivePageIndex((p) => Math.max(p - 1, 0))}
          aria-label="Previous statement page"
          className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-semibold font-mono tabular-nums text-slate-600 px-1.5">
          Page {activePageIndex + 1} of {images.length}
        </span>
        <button
          type="button"
          disabled={activePageIndex >= images.length - 1}
          onClick={() =>
            setActivePageIndex((p) => Math.min(p + 1, images.length - 1))
          }
          aria-label="Next statement page"
          className="w-8 h-8 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <>
      <div className={cn("flex flex-col", className)}>
        {isPdf ? (
          <iframe
            src={currentPage.url}
            title="Hospital Bill PDF Document"
            className="w-full h-[360px] sm:h-[440px] lg:h-[calc(100vh-12rem)] rounded-xl border border-slate-200 bg-white"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsFullScreen(true)}
            aria-label={`Enlarge ${hospitalName || "hospital statement"} photo`}
            className="w-full h-[360px] sm:h-[440px] lg:h-[calc(100vh-12rem)] flex items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPage.url}
              alt={hospitalName || "Hospital statement scanned document"}
              className="max-h-full max-w-full rounded-lg object-contain bg-white"
              loading="eager"
            />
          </button>
        )}

        {renderPageStepper()}
      </div>

      {/* Simple Fullscreen Lightbox on Tap */}
      {isFullScreen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Statement preview for ${hospitalName || "hospital bill"}`}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 p-4 sm:p-6"
            onClick={() => setIsFullScreen(false)}
          >
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              aria-label="Close enlarged preview"
              className="self-end mb-2.5 w-9 h-9 flex items-center justify-center rounded-full bg-white text-slate-900 shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="max-w-4xl w-full max-h-[80dvh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPage.url}
                alt={hospitalName || "Hospital statement"}
                className="max-w-full max-h-[72dvh] rounded-xl object-contain bg-white shadow-2xl"
              />
              {images.length > 1 && (
                <div className="mt-2.5 rounded-full bg-white/95 px-2.5 pb-1.5 pt-0.5 shadow-lg">
                  {renderPageStepper()}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
