"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { ScannerViewfinder } from "@/components/scanner/ScannerViewfinder";
import { StatementStagingCard } from "@/components/scanner/StatementStagingCard";
import { useScanBackground } from "@/components/providers/ScanBackgroundProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_ELIGIBILITY_SNAPSHOT,
  normalizeEligibilitySnapshot,
} from "@/lib/auditEngine";
import {
  compressBillImage,
  isSupportedBillFile,
} from "@/lib/imageCompression";
import type {
  ScannedPage,
  PipelineStage,
  AuditEngineResult,
  StatutoryDiscountType,
  EligibilitySnapshot,
} from "@/types/audit";

export default function ScannerPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    scanState,
    isBusy: isBackgroundBusy,
    startScanJob,
    resetScanJob,
    requestNotificationPermission,
  } = useScanBackground();

  const [isDragging, setIsDragging] = useState(false);

  const [pages, setPages] = useState<ScannedPage[]>(() => {
    const hasActiveOrDoneJob =
      scanState.stage === "uploading" ||
      scanState.stage === "staging_db" ||
      scanState.stage === "analyzing_ocr" ||
      scanState.stage === "completed" ||
      scanState.stage === "error";
    if (!hasActiveOrDoneJob || scanState.pages.length === 0) return [];
    return scanState.pages.map((p, idx) => ({
      id: `restored-${idx}-${p.originalName}`,
      originalName: p.originalName,
      result: {
        file: p.file,
        blob: p.file,
        mimeType: p.mimeType,
        previewUrl: p.previewUrl ?? "",
        originalSize: p.originalSize ?? p.file.size,
        compressedSize: p.compressedSize ?? p.file.size,
        compressionRatio: p.compressionRatio ?? 1,
        wasCompressed: (p.compressionRatio ?? 1) < 1,
        width: p.width ?? 0,
        height: p.height ?? 0,
      },
    }));
  });
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [hospitalName, setHospitalName] = useState<string>(() =>
    scanState.pages.length > 0 &&
    (isBackgroundBusy ||
      scanState.stage === "completed" ||
      scanState.stage === "error")
      ? scanState.hospitalName
      : ""
  );

  const [stage, setStage] = useState<PipelineStage>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagedAuditId, setStagedAuditId] = useState<string | null>(null);
  const [statutoryDiscountType, setStatutoryDiscountType] =
    useState<StatutoryDiscountType>("regular");
  const [eligibilitySnapshot, setEligibilitySnapshot] =
    useState<EligibilitySnapshot>(DEFAULT_ELIGIBILITY_SNAPSHOT);
  const [ocrAuditResult, setOcrAuditResult] = useState<AuditEngineResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const pagesRef = useRef<ScannedPage[]>([]);
  const keepPreviewsOnUnmountRef = useRef<boolean>(false);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    keepPreviewsOnUnmountRef.current =
      isBackgroundBusy ||
      scanState.stage === "completed" ||
      scanState.stage === "error";
  }, [isBackgroundBusy, scanState.stage]);

  // Synchronize when background scan finishes
  useEffect(() => {
    if (scanState.stage === "completed" && scanState.auditId) {
      const timer = setTimeout(() => {
        router.push(`/audits/${scanState.auditId}`);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [scanState.stage, scanState.auditId, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "contributor_type, accommodation_type, has_mdr_or_pin, facility_level"
          )
          .eq("id", user.id)
          .maybeSingle();
        if (profile && !cancelled) {
          setEligibilitySnapshot(normalizeEligibilitySnapshot(profile));
        }
      } catch {
        // Optional profile columns before migration 007
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (keepPreviewsOnUnmountRef.current) return;
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
      if (!isBackgroundBusy) {
        resetScanJob();
      }

      const invalidFile = incomingFiles.find((f) => !isSupportedBillFile(f));
      if (invalidFile) {
        const msg = `Unsupported file "${invalidFile.name}". Please upload JPEG, PNG, WebP, HEIC photos, or a PDF statement.`;
        setStage("error");
        setErrorMessage(msg);
        toast.error(msg);
        return;
      }

      try {
        setStage("compressing");
        const processedPages: ScannedPage[] = [];

        for (let i = 0; i < incomingFiles.length; i++) {
          const currentFile = incomingFiles[i];
          setStatusMessage(
            `Compressing image (${i + 1} of ${incomingFiles.length}: ${currentFile.name})...`
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
        toast.error(msg);
      }
    },
    [isBackgroundBusy, resetScanJob, toast]
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
    if (!isBackgroundBusy) {
      resetScanJob();
    }
    toast.info("Statement page removed");
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
    resetScanJob();
    toast.info("Staged pages cleared");
  };

  const handleUploadAndStage = async () => {
    if (pages.length === 0) return;

    setErrorMessage(null);
    try {
      await requestNotificationPermission();
    } catch {
      // Best-effort permission request
    }

    const resolvedId = await startScanJob({
      pages: pages.map((p) => ({
        file: p.result.file,
        originalName: p.originalName,
        mimeType: p.result.mimeType,
        previewUrl: p.result.previewUrl,
        originalSize: p.result.originalSize,
        compressedSize: p.result.compressedSize,
        compressionRatio: p.result.compressionRatio,
        width: p.result.width,
        height: p.result.height,
      })),
      hospitalName,
      statutoryDiscountType,
      eligibilitySnapshot,
      stagedAuditId,
    });

    if (resolvedId && !resolvedId.startsWith("audit-")) {
      router.push(`/audits/${resolvedId}`);
    }
  };

  const effectiveStage: PipelineStage = isBackgroundBusy
    ? (scanState.stage as PipelineStage)
    : scanState.stage === "completed"
      ? "completed"
      : scanState.stage === "error"
        ? "error"
        : stage;

  const effectiveProgress =
    isBackgroundBusy || scanState.stage === "completed"
      ? scanState.progress
      : uploadProgress;

  const effectiveStatusMessage =
    isBackgroundBusy || scanState.stage === "completed"
      ? scanState.statusMessage
      : statusMessage;

  const effectiveErrorMessage =
    scanState.stage === "error" ? scanState.errorMessage : errorMessage;

  const isBusy =
    effectiveStage === "compressing" ||
    effectiveStage === "uploading" ||
    effectiveStage === "staging_db" ||
    effectiveStage === "analyzing_ocr" ||
    isBackgroundBusy;

  const handleRunAIOcr = async () => {
    await handleUploadAndStage();
  };

  const handleRetryScan = async () => {
    await handleUploadAndStage();
  };

  return (
    <div className="w-full max-w-none space-y-4 sm:space-y-5">
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

      {/* Editorial Header - Clean typographic hierarchy, compassionate value prop */}
      <div className="space-y-1 border-b border-slate-200/80 pb-4 sm:pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Scan Statement
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
          Upload or capture your Itemized Statement (ISA) for automated case rate and statutory deduction auditing.
        </p>
      </div>

      {/* Main Upload Dropzone & Staged Pages */}
      <div className="animate-rate-item" style={{ animationDelay: "60ms" }}>
        <ScannerViewfinder
          pages={pages}
          activePageIndex={activePageIndex}
          setActivePageIndex={setActivePageIndex}
          stage={effectiveStage}
          statusMessage={effectiveStatusMessage}
          uploadProgress={effectiveProgress}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onBrowseFiles={() => fileInputRef.current?.click()}
          onTakePhoto={() => cameraInputRef.current?.click()}
          onRemovePage={handleRemovePage}
          isAuditComplete={Boolean(ocrAuditResult ?? scanState.completedResult)}
        />
      </div>

      {/* Error Alert Banner */}
      {effectiveErrorMessage && (
        <div className="animate-fade-slide-in p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start justify-between gap-3 transition-opacity duration-150">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">Scan / OCR Notice</p>
              <p className="text-rose-700 mt-0.5">{effectiveErrorMessage}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {pages.length > 0 && !isBusy && (
                  <button
                    type="button"
                    onClick={handleRetryScan}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-3 py-1 text-xs font-bold text-white hover:bg-rose-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry Scan</span>
                  </button>
                )}
                {effectiveErrorMessage.toLowerCase().includes("signed in") && (
                  <Link
                    href="/auth?next=/scanner"
                    className="inline-flex items-center gap-1 font-bold text-[#2563EB] hover:underline"
                  >
                    <span>Go to Sign In</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              resetScanJob();
            }}
            className="text-rose-500 hover:text-rose-700 font-bold text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Staging & Upload Controls or Completion Card (no transform ancestor so fixed dock anchors to viewport) */}
      <StatementStagingCard
        pageCount={pages.length}
        stage={effectiveStage}
        statusMessage={effectiveStatusMessage}
        hospitalName={hospitalName}
        setHospitalName={setHospitalName}
        onUploadAndStage={handleUploadAndStage}
        onResetAll={handleResetAll}
        statutoryDiscountType={statutoryDiscountType}
        setStatutoryDiscountType={setStatutoryDiscountType}
        eligibilitySnapshot={eligibilitySnapshot}
        setEligibilitySnapshot={setEligibilitySnapshot}
        onRunAIOcr={handleRunAIOcr}
        onRetryScan={handleRetryScan}
        hasError={Boolean(effectiveErrorMessage)}
        isAnalyzingOcr={isBusy}
        ocrAuditResult={ocrAuditResult ?? scanState.completedResult}
      />
    </div>
  );
}
