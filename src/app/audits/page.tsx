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
  ArrowRight,
  Sparkles,
  FolderArchive,
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
  isLive?: boolean;
  /** Total flagged by the audit engine; undefined until the bill is analyzed. */
  flaggedAmount?: number;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

/** Demo figure shown until the signed-in user has analyzed a real bill. */
const SAMPLE_PROTECTION_TOTAL = 48750;

const sampleAuditDocuments: AuditDoc[] = [
  {
    id: "doc-1",
    facility: "St. Luke's Medical Center - BGC",
    total: 148500,
    fileSize: "4.2 MB",
    fileType: "PDF",
    dateText: "Audited Today",
    createdAt: new Date().toISOString(),
    tags: [
      { label: "• ₱32,400 Disputed", variant: "rose" },
      { label: "ISA #2024-884", variant: "slate" },
    ],
  },
  {
    id: "doc-2",
    facility: "The Medical City — Inpatient",
    total: 84200,
    fileSize: "2.8 MB",
    fileType: "DOCX",
    dateText: "Yesterday",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [
      { label: "✓ PhilHealth Deducted (-₱19k)", variant: "emerald" },
      { label: "Senior 20% Applied", variant: "slate" },
    ],
  },
  {
    id: "doc-3",
    facility: "Makati Medical Center",
    total: 29800,
    fileSize: "3.1 MB",
    fileType: "PDF",
    dateText: "3 days ago",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [
      { label: "✓ Verified Clean", variant: "emerald" },
      { label: "No DOH cap excess", variant: "slate" },
    ],
  },
  {
    id: "doc-4",
    facility: "Cardinal Santos Medical Center",
    total: 65000,
    fileSize: "5.4 MB",
    fileType: "Scan",
    dateText: "2 weeks ago",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [
      { label: "Room & Board Breakdown", variant: "blue" },
      { label: "3 days semi-private", variant: "slate" },
    ],
  },
  {
    id: "doc-5",
    facility: "Philippine General Hospital",
    total: 14350,
    fileSize: "1.9 MB",
    fileType: "PDF",
    dateText: "Last month",
    createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [{ label: "Malasakit Center Credit", variant: "teal" }],
  },
];

export default function DocumentArchivePage() {
  const [activeTab, setActiveTab] = useState<
    "Today" | "This week" | "All Documents" | "Archive"
  >("This week");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveDocs, setLiveDocs] = useState<AuditDoc[]>([]);

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

  const combinedDocs = [...liveDocs, ...sampleAuditDocuments];

  const filteredDocs = combinedDocs.filter((doc) => {
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
  const hasLiveTotal = analyzedDocs.length > 0;
  const protectionTotal = hasLiveTotal
    ? analyzedDocs.reduce((sum, doc) => sum + (doc.flaggedAmount ?? 0), 0)
    : SAMPLE_PROTECTION_TOTAL;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Redesigned Header - Clean, No Card Background */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 pb-1 sm:pt-2 sm:pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
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
                <span className="text-base sm:text-lg font-black tracking-tight text-blue-600">
                  {formatPHP(protectionTotal)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  identified {!hasLiveTotal && "(sample)"}
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
          <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-soft space-y-2.5">
            <FolderArchive className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-800">
              No statements found for &ldquo;{activeTab}&rdquo;
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? `No hospital statements matched your search for "${searchQuery}".`
                : `There are no statements recorded under the ${activeTab} filter.`}
            </p>
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
          </div>
        ) : (
          filteredDocs.map((doc) => {
          const card = (
            <Card
              className="hover:border-blue-300 hover:shadow-card-hover transition-all bg-white cursor-pointer group border-slate-200/80 rounded-2xl shadow-soft"
            >
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  {/* File Format Badge */}
                  <div
                    className={cn(
                      "w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 font-bold text-[10px] border",
                      doc.fileType === "PDF" &&
                        "bg-rose-50 text-[#DC2626] border-rose-200",
                      doc.fileType === "DOCX" &&
                        "bg-blue-50 text-blue-600 border-blue-200",
                      doc.fileType === "Scan" &&
                        "bg-blue-50 text-blue-600 border-blue-200"
                    )}
                  >
                    {doc.fileType === "Scan" ? (
                      <Camera className="w-5 h-5 text-blue-600" />
                    ) : (
                      <span>{doc.fileType}</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="font-bold text-sm text-[#1E293B] truncate group-hover:text-[#2563EB] transition-colors">
                          {doc.facility}
                        </h4>
                        {doc.isLive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2563EB] text-white shrink-0">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>LIVE</span>
                          </span>
                        )}
                      </div>
                      <span className="font-black text-sm text-[#1E293B] shrink-0">
                        {doc.total > 0 ? formatPHP(doc.total) : "Pending OCR"}
                      </span>
                    </div>

                    <p className="text-xs text-[#64748B] font-medium">
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
          );

          // Only real audits open in the Audit Studio; sample rows are demo data.
          return doc.isLive ? (
            <Link
              key={doc.id}
              href={`/audits/${doc.id}`}
              className="block focus:outline-none"
            >
              {card}
            </Link>
          ) : (
            <React.Fragment key={doc.id}>{card}</React.Fragment>
          );
        })
        )}
      </div>

      {/* DPA 2012 Regulatory Compliance Footer */}
      <div className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center gap-2 text-[11px] text-[#64748B] text-center font-medium">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>End-to-End Encrypted Healthcare Storage (DPA 2012 Compliant)</span>
      </div>
    </div>
  );
}
