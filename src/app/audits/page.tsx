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
    dateText: "12.04.2024",
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
    dateText: "08.04.2024",
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
    dateText: "28.03.2024",
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
    dateText: "15.03.2024",
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

  const filteredDocs = combinedDocs.filter((doc) =>
    doc.facility.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const analyzedDocs = liveDocs.filter((doc) => doc.flaggedAmount !== undefined);
  const hasLiveTotal = analyzedDocs.length > 0;
  const protectionTotal = hasLiveTotal
    ? analyzedDocs.reduce((sum, doc) => sum + (doc.flaggedAmount ?? 0), 0)
    : SAMPLE_PROTECTION_TOTAL;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Audit Protection Total Solid Banner (Solid Brand Blue #2563EB, No Gradient) */}
      <div className="rounded-2xl bg-[#2563EB] text-white p-4 sm:p-5 shadow-soft flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#1D4ED8] flex items-center justify-center shrink-0 text-white">
            <Coins className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-100 block">
              Audit Protection Total
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {formatPHP(protectionTotal)}
              </span>
              <span className="text-xs sm:text-sm font-medium text-blue-100">
                identified overcharges
                {!hasLiveTotal && " (sample)"}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="w-9 h-9 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] flex items-center justify-center text-white transition-colors shrink-0 cursor-pointer"
          aria-label="View protection breakdown"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
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
        {filteredDocs.map((doc) => {
          const card = (
            <Card
              className={cn(
                "hover:border-[#2563EB] hover:shadow-card-hover transition-all bg-white cursor-pointer group border-[#CBD5E1]",
                doc.isLive && "border-[#2563EB]"
              )}
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
                        "bg-blue-50 text-[#2563EB] border-blue-200",
                      doc.fileType === "Scan" &&
                        "bg-[#F3F4F6] text-[#1E293B] border-[#CBD5E1]"
                    )}
                  >
                    {doc.fileType === "Scan" ? (
                      <Camera className="w-5 h-5 text-[#2563EB]" />
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
        })}
      </div>

      {/* DPA 2012 Regulatory Compliance Footer */}
      <div className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center gap-2 text-[11px] text-[#64748B] text-center font-medium">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>End-to-End Encrypted Healthcare Storage (DPA 2012 Compliant)</span>
      </div>
    </div>
  );
}
