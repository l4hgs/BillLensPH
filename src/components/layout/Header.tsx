"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, HelpCircle, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          return supabase.auth.getUser().then(({ data: { user: fetchedUser } }) => {
            setUser(fetchedUser ?? null);
          });
        }
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname]);

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Scan Hub", href: "/scanner" },
    { label: "Archive", href: "/audits" },
    { label: "PhilHealth Rates", href: "/rates" },
    { label: "AI Copilot", href: "/copilot" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#CBD5E1] px-3 sm:px-6 py-2 transition-all">
      <div className="max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Left branding with Mascot Logo (no gray background, larger size) */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            className="p-1.5 -ml-1 text-[#1E293B] hover:text-[#2563EB] rounded-xl hover:bg-[#F3F4F6] transition-colors md:hidden cursor-pointer"
            aria-label="Navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Image
                src="/logo.png"
                alt="BillLens PH Logo"
                width={48}
                height={48}
                className="object-contain w-auto h-full"
                priority
              />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-[#1E293B]">
                BillLens
              </span>
              <span className="font-black text-xs sm:text-sm text-[#DC2626] tracking-wide">
                PH
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="desktop-only-nav items-center gap-1 bg-[#F3F4F6] p-1 rounded-full border border-[#CBD5E1]">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-bold rounded-full transition-all duration-150 whitespace-nowrap",
                  isActive
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "text-[#64748B] hover:text-[#1E293B] hover:bg-white/80"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right action icons */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/copilot"
            className="w-8 h-8 rounded-full border border-[#CBD5E1] bg-white flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:bg-[#F3F4F6] transition-colors"
            title="Help & Guidelines"
          >
            <HelpCircle className="w-4 h-4" />
          </Link>

          {user ? (
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white border border-[#CBD5E1] text-[#1E293B] text-xs font-bold hover:border-[#2563EB] hover:bg-[#F3F4F6] transition-colors whitespace-nowrap"
              title={user.email || "User profile"}
            >
              <span className="w-6 h-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                {user.email ? user.email.charAt(0).toUpperCase() : "U"}
              </span>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {user.user_metadata?.full_name || user.email?.split("@")[0]}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1E293B] text-white text-xs font-bold shadow-xs hover:bg-slate-800 transition-colors whitespace-nowrap"
              title="Sign in"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
