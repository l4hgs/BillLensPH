import React from "react";
import Link from "next/link";
import {
  Scan,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
  Building2,
  FileSpreadsheet,
  Zap,
  HelpCircle,
  FolderArchive,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPHP } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Onboarding Hero Section - Matching Reference Screenshot 1 */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-100 shadow-soft">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-4xl mx-auto">
          {/* Visual Card Stack Graphic */}
          <div className="relative flex items-center justify-center py-6 order-1 md:order-2">
            <div className="relative w-64 h-72 sm:w-72 sm:h-80 flex items-center justify-center">
              {/* Back Yellow Card (DOH Cap) */}
              <div className="absolute -left-3 top-2 w-48 h-64 sm:w-56 sm:h-72 rounded-3xl bg-amber-100/90 border border-amber-200/80 -rotate-12 shadow-sm transition-transform hover:-rotate-14 duration-300 p-4">
                <div className="w-12 h-2.5 rounded-full bg-amber-300/80 mb-2" />
                <div className="w-6 h-6 rounded-full bg-amber-300/80 mb-3" />
                <div className="w-32 h-2 rounded-full bg-amber-200/80 mb-2" />
                <div className="w-24 h-2 rounded-full bg-amber-200/80" />
                <div className="absolute bottom-4 left-4 text-amber-700/70 font-bold text-xs">
                  DOH Cap
                </div>
              </div>

              {/* Back Blue Card (PhilHealth Case Rate) */}
              <div className="absolute -right-3 top-4 w-48 h-64 sm:w-56 sm:h-72 rounded-3xl bg-blue-600 text-white rotate-12 shadow-lg shadow-blue-500/20 transition-transform hover:rotate-14 duration-300 p-5 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-wider uppercase text-blue-200">
                    CASE RATE
                  </div>
                  <div className="text-xl sm:text-2xl font-black mt-1">
                    ₱38,500
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-blue-400 mt-2" />
                </div>
                <div className="text-right text-[11px] font-semibold text-blue-200">
                  ACR v3 Verified
                </div>
              </div>

              {/* Front Main White Card (HOSPITAL ISA) */}
              <div className="relative z-10 w-52 h-68 sm:w-60 sm:h-76 rounded-3xl bg-white border border-slate-100 shadow-2xl p-4 flex flex-col justify-between">
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-rose-500 font-bold text-xs">+</span>
                      <span className="font-bold text-[11px] tracking-tight text-slate-800 uppercase">
                        Hospital ISA
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>

                  {/* Circular Auditing Radar */}
                  <div className="my-4 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full border-4 border-blue-600 flex flex-col items-center justify-center bg-blue-50/30 relative">
                      <Scan className="w-6 h-6 text-blue-600 mb-0.5 animate-pulse" />
                      <span className="text-[9px] font-bold tracking-wider text-blue-600 uppercase">
                        Auditing
                      </span>
                    </div>
                  </div>

                  {/* Lines placeholder */}
                  <div className="space-y-1.5 px-2">
                    <div className="w-full h-1.5 rounded-full bg-slate-100" />
                    <div className="w-3/4 h-1.5 rounded-full bg-slate-100" />
                    <div className="w-1/2 h-1.5 rounded-full bg-blue-100" />
                  </div>
                </div>

                {/* Senior / PWD Chip */}
                <div className="py-1 px-2.5 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-between text-[10px] font-semibold text-slate-700">
                  <span>Senior / PWD -20%</span>
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Copy and CTA Side */}
          <div className="text-center md:text-left space-y-4 order-2 md:order-1">
            {/* Advocacy Pill Badge */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Philippine Medical Advocacy</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Welcome to BillLens PH
            </h1>

            <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto md:mx-0">
              Transform complex hospital bills into transparent itemized audits with instant PhilHealth & Senior/PWD statutory checks.
            </p>

            {/* Pagination Dots indicator */}
            <div className="flex items-center justify-center md:justify-start gap-1.5 pt-1">
              <span className="w-6 h-2 rounded-full bg-blue-600" />
              <span className="w-2 h-2 rounded-full bg-slate-200" />
              <span className="w-2 h-2 rounded-full bg-slate-200" />
            </div>

            {/* Main Action Button */}
            <div className="pt-2">
              <Link href="/scanner">
                <Button
                  size="lg"
                  className="w-full sm:w-auto px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/25 h-13"
                >
                  <Scan className="w-5 h-5 mr-2 stroke-[2.2]" />
                  <span>Scan Your First Bill</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>

            <p className="text-xs text-slate-500">
              Already have an audit saved?{" "}
              <Link
                href="/auth"
                className="text-blue-600 font-semibold hover:underline"
              >
                Sign In
              </Link>
            </p>

            {/* Statutory Features Footer Pills */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>DOH Reference Cap</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>RA 9994 (Senior)</span>
              </div>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>PhilHealth ACR</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Dashboard Overview Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quick Access Card 1 */}
        <Link href="/scanner" className="group">
          <Card className="p-5 hover:border-blue-300 hover:shadow-card-hover transition-all bg-white h-full">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Scan className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
              Fast ISA Scanner
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload multi-page statements or camera snapshots with instant reticle auto-framing.
            </p>
          </Card>
        </Link>

        {/* Quick Access Card 2 */}
        <Link href="/audits" className="group">
          <Card className="p-5 hover:border-blue-300 hover:shadow-card-hover transition-all bg-white h-full">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FolderArchive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
              Document Archive
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Access your audited statements, PhilHealth deductions, and disputed amounts.
            </p>
          </Card>
        </Link>

        {/* Quick Access Card 3 */}
        <Link href="/rates" className="group">
          <Card className="p-5 hover:border-blue-300 hover:shadow-card-hover transition-all bg-white h-full">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
              PhilHealth ACR 2024
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cross-reference official All-Case-Rates v3 to ensure mandatory hospital deductions.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
