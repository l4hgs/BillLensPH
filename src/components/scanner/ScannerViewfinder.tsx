"use client";

import React from "react";
import {
  Zap,
  Grid,
  CheckCircle2,
  Loader2,
  Sparkles,
  FileText,
  ArrowRight,
  RotateCcw,
  Trash2,
  UploadCloud,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatFileSize } from "@/lib/imageCompression";
import type { ScannedPage, PipelineStage } from "@/types/audit";

interface ScannerViewfinderProps {
  pages: ScannedPage[];
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  stage: PipelineStage;
  statusMessage: string;
  uploadProgress: number;
  isFlashOn: boolean;
  setIsFlashOn: (val: boolean) => void;
  showGrid: boolean;
  setShowGrid: (val: boolean) => void;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowseFiles: () => void;
  onRetakeActive: () => void;
  onRemovePage: (index: number) => void;
}

export function ScannerViewfinder({
  pages,
  activePageIndex,
  setActivePageIndex,
  stage,
  statusMessage,
  uploadProgress,
  isFlashOn,
  setIsFlashOn,
  showGrid,
  setShowGrid,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowseFiles,
  onRetakeActive,
  onRemovePage,
}: ScannerViewfinderProps) {
  const activePage = pages[activePageIndex] ?? null;
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db";

  const totalOriginalBytes = pages.reduce(
    (acc, p) => acc + p.result.originalSize,
    0
  );
  const totalCompressedBytes = pages.reduce(
    (acc, p) => acc + p.result.compressedSize,
    0
  );
  const overallSavingsPercent =
    totalOriginalBytes > 0
      ? Math.max(
          0,
          Math.round(
            ((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) *
              100
          )
        )
      : 0;

  return (
    <Card
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`overflow-hidden border transition-all duration-200 shadow-soft bg-white ${
        isDragging
          ? "border-blue-500 ring-4 ring-blue-500/15 bg-blue-50/20"
          : "border-slate-100"
      }`}
    >
      <div className="p-5 sm:p-7 flex flex-col items-center bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
        {/* Top Bar inside Viewfinder */}
        <div className="w-full flex items-center justify-between mb-4">
          {stage === "completed" ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>STAGED FOR AI OCR</span>
            </div>
          ) : isBusy ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>
                {stage === "compressing"
                  ? "COMPRESSING IMAGE..."
                  : stage === "uploading"
                  ? "ENCRYPTED UPLOAD..."
                  : "STAGING AUDIT..."}
              </span>
            </div>
          ) : activePage ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>
                PAGE {activePageIndex + 1} OF {pages.length} LOCKED
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>AUTO-FRAME READY</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFlashOn(!isFlashOn)}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                isFlashOn
                  ? "bg-amber-100 border-amber-300 text-amber-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              aria-label="Toggle Flash"
            >
              <Zap className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                showGrid
                  ? "bg-blue-50 border-blue-200 text-blue-600"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              aria-label="Toggle Grid"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Central Camera Reticle & Interactive Dropzone Frame */}
        <div
          onClick={() => {
            if (!activePage && !isBusy) {
              onBrowseFiles();
            }
          }}
          className={`relative w-full max-w-xs sm:max-w-sm h-72 sm:h-84 my-3 flex items-center justify-center rounded-2xl overflow-hidden transition-all ${
            !activePage && !isBusy ? "cursor-pointer hover:bg-blue-50/30" : ""
          }`}
        >
          {/* Viewfinder Corner Brackets */}
          <div className="absolute top-0 left-0 w-12 h-12 border-t-[3.5px] border-l-[3.5px] border-blue-600 rounded-tl-2xl z-20 pointer-events-none" />
          <div className="absolute top-0 right-0 w-12 h-12 border-t-[3.5px] border-r-[3.5px] border-blue-600 rounded-tr-2xl z-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[3.5px] border-l-[3.5px] border-blue-600 rounded-bl-2xl z-20 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[3.5px] border-r-[3.5px] border-blue-600 rounded-br-2xl z-20 pointer-events-none" />

          {/* Optional 3x3 Alignment Grid Overlay */}
          {showGrid && (
            <div className="absolute inset-4 grid grid-cols-3 grid-rows-3 pointer-events-none z-10 opacity-25">
              <div className="border-r border-b border-blue-400" />
              <div className="border-r border-b border-blue-400" />
              <div className="border-b border-blue-400" />
              <div className="border-r border-b border-blue-400" />
              <div className="border-r border-b border-blue-400" />
              <div className="border-b border-blue-400" />
              <div className="border-r border-blue-400" />
              <div className="border-r border-blue-400" />
              <div />
            </div>
          )}

          {/* STATE A: Live Preview of Selected Image or PDF inside Reticle */}
          {activePage ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-2.5 bg-slate-900/5">
              {activePage.result.mimeType === "application/pdf" ? (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-white/95 rounded-2xl border border-slate-200 shadow-sm max-w-[240px]">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-3">
                    <FileText className="w-7 h-7" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 line-clamp-2 break-all">
                    {activePage.originalName}
                  </p>
                  <span className="mt-1 text-[11px] font-medium text-slate-500">
                    PDF Statement •{" "}
                    {formatFileSize(activePage.result.compressedSize)}
                  </span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activePage.result.previewUrl}
                  alt={activePage.originalName}
                  className="w-full h-full object-contain rounded-xl shadow-xs bg-white"
                />
              )}

              {/* Compression Badge Overlay inside top of reticle */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1.5 z-20 shadow-sm">
                {activePage.result.wasCompressed ? (
                  <>
                    <span className="text-slate-300 line-through">
                      {formatFileSize(activePage.result.originalSize)}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-emerald-300 font-bold">
                      {formatFileSize(activePage.result.compressedSize)}
                    </span>
                    <span className="text-emerald-400">
                      (-{activePage.result.compressionRatio}%)
                    </span>
                  </>
                ) : (
                  <span>
                    {formatFileSize(activePage.result.compressedSize)} •{" "}
                    {activePage.result.mimeType === "application/pdf"
                      ? "PDF Ready"
                      : "Optimal"}
                  </span>
                )}
              </div>

              {/* Quick Retake / Delete floating pills at bottom of reticle */}
              {!isBusy && stage !== "completed" && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetakeActive();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white text-slate-800 border border-slate-200 text-[11px] font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-blue-600" />
                    <span>Retake</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePage(activePageIndex);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 hover:bg-rose-50 text-rose-600 border border-slate-200 text-[11px] font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* STATE B: Empty Viewfinder with Laser Line & Dropzone Prompt */
            <>
              <div className="absolute left-6 right-6 h-[2px] bg-blue-600 shadow-[0_0_24px_4px_rgba(37,99,235,0.7)] animate-pulse z-10 pointer-events-none" />
              <div className="absolute top-6 bottom-6 w-[1.5px] bg-blue-500/35 pointer-events-none" />

              <div className="flex flex-col items-center justify-center text-center px-6 z-10">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3 shadow-2xs">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {isDragging
                    ? "Drop hospital bill here"
                    : "Tap or drag & drop statement here"}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Auto-downscales to 1600px • WebP/JPEG (~300KB)
                </p>

                <div className="w-40 space-y-2 opacity-20 pointer-events-none mt-4">
                  <div className="h-2 bg-slate-500 rounded-full w-full" />
                  <div className="h-1.5 bg-slate-400 rounded-full w-5/6 mx-auto" />
                  <div className="h-1.5 bg-slate-400 rounded-full w-4/6 mx-auto" />
                </div>
              </div>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-xs font-medium text-slate-700 shadow-xs z-20">
                Align Itemized Statement (ISA) within frame
              </div>
            </>
          )}

          {/* Loading / Progress Overlay inside Reticle */}
          {isBusy && (
            <div className="absolute inset-0 bg-white/85 backdrop-blur-xs z-30 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                {statusMessage}
              </p>
              {(stage === "uploading" || stage === "staging_db") && (
                <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-Page Statement Queue Strip */}
        {pages.length > 0 && (
          <div className="w-full max-w-sm mt-2 pt-3 border-t border-slate-200/80">
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-2">
              <span className="font-bold text-slate-800">
                Statement Pages ({pages.length})
              </span>
              <span>
                Total: {formatFileSize(totalCompressedBytes)}{" "}
                {overallSavingsPercent > 0 && (
                  <span className="text-emerald-600 font-semibold">
                    (Saved {overallSavingsPercent}%)
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {pages.map((p, idx) => {
                const isSelected = idx === activePageIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePageIndex(idx)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>Page {idx + 1}</span>
                  </button>
                );
              })}

              {stage !== "completed" && !isBusy && (
                <button
                  type="button"
                  onClick={onBrowseFiles}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-blue-300 text-blue-600 bg-blue-50/50 hover:bg-blue-50 transition-all shrink-0 cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Page</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Supported Forms note */}
        <p className="text-xs text-slate-600 text-center mt-2">
          Supports DOH standard billing, PhilHealth CF2 & SOA forms
        </p>
      </div>
    </Card>
  );
}

