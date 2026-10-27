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
              "flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all duration-200 text-center relative",
              isActive
                ? "bg-blue-50/60 border-blue-200 text-blue-700 shadow-xs"
                : "bg-white border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50/50 shadow-soft"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center mb-1.5 transition-colors",
                isActive
                  ? "bg-blue-100 text-blue-600"
                  : "bg-slate-100/80 text-slate-500"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>

            <span
              className={cn(
                "font-bold text-xs tracking-tight",
                isActive ? "text-blue-700" : "text-slate-800"
              )}
            >
              {mode.label}
            </span>

            <span className="text-[10px] text-slate-600 mt-0.5">
              {mode.sub}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
