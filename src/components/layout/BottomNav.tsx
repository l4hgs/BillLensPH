"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Scan,
  FolderArchive,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScanBackground } from "@/components/providers/ScanBackgroundProvider";
import { useChatbotBackground } from "@/components/providers/ChatbotBackgroundProvider";

export function BottomNav() {
  const pathname = usePathname();
  const { isBusy: isScanning } = useScanBackground();
  const { isStreaming: isChatStreaming, hasUnreadMessage } =
    useChatbotBackground();

  const navLinks = [
    { label: "Home", shortLabel: "Home", href: "/", icon: Home },
    { label: "Scan Hub", shortLabel: "Scan Hub", href: "/scanner", icon: Scan },
    {
      label: "Archive",
      shortLabel: "Archive",
      href: "/audits",
      icon: FolderArchive,
    },
    {
      label: "PhilHealth Rates",
      shortLabel: "Rates",
      href: "/rates",
      icon: ShieldCheck,
    },
    {
      label: "Chat",
      shortLabel: "Chat",
      href: "/chatbot",
      icon: null,
    },
  ];

  return (
    <div className="no-print print:hidden fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 mobile-only-bottom-nav w-[calc(100%-1.25rem)] max-w-md sm:max-w-2xl pointer-events-none">
      <nav
        aria-label="Mobile and tablet navigation"
        className="pointer-events-auto flex items-center justify-between gap-1 bg-white/55 backdrop-blur-xl backdrop-saturate-150 p-1.5 rounded-full border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.12),0_4px_12px_-2px_rgba(15,23,42,0.05),inset_0_1px_2px_rgba(255,255,255,0.6)]"
      >
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          const isScanningTab = link.href === "/scanner" && isScanning;
          const isChatActive =
            link.href === "/chatbot" && (isChatStreaming || hasUnreadMessage);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex-1 inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold rounded-full transition-all duration-200 whitespace-nowrap",
                isActive
                  ? "bg-[#0F172A] text-white shadow-xs ring-1 ring-slate-900/10"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              )}
            >
              <div className="relative flex items-center justify-center">
                {Icon ? (
                  <Icon
                    className={cn(
                      "w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 transition-colors",
                      isActive ? "text-white" : "text-slate-500"
                    )}
                  />
                ) : (
                  <Image
                    src="/billy-nav.png"
                    alt=""
                    width={16}
                    height={16}
                    aria-hidden="true"
                    className={cn(
                      "w-4 h-4 sm:w-3.5 sm:h-3.5 object-contain shrink-0 transition-all",
                      isActive && "brightness-0 invert"
                    )}
                  />
                )}
                {isScanningTab && (
                  <span className="sm:hidden absolute -top-0.5 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                )}
                {isChatActive && (
                  <span className="sm:hidden absolute -top-0.5 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                )}
              </div>

              <span className="sm:hidden tracking-tight">{link.shortLabel}</span>
              <span className="hidden sm:inline">{link.label}</span>

              {isScanningTab && (
                <span className="hidden sm:flex relative h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
              )}
              {isChatActive && (
                <span className="hidden sm:flex relative h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
