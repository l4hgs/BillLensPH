"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeItem {
  id: string;
  label: string;
  sub: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const modes: ModeItem[] = [
  {
    id: "isa",
    label: "ISA Scan",
    sub: "Fast OCR",
    href: "/scanner",
    icon: FileText,
  },
  {
    id: "philhealth",
    label: "PhilHealth",
    sub: "Case Rates",
    href: "/rates",
    icon: Shield,
  },
  {
    id: "copilot",
    label: "AI Copilot",
    sub: "Dispute Kit",
    href: "/copilot",
    icon: Sparkles,
  },
];

export function ModeSelector() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full">
      {modes.map((mode) => {
        const isActive =
          (mode.id === "isa" && (pathname === "/scanner" || pathname === "/")) ||
          (mode.id === "philhealth" && pathname === "/rates") ||
          (mode.id === "copilot" && pathname === "/copilot");

        const Icon = mode.icon;

        return (
          <Link
            key={mode.id}
            href={mode.href}
            className={cn(
              "flex flex-row sm:flex-col items-center justify-start sm:justify-center p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 text-left sm:text-center relative min-h-[68px] sm:min-h-[96px] gap-3 sm:gap-1.5",
              isActive
                ? "bg-white border-[#2563EB] text-[#2563EB] shadow-xs"
                : "bg-white border-[#CBD5E1] text-[#64748B] hover:border-slate-400 hover:bg-[#F3F4F6] shadow-soft"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 sm:mb-1 transition-colors",
                isActive
                  ? "bg-blue-50 text-[#2563EB]"
                  : "bg-[#F3F4F6] text-[#64748B]"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>

            <div className="flex-1 sm:flex-initial">
              <span
                className={cn(
                  "font-bold text-xs sm:text-sm tracking-tight block",
                  isActive ? "text-[#2563EB]" : "text-[#1E293B]"
                )}
              >
                {mode.label}
              </span>

              <span className="text-[11px] text-[#64748B] font-medium block">
                {mode.sub}
              </span>
            </div>

            {/* Active indicator dot */}
            {isActive && (
              <span className="w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full bg-[#2563EB] shrink-0 sm:mt-1" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
