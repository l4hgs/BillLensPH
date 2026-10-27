"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderArchive, Scan, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 mobile-only-bottom-nav bg-white/95 backdrop-blur-lg border-t border-slate-100 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-around px-6 py-2 max-w-md mx-auto">
        {/* Archive tab */}
        <Link
          href="/audits"
          className={cn(
            "flex flex-col items-center justify-center py-1 transition-all",
            pathname === "/audits"
              ? "text-blue-600 font-semibold"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <FolderArchive className="w-5 h-5" />
          <span className="text-[11px] mt-1">Archive</span>
        </Link>

        {/* Center elevated scan button */}
        <Link
          href="/scanner"
          className="group relative -top-3 flex flex-col items-center"
        >
          <div
            className={cn(
              "w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/40 border-4 border-slate-50 group-hover:bg-blue-700 group-hover:scale-105 active:scale-95 transition-all duration-200",
              pathname === "/scanner" && "ring-2 ring-blue-500/50 bg-blue-700"
            )}
          >
            <Scan className="w-6 h-6 stroke-[2.2]" />
          </div>
          <span className="text-[11px] font-semibold text-blue-600 mt-0.5 tracking-tight">
            Scan ISA
          </span>
        </Link>

        {/* Insights / Copilot tab */}
        <Link
          href="/copilot"
          className={cn(
            "flex flex-col items-center justify-center py-1 transition-all",
            pathname === "/copilot"
              ? "text-blue-600 font-semibold"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[11px] mt-1">Insights</span>
        </Link>
      </div>
    </nav>
  );
}
