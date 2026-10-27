"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, FileSpreadsheet, HelpCircle, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    }).catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getPageTitle = () => {
    if (pathname === "/scanner") return "Scan Hub";
    if (pathname === "/audits") return "Document Archive";
    if (pathname === "/rates") return "PhilHealth Case Rates";
    if (pathname === "/copilot") return "AI Copilot";
    if (pathname.startsWith("/auth")) return "Account";
    return "BillLens PH";
  };

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Scan Hub", href: "/scanner" },
    { label: "Archive", href: "/audits" },
    { label: "PhilHealth Rates", href: "/rates" },
    { label: "AI Copilot", href: "/copilot" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 py-3 transition-all">
      <div className="max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between">
        {/* Left branding / title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-1.5 -ml-1 text-slate-700 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors md:hidden"
            aria-label="Navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/25 group-hover:bg-blue-700 transition-all">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900">
                {getPageTitle()}
              </span>
              {pathname === "/" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  PH
                </span>
              )}
            </div>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="desktop-only-nav items-center gap-1 bg-slate-100/70 p-1 rounded-full border border-slate-200/60">
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
                  "px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150",
                  isActive
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right action icons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/copilot"
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            title="Help & Guidelines"
          >
            <HelpCircle className="w-4 h-4" />
          </Link>

          {user ? (
            <Link
              href="/auth"
              className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-xs hover:bg-blue-700 transition-colors"
              title={user.email || "User profile"}
            >
              {user.email ? user.email.charAt(0).toUpperCase() : "U"}
            </Link>
          ) : (
            <Link
              href="/auth"
              className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shadow-xs hover:bg-blue-700 transition-colors"
              title="Sign in"
            >
              <UserIcon className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
