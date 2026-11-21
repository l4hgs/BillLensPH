"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { useScanBackground } from "@/components/providers/ScanBackgroundProvider";
import { useChatbotBackground } from "@/components/providers/ChatbotBackgroundProvider";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setAvatarError(false);
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAvatarError(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname]);

  const { isBusy: isScanning } = useScanBackground();
  const { isStreaming: isChatStreaming, hasUnreadMessage } =
    useChatbotBackground();

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Scan Hub", href: "/scanner" },
    { label: "Archive", href: "/audits" },
    { label: "PhilHealth Rates", href: "/rates" },
    { label: "AI Chatbot", href: "/chatbot" },
  ];

  return (
    <header className="no-print print:hidden sticky top-0 z-40 bg-white/40 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-200/50 py-2.5 transition-all shadow-[0_1px_3px_0_rgba(15,23,42,0.02)]">
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-10 xl:px-14 flex items-center justify-between gap-3">
        {/* Left branding: Whole Official Logo Header (Minimized) */}
        <div className="flex items-center shrink-0">
          <Link href="/" className="flex items-center group">
            <Image
              src="/logo-header.png"
              alt="BillLens PH"
              width={125}
              height={41}
              className="h-6 sm:h-7 w-auto object-contain group-hover:scale-[1.02] transition-transform"
              style={{ width: "auto", height: "auto" }}
              priority
            />
            <span className="sr-only">BillLens PH</span>
          </Link>
        </div>

        {/* Desktop Navigation Links - Circular / Pill Container */}
        <nav className="desktop-only-nav items-center gap-1 bg-white/30 backdrop-blur-md p-1 rounded-full border border-slate-200/60 shadow-[inset_0_1px_2px_rgba(15,23,42,0.02)]">
          {navLinks.map((link) => {
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
                  "relative inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-[#0F172A] text-white shadow-xs ring-1 ring-slate-900/10"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                )}
              >
                <span>{link.label}</span>
                {isScanningTab && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                )}
                {isChatActive && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right action icons & profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user ? (
            (() => {
              const avatarUrl =
                (user.user_metadata?.avatar_url as string | undefined) ||
                (user.user_metadata?.picture as string | undefined) ||
                null;
              const displayName =
                (user.user_metadata?.full_name as string | undefined) ||
                (user.user_metadata?.name as string | undefined) ||
                user.email?.split("@")[0] ||
                "Profile";

              return (
                <Link
                  href="/auth"
                  className="inline-flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-3.5 sm:py-1 rounded-full bg-white/40 backdrop-blur-md border border-slate-200/60 hover:border-slate-300 hover:bg-white/70 text-slate-800 transition-all duration-200 shadow-[0_1px_2px_rgba(15,23,42,0.02)] hover:shadow-xs group"
                  title={user.email || "User profile"}
                >
                  {avatarUrl && !avatarError ? (
                    <div className="relative shrink-0">
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarError(true)}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200/80 shadow-2xs"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <span className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs ring-1 ring-slate-200/80 shadow-2xs">
                        {displayName.charAt(0).toUpperCase() || (
                          <UserIcon className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                  )}
                  <div className="hidden sm:flex flex-col text-left leading-none">
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 max-w-[120px] truncate tracking-[-0.01em]">
                      {displayName}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 mt-0.5 tracking-tight">
                      Account
                    </span>
                  </div>
                </Link>
              );
            })()
          ) : (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full bg-[#0F172A]/90 hover:bg-[#0F172A] backdrop-blur-sm text-white text-xs font-semibold shadow-xs hover:shadow transition-all duration-200 border border-slate-900/80 group"
              title="Sign in"
            >
              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <UserIcon className="w-3 h-3 text-white" />
              </span>
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
