"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Coins,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Camera,
  FolderArchive,
  Eye,
  FileText,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPHP } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/imageCompression";
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
      <div className="relative w-12 h-14 sm:w-14 sm:h-16 rounded-xl overflow-hidden border border-slate-200/90 bg-slate-100 shrink-0 shadow-2xs group/thumb hover:border-blue-400 transition-all">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={facility}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent pointer-events-none" />
        <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded text-[8px] font-bold bg-slate-900/80 text-white tracking-wider uppercase backdrop-blur-2xs">
          {fileType}
        </span>
        {onPreview && (
          <button
            type="button"
            title="Preview hospital bill photo"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
            className="absolute inset-0 flex items-center justify-center bg-slate-900/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity text-white cursor-pointer"
          >
            <div className="p-1 rounded-full bg-slate-900/80 hover:bg-blue-600 transition-colors shadow-2xs">
              <Eye className="w-3.5 h-3.5" />
            </div>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-12 h-14 sm:w-14 sm:h-16 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold border shadow-2xs",
        fileType === "PDF" && "bg-rose-50 text-[#DC2626] border-rose-200",
        fileType === "DOCX" && "bg-blue-50 text-blue-600 border-blue-200",
        fileType === "Scan" && "bg-blue-50 text-blue-600 border-blue-200"
      )}
    >
      {fileType === "Scan" ? (
        <Camera className="w-5 h-5 text-blue-600 mb-0.5" />
      ) : (
        <FileText className="w-5 h-5 text-rose-600 mb-0.5" />
      )}
      <span className="text-[9px] uppercase tracking-wider">{fileType}</span>
    </div>
  );
}

export default function DocumentArchivePage() {
  const [activeTab, setActiveTab] = useState<
    "Today" | "This week" | "All Documents" | "Archive"
  >("This week");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveDocs, setLiveDocs] = useState<AuditDoc[]>([]);
  const [previewModal, setPreviewModal] = useState<{
    url: string;
    facility: string;
    total: number;
    auditId: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadUserAudits() {
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
    // "All Documents" shows all records

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
    <div className="w-full max-w-none space-y-6">
      {/* Redesigned Header - Clean, No Card Background */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 pb-1 sm:pt-2 sm:pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.03em] text-slate-900">
            Audited Hospital Statements
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Access your audited statements, PhilHealth deductions, itemized overrides, and disputed amounts.
          </p>
        </div>

        {/* Right-aligned metric badge */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white border border-slate-200/80 shadow-soft rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600 shadow-2xs">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Audit Protection Total
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black tracking-tight text-blue-600 font-mono tabular-nums">
                  {formatPHP(protectionTotal)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  identified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#64748B] absolute left-4" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search hospital bills, facility, or case code..."
          className="w-full bg-white border border-[#CBD5E1] rounded-full pl-11 pr-11 py-3 text-xs sm:text-sm text-[#1E293B] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] shadow-soft transition-all"
        />
        <button
          type="button"
          className="absolute right-3.5 text-[#64748B] hover:text-[#1E293B] p-1"
          aria-label="Filter"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-6 border-b border-[#CBD5E1] px-2 text-xs font-bold overflow-x-auto scrollbar-none">
        {(["Today", "This week", "All Documents", "Archive"] as const).map(
          (tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "pb-2.5 transition-all whitespace-nowrap relative font-bold",
                  isActive
                    ? "text-[#2563EB]"
                    : "text-[#64748B] hover:text-[#1E293B]"
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

      {/* Document Items List */}
      <div className="space-y-3">
        {filteredDocs.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-soft space-y-3">
            <FolderArchive className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-800">
              {liveDocs.length === 0
                ? "No statements audited yet"
                : `No statements found for "${activeTab}"`}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {liveDocs.length === 0
                ? "Upload or capture an itemized hospital bill (ISA) in Scan Hub to start auditing."
                : searchQuery
                ? `No hospital statements matched your search for "${searchQuery}".`
                : `There are no statements recorded under the ${activeTab} filter.`}
            </p>
            {liveDocs.length === 0 ? (
              <div className="pt-1">
                <Link
                  href="/scanner"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-soft transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Scan First Statement
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("All Documents");
                  setSearchQuery("");
                }}
                className="inline-block mt-2 text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
              >
                View All Documents →
              </button>
            )}
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <Link
              key={doc.id}
              href={`/audits/${doc.id}`}
              className="block focus:outline-none"
            >
              <Card className="hover:border-blue-300 hover:shadow-card-hover transition-all bg-white cursor-pointer group border-slate-200/80 rounded-2xl shadow-soft">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Bill Picture Thumbnail or Format Fallback */}
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

                    {/* Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="font-bold text-sm text-[#1E293B] truncate group-hover:text-[#2563EB] transition-colors">
                            {doc.facility}
                          </h4>
                        </div>
                        <span className="font-black text-sm text-[#1E293B] shrink-0 font-mono tabular-nums">
                          {doc.total > 0 ? formatPHP(doc.total) : "Pending OCR"}
                        </span>
                      </div>

                      <p className="text-xs text-[#64748B] font-medium font-mono">
                        {doc.fileSize} • {doc.fileType} • {doc.dateText}
                      </p>

                      {/* Chips */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {doc.tags.map((tag, i) => (
                          <span
                            key={i}
                            className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                              tag.variant === "rose" &&
                                "bg-rose-50 text-[#DC2626] border-rose-200",
                              tag.variant === "emerald" &&
                                "bg-emerald-50 text-emerald-800 border-emerald-200",
                              tag.variant === "slate" &&
                                "bg-[#F3F4F6] text-[#64748B] border-[#CBD5E1]",
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
                  </div>

                  <ChevronRight className="w-4 h-4 text-[#64748B] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* DPA 2012 Regulatory Compliance Footer */}
      <div className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center gap-2 text-[11px] text-[#64748B] text-center font-medium">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>End-to-End Encrypted Healthcare Storage (DPA 2012 Compliant)</span>
      </div>

      {/* Bill Picture Lightbox / Fullscreen Modal */}
      {previewModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 transition-opacity duration-150"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[82vh] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col transition-opacity duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                  {previewModal.facility}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Total Billed: <span className="font-bold text-slate-800">{formatPHP(previewModal.total)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/audits/${previewModal.auditId}`}
                  className="px-3 py-1 rounded-full text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-2xs transition-colors"
                >
                  Open Studio →
                </Link>
                <button
                  type="button"
                  aria-label="Close bill preview"
                  onClick={() => setPreviewModal(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-3 flex items-center justify-center bg-slate-50 min-h-[240px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewModal.url}
                alt={previewModal.facility}
                className="max-w-full max-h-[62vh] rounded-lg object-contain shadow-2xs border border-slate-200/80 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
