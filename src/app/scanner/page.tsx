"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Zap,
  Grid,
  Image as ImageIcon,
  Camera,
  SlidersHorizontal,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Accessibility,
  UploadCloud,
  FileText,
  Trash2,
  RotateCcw,
  Plus,
  Loader2,
  Sparkles,
  AlertCircle,
  Building2,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModeSelector } from "@/components/layout/ModeSelector";
import { createClient } from "@/lib/supabase/client";
import {
  compressBillImage,
  formatFileSize,
  isSupportedBillFile,
  type CompressionResult,
} from "@/lib/imageCompression";
import type { Json } from "@/lib/supabase/database.types";

interface ScannedPage {
  id: string;
  originalName: string;
  result: CompressionResult;
  storagePath?: string;
}

type PipelineStage =
  | "idle"
  | "compressing"
  | "ready"
  | "uploading"
  | "staging_db"
  | "completed"
  | "error";

export default function ScannerPage() {
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Scanned pages state (supports single or multi-page ISA statements)
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [hospitalName, setHospitalName] = useState<string>("");

  // Pipeline progress & feedback state
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedAuditId, setStagedAuditId] = useState<string | null>(null);

  // Hidden file input refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  // Keep track of object URLs for cleanup on unmount
  const pagesRef = useRef<ScannedPage[]>([]);
  pagesRef.current = pages;

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((p) => {
        if (p.result.previewUrl) {
          URL.revokeObjectURL(p.result.previewUrl);
        }
      });
    };
  }, []);

  const activePage = pages[activePageIndex] ?? null;

  /**
   * Processes one or more selected/dropped files through the client-side compression engine.
   */
  const handleProcessFiles = useCallback(
    async (fileList: FileList | File[], replaceActive = false) => {
      const incomingFiles = Array.from(fileList);
      if (incomingFiles.length === 0) return;

      setErrorMessage(null);
      setStagedAuditId(null);

      // Validate file types upfront
      const invalidFile = incomingFiles.find((f) => !isSupportedBillFile(f));
      if (invalidFile) {
        setStage("error");
        setErrorMessage(
          `Unsupported file "${invalidFile.name}". Please upload JPEG, PNG, WebP, HEIC photos, or a PDF statement.`
        );
        return;
      }

      try {
        setStage("compressing");
        const processedPages: ScannedPage[] = [];

        for (let i = 0; i < incomingFiles.length; i++) {
          const currentFile = incomingFiles[i];
          setStatusMessage(
            `Optimizing page ${i + 1} of ${incomingFiles.length} (${currentFile.name})...`
          );

          const compressed = await compressBillImage(currentFile);
          processedPages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            originalName: currentFile.name,
            result: compressed,
          });
        }

        setPages((prev) => {
          if (replaceActive && prev[activePageIndex]) {
            const copy = [...prev];
            // Revoke old preview URL
            URL.revokeObjectURL(copy[activePageIndex].result.previewUrl);
            copy[activePageIndex] = processedPages[0];
            return copy;
          }
          const updated = [...prev, ...processedPages];
          setActivePageIndex(updated.length - 1);
          return updated;
        });

        setStage("ready");
        setStatusMessage("Ready to upload & stage for AI OCR");
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to compress image. Please try another file.";
        setStage("error");
        setErrorMessage(msg);
      }
    },
    [activePageIndex]
  );

  /**
   * Drag-and-drop handlers for the viewfinder dropzone
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleProcessFiles(e.dataTransfer.files, false);
    }
  };

  /**
   * Removes a single page from the multi-page statement queue
   */
  const handleRemovePage = (indexToRemove: number) => {
    setPages((prev) => {
      const target = prev[indexToRemove];
      if (target?.result.previewUrl) {
        URL.revokeObjectURL(target.result.previewUrl);
      }
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (next.length === 0) {
        setStage("idle");
        setStatusMessage("");
        setActivePageIndex(0);
      } else if (activePageIndex >= next.length) {
        setActivePageIndex(next.length - 1);
      }
      return next;
    });
    setErrorMessage(null);
    setStagedAuditId(null);
  };

  /**
   * Resets the entire scanner back to initial state
   */
  const handleResetAll = () => {
    pages.forEach((p) => {
      if (p.result.previewUrl) {
        URL.revokeObjectURL(p.result.previewUrl);
      }
    });
    setPages([]);
    setActivePageIndex(0);
    setHospitalName("");
    setStage("idle");
    setStatusMessage("");
    setUploadProgress(0);
    setErrorMessage(null);
    setStagedAuditId(null);
  };

  /**
   * Uploads all compressed pages to Supabase Storage (`bill-uploads/{user_id}/*`)
   * and creates a draft record in the `audits` table for Week 3 OCR ingestion.
   */
  const handleUploadAndStage = async () => {
    if (pages.length === 0) return;

    setErrorMessage(null);
    setUploadProgress(10);
    setStage("uploading");
    setStatusMessage("Verifying secure session...");

    try {
      const supabase = createClient();

      // Check local session first (clock-skew normalized), then fallback to getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let user = session?.user ?? null;
      if (!user) {
        const {
          data: { user: fetchedUser },
        } = await supabase.auth.getUser();
        user = fetchedUser;
      }

      if (!user) {
        setStage("error");
        setErrorMessage(
          "You must be signed in to upload hospital bills. Please sign in and try again."
        );
        return;
      }

      // Ensure user profile exists in `profiles` table (satisfies foreign key `audits.user_id -> profiles.id`)
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name:
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "BillLens User",
        },
        { onConflict: "id" }
      );

      const uploadedFilesMeta: {
        path: string;
        signed_url: string | null;
        original_name: string;
        mime_type: string;
        original_size: number;
        compressed_size: number;
        compression_ratio: number;
        width: number;
        height: number;
      }[] = [];

      const batchTimestamp = Date.now();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const safeName = page.result.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        // Strictly scoped to `{user_id}/*` to satisfy Supabase Storage RLS policy
        const storagePath = `${user.id}/${batchTimestamp}-p${i + 1}-${safeName}`;

        setStatusMessage(
          `Uploading page ${i + 1} of ${pages.length} to encrypted storage...`
        );
        setUploadProgress(
          Math.round(20 + ((i + 0.5) / pages.length) * 55)
        );

        const { error: uploadError } = await supabase.storage
          .from("bill-uploads")
          .upload(storagePath, page.result.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: page.result.mimeType,
          });

        if (uploadError) {
          throw new Error(
            `Storage upload failed for "${page.originalName}": ${uploadError.message}`
          );
        }

        // Create a signed URL (valid for 7 days) so Week 3 Gemini Vision OCR can read it directly
        const { data: signedData } = await supabase.storage
          .from("bill-uploads")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

        uploadedFilesMeta.push({
          path: storagePath,
          signed_url: signedData?.signedUrl ?? null,
          original_name: page.originalName,
          mime_type: page.result.mimeType,
          original_size: page.result.originalSize,
          compressed_size: page.result.compressedSize,
          compression_ratio: page.result.compressionRatio,
          width: page.result.width,
          height: page.result.height,
        });
      }

      // Step 4: Database Staging — insert draft audit record in `audits` table
      setStage("staging_db");
      setUploadProgress(85);
      setStatusMessage("Creating draft audit record in database...");

      const resolvedHospitalName =
        hospitalName.trim() || "Pending OCR Extraction (Draft ISA)";

      const stagedPayload: { [key: string]: Json | undefined } = {
        status: "staged_for_ocr",
        bucket: "bill-uploads",
        page_count: uploadedFilesMeta.length,
        storage_paths: uploadedFilesMeta.map((f) => f.path),
        files: uploadedFilesMeta,
        uploaded_at: new Date().toISOString(),
      };

      const { data: insertedAudit, error: dbError } = await supabase
        .from("audits")
        .insert({
          user_id: user.id,
          hospital_name: resolvedHospitalName,
          total_billed: 0,
          estimated_out_of_pocket: 0,
          raw_extracted_data: stagedPayload,
          audit_results: {
            stage: "week2_staged",
            ready_for_gemini_ocr: true,
          },
        })
        .select("id")
        .single();

      if (dbError) {
        throw new Error(`Database staging failed: ${dbError.message}`);
      }

      setUploadProgress(100);
      setStage("completed");
      setStagedAuditId(insertedAudit?.id ?? null);
      setStatusMessage("Bill uploaded & staged for AI OCR audit!");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during upload.";
      setStage("error");
      setErrorMessage(msg);
    }
  };

  // Aggregate compression metrics across all pages
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

  const isBusy =
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "staging_db";

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Hidden File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleProcessFiles(e.target.files, false);
            e.target.value = "";
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleProcessFiles(e.target.files, false);
            e.target.value = "";
          }
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleProcessFiles(e.target.files, true);
            e.target.value = "";
          }
        }}
      />

      {/* Top 3 Mode Selectors */}
      <ModeSelector />

      {/* Main Scanner Viewfinder & Drag-and-Drop Card */}
      <Card
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
                fileInputRef.current?.click();
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
                        replaceInputRef.current?.click();
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
                        handleRemovePage(activePageIndex);
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
                {/* Glowing Blue Horizontal Laser Line */}
                <div className="absolute left-6 right-6 h-[2px] bg-blue-600 shadow-[0_0_24px_4px_rgba(37,99,235,0.7)] animate-pulse z-10 pointer-events-none" />

                {/* Vertical Reticle Crosshair Line */}
                <div className="absolute top-6 bottom-6 w-[1.5px] bg-blue-500/35 pointer-events-none" />

                {/* Placeholder Statement Form Lines + Upload Icon */}
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

                {/* Instruction Chip inside Reticle */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-xs font-medium text-slate-700 shadow-xs z-20">
                  Align Itemized Statement (ISA) within frame
                </div>
              </>
            )}

            {/* Loading / Progress Overlay inside Reticle when Compressing or Uploading */}
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

          {/* Multi-Page Statement Queue Strip (shown when >= 1 page is loaded) */}
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
                    onClick={() => fileInputRef.current?.click()}
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

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">Upload Notice</p>
              <p className="text-rose-700 mt-0.5">{errorMessage}</p>
              {errorMessage.toLowerCase().includes("signed in") && (
                <Link
                  href="/auth?next=/scanner"
                  className="inline-flex items-center gap-1 mt-2 font-bold text-blue-600 hover:underline"
                >
                  <span>Go to Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 font-bold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/*Staging & Upload Controls Card (Visible once at least 1 file is selected) */}
      {pages.length > 0 && stage !== "completed" && (
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
                onClick={handleUploadAndStage}
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
                      Upload & Stage for AI Audit ({pages.length}{" "}
                      {pages.length === 1 ? "Page" : "Pages"})
                    </span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={isBusy}
                onClick={handleResetAll}
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                <span>Clear</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload & Database Staging Success Card */}
      {stage === "completed" && (
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
                onClick={handleResetAll}
              >
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Scan Another Bill</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons Row: Camera Capture (`capture="environment"`) + Photo/PDF File Picker + ACR Rates */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => cameraInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-blue-600 text-white text-xs font-semibold shadow-soft hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          <span>Take Photo</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-soft hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4 text-blue-600" />
          <span>Upload Photo / PDF</span>
        </button>

        <Link href="/rates" className="col-span-2 sm:col-span-1">
          <div className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-soft hover:bg-slate-50 transition-colors">
            <SlidersHorizontal className="w-4 h-4 text-slate-600" />
            <span>Auto 2024 ACR</span>
          </div>
        </Link>
      </div>

      {/* PhilHealth Rate Audit Status Card */}
      <Card className="hover:border-blue-300 transition-all cursor-pointer bg-white">
        <Link href="/rates">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-slate-900">
                    PhilHealth Rate Audit
                  </h4>
                  <Badge
                    variant="primary"
                    className="text-[10px] py-0 px-2 bg-blue-100 text-blue-700 border-blue-200"
                  >
                    Active
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px] sm:max-w-md">
                  Detect overcharges and unapplied case rate bundles
                </p>
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
              <ArrowRight className="w-4 h-4" />
            </div>
          </CardContent>
        </Link>
      </Card>

      {/* 2-Column Info Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-white border border-slate-100 shadow-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-600 block">
              Case Rate DB
            </span>
            <span className="font-bold text-xs sm:text-sm text-slate-800">
              All-Case Rates v3
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-white border border-slate-100 shadow-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Accessibility className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-600 block">
              Statutory VAT
            </span>
            <span className="font-bold text-xs sm:text-sm text-slate-800">
              Auto 20% + VAT Zero
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
