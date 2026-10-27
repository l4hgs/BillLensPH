"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Coins,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  FileText,
  Camera,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "@/components/layout/ModeSelector";
import { cn, formatPHP } from "@/lib/utils";

interface AuditDoc {
  id: string;
  facility: string;
  total: number;
  fileSize: string;
  fileType: "PDF" | "DOCX" | "Scan";
  dateText: string;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

const auditDocuments: AuditDoc[] = [
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
    tags: [
      { label: "Malasakit Center Credit", variant: "teal" },
    ],
  },
];

export default function DocumentArchivePage() {
  const [activeTab, setActiveTab] = useState<"Today" | "This week" | "All Documents" | "Archive">("This week");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDocs = auditDocuments.filter((doc) =>
    doc.facility.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Top 3 Mode Selector */}
      <ModeSelector />

      {/* Audit Protection Total Blue Banner Card */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5 shadow-lg shadow-blue-500/20 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">
              Audit Protection Total
            </span>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
              ₱48,750{" "}
              <span className="text-xs sm:text-sm font-normal text-blue-100">
                identified overcharges
              </span>
            </span>
          </div>
        </div>

        <button
          type="button"
          className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          aria-label="View protection breakdown"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-4" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search hospital bills, facility, or case code..."
          className="w-full bg-white border border-slate-200/90 rounded-full pl-11 pr-11 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-soft transition-all"
        />
        <button
          type="button"
          className="absolute right-3.5 text-slate-400 hover:text-slate-600 p-1"
          aria-label="Filter"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 px-2 text-xs font-semibold overflow-x-auto scrollbar-none">
        {(["Today", "This week", "All Documents", "Archive"] as const).map(
          (tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "pb-2.5 transition-all whitespace-nowrap relative",
                  isActive
                    ? "text-blue-600 font-bold"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {tab}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Document Items List */}
      <div className="space-y-3">
        {filteredDocs.map((doc) => (
          <Card
            key={doc.id}
            className="hover:border-blue-300 hover:shadow-card-hover transition-all bg-white cursor-pointer group"
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                {/* File Format Badge */}
                <div
                  className={cn(
                    "w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 font-bold text-[10px] border",
                    doc.fileType === "PDF" &&
                      "bg-rose-50 text-rose-600 border-rose-200/80",
                    doc.fileType === "DOCX" &&
                      "bg-blue-50 text-blue-600 border-blue-200/80",
                    doc.fileType === "Scan" &&
                      "bg-slate-100 text-slate-700 border-slate-200"
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
                    <h4 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {doc.facility}
                    </h4>
                    <span className="font-extrabold text-sm text-slate-900 shrink-0">
                      {formatPHP(doc.total)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium">
                    {doc.fileSize} • {doc.fileType} • {doc.dateText}
                  </p>

                  {/* Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {doc.tags.map((tag, i) => (
                      <span
                        key={i}
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                          tag.variant === "rose" &&
                            "bg-rose-50 text-rose-700 border-rose-200",
                          tag.variant === "emerald" &&
                            "bg-emerald-50 text-emerald-700 border-emerald-200",
                          tag.variant === "slate" &&
                            "bg-slate-100 text-slate-600 border-slate-200",
                          tag.variant === "blue" &&
                            "bg-blue-50 text-blue-700 border-blue-200",
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

              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DPA 2012 Regulatory Compliance Footer */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-xs flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center">
        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
        <span>End-to-End Encrypted Healthcare Storage (DPA 2012 Compliant)</span>
      </div>
    </div>
  );
}
