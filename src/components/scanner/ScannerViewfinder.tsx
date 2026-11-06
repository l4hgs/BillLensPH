"use client";

import React from "react";
import { UploadCloud, Trash2, X } from "lucide-react";
import { formatFileSize } from "@/lib/imageCompression";
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
}: ScannerViewfinderProps) {
  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db";

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="w-full rounded-[28px] bg-white border border-[#CBD5E1]/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 transition-all"
    >
      {/* Dropzone Container */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!isBusy) {
            onBrowseFiles();
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isBusy) {
            e.preventDefault();
            onBrowseFiles();
          }
        }}
        className={`w-full min-h-[220px] sm:min-h-[240px] rounded-2xl transition-all duration-200 flex flex-col items-center justify-center p-6 sm:p-8 text-center cursor-pointer select-none ${
          isDragging
            ? "bg-[#E8EDF5] ring-2 ring-[#2563EB]/40"
            : "bg-[#F1F3F5] hover:bg-[#EAECEF]"
        }`}
      >
        {/* Upload Icon Tile */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white shadow-xs flex items-center justify-center mb-3 sm:mb-3.5 text-[#1E293B]">
          <UploadCloud className="w-7 h-7 stroke-[1.8] text-[#1E293B]" />
        </div>

        {/* Dropzone Title */}
        <p className="font-semibold text-sm sm:text-base text-[#1E293B]">
          {isDragging
            ? "Drop statement here"
            : "Tap or drag & drop statement here"}
        </p>

        {/* Dropzone Helper Text */}
        <p className="text-xs text-[#64748B] mt-1">
          Auto-downscales to 1600px • WebP/JPEG (~300KB)
        </p>
      </div>

      {/* Caption below dropzone */}
      <p className="text-xs text-[#64748B] text-center mt-3 sm:mt-4 font-normal">
        Supports DOH standard billing, PhilHealth CF2 & SOA forms
      </p>

      {/* File Rows List */}
      {pages.length > 0 && (
        <div className="mt-6 space-y-3">
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
              <React.Fragment key={page.id}>
                {index > 0 && (
                  <div className="flex justify-center items-center gap-1.5 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                    <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                    <span className="w-1 h-1 rounded-full bg-[#CBD5E1]" />
                  </div>
                )}

                <div
                  onClick={() => setActivePageIndex(index)}
                  className={`w-full rounded-2xl border bg-white p-3.5 sm:p-4 transition-all duration-200 ${
                    index === activePageIndex
                      ? "border-[#2563EB]/40 shadow-xs"
                      : "border-[#E5E7EB] hover:border-[#CBD5E1]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* File Type Tile */}
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#F4F4F5] border border-[#E5E7EB] flex items-center justify-center shrink-0">
                        <span className="text-[11px] sm:text-xs font-bold text-[#1E293B] uppercase tracking-wider">
                          {fileType}
                        </span>
                      </div>

                      {/* Filename & Size Stack */}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                          {page.originalName}
                        </p>
                        <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5">
                          {isRowInProgress ? progressText : formatFileSize(page.result.compressedSize)}
                        </p>
                      </div>
                    </div>

                    {/* Action Icon: X (cancel) when in-progress, Trash when idle */}
                    {isRowInProgress ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePage(index);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:bg-[#F4F4F5] transition-colors cursor-pointer shrink-0"
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
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#DC2626] hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        aria-label="Remove statement file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Thin Rounded Progress Bar */}
                  {isRowInProgress && (
                    <div className="w-full h-1 bg-[#E5E7EB] rounded-full overflow-hidden mt-3">
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
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
