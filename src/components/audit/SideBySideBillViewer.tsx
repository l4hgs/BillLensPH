"use client";

import React, { useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  FileText,
  ImageIcon,
} from "lucide-react";
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

export function SideBySideBillViewer({
  images,
  hospitalName,
  onClose,
  className,
}: SideBySideBillViewerProps) {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-3xl border border-slate-200/90 bg-slate-50 p-6 text-center text-slate-500 shadow-soft",
          className
        )}
      >
        <ImageIcon className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-xs font-bold text-slate-700">No statement photo available</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
          This audit was generated without attached storage images.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
          >
            Close side-by-side view
          </button>
        )}
      </div>
    );
  }

  const currentPage = images[Math.min(activePageIndex, images.length - 1)];
  const isPdf =
    currentPage.mimeType === "application/pdf" ||
    currentPage.url.toLowerCase().includes(".pdf");

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const viewerControls = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3.5 py-2.5 text-white backdrop-blur-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-bold truncate text-slate-200">
          <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{hospitalName || "Original Statement"}</span>
        </span>

        {images.length > 1 && (
          <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-full text-[11px] font-bold text-slate-300 shrink-0">
            <button
              type="button"
              disabled={activePageIndex === 0}
              onClick={() => setActivePageIndex((p) => Math.max(p - 1, 0))}
              aria-label="Previous page"
              className="hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span>
              {activePageIndex + 1}/{images.length}
            </span>
            <button
              type="button"
              disabled={activePageIndex >= images.length - 1}
              onClick={() =>
                setActivePageIndex((p) => Math.min(p + 1, images.length - 1))
              }
              aria-label="Next page"
              className="hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right controls: Zoom & Maximize */}
      <div className="flex items-center gap-1 shrink-0">
        {!isPdf && (
          <div className="flex items-center gap-1 bg-slate-800/90 rounded-full px-1.5 py-0.5 text-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              title="Zoom out"
              className="p-1 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset zoom (100%)"
              className="px-1 text-[10px] font-mono font-bold text-slate-300 hover:text-white cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3.0}
              title="Zoom in"
              className="p-1 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset"
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsFullScreen((prev) => !prev)}
          title={isFullScreen ? "Exit fullscreen" : "Fullscreen preview"}
          className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <a
          href={currentPage.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original file in new tab"
          className="p-1.5 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Hide side-by-side view"
            className="p-1.5 rounded-full hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Side-by-Side Panel (Sticky on Desktop) */}
      <div
        className={cn(
          "flex flex-col rounded-3xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden",
          className
        )}
      >
        {viewerControls}

        {/* Content Viewer Body */}
        <div className="flex-1 min-h-[350px] overflow-auto p-3 flex items-start justify-center bg-slate-950/90 relative select-none">
          {isPdf ? (
            <iframe
              src={currentPage.url}
              title="Hospital Bill PDF Document"
              className="w-full h-full min-h-[500px] rounded-2xl border border-slate-800 bg-white"
            />
          ) : (
            <div className="w-full h-full flex items-start justify-center overflow-auto p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentPage.url}
                alt={hospitalName || "Hospital statement scanned document"}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  transition: "transform 150ms ease-out",
                }}
                className="max-w-full rounded-xl object-contain shadow-2xl border border-slate-800 bg-white"
                loading="eager"
              />
            </div>
          )}
        </div>

        {/* Page Switcher Thumbnails Bar if Multiple Pages */}
        {images.length > 1 && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800 bg-slate-900/90 overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActivePageIndex(idx)}
                className={cn(
                  "relative h-11 w-9 rounded-lg overflow-hidden border shrink-0 transition-all cursor-pointer",
                  activePageIndex === idx
                    ? "border-blue-500 ring-2 ring-blue-500/50"
                    : "border-slate-700 opacity-60 hover:opacity-100"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`Thumbnail page ${idx + 1}`}
                  className="w-full h-full object-cover object-top"
                />
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-bold text-white text-center py-0.2">
                  {idx + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen Modal Lightbox */}
      {isFullScreen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 transition-opacity duration-150"
          onClick={() => setIsFullScreen(false)}
        >
          <div
            className="relative w-full max-w-5xl h-[94vh] bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {viewerControls}

            <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-slate-950">
              {isPdf ? (
                <iframe
                  src={currentPage.url}
                  title="Hospital Bill PDF Document"
                  className="w-full h-full rounded-2xl border border-slate-800 bg-white"
                />
              ) : (
                <div className="w-full h-full flex items-start justify-center overflow-auto p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentPage.url}
                    alt={hospitalName || "Hospital statement"}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "top center",
                      transition: "transform 150ms ease-out",
                    }}
                    className="max-w-full rounded-xl object-contain shadow-2xl border border-slate-800 bg-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
