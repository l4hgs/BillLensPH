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
  AuditEngineResult,
} from "@/types/audit";

export default function ScannerPage() {
  const [isDragging, setIsDragging] = useState(false);

  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [hospitalName, setHospitalName] = useState<string>("");

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedAuditId, setStagedAuditId] = useState<string | null>(null);
  const [isSeniorOrPwd, setIsSeniorOrPwd] = useState<boolean>(false);
  const [isAnalyzingOcr, setIsAnalyzingOcr] = useState<boolean>(false);
  const [ocrAuditResult, setOcrAuditResult] = useState<AuditEngineResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const pagesRef = useRef<ScannedPage[]>([]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

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
    async (fileList: FileList | File[]) => {
      const incomingFiles = Array.from(fileList);
      if (incomingFiles.length === 0) return;

      setErrorMessage(null);
      setStagedAuditId(null);
      setOcrAuditResult(null);

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
    []
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
      await handleProcessFiles(e.dataTransfer.files);
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
    setOcrAuditResult(null);
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
    setOcrAuditResult(null);
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
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      let session = initialSession;
      const localNowSec = Math.floor(Date.now() / 1000);
      const sessionMeta = session as unknown as Record<string, unknown> | null;
      const needsTokenRefresh =
        !session ||
        typeof sessionMeta?.rebased_at !== "number" ||
        (typeof session.expires_at === "number" &&
          session.expires_at - localNowSec < 300);

      if (needsTokenRefresh) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) {
          session = refreshed.session;
        }
      }

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

        let { error: uploadError } = await supabase.storage
          .from("bill-uploads")
          .upload(storagePath, page.result.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: page.result.mimeType,
          });

        if (
          uploadError &&
          /exp|jwt|token|timestamp|expired/i.test(uploadError.message)
        ) {
          await supabase.auth.refreshSession();
          const retryRes = await supabase.storage
            .from("bill-uploads")
            .upload(storagePath, page.result.file, {
              cacheControl: "3600",
              upsert: true,
              contentType: page.result.mimeType,
            });
          uploadError = retryRes.error;
        }

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
    stage === "staging_db" ||
    isAnalyzingOcr;

  const handleRunAIOcr = async () => {
    if (!stagedAuditId && pages.length === 0) return;

    setErrorMessage(null);
    setIsAnalyzingOcr(true);
    setStatusMessage("Extracting line items and auditing with Gemini Flash...");

    try {
      let payload: Record<string, unknown> = {
        isSeniorOrPwd,
      };

      if (stagedAuditId) {
        payload.auditId = stagedAuditId;
      } else if (pages[0]?.result?.file) {
        const file = pages[0].result.file;
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        const base64 = btoa(binary);
        payload = {
          ...payload,
          imageBase64: base64,
          mimeType: file.type || "image/jpeg",
        };
      }

      const res = await fetch("/api/audit/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "OCR extraction failed.");
      }

      setOcrAuditResult(data.audit);
      setStatusMessage("AI PhilHealth Audit Complete!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze bill with AI.";
      setErrorMessage(msg);
    } finally {
      setIsAnalyzingOcr(false);
    }
  };

  return (
    <div className="max-w-[640px] w-full mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Hidden File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleProcessFiles(e.target.files);
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
            handleProcessFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Top 3 Mode Selectors (Grid on desktop, stacked on mobile) */}
      <ModeSelector />

      {/* Centered Heading & Muted Subtitle */}
      <div className="text-center space-y-1.5 pt-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E293B]">
          Scan Statement
        </h1>
        <p className="text-xs sm:text-sm text-[#64748B]">
          Upload or capture your Itemized Statement (ISA) for auditing.
        </p>
      </div>

      {/* Main Upload Card with Dropzone & File Rows */}
      <ScannerViewfinder
        pages={pages}
        activePageIndex={activePageIndex}
        setActivePageIndex={setActivePageIndex}
        stage={stage}
        statusMessage={statusMessage}
        uploadProgress={uploadProgress}
        isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onBrowseFiles={() => fileInputRef.current?.click()}
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
                  className="inline-flex items-center gap-1 mt-2 font-bold text-[#2563EB] hover:underline"
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
            className="text-rose-500 hover:text-rose-700 font-bold text-xs cursor-pointer"
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
        isSeniorOrPwd={isSeniorOrPwd}
        setIsSeniorOrPwd={setIsSeniorOrPwd}
        onRunAIOcr={handleRunAIOcr}
        isAnalyzingOcr={isAnalyzingOcr}
        ocrAuditResult={ocrAuditResult}
      />

      {/* Action Buttons Row: Primary & Secondary Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => cameraInputRef.current?.click()}
          className="w-full h-12 flex items-center justify-center gap-2 px-5 rounded-full bg-[#2563EB] text-white text-xs sm:text-sm font-bold shadow-soft hover:bg-[#1D4ED8] transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
        >
          <Camera className="w-4 h-4" />
          <span>Take Photo</span>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-12 flex items-center justify-center gap-2 px-5 rounded-full bg-white border border-[#CBD5E1] text-[#1E293B] text-xs sm:text-sm font-bold shadow-soft hover:bg-[#F3F4F6] transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
        >
          <ImageIcon className="w-4 h-4 text-[#2563EB]" />
          <span>Upload Photo / PDF</span>
        </button>

        <Link href="/rates" className="w-full">
          <div className="w-full h-12 flex items-center justify-center gap-2 px-5 rounded-full bg-white border border-[#CBD5E1] text-[#1E293B] text-xs sm:text-sm font-bold shadow-soft hover:bg-[#F3F4F6] transition-all cursor-pointer active:scale-[0.98]">
            <SlidersHorizontal className="w-4 h-4 text-[#64748B]" />
            <span>Auto 2024 ACR</span>
          </div>
        </Link>
      </div>

      {/* PhilHealth Rate Audit Status Card */}
      <Card className="hover:border-[#2563EB] transition-all cursor-pointer bg-white border-[#CBD5E1]/70 rounded-2xl shadow-soft">
        <Link href="/rates">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-[#1E293B]">
                    PhilHealth Rate Audit
                  </h4>
                  <Badge
                    variant="primary"
                    className="text-[10px] py-0 px-2 bg-blue-50 text-[#2563EB] border-blue-200 font-bold"
                  >
                    Active
                  </Badge>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5 truncate max-w-[200px] sm:max-w-md">
                  Detect overcharges and unapplied case rate bundles
                </p>
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
              <ArrowRight className="w-4 h-4" />
            </div>
          </CardContent>
        </Link>
      </Card>

      {/* 2-Column Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#CBD5E1]/70 shadow-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
              Case Rate DB
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-[#1E293B]">
              All-Case Rates v3
            </span>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#CBD5E1]/70 shadow-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
            <Accessibility className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[#64748B] block">
              Statutory VAT
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-[#1E293B]">
              Auto 20% + VAT Zero
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
