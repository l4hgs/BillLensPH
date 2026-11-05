import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Scan,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  FolderArchive,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Onboarding Hero Section */}
      <div className="bg-white rounded-2xl p-5 sm:p-8 md:p-10 border border-[#CBD5E1] shadow-soft">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-4xl mx-auto">
          {/* Visual Card Stack Graphic with Official Mascot */}
          <div className="relative flex items-center justify-center py-4 sm:py-6 order-1 md:order-2 overflow-hidden">
            <div className="relative w-64 h-72 sm:w-72 sm:h-80 flex items-center justify-center scale-90 sm:scale-100 origin-center transition-transform">
              {/* Back Yellow Card (DOH Cap) */}
              <div className="absolute -left-3 top-2 w-48 h-64 sm:w-56 sm:h-72 rounded-2xl bg-amber-50 border border-amber-200 -rotate-12 shadow-sm p-4">
                <div className="w-12 h-2.5 rounded-full bg-amber-300 mb-2" />
                <div className="w-6 h-6 rounded-full bg-amber-300 mb-3" />
                <div className="w-32 h-2 rounded-full bg-amber-200 mb-2" />
                <div className="w-24 h-2 rounded-full bg-amber-200" />
                <div className="absolute bottom-4 left-4 text-amber-800 font-bold text-xs">
                  DOH Price Reference
                </div>
              </div>

              {/* Back Blue Card (PhilHealth Case Rate) */}
              <div className="absolute -right-3 top-4 w-48 h-64 sm:w-56 sm:h-72 rounded-2xl bg-[#2563EB] text-white rotate-12 shadow-md shadow-blue-500/20 p-5 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-extrabold tracking-wider uppercase text-blue-200">
                    PHILHEALTH BENEFIT
                  </div>
                  <div className="text-xl sm:text-2xl font-black mt-1">
                    ₱38,500
                  </div>
                  <div className="w-16 h-1.5 rounded-full bg-blue-300 mt-2" />
                </div>
                <div className="text-right text-[11px] font-bold text-blue-100">
                  ACR 2024 Verified
                </div>
              </div>

              {/* Front Main White Card (HOSPITAL ISA + Mascot) */}
              <div className="relative z-10 w-52 h-68 sm:w-60 sm:h-76 rounded-2xl bg-white border border-[#CBD5E1] shadow-xl p-4 flex flex-col justify-between">
                <div>
                  {/* Card Header with Logo Accent */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#CBD5E1]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                      <span className="font-extrabold text-[11px] tracking-tight text-[#1E293B] uppercase">
                        Hospital ISA
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>

                  {/* Robot Mascot without gray box */}
                  <div className="my-3 flex items-center justify-center">
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center p-1">
                      <Image
                        src="/logo.png"
                        alt="BillLens PH Mascot"
                        width={76}
                        height={76}
                        className="object-contain w-auto h-full"
                        priority
                      />
                    </div>
                  </div>

                  {/* Lines placeholder */}
                  <div className="space-y-1.5 px-2">
                    <div className="w-full h-1.5 rounded-full bg-[#CBD5E1]" />
                    <div className="w-3/4 h-1.5 rounded-full bg-[#CBD5E1]" />
                    <div className="w-1/2 h-1.5 rounded-full bg-blue-200" />
                  </div>
                </div>

                {/* Senior / PWD Chip */}
                <div className="py-1 px-2.5 rounded-full bg-[#F3F4F6] border border-[#CBD5E1] flex items-center justify-between text-[10px] font-bold text-[#1E293B]">
                  <span>Senior/PWD -20% + VAT 0%</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Copy and CTA Side */}
          <div className="text-center md:text-left space-y-4 order-2 md:order-1">
            {/* Advocacy Pill Badge */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[#2563EB] text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
              <span>Philippine Medical Billing Transparency</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#1E293B] leading-tight">
              Hospital Bills, Audited with Clarity.
            </h1>

            <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed max-w-md mx-auto md:mx-0">
              Transform complex Philippine hospital Statements of Account (ISA) into transparent itemized audits with automatic PhilHealth ACR coverage & RA 9994 / RA 10754 statutory checks.
            </p>

            {/* Pagination Dots indicator */}
            <div className="flex items-center justify-center md:justify-start gap-1.5 pt-1">
              <span className="w-6 h-2 rounded-full bg-[#2563EB]" />
              <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
              <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
            </div>

            {/* Main Action Buttons: Fixed responsiveness with whitespace-nowrap and flex-wrap handling */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full">
              <Link href="/scanner" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto px-6 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold shadow-md shadow-blue-500/20 whitespace-nowrap"
                >
                  <Scan className="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0 stroke-[2.2]" />
                  <span>Scan Hospital Bill</span>
                  <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                </Button>
              </Link>

              <Link href="/rates" className="w-full sm:w-auto">
                <Button
                  variant="dark"
                  size="lg"
                  className="w-full sm:w-auto px-5 py-3 font-bold whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4 mr-2 shrink-0 text-yellow-400" />
                  <span>Browse PhilHealth Rates</span>
                </Button>
              </Link>
            </div>

            <p className="text-xs text-[#64748B]">
              Already have an audit saved?{" "}
              <Link
                href="/auth"
                className="text-[#2563EB] font-bold hover:underline"
              >
                Sign In
              </Link>
            </p>

            {/* Statutory Features Footer Pills */}
            <div className="pt-3 border-t border-[#CBD5E1] flex flex-wrap items-center justify-center md:justify-start gap-2.5 sm:gap-3 text-xs text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold whitespace-nowrap">DOH Reference Cap</span>
              </div>
              <span className="text-[#CBD5E1] hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold whitespace-nowrap">RA 9994 (Senior Citizen)</span>
              </div>
              <span className="text-[#CBD5E1] hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold whitespace-nowrap">PhilHealth ACR 2024</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quick Access Card 1 */}
        <Link href="/scanner" className="group">
          <Card className="p-5 hover:border-[#2563EB] hover:shadow-card-hover transition-all bg-white h-full border-[#CBD5E1]">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB] mb-3 group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
              <Scan className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1E293B] group-hover:text-[#2563EB] transition-colors">
              Fast ISA Scanner
            </h3>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Upload multi-page statements or camera snapshots with instant reticle auto-framing and image optimization.
            </p>
          </Card>
        </Link>

        {/* Quick Access Card 2 */}
        <Link href="/audits" className="group">
          <Card className="p-5 hover:border-[#2563EB] hover:shadow-card-hover transition-all bg-white h-full border-[#CBD5E1]">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <FolderArchive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1E293B] group-hover:text-[#2563EB] transition-colors">
              Document Archive
            </h3>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Access your audited statements, PhilHealth deductions, itemized overrides, and disputed amounts.
            </p>
          </Card>
        </Link>

        {/* Quick Access Card 3 */}
        <Link href="/rates" className="group">
          <Card className="p-5 hover:border-[#2563EB] hover:shadow-card-hover transition-all bg-white h-full border-[#CBD5E1]">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-3 group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1E293B] group-hover:text-[#2563EB] transition-colors">
              PhilHealth ACR 2024
            </h3>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Cross-reference official All-Case-Rates v3 to ensure mandatory hospital deductions and unbundling protection.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
