"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  Grid,
  Image as ImageIcon,
  SlidersHorizontal,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Accessibility,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "@/components/layout/ModeSelector";

export default function ScannerPage() {
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Top 3 Mode Selectors */}
      <ModeSelector />

      {/* Main Scanner Viewfinder Card */}
      <Card className="overflow-hidden border-slate-100 shadow-soft bg-white">
        <div className="p-5 sm:p-7 flex flex-col items-center bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
          {/* Top Bar inside Viewfinder */}
          <div className="w-full flex items-center justify-between mb-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>AUTO-FRAME READY</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFlashOn(!isFlashOn)}
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                  isFlashOn
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                aria-label="Toggle Flash"
              >
                <Zap className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                  showGrid
                    ? "bg-blue-50 border-blue-200 text-blue-600"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                aria-label="Toggle Grid"
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Central Camera Reticle & Laser Crosshairs */}
          <div className="relative w-full max-w-xs sm:max-w-sm h-72 sm:h-84 my-3 flex items-center justify-center">
            {/* Viewfinder Corner Brackets */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-[3.5px] border-l-[3.5px] border-blue-600 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-[3.5px] border-r-[3.5px] border-blue-600 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[3.5px] border-l-[3.5px] border-blue-600 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[3.5px] border-r-[3.5px] border-blue-600 rounded-br-2xl" />

            {/* Glowing Blue Horizontal Laser Line */}
            <div className="absolute left-6 right-6 h-[2px] bg-blue-600 shadow-[0_0_24px_4px_rgba(37,99,235,0.7)] animate-pulse z-10" />
            
            {/* Vertical Reticle Crosshair Line */}
            <div className="absolute top-6 bottom-6 w-[1.5px] bg-blue-500/35" />

            {/* Placeholder Statement Form Lines inside Reticle */}
            <div className="w-48 sm:w-56 space-y-2.5 opacity-20 pointer-events-none">
              <div className="h-2.5 bg-slate-500 rounded-full w-full" />
              <div className="h-2 bg-slate-400 rounded-full w-5/6" />
              <div className="h-2 bg-slate-400 rounded-full w-4/6" />
              <div className="h-2 bg-slate-400 rounded-full w-full" />
              <div className="h-2 bg-slate-400 rounded-full w-3/4" />
            </div>

            {/* Instruction Chip inside Reticle */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-xs font-medium text-slate-700 shadow-xs z-20">
              Align Itemized Statement (ISA) within frame
            </div>
          </div>

          {/* Supported Forms note */}
          <p className="text-xs text-slate-600 text-center mt-2">
            Supports DOH standard billing, PhilHealth CF2 & SOA forms
          </p>
        </div>
      </Card>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-3">
        <label className="flex-1 cursor-pointer">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                alert(`Selected: ${e.target.files[0].name}. (Week 2 Upload Engine ready)`);
              }
            }}
          />
          <div className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-soft hover:bg-slate-50 transition-colors">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span>Upload Photo / PDF</span>
          </div>
        </label>

        <Link href="/rates" className="flex-1">
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
                  <Badge variant="primary" className="text-[10px] py-0 px-2 bg-blue-100 text-blue-700 border-blue-200">
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
