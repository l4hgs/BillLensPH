"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Mail,
  Lock,
  User as UserIcon,
  LogOut,
  ArrowRight,
  Scan,
  FolderArchive,
  FileCheck,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { User } from "@supabase/supabase-js";

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errParam = params.get("error");
      const msgParam = params.get("message") || params.get("error_description");
      if (errParam || msgParam) {
        return msgParam
          ? `Authentication failed: ${msgParam}`
          : `Authentication failed (${errParam}). Please check your Supabase API key and Redirect URLs.`;
      }
    }
    return null;
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function hydrateAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isMounted) {
          setCurrentUser(session?.user ?? null);
        }
      } catch {
        // Ignore network errors on initial check
      } finally {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    }

    hydrateAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setCurrentUser(session?.user ?? null);
        setCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const getRedirectDestination = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      if (next && next.startsWith("/")) {
        return next;
      }
    }
    return "/scanner";
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabase = createClient();

    try {
      // Ensure GoTrueClient's initializePromise has settled before signing in
      // so initial session recovery never races with or overwrites the new session.
      await supabase.auth.getSession();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      // Ensure GoTrueClient's initializePromise has settled before writing the
      // PKCE code_verifier cookie so initial recovery cannot wipe it.
      await supabase.auth.getSession();

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        getRedirectDestination()
      )}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
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

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setCurrentUser(null);
    setLoading(false);
    router.refresh();
  };

  if (checkingSession) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center text-xs text-slate-500">
        Verifying your account session...
      </div>
    );
  }

  // Authenticated Profile View: Clean, Productive Minimalism
  if (currentUser) {
    const displayName =
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0] ||
      "BillLens User";
    const initial = (currentUser.email || "U").charAt(0).toUpperCase();
    const memberSince = currentUser.created_at
      ? new Date(currentUser.created_at).toLocaleDateString("en-PH", {
          month: "short",
          year: "numeric",
        })
      : "Active Member";

    return (
      <div className="w-full max-w-lg mx-auto space-y-5 py-2 sm:py-4">
        {/* Main Clean Profile Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft p-6 sm:p-7 space-y-5">
          {/* Header Profile Identity */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-black text-xl shadow-xs shrink-0">
              {initial}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-0.5">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate">
                  {displayName}
                </h1>
                <Badge
                  variant="primary"
                  className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold py-0.5"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 inline" />
                  Verified
                </Badge>
              </div>

              <p className="text-xs text-slate-500 font-medium truncate">
                {currentUser.email}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[10px] font-bold">
                  <FileCheck className="w-3 h-3" />
                  <span>PhilHealth UHC Protected</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Member since {memberSince}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Account Security & Compliance Overview */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between py-0.5 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Privacy &amp; Data Security</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" /> DPA 2012 Encrypted
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Statutory Privileges</span>
              <span className="font-semibold text-slate-800 text-[11px]">
                RA 9994 (Senior) &amp; RA 10754 (PWD) Active
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500 font-medium">PhilHealth ACR Catalog</span>
              <span className="font-semibold text-blue-600 text-[11px]">
                Circ. 2024-0037+ Verified
              </span>
            </div>
          </div>

          {/* Action Hierarchy: Compact & Proportional Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/scanner" className="inline-block">
                <Button
                  size="sm"
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold shadow-soft rounded-full text-xs h-9 gap-1.5"
                >
                  <Scan className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>Go to Scanner</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </Link>

              <Link href="/audits" className="inline-block">
                <Button
                  variant="outline"
                  size="sm"
                  className="px-4 py-1.5 bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-full shadow-soft font-bold text-xs h-9 gap-1.5"
                >
                  <FolderArchive className="w-3.5 h-3.5 text-blue-600" />
                  <span>View Archive</span>
                </Button>
              </Link>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={loading}
              className="px-3.5 py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-full font-bold shadow-soft text-xs h-9 transition-colors cursor-pointer shrink-0 gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{loading ? "Signing out..." : "Sign Out"}</span>
            </Button>
          </div>
        </div>

        {/* Regulatory footer */}
        <p className="text-[11px] text-center text-slate-500">
          Protected under Philippine Data Privacy Act of 2012 (RA 10173). Statements of account are stored with end-to-end user isolation.
        </p>
      </div>
    );
  }

  // Unauthenticated Sign In / Sign Up Form
  return (
    <div className="w-full max-w-md mx-auto space-y-6 py-4 sm:py-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 mx-auto flex items-center justify-center text-blue-600 shadow-soft mb-2">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          BillLens<span className="text-[#DC2626]">PH</span> Account
        </h1>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          Sign in to save statement audits, track case rate deductions, and export negotiation briefs.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft p-6 sm:p-7 space-y-5">
        <div className="flex p-1 bg-slate-100 rounded-full border border-slate-200/60 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-full transition-all cursor-pointer ${
              !isSignUp
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-1.5 rounded-full transition-all cursor-pointer ${
              isSignUp
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Create Account
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed transition-opacity duration-150">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed transition-opacity duration-150">
            {successMessage}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={oauthLoading}
          className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 h-11 rounded-full shadow-soft"
        >
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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
            {oauthLoading ? "Connecting..." : "Continue with Google"}
          </span>
        </Button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-slate-500 absolute font-semibold">
            or with email
          </span>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3.5">
          {isSignUp && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2 h-11 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold shadow-soft"
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
      </div>

      <p className="text-[11px] text-center text-slate-500 px-4">
        Protected under Philippine Data Privacy Act of 2012 (RA 10173). Statements of account are stored encrypted with user-isolated RLS.
      </p>
    </div>
  );
}
