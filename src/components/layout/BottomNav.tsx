"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderArchive, Scan, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScanBackground } from "@/components/providers/ScanBackgroundProvider";
import { useChatbotBackground } from "@/components/providers/ChatbotBackgroundProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { isBusy: isScanning } = useScanBackground();
  const { isStreaming: isChatStreaming, hasUnreadMessage } =
    useChatbotBackground();

  return (
    <nav className="no-print print:hidden fixed bottom-0 left-0 right-0 z-40 mobile-only-bottom-nav bg-white/95 backdrop-blur-lg border-t border-[#CBD5E1] pb-safe shadow-[0_-4px_20px_rgba(30,41,59,0.04)]">
      <div className="flex items-center justify-around px-6 py-2 max-w-md mx-auto">
        {/* Archive tab */}
        <Link
          href="/audits"
          className={cn(
            "flex flex-col items-center justify-center py-1 transition-all",
            pathname === "/audits"
              ? "text-[#2563EB] font-bold"
              : "text-[#64748B] hover:text-[#1E293B]"
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
              "relative w-14 h-14 rounded-full bg-[#2563EB] flex items-center justify-center text-white shadow-lg shadow-blue-500/35 border-4 border-[#F3F4F6] group-hover:bg-[#1D4ED8] group-hover:scale-105 active:scale-95 transition-all duration-200",
              pathname === "/scanner" && "ring-2 ring-blue-500/50 bg-[#1D4ED8]"
            )}
          >
            <Scan className="w-6 h-6 stroke-[2.2]" />
            {isScanning && (
              <span className="absolute top-0 right-0 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border-2 border-white" />
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-[#2563EB] mt-0.5 tracking-tight">
            Scan ISA
          </span>
        </Link>

        {/* AI Chatbot tab */}
        <Link
          href="/chatbot"
          className={cn(
            "relative flex flex-col items-center justify-center py-1 transition-all",
            pathname === "/chatbot"
              ? "text-[#2563EB] font-bold"
              : "text-[#64748B] hover:text-[#1E293B]"
          )}
        >
          <div className="relative">
            <Activity className="w-5 h-5" />
            {(isChatStreaming || hasUnreadMessage) && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1">AI Chatbot</span>
        </Link>
      </div>
    </nav>
  );
}
