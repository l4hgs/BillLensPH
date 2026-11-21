"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type {
  AuditEngineResult,
  EligibilitySnapshot,
  StatutoryDiscountType,
} from "@/types/audit";

export interface ScanPagePayload {
  file: File;
  originalName: string;
  mimeType: string;
  previewUrl?: string;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  width?: number;
  height?: number;
}

export interface ScanJobPayload {
  pages: ScanPagePayload[];
  hospitalName?: string;
  statutoryDiscountType: StatutoryDiscountType;
  eligibilitySnapshot: EligibilitySnapshot;
  stagedAuditId?: string | null;
}

export type ScanStage =
  | "idle"
  | "uploading"
  | "staging_db"
  | "analyzing_ocr"
  | "completed"
  | "error";

export interface ScanState {
  stage: ScanStage;
  progress: number;
  statusMessage: string;
  errorMessage: string | null;
  auditId: string | null;
  hospitalName: string;
  completedResult: AuditEngineResult | null;
  startedAt: number | null;
  pageCount: number;
  pages: ScanPagePayload[];
}

interface ScanBackgroundContextValue {
  scanState: ScanState;
  isBusy: boolean;
  startScanJob: (payload: ScanJobPayload) => Promise<string | null>;
  resetScanJob: () => void;
  dismissNotice: () => void;
  requestNotificationPermission: () => Promise<boolean>;
}

const defaultScanState: ScanState = {
  stage: "idle",
  progress: 0,
  statusMessage: "",
  errorMessage: null,
  auditId: null,
  hospitalName: "",
  completedResult: null,
  startedAt: null,
  pageCount: 0,
  pages: [],
};

const ScanBackgroundContext = createContext<ScanBackgroundContextValue | null>(
  null
);

export function ScanBackgroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [scanState, setScanState] = useState<ScanState>(defaultScanState);
  const activeJobRef = useRef<boolean>(false);

  const isBusy =
    scanState.stage === "uploading" ||
    scanState.stage === "staging_db" ||
    scanState.stage === "analyzing_ocr";

  // Request HTML5 notification permission if available
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    try {
      if (Notification.permission === "granted") return true;
      if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        return permission === "granted";
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Show desktop notification when bill processing completes while user is on another tab/window
  const notifyCompletion = useCallback(
    (hospital: string, auditId: string) => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        document.visibilityState === "visible"
      ) {
        return;
      }

      try {
        const notif = new Notification("BillLens PH - Audit Complete", {
          body: `Your statement from ${hospital || "hospital"} has been audited. Click to review flagged items & savings.`,
          icon: "/icon.png",
          tag: `audit-complete-${auditId}`,
        });

        notif.onclick = () => {
          window.focus();
          window.location.href = `/audits/${auditId}`;
        };
      } catch {
        // Notification API fallback
      }
    },
    []
  );

  // Prevent accidental tab closure while active scan is processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isBusy) {
        e.preventDefault();
        e.returnValue =
          "A hospital bill scan and AI audit is currently in progress. Navigating away or closing this tab will cancel it.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBusy]);

  // Dynamic document title so user can track progress across browser tabs
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isBusy) {
      document.title = `(⚡ ${scanState.progress}% Auditing) BillLens PH`;
    } else if (scanState.stage === "completed" && scanState.auditId) {
      document.title = "✓ Audit Ready! - BillLens PH";
    } else {
      if (
        document.title.startsWith("(⚡") ||
        document.title.startsWith("✓ Audit Ready")
      ) {
        document.title =
          "BillLens PH - Hospital Statement Auditor & PhilHealth Assistant";
      }
    }
  }, [isBusy, scanState.stage, scanState.progress, scanState.auditId]);

  const startScanJob = useCallback(
    async (payload: ScanJobPayload): Promise<string | null> => {
      const {
        pages,
        hospitalName = "",
        statutoryDiscountType,
        eligibilitySnapshot,
        stagedAuditId,
      } = payload;

      if (pages.length === 0 && !stagedAuditId) return null;
      if (activeJobRef.current) return null;

      activeJobRef.current = true;
      const startedAt = Date.now();

      setScanState({
        stage: "uploading",
        progress: 10,
        statusMessage: "Verifying secure session...",
        errorMessage: null,
        auditId: stagedAuditId ?? null,
        hospitalName: hospitalName.trim() || "Hospital Statement",
        completedResult: null,
        startedAt,
        pageCount: pages.length,
        pages,
      });

      try {
        const supabase = createClient();

        // 1. Verify user session
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
          throw new Error(
            "You must be signed in to upload and audit hospital bills. Please sign in and try again."
          );
        }

        let targetAuditId = stagedAuditId ?? null;

        // 2. Upload pages if not already staged
        if (!targetAuditId && pages.length > 0) {
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

          const uploadedFilesMeta: Array<{
            path: string;
            signed_url: string | null;
            original_name: string;
            mime_type: string;
            original_size?: number;
            compressed_size?: number;
            compression_ratio?: number;
            width?: number;
            height?: number;
          }> = [];

          const batchTimestamp = Date.now();

          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const safeName = page.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${user.id}/${batchTimestamp}-p${i + 1}-${safeName}`;

            setScanState((prev) => ({
              ...prev,
              progress: Math.round(15 + ((i + 0.5) / pages.length) * 55),
              statusMessage: `Uploading page ${i + 1} of ${pages.length} to encrypted storage...`,
            }));

            let { error: uploadError } = await supabase.storage
              .from("bill-uploads")
              .upload(storagePath, page.file, {
                cacheControl: "3600",
                upsert: false,
                contentType: page.mimeType,
              });

            if (
              uploadError &&
              /exp|jwt|token|timestamp|expired/i.test(uploadError.message)
            ) {
              await supabase.auth.refreshSession();
              const retryRes = await supabase.storage
                .from("bill-uploads")
                .upload(storagePath, page.file, {
                  cacheControl: "3600",
                  upsert: true,
                  contentType: page.mimeType,
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
              mime_type: page.mimeType,
              original_size: page.originalSize,
              compressed_size: page.compressedSize,
              compression_ratio: page.compressionRatio,
              width: page.width,
              height: page.height,
            });
          }

          setScanState((prev) => ({
            ...prev,
            stage: "staging_db",
            progress: 75,
            statusMessage: "Creating draft audit record in database...",
          }));

          const resolvedHospitalName =
            hospitalName.trim() || "Pending OCR Extraction (Draft ISA)";

          const stagedPayload: { [key: string]: Json | undefined } = {
            status: "staged_for_ocr",
            bucket: "bill-uploads",
            page_count: uploadedFilesMeta.length,
            storage_paths: uploadedFilesMeta.map((f) => f.path),
            files: uploadedFilesMeta as unknown as Json,
            statutory_discount_type: statutoryDiscountType,
            is_senior_or_pwd: statutoryDiscountType !== "regular",
            eligibility_snapshot: eligibilitySnapshot as unknown as Json,
            uploaded_at: new Date().toISOString(),
          };

          const insertPayload = {
            user_id: user.id,
            hospital_name: resolvedHospitalName,
            total_billed: 0,
            estimated_out_of_pocket: 0,
            eligibility_snapshot: eligibilitySnapshot as unknown as Json,
            raw_extracted_data: stagedPayload,
            audit_results: {
              stage: "week2_staged",
              ready_for_gemini_ocr: true,
            },
          };

          let { data: insertedAudit, error: dbError } = await supabase
            .from("audits")
            .insert(insertPayload)
            .select("id")
            .single();

          if (dbError && /eligibility_snapshot/i.test(dbError.message)) {
            const fallbackInsert = { ...insertPayload };
            delete (fallbackInsert as Record<string, unknown>).eligibility_snapshot;
            const retryInsert = await supabase
              .from("audits")
              .insert(fallbackInsert)
              .select("id")
              .single();
            insertedAudit = retryInsert.data;
            dbError = retryInsert.error;
          }

          if (dbError || !insertedAudit?.id) {
            throw new Error(`Database staging failed: ${dbError?.message || "Unknown error"}`);
          }

          targetAuditId = insertedAudit.id;
        }

        // 3. Trigger Gemini Vision OCR & PhilHealth ACR Audit
        setScanState((prev) => ({
          ...prev,
          stage: "analyzing_ocr",
          auditId: targetAuditId,
          progress: 85,
          statusMessage: "Extracting line items with Gemini Vision OCR...",
        }));

        let ocrPayload: Record<string, unknown> = {
          statutoryDiscountType,
          isSeniorOrPwd: statutoryDiscountType !== "regular",
          eligibilitySnapshot,
        };

        if (targetAuditId) {
          ocrPayload.auditId = targetAuditId;
        } else if (pages.length > 0) {
          const encodedPages: Array<{ imageBase64: string; mimeType: string }> = [];
          for (const page of pages) {
            const arrayBuffer = await page.file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            bytes.forEach((b) => {
              binary += String.fromCharCode(b);
            });
            encodedPages.push({
              imageBase64: btoa(binary),
              mimeType: page.mimeType || "image/jpeg",
            });
          }
          ocrPayload = {
            ...ocrPayload,
            pages: encodedPages,
          };
        }

        const ocrTimer = window.setTimeout(() => {
          setScanState((prev) =>
            prev.stage === "analyzing_ocr"
              ? {
                  ...prev,
                  progress: 92,
                  statusMessage: "Auditing against PhilHealth ACR & statutory rules...",
                }
              : prev
          );
        }, 3000);

        const res = await fetch("/api/audit/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ocrPayload),
        });

        window.clearTimeout(ocrTimer);

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "OCR extraction & audit failed.");
        }

        const resolvedId: string =
          data.audit?.audit_id || data.auditId || targetAuditId || "";

        setScanState((prev) => ({
          ...prev,
          stage: "completed",
          progress: 100,
          statusMessage: "AI PhilHealth Audit Complete! Statement ready.",
          auditId: resolvedId,
          hospitalName: data.audit?.hospital_name || prev.hospitalName,
          completedResult: data.audit ?? null,
        }));

        notifyCompletion(data.audit?.hospital_name || hospitalName, resolvedId);
        return resolvedId;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during processing.";

        setScanState((prev) => ({
          ...prev,
          stage: "error",
          errorMessage: msg,
          statusMessage: "Scan failed. Click retry or check connection.",
        }));
        return null;
      } finally {
        activeJobRef.current = false;
      }
    },
    [notifyCompletion]
  );

  const resetScanJob = useCallback(() => {
    setScanState(defaultScanState);
    activeJobRef.current = false;
  }, []);

  const dismissNotice = useCallback(() => {
    setScanState((prev) => ({
      ...prev,
      stage: "idle",
      statusMessage: "",
      errorMessage: null,
      auditId: null,
      completedResult: null,
      pages: [],
    }));
  }, []);

  return (
    <ScanBackgroundContext.Provider
      value={{
        scanState,
        isBusy,
        startScanJob,
        resetScanJob,
        dismissNotice,
        requestNotificationPermission,
      }}
    >
      {children}
    </ScanBackgroundContext.Provider>
  );
}

export function useScanBackground(): ScanBackgroundContextValue {
  const context = useContext(ScanBackgroundContext);
  if (!context) {
    throw new Error(
      "useScanBackground must be used within a ScanBackgroundProvider"
    );
  }
  return context;
}
