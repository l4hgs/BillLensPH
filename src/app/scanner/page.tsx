"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  Camera,
  SlidersHorizontal,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Accessibility,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "@/components/layout/ModeSelector";
import { ScannerViewfinder } from "@/components/scanner/ScannerViewfinder";
import { StatementStagingCard } from "@/components/scanner/StatementStagingCard";
import { createClient } from "@/lib/supabase/client";
import {
  compressBillImage,
  isSupportedBillFile,
} from "@/lib/imageCompression";
import type { Json } from "@/lib/supabase/database.types";
import type {
  ScannedPage,
  PipelineStage,
  StagedFileMeta,
} from "@/types/audit";

export default function ScannerPage() {
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [hospitalName, setHospitalName] = useState<string>("");

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedAuditId, setStagedAuditId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleProcessFiles = useCallback(
    async (fileList: FileList | File[], replaceActive = false) => {
      const incomingFiles = Array.from(fileList);
      if (incomingFiles.length === 0) return;

      setErrorMessage(null);
      setStagedAuditId(null);

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

  const handleUploadAndStage = async () => {
    if (pages.length === 0) return;

    setErrorMessage(null);
    setUploadProgress(10);
    setStage("uploading");
    setStatusMessage("Verifying secure session...");

    try {
      const supabase = createClient();

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

      const uploadedFilesMeta: StagedFileMeta[] = [];
      const batchTimestamp = Date.now();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const safeName = page.result.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${user.id}/${batchTimestamp}-p${i + 1}-${safeName}`;

        setStatusMessage(
          `Uploading page ${i + 1} of ${pages.length} to encrypted storage...`
        );
        setUploadProgress(Math.round(20 + ((i + 0.5) / pages.length) * 55));

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
        files: uploadedFilesMeta as unknown as Json,
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
      <ScannerViewfinder
        pages={pages}
        activePageIndex={activePageIndex}
        setActivePageIndex={setActivePageIndex}
        stage={stage}
        statusMessage={statusMessage}
        uploadProgress={uploadProgress}
        isFlashOn={isFlashOn}
        setIsFlashOn={setIsFlashOn}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onBrowseFiles={() => fileInputRef.current?.click()}
        onRetakeActive={() => replaceInputRef.current?.click()}
        onRemovePage={handleRemovePage}
      />

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

      {/* Staging & Upload Controls or Completion Card */}
      <StatementStagingCard
        pageCount={pages.length}
        stage={stage}
        statusMessage={statusMessage}
        hospitalName={hospitalName}
        setHospitalName={setHospitalName}
        stagedAuditId={stagedAuditId}
        onUploadAndStage={handleUploadAndStage}
        onResetAll={handleResetAll}
      />

      {/* Action Buttons Row */}
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
