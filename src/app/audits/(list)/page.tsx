"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Search,
  ShieldCheck,
  Camera,
  FolderArchive,
  Eye,
  FileText,
  X,
  ArrowRight,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/imageCompression";
import { ArchivePageSkeleton } from "@/components/audit/AuditSkeletons";
import { useToast } from "@/components/providers/ToastProvider";
import type { AuditEngineResult } from "@/types/audit";

interface AuditDoc {
  id: string;
  facility: string;
  total: number;
  fileSize: string;
  fileType: "PDF" | "DOCX" | "Scan";
  dateText: string;
  createdAt: string;
  thumbnailUrl?: string;
  isLive?: boolean;
  /** Total flagged by the audit engine; undefined until the bill is analyzed. */
  flaggedAmount?: number;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

function AuditThumbnail({
  thumbnailUrl,
  facility,
  fileType,
  onPreview,
}: {
  thumbnailUrl?: string;
  facility: string;
  fileType: "PDF" | "DOCX" | "Scan";
  onPreview?: () => void;
}) {
  const [hasError, setHasError] = useState(false);

  if (thumbnailUrl && !hasError && fileType !== "PDF") {
    return (
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Preview ${facility} statement image`}
        title="Click to preview statement image"
        className="group/thumb relative w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-xl overflow-hidden border border-slate-200/90 bg-slate-100 shrink-0 hover:border-[#2563EB] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={`${facility} statement preview`}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover object-top group-hover/thumb:scale-105 transition-transform duration-200"
          loading="lazy"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-slate-900/75 text-white flex items-center justify-center opacity-85 group-hover/thumb:opacity-100 group-hover/thumb:bg-[#2563EB] transition-all shadow-xs"
        >
          <Eye className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold border",
        fileType === "PDF" && "bg-rose-50/70 text-[#DC2626] border-rose-200/80",
        fileType === "DOCX" && "bg-blue-50/70 text-[#2563EB] border-blue-200/80",
        fileType === "Scan" && "bg-slate-50 text-slate-600 border-slate-200/80"
      )}
    >
      {fileType === "Scan" ? (
        <Camera className="w-6 h-6 text-slate-500 mb-1" />
      ) : (
        <FileText className="w-6 h-6 text-rose-600 mb-1" />
      )}
      <span className="text-[10px] uppercase tracking-wider">{fileType}</span>
    </div>
  );
}

export default function DocumentArchivePage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<
    "Today" | "This week" | "All Documents" | "Archive"
  >("This week");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [liveDocs, setLiveDocs] = useState<AuditDoc[]>([]);
  const [previewModal, setPreviewModal] = useState<{
    url: string;
    facility: string;
    total: number;
    auditId: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuditDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dismiss preview or delete confirmation modal with Escape key
  useEffect(() => {
    if (!previewModal && !deleteTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteTarget && !isDeleting) {
          setDeleteTarget(null);
          return;
        }
        if (previewModal) {
          setPreviewModal(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewModal, deleteTarget, isDeleting]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/audit/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      const payload = (await res.json().catch(() => ({}))) as {
        error?: unknown;
      };
      if (!res.ok) {
        toast.error(
          typeof payload.error === "string" && payload.error
            ? payload.error
            : "Could not delete audit. Please try again."
        );
        return;
      }

      const deletedId = deleteTarget.id;
      setLiveDocs((prev) => prev.filter((item) => item.id !== deletedId));
      if (previewModal?.auditId === deletedId) {
        setPreviewModal(null);
      }
      setDeleteTarget(null);
      toast.success("Audit deleted");
    } catch {
      toast.error("Could not delete audit. Please check your connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadUserAudits() {
      const minSkeletonDelay = new Promise<void>((resolve) =>
        setTimeout(resolve, 350)
      );
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
        if (!user) return;

        const { data: rows } = await supabase
          .from("audits")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!rows || !isMounted) return;

        // Collect storage paths to batch create fresh signed URLs
        const pathsToSign: string[] = [];
        for (const row of rows) {
          const raw = (row.raw_extracted_data ?? {}) as Record<string, unknown>;
          const files = Array.isArray(raw.files)
            ? (raw.files as Record<string, unknown>[])
            : [];
          const firstPath =
            typeof files[0]?.path === "string"
              ? files[0].path
              : Array.isArray(raw.storage_paths) && typeof raw.storage_paths[0] === "string"
                ? raw.storage_paths[0]
                : null;
          if (firstPath) {
            pathsToSign.push(firstPath);
          }
        }

        const signedUrlMap = new Map<string, string>();
        if (pathsToSign.length > 0) {
          try {
            const { data: signedResults } = await supabase.storage
              .from("bill-uploads")
              .createSignedUrls(pathsToSign, 3600);

            if (signedResults) {
              for (const item of signedResults) {
                if (item.path && item.signedUrl) {
                  signedUrlMap.set(item.path, item.signedUrl);
                }
              }
            }
          } catch (err) {
            console.warn("Could not batch create signed URLs for thumbnails:", err);
          }
        }

        const mapped: AuditDoc[] = rows.map((row) => {
          const raw = (row.raw_extracted_data ?? {}) as Record<string, unknown>;
          const files = Array.isArray(raw.files)
            ? (raw.files as Record<string, unknown>[])
            : [];
          const totalCompressed = files.reduce(
            (sum, f) =>
              sum +
              (typeof f.compressed_size === "number" ? f.compressed_size : 0),
            0
          );
          const firstMime =
            typeof files[0]?.mime_type === "string" ? files[0].mime_type : "";
          const isPdf = firstMime === "application/pdf";
          const pageCount =
            typeof raw.page_count === "number"
              ? raw.page_count
              : Math.max(1, files.length);

          const filePath =
            typeof files[0]?.path === "string"
              ? files[0].path
              : Array.isArray(raw.storage_paths) && typeof raw.storage_paths[0] === "string"
                ? raw.storage_paths[0]
                : null;

          let thumbnailUrl: string | undefined = undefined;
          if (filePath && signedUrlMap.has(filePath)) {
            thumbnailUrl = signedUrlMap.get(filePath);
          } else if (typeof files[0]?.signed_url === "string" && files[0].signed_url.trim()) {
            thumbnailUrl = files[0].signed_url;
          }

          const audit = (row.audit_results ?? null) as Partial<AuditEngineResult> | null;
          const auditItems = Array.isArray(audit?.line_items) ? audit.line_items : [];
          const isAnalyzed = auditItems.length > 0;
          const flagged =
            Number(audit?.disputed_overcharge_total ?? 0) +
            Number(audit?.senior_pwd_savings ?? 0);
          const reviewCount = auditItems.filter(
            (item) => item.status === "review_worthy"
          ).length;

          const tags: AuditDoc["tags"] = isAnalyzed
            ? [
                flagged > 0
                  ? { label: `• ${formatPHP(flagged)} flagged`, variant: "rose" }
                  : { label: "✓ No overcharges flagged", variant: "emerald" },
                {
                  label:
                    reviewCount > 0
                      ? `${reviewCount} ${reviewCount === 1 ? "item" : "items"} to review`
                      : `${auditItems.length} items checked`,
                  variant: "slate",
                },
              ]
            : [
                { label: "Awaiting AI analysis", variant: "blue" },
                {
                  label: `${pageCount} ${pageCount === 1 ? "Page" : "Pages"} • Encrypted`,
                  variant: "emerald",
                },
              ];

          return {
            id: row.id,
            facility: row.hospital_name || "Draft Hospital Statement",
            total: Number(row.total_billed ?? 0),
            fileSize:
              totalCompressed > 0 ? formatFileSize(totalCompressed) : "Staged",
            fileType: isPdf ? "PDF" : "Scan",
            dateText: new Date(row.created_at).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            createdAt: row.created_at,
            thumbnailUrl,
            isLive: true,
            flaggedAmount: isAnalyzed ? flagged : undefined,
            tags,
          };
        });

        setLiveDocs(mapped);
      } catch {
        // Ignore if unauthenticated or offline
      } finally {
        await minSkeletonDelay;
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUserAudits();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredDocs = liveDocs.filter((doc) => {
    // 1. Tab Time Filter
    const now = new Date();
    const docTime = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
    const diffMs = now.getTime() - docTime;

    if (activeTab === "Today") {
      const docDate = new Date(doc.createdAt);
      const isCalendarToday = docDate.toDateString() === now.toDateString();
      const isLast24h = diffMs <= 24 * 60 * 60 * 1000 && diffMs >= 0;
      if (!isCalendarToday && !isLast24h) return false;
    } else if (activeTab === "This week") {
      const isLast7d = diffMs <= 7 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      if (!isLast7d) return false;
    } else if (activeTab === "Archive") {
      const isOlderThan7d = diffMs > 7 * 24 * 60 * 60 * 1000;
      if (!isOlderThan7d) return false;
    }

    // 2. Text Search Filter (Facility, Tags, Date)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesFacility = doc.facility.toLowerCase().includes(q);
      const matchesDate = doc.dateText.toLowerCase().includes(q);
      const matchesTags = doc.tags.some((t) =>
        t.label.toLowerCase().includes(q)
      );
      if (!matchesFacility && !matchesDate && !matchesTags) {
        return false;
      }
    }

    return true;
  });

  const analyzedDocs = liveDocs.filter((doc) => doc.flaggedAmount !== undefined);
  const protectionTotal = analyzedDocs.reduce(
    (sum, doc) => sum + (doc.flaggedAmount ?? 0),
    0
  );

  return (
    <div className="w-full max-w-none space-y-4 sm:space-y-6">
      {/* Editorial Header - Full-Width, Non-Bento */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 border-b border-slate-200/80 pb-4 sm:pb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Audited Hospital Statements
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Access your audited statements, PhilHealth deductions, itemized overrides, and disputed amounts.
          </p>
        </div>

        {/* Right-aligned editorial metric (Skeletonizes price only while loading) */}
        <div className="shrink-0 sm:text-right sm:border-l sm:border-slate-200/80 sm:pl-6">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Audit Protection Total
          </span>
          {isLoading ? (
            <div className="h-7 w-28 sm:ml-auto mt-1 rounded-md bg-slate-200/70 animate-pulse motion-reduce:animate-none" />
          ) : (
            <div className="animate-fade-slide-in motion-reduce:animate-none flex items-baseline sm:justify-end gap-1.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#2563EB] font-mono tabular-nums">
                {formatPHP(protectionTotal)}
              </span>
              <span className="text-xs font-medium text-slate-500">
                identified
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Clean Search Input (Non-working filter button removed) */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search hospital bills, facility, or case code..."
          aria-label="Search hospital bills, facility, or case code"
          className="w-full min-h-[44px] bg-white border border-slate-200/90 rounded-xl pl-11 pr-11 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search query"
            className="absolute right-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Time & Scope Filter Tabs */}
      <div
        role="tablist"
        aria-label="Statement time filter"
        className="flex items-center gap-4 sm:gap-6 border-b border-slate-200/80 text-xs font-bold overflow-x-auto scrollbar-none"
      >
        {(["Today", "This week", "All Documents", "Archive"] as const).map(
          (tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "min-h-[44px] py-2.5 transition-all whitespace-nowrap relative font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-t-md",
                  isActive
                    ? "text-[#2563EB]"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Full-Width Editorial Statements List (No Bento Cards) */}
      <div>
        {isLoading ? (
          <ArchivePageSkeleton />
        ) : filteredDocs.length === 0 ? (
          <div
            key={`${activeTab}-empty`}
            className="animate-rate-item motion-reduce:animate-none py-12 px-4 text-center border-b border-slate-200/80 space-y-3"
          >
            <FolderArchive className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-900">
              {liveDocs.length === 0
                ? "No statements audited yet"
                : `No statements found for "${activeTab}"`}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {liveDocs.length === 0
                ? "Upload or capture an itemized hospital bill (ISA) in Scan Hub to start auditing."
                : searchQuery
                  ? `No hospital statements matched your search for "${searchQuery}".`
                  : `There are no statements recorded under the ${activeTab} filter.`}
            </p>
            {liveDocs.length === 0 ? (
              <div className="pt-2">
                <Link
                  href="/scanner"
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-full text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Scan First Statement</span>
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("All Documents");
                  setSearchQuery("");
                }}
                className="inline-flex items-center min-h-[44px] px-3 text-xs font-bold text-[#2563EB] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg"
              >
                View All Documents →
              </button>
            )}
          </div>
        ) : (
          <div
            key={activeTab}
            className="divide-y divide-slate-200/80 border-b border-slate-200/80"
          >
            {filteredDocs.map((doc, idx) => (
              <div
                key={doc.id}
                style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}
                className="animate-rate-item motion-reduce:animate-none group py-3.5 sm:py-5 px-1 sm:px-3 flex items-center gap-3 sm:gap-4 hover:bg-slate-50/70 transition-colors rounded-xl"
              >
                {/* Dedicated Larger Thumbnail Preview Button (Distinct from Row Link) */}
                <AuditThumbnail
                  thumbnailUrl={doc.thumbnailUrl}
                  facility={doc.facility}
                  fileType={doc.fileType}
                  onPreview={
                    doc.thumbnailUrl
                      ? () =>
                          setPreviewModal({
                            url: doc.thumbnailUrl!,
                            facility: doc.facility,
                            total: doc.total,
                            auditId: doc.id,
                          })
                      : undefined
                  }
                />

                {/* Row Navigation Link to Audit Studio */}
                <Link
                  href={`/audits/${doc.id}`}
                  className="flex-1 min-w-0 flex items-center justify-between gap-3 sm:gap-4 py-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 truncate group-hover:text-[#2563EB] transition-colors">
                      {doc.facility}
                    </h4>

                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium font-mono truncate">
                      {doc.fileSize} • {doc.fileType} • {doc.dateText}
                    </p>

                    {/* Status & Audit Flag Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {doc.tags.map((tag, i) => (
                        <span
                          key={i}
                          className={cn(
                            "px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border whitespace-nowrap",
                            tag.variant === "rose" &&
                              "bg-rose-50 text-[#DC2626] border-rose-200",
                            tag.variant === "emerald" &&
                              "bg-emerald-50 text-emerald-800 border-emerald-200",
                            tag.variant === "slate" &&
                              "bg-slate-100 text-slate-600 border-slate-200",
                            tag.variant === "blue" &&
                              "bg-blue-50 text-[#2563EB] border-blue-200",
                            tag.variant === "teal" &&
                              "bg-teal-50 text-teal-800 border-teal-200"
                          )}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <span className="font-black text-sm sm:text-base text-slate-900 shrink-0 font-mono tabular-nums text-right">
                    {doc.total > 0 ? formatPHP(doc.total) : "Pending OCR"}
                  </span>
                </Link>

                {/* Right Utility Action (Delete Button) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget(doc);
                  }}
                  aria-label={`Delete audit for ${doc.facility}`}
                  title={`Delete audit for ${doc.facility}`}
                  className="min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/70 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Understated DPA 2012 Compliance Footer Note (No Boxed Card) */}
      <footer className="pt-2 pb-4 flex items-center justify-center gap-2 text-xs text-slate-500 text-center font-medium">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>End-to-End Encrypted Healthcare Storage (DPA 2012 Compliant)</span>
      </footer>

      {/* Crisp Statement Preview Modal (NO backdrop-blur) */}
      {previewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Statement preview for ${previewModal.facility}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-6 transition-opacity duration-150"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3 bg-white">
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 truncate">
                  {previewModal.facility}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total Billed:{" "}
                  <span className="font-bold text-slate-900 font-mono tabular-nums">
                    {previewModal.total > 0 ? formatPHP(previewModal.total) : "Pending OCR"}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/audits/${previewModal.auditId}`}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
                >
                  <span>Open Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  aria-label="Close statement preview"
                  onClick={() => setPreviewModal(null)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-slate-100/80 min-h-[280px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewModal.url}
                alt={`${previewModal.facility} hospital statement`}
                className="max-w-full max-h-[68vh] rounded-lg object-contain shadow-sm border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Two-Step Delete Confirmation Modal (No backdrop-blur) */}
      {deleteTarget &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-audit-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => {
              if (!isDeleting) setDeleteTarget(null);
            }}
          >
            <div
              className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-2xl p-5 sm:p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1.5">
                <h2
                  id="delete-audit-title"
                  className="text-base sm:text-lg font-bold text-slate-900"
                >
                  Delete hospital audit?
                </h2>
                <p className="text-xs sm:text-sm font-semibold text-slate-700">
                  {deleteTarget.facility}{" "}
                  <span className="font-normal text-slate-500">
                    • {deleteTarget.dateText}
                  </span>
                </p>
                <p className="text-xs text-slate-500 leading-relaxed pt-1">
                  This will permanently delete the audit record and all uploaded
                  bill files. This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Audit</span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
