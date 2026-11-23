"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_ELIGIBILITY_SNAPSHOT,
  normalizeEligibilitySnapshot,
} from "@/lib/auditEngine";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/utils";
import {
  Mail,
  Lock,
  User as UserIcon,
  LogOut,
  Calendar,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { EligibilitySnapshot } from "@/types/audit";

export function AuthClient({ initialUser = null }: { initialUser?: User | null }) {
  const router = useRouter();
  const toast = useToast();
  const [isSignUp, setIsSignUp] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("mode") === "signup";
    }
    return false;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errParam = params.get("error");
      const msgParam = params.get("message") || params.get("error_description");
      if (errParam === "account_not_found") {
        return (
          msgParam ||
          "No existing account was found for that Google email. Please use Create Account below to register first."
        );
      }
      if (errParam || msgParam) {
        return msgParam
          ? `Authentication failed: ${msgParam}`
          : `Authentication failed (${errParam}). Please check your Supabase API key and Redirect URLs.`;
      }
    }
    return null;
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [avatarError, setAvatarError] = useState(false);

  // Saved PhilHealth & Audit Defaults
  const [eligibilityDefaults, setEligibilityDefaults] =
    useState<EligibilitySnapshot>(DEFAULT_ELIGIBILITY_SNAPSHOT);
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function loadProfileDefaults(user: User | null) {
      if (!user) return;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select(
            "contributor_type, accommodation_type, has_mdr_or_pin, facility_level"
          )
          .eq("id", user.id)
          .maybeSingle();
        if (profile && isMounted) {
          setEligibilityDefaults(normalizeEligibilitySnapshot(profile));
        }
      } catch {
        // Optional profile columns before migration 007
      }
    }

    async function hydrateAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isMounted) {
          const user = session?.user ?? null;
          setCurrentUser(user);
          await loadProfileDefaults(user);
        }
      } catch {
        // Ignore network errors on initial check
      }
    }

    if (initialUser) {
      void loadProfileDefaults(initialUser);
    }
    void hydrateAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        const user = session?.user ?? null;
        setCurrentUser(user);
        void loadProfileDefaults(user);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialUser]);

  const getRedirectDestination = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        return next;
      }
    }
    return "/scanner";
  };

  const buildAuthCallbackUrl = (nextPath?: string) => {
    const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(
      /\/+$/,
      ""
    );
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : envSiteUrl || "";
    const callbackUrl = new URL("/auth/callback", origin);
    if (
      nextPath &&
      nextPath !== "/scanner" &&
      nextPath.startsWith("/") &&
      !nextPath.startsWith("//")
    ) {
      callbackUrl.searchParams.set("next", nextPath);
    }
    return callbackUrl.toString();
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = createClient();

    try {
      await supabase.auth.getSession();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: buildAuthCallbackUrl(getRedirectDestination()),
          },
        });

        if (error) throw error;

        if (data.session?.user) {
          window.location.assign(getRedirectDestination());
          return;
        }

        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (!signInError && signInData.session?.user) {
          window.location.assign(getRedirectDestination());
          return;
        }

        setSuccessMessage(
          "Confirmation link sent! Please check your email inbox to activate your account."
        );
        setLoading(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.session?.user) {
          window.location.assign(getRedirectDestination());
          return;
        }
        setLoading(false);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication error.";
      setErrorMessage(message);
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setOauthLoading(true);
    setErrorMessage(null);

    const supabase = createClient();

    try {
      await supabase.auth.getSession();

      const destination = getRedirectDestination();
      const authMode = isSignUp ? "signup" : "signin";
      document.cookie = `billlens_auth_next=${encodeURIComponent(
        destination
      )}; path=/; max-age=600; SameSite=Lax`;
      document.cookie = `billlens_auth_mode=${authMode}; path=/; max-age=600; SameSite=Lax`;
      const redirectTo = buildAuthCallbackUrl(destination);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: isSignUp
            ? {
                access_type: "offline",
                prompt: "consent",
              }
            : {
                prompt: "select_account",
              },
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed.";
      setErrorMessage(message);
      setOauthLoading(false);
    }
  };

  const handleSaveDefaults = async () => {
    if (!currentUser) return;
    setSavingDefaults(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").upsert(
        {
          id: currentUser.id,
          contributor_type: eligibilityDefaults.contributor_type,
          accommodation_type: eligibilityDefaults.accommodation_type,
          has_mdr_or_pin: eligibilityDefaults.has_mdr_or_pin,
          facility_level: eligibilityDefaults.facility_level,
        },
        { onConflict: "id" }
      );

      if (error) {
        throw error;
      }

      toast.success("PhilHealth & audit defaults saved");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not save defaults right now."
      );
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setCurrentUser(null);
    setLoading(false);
    router.refresh();
  };

  // Authenticated Profile View: Full-Width, Non-Bento Editorial Layout
  if (currentUser) {
    const displayName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email?.split("@")[0] ||
      "BillLens User";
    const avatarUrl =
      (currentUser.user_metadata?.avatar_url as string | undefined) ||
      (currentUser.user_metadata?.picture as string | undefined) ||
      null;
    const memberSince = currentUser.created_at
      ? new Date(currentUser.created_at).toLocaleDateString("en-PH", {
          month: "short",
          year: "numeric",
        })
      : "Active Member";

    return (
      <div className="w-full max-w-none space-y-6">
        {/* Identity Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5 sm:pb-6">
          <div className="flex items-center gap-4 min-w-0">
            {avatarUrl && !avatarError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-[#2563EB] shrink-0">
                <UserIcon className="w-7 h-7" />
              </div>
            )}

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 truncate">
                {displayName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
                {currentUser.email}
              </p>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                <Calendar className="w-3 h-3" />
                <span>Member since {memberSince}</span>
              </p>
            </div>
          </div>
        </header>

        {/* Saved PhilHealth & Audit Defaults Section */}
        <section
          aria-labelledby="defaults-heading"
          className="border-b border-slate-200/80 pb-6 space-y-5"
        >
          <div>
            <h2
              id="defaults-heading"
              className="text-sm sm:text-base font-bold text-slate-900"
            >
              Default PhilHealth &amp; Ward Settings
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pre-filled automatically when you stage a new statement in Scan
              Hub.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Contributor Category */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-800">
                PhilHealth Contributor Category (NBB Eligibility)
              </span>
              <div
                role="radiogroup"
                aria-label="Default PhilHealth Contributor Category"
                className="grid grid-cols-2 sm:grid-cols-4 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { id: "unknown", label: "Auto / Not Sure" },
                    { id: "direct", label: "Direct" },
                    { id: "indirect_nbb", label: "Indirect / NBB" },
                    { id: "lifetime", label: "Lifetime" },
                  ] as const
                ).map((opt) => {
                  const isSelected =
                    eligibilityDefaults.contributor_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setEligibilityDefaults((prev) => ({
                          ...prev,
                          contributor_type: opt.id,
                        }))
                      }
                      className={cn(
                        "cursor-pointer min-h-[44px] rounded-lg px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Room / Ward Accommodation */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-800">
                Room / Ward Accommodation Type
              </span>
              <div
                role="radiogroup"
                aria-label="Default Room or Ward Accommodation"
                className="grid grid-cols-1 sm:grid-cols-3 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { id: "unknown", label: "Auto / Not Sure" },
                    { id: "basic_ward", label: "Basic / Ward" },
                    { id: "non_basic_private", label: "Private Room" },
                  ] as const
                ).map((opt) => {
                  const isSelected =
                    eligibilityDefaults.accommodation_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setEligibilityDefaults((prev) => ({
                          ...prev,
                          accommodation_type: opt.id,
                        }))
                      }
                      className={cn(
                        "cursor-pointer min-h-[44px] rounded-lg px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MDR / PIN */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-800">
                MDR / PIN Presented at Billing
              </span>
              <div
                role="radiogroup"
                aria-label="Default MDR or PIN Status"
                className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { val: true, label: "Yes, Presented" },
                    { val: false, label: "Not Yet" },
                  ] as const
                ).map((opt) => {
                  const isSelected =
                    eligibilityDefaults.has_mdr_or_pin === opt.val;
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setEligibilityDefaults((prev) => ({
                          ...prev,
                          has_mdr_or_pin: opt.val,
                        }))
                      }
                      className={cn(
                        "cursor-pointer min-h-[44px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Facility Level */}
            <div className="space-y-1.5">
              <label
                htmlFor="default-facility-level"
                className="block text-xs font-bold text-slate-800"
              >
                Default Hospital Facility Level
              </label>
              <SelectMenu
                id="default-facility-level"
                ariaLabel="Default Hospital Facility Level"
                value={eligibilityDefaults.facility_level}
                onChange={(val) =>
                  setEligibilityDefaults((prev) => ({
                    ...prev,
                    facility_level: val as EligibilitySnapshot["facility_level"],
                  }))
                }
                options={[
                  { value: "unknown", label: "Auto / Not Sure" },
                  { value: "level_1", label: "Level 1 Hospital" },
                  { value: "level_2", label: "Level 2 Hospital" },
                  { value: "level_3", label: "Level 3 Tertiary" },
                  { value: "asc", label: "ASC / Dialysis Center" },
                ]}
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={savingDefaults}
              onClick={handleSaveDefaults}
              className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-xs font-semibold text-[#2563EB] hover:bg-blue-50/70 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {savingDefaults ? "Saving..." : "Save Defaults"}
            </button>
          </div>
        </section>

        {/* Minimal Compliance & Security Summary Rows */}
        <section
          aria-label="Account security and compliance"
          className="divide-y divide-slate-200/80 border-b border-slate-200/80 text-[11px] sm:text-xs"
        >
          <div className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
            <span className="text-slate-500 font-medium shrink-0">
              Privacy &amp; Data Security
            </span>
            <span className="font-medium text-slate-700 sm:text-right">
              DPA 2012 (RA 10173) Encrypted
            </span>
          </div>
          <div className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
            <span className="text-slate-500 font-medium shrink-0">
              Statutory Privileges
            </span>
            <span className="font-medium text-slate-700 sm:text-right">
              RA 9994 (Senior) &amp; RA 10754 (PWD) Active
            </span>
          </div>
          <div className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
            <span className="text-slate-500 font-medium shrink-0">
              PhilHealth ACR Catalog
            </span>
            <span className="font-medium text-slate-700 sm:text-right">
              Circular 2024-0037+ Verified
            </span>
          </div>
        </section>

        {/* Compact Footer & Right-Aligned Sign Out Action */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 leading-snug min-w-0 flex-1">
            Statements of account are stored with end-to-end user isolation
            under the Philippine Data Privacy Act of 2012.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] px-3 rounded-full text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>{loading ? "Signing out..." : "Sign Out"}</span>
          </button>
        </div>
      </div>
    );
  }

  // Unauthenticated Sign In / Sign Up View (Single-screen glassmorphic card over seamless full-viewport blue gradient)
  return (
    <div className="relative min-h-[calc(100dvh-11rem)] sm:min-h-[calc(100dvh-9.5rem)] flex items-center justify-center py-2">
      {/* Full-viewport seamless blue ambient gradient (never clipped by container padding) */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-[68%] -translate-y-[62%] w-[360px] h-[360px] sm:w-[540px] sm:h-[540px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(37,99,235,0.22) 0%, rgba(96,165,250,0.12) 42%, rgba(248,250,252,0) 72%)",
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-[25%] -translate-y-[25%] w-[380px] h-[380px] sm:w-[560px] sm:h-[560px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(29,78,216,0.18) 0%, rgba(59,130,246,0.10) 45%, rgba(248,250,252,0) 72%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[340px] sm:max-w-[400px]">
        <div className="animate-rate-item w-full rounded-3xl border border-white/75 bg-white/50 backdrop-blur-2xl backdrop-saturate-150 p-5 sm:p-7 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.12),inset_0_1px_1px_rgba(255,255,255,0.85)] space-y-3.5 sm:space-y-4">
        {/* Heading + Inline Mode Switch */}
        <div className="text-center space-y-1">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[#0F172A]">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>

          <p className="text-xs sm:text-sm text-slate-600">
            {isSignUp ? "Already have an account? " : "First time here? "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp((prev) => !prev);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="font-semibold text-[#2563EB] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
            >
              {isSignUp ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="animate-fade-slide-in border-l-2 border-rose-500 bg-rose-50/80 pl-3 pr-2.5 py-2 text-xs text-rose-800 leading-snug rounded-r-lg"
          >
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="animate-fade-slide-in border-l-2 border-emerald-500 bg-emerald-50/80 pl-3 pr-2.5 py-2 text-xs text-emerald-900 leading-snug rounded-r-lg"
          >
            {successMessage}
          </div>
        )}

        <form
          key={isSignUp ? "signup" : "signin"}
          onSubmit={handleEmailAuth}
          className="animate-fade-slide-in space-y-2.5"
        >
          {isSignUp && (
            <div className="relative">
              <label htmlFor="auth-full-name" className="sr-only">
                Full Name
              </label>
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                id="auth-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name (e.g. Juan Dela Cruz)"
                className="w-full h-10 sm:h-11 bg-white/55 focus:bg-white/85 border border-slate-200/80 rounded-2xl pl-10 pr-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
              />
            </div>
          )}

          <div className="relative">
            <label htmlFor="auth-email" className="sr-only">
              Email Address
            </label>
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 sm:top-3.5" />
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="w-full h-10 sm:h-11 bg-white/55 focus:bg-white/85 border border-slate-200/80 rounded-2xl pl-10 pr-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
            />
          </div>

          <div className="relative">
            <label htmlFor="auth-password" className="sr-only">
              Password
            </label>
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 sm:top-3.5" />
            <input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min. 6 characters)"
              minLength={6}
              className="w-full h-10 sm:h-11 bg-white/55 focus:bg-white/85 border border-slate-200/80 rounded-2xl pl-10 pr-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 sm:h-11 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold shadow-xs mt-1 text-xs sm:text-sm"
          >
            {loading ? (
              <span>Processing...</span>
            ) : isSignUp ? (
              <span>Create Account</span>
            ) : (
              <span>Sign In</span>
            )}
          </Button>
        </form>

        <div className="flex items-center gap-3 py-0.5">
          <div className="flex-1 border-t border-slate-300/60" />
          <span className="text-[11px] font-medium text-slate-500">or</span>
          <div className="flex-1 border-t border-slate-300/60" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={oauthLoading}
          className="w-full h-10 sm:h-11 border-slate-200/80 bg-white/60 hover:bg-white/85 text-slate-800 font-semibold rounded-full shadow-2xs text-xs sm:text-sm"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>
            {oauthLoading
              ? "Connecting..."
              : isSignUp
                ? "Sign up with Google"
                : "Sign in with Google"}
          </span>
        </Button>

        <p className="text-[11px] text-center text-slate-500 leading-snug pt-1">
          Protected under Philippine Data Privacy Act of 2012 (RA 10173) with
          user-isolated RLS.
        </p>
        </div>
      </div>
    </div>
  );
}
