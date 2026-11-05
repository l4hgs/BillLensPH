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
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4 w-full">
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
              "flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border transition-all duration-200 text-center relative",
              isActive
                ? "bg-white border-[#2563EB] text-[#2563EB] shadow-xs"
                : "bg-white border-[#CBD5E1] text-[#64748B] hover:border-slate-400 hover:bg-[#F3F4F6] shadow-soft"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center mb-1.5 transition-colors",
                isActive
                  ? "bg-blue-50 text-[#2563EB]"
                  : "bg-[#F3F4F6] text-[#64748B]"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>

            <span
              className={cn(
                "font-bold text-xs tracking-tight",
                isActive ? "text-[#2563EB]" : "text-[#1E293B]"
              )}
            >
              {mode.label}
            </span>

            <span className="text-[10px] text-[#64748B] mt-0.5 font-medium">
              {mode.sub}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1.5" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
