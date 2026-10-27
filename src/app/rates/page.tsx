"use client";

import React, { useState } from "react";
import { Search, ShieldCheck, ChevronRight, SlidersHorizontal, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "@/components/layout/ModeSelector";
import { formatPHP } from "@/lib/utils";

const casePackages = [
  {
    code: "47562",
    keyword: "Laparoscopic Cholecystectomy",
    hciFee: 18600,
    profFee: 12400,
    totalRate: 31000,
    description: "Minimally invasive gallbladder removal inclusive of standard surgical supplies and basic OR setup.",
    category: "Surgical Bundle",
  },
  {
    code: "44970",
    keyword: "Laparoscopic Appendectomy",
    hciFee: 14400,
    profFee: 9600,
    totalRate: 24000,
    description: "Inclusive of basic OR medications, routine anesthesia, and post-anesthesia care room charges.",
    category: "Surgical Bundle",
  },
  {
    code: "93458",
    keyword: "Coronary Angiography",
    hciFee: 22800,
    profFee: 15200,
    totalRate: 38000,
    description: "Cardiac catheterization bundle covering standard ionic contrast media, catheters, and guide wires.",
    category: "Cardiovascular",
  },
  {
    code: "59400",
    keyword: "Normal Spontaneous Delivery (NSD)",
    hciFee: 5000,
    profFee: 3000,
    totalRate: 8000,
    description: "Maternity care package for low-risk vaginal delivery in accredited hospitals and lying-in clinics.",
    category: "Maternity",
  },
  {
    code: "90935",
    keyword: "Hemodialysis Session",
    hciFee: 4000,
    profFee: 0,
    totalRate: 4000,
    description: "Standard dialysis session under PhilHealth expanded 156-session benefit circular.",
    category: "Renal Care",
  },
];

export default function RatesPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = casePackages.filter(
    (pkg) =>
      pkg.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.code.includes(searchQuery)
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Top 3 Mode Selector */}
      <ModeSelector />

      {/* Header Info */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200/80 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>PhilHealth All-Case-Rates (ACR v3)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Benefit Case Rates Directory
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Official circular rates covering hospital facility charges and professional fees.
            </p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-4" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by case code or procedure (e.g. 44970, Appendectomy)..."
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

      {/* Case Package Cards */}
      <div className="space-y-3">
        {filtered.map((pkg) => (
          <Card
            key={pkg.code}
            className="hover:border-blue-300 hover:shadow-card-hover transition-all bg-white cursor-pointer group"
          >
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      RVS {pkg.code}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-600 uppercase">
                      {pkg.category}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                    {pkg.keyword}
                  </h3>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-600 block">
                    Fixed Benefit
                  </span>
                  <span className="font-black text-sm sm:text-base text-emerald-800">
                    {formatPHP(pkg.totalRate)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {pkg.description}
              </p>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-3">
                  <span>
                    Facility Fee:{" "}
                    <strong className="text-slate-800">{formatPHP(pkg.hciFee)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Prof. Fee:{" "}
                    <strong className="text-slate-800">{formatPHP(pkg.profFee)}</strong>
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
