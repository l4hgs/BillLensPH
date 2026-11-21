"use client";

import React from "react";
import Link from "next/link";
import {
  UploadCloud,
  Trash2,
  X,
  Image as ImageIcon,
  Camera,
  CheckCircle2,
  Sparkles,
  SlidersHorizontal,
  Plus,
} from "lucide-react";
import { formatFileSize } from "@/lib/imageCompression";
import { cn } from "@/lib/utils";
import type { ScannedPage, PipelineStage } from "@/types/audit";

interface ScannerViewfinderProps {
  pages: ScannedPage[];
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  stage: PipelineStage;
  statusMessage: string;
  uploadProgress: number;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowseFiles: () => void;
  onRemovePage: (index: number) => void;
  onTakePhoto?: () => void;
  isAuditComplete?: boolean;
}

function getFileTypeLabel(page: ScannedPage): string {
  const mime = page.result.mimeType?.toLowerCase() || "";
  const name = page.originalName.toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (mime.includes("png") || name.endsWith(".png")) return "PNG";
  if (mime.includes("webp") || name.endsWith(".webp")) return "WEBP";
  if (mime.includes("heic") || name.endsWith(".heic")) return "HEIC";
  return "JPG";
}

export function ScannerViewfinder({
  pages,
  activePageIndex,
  setActivePageIndex,
  stage,
  statusMessage,
  uploadProgress,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowseFiles,
  onRemovePage,
  onTakePhoto,
  isAuditComplete = false,
}: ScannerViewfinderProps) {
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db";

  // When no pages are uploaded yet: display full-width primary dropzone
  if (pages.length === 0) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="w-full space-y-4"
      >
        {/* Primary Dropzone Affordance - Full-Width Editorial Surface */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload hospital statement document or take photo"
          onClick={() => {
            if (!isBusy) onBrowseFiles();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isBusy) {
              e.preventDefault();
              onBrowseFiles();
            }
          }}
          className={cn(
            "group relative w-full rounded-3xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer select-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2",
            isDragging
              ? "border-[#2563EB] bg-blue-50/70 ring-4 ring-[#2563EB]/15 scale-[1.005]"
              : "border-slate-300 bg-white hover:border-[#2563EB]/70 hover:bg-slate-50/70 shadow-soft"
          )}
        >
          {/* Central Icon */}
          <div
            className={cn(
              "w-16 h-16 sm:w-18 sm:h-18 rounded-2xl mx-auto flex items-center justify-center mb-4 transition-all duration-200 shadow-xs",
              isDragging
                ? "bg-[#2563EB] text-white scale-110"
                : "bg-blue-50/80 border border-blue-200/80 text-[#2563EB] group-hover:scale-105"
            )}
          >
            <UploadCloud className="w-8 h-8 stroke-[1.8]" />
          </div>

          {/* Clear Primary Copy */}
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {isDragging
              ? "Drop your statement file here"
              : "Tap to select or drag & drop statement here"}
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Select multi-page hospital bills, clinic charge sheets, or itemized PDF statements.
          </p>

          {/* Initial Upload Button Cluster (Dominant when empty) */}
          <div
            className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={isBusy}
              onClick={onBrowseFiles}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer inline-flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Upload Photo / PDF</span>
            </button>

            {onTakePhoto && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onTakePhoto}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer inline-flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                <Camera className="w-4 h-4 text-slate-600" />
                <span>Take Photo</span>
              </button>
            )}
          </div>
        </div>

        {/* Technical Cues & Non-Competing Progressive Disclosure */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-1 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 font-medium border border-slate-200/50">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>DOH Standard Billing</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 font-medium border border-slate-200/50">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>PhilHealth CF2 &amp; SOA</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 font-medium border border-slate-200/50">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Auto-downscales 1600px • WebP/JPEG</span>
            </span>
          </div>

          <Link
            href="/rates"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-[#2563EB] font-semibold transition-colors shrink-0 group text-[11px] sm:text-xs min-h-[44px] sm:min-h-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#2563EB] transition-colors" />
            <span>PhilHealth ACR Directory</span>
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </Link>
        </div>
      </div>
    );
  }

  // When pages ARE staged: render compact staged list with clean consolidated actions
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="w-full space-y-3"
    >
      {/* Staged Pages Section Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
            {isAuditComplete
              ? `Audited Statement (${pages.length} ${pages.length === 1 ? "page" : "pages"})`
              : `Staged Statement Pages (${pages.length})`}
          </h3>
          <span
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-full",
              isAuditComplete
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-500"
            )}
          >
            {isAuditComplete ? "Audited" : "Ready for audit"}
          </span>
        </div>

        {/* Consolidated "+ Add another page" text action */}
        {!isAuditComplete && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onBrowseFiles}
            className="text-xs font-semibold text-slate-600 hover:text-[#2563EB] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 min-h-[44px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add another page</span>
          </button>
        )}
      </div>

      {/* Staged File Cards */}
      <div className="space-y-2">
        {pages.map((page, index) => {
          const isRowInProgress = isBusy && index === activePageIndex;
          const fileType = getFileTypeLabel(page);

          let progressText = `${formatFileSize(page.result.compressedSize)}`;
          if (stage === "uploading") {
            const currentBytes = Math.round(
              (uploadProgress / 100) * page.result.compressedSize
            );
            progressText = `${formatFileSize(currentBytes)} of ${formatFileSize(page.result.compressedSize)}`;
          } else if (stage === "compressing") {
            progressText = statusMessage || `Optimizing page ${index + 1}...`;
          } else if (stage === "staging_db") {
            progressText = "Staging draft audit...";
          }

          return (
            <div
              key={page.id}
              onClick={() => setActivePageIndex(index)}
              className={cn(
                "w-full rounded-2xl border bg-white p-3 sm:p-3.5 transition-all duration-200 cursor-pointer shadow-xs",
                index === activePageIndex
                  ? "border-[#2563EB]/60 ring-2 ring-[#2563EB]/10"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* File Type Pill */}
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      {fileType}
                    </span>
                  </div>

                  {/* Filename & Size Metadata */}
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-md">
                      {page.originalName}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isRowInProgress
                        ? progressText
                        : `Page ${index + 1} • ${formatFileSize(page.result.compressedSize)}`}
                    </p>
                  </div>
                </div>

                {/* Cancel or Remove Action */}
                {isRowInProgress ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePage(index);
                    }}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    aria-label="Cancel upload"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePage(index);
                    }}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    aria-label="Remove statement file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* In-row progress indicator */}
              {isRowInProgress && (
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-2.5">
                  <div
                    className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                    style={{
                      width:
                        stage === "uploading"
                          ? `${Math.max(8, uploadProgress)}%`
                          : "65%",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clean Single Drop Zone (No redundant nested buttons; clicking or dropping triggers file upload) */}
      {!isBusy && !isAuditComplete && (
        <div
          role="button"
          tabIndex={0}
          onClick={onBrowseFiles}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onBrowseFiles();
            }
          }}
          className={cn(
            "rounded-2xl border border-dashed transition-all p-3 sm:px-4 sm:py-2.5 flex items-center justify-center gap-2 cursor-pointer text-xs font-medium",
            isDragging
              ? "border-[#2563EB] bg-blue-50/70 text-[#2563EB] ring-2 ring-[#2563EB]/20"
              : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 hover:border-slate-300 text-slate-500 hover:text-slate-700"
          )}
        >
          <UploadCloud className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            {isDragging
              ? "Drop page here to add"
              : "Drop another page here or click to browse"}
          </span>
        </div>
      )}
    </div>
  );
}
