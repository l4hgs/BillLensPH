"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function hydrateAuth() {
      try {
        // Check local session first for immediate hydration
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user && isMounted) {
          setCurrentUser(session.user);
          setCheckingSession(false);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (isMounted) {
          setCurrentUser(user ?? null);
        }
      } catch {
        // Ignore network errors on initial check
      } finally {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errParam = params.get("error");
      const msgParam = params.get("message") || params.get("error_description");
      if (errParam || msgParam) {
        setErrorMessage(
          msgParam
            ? `Authentication failed: ${msgParam}`
            : `Authentication failed (${errParam}). Please check your Supabase API key and Redirect URLs.`
        );
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
          setCurrentUser(data.session.user);
          router.push(getRedirectDestination());
          router.refresh();
          return;
        }

        // If data.session is null, the user may have already created this account earlier
        // or email confirmation is off/on. Try signing in directly with the same credentials:
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (!signInError && signInData.session?.user) {
          setCurrentUser(signInData.session.user);
          router.push(getRedirectDestination());
          router.refresh();
          return;
        }

        if (
          data.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          setIsSignUp(false);
          setErrorMessage(
            "An account with this email already exists. Please sign in with your password."
          );
        } else {
          setIsSignUp(false);
          setSuccessMessage(
            "Account created! Please check your email for the confirmation link before signing in (or disable 'Confirm email' in Supabase Auth settings for instant login)."
          );
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.session?.user) {
          setCurrentUser(data.session.user);
        }
        router.push(getRedirectDestination());
        router.refresh();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected authentication error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setOauthLoading(true);
    setErrorMessage(null);

    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Failed to initiate Google sign-in.");
      }
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
      <div className="p-8 flex flex-col items-center justify-center text-center text-xs text-slate-500">
        Verifying your account session...
      </div>
    );
  }

  if (currentUser) {
    return (
      <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-300 max-w-md mx-auto w-full">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md mx-auto flex items-center justify-center text-xl font-bold mb-3 border border-white/30">
              {currentUser.email?.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold">
              {currentUser.user_metadata?.full_name || "BillLens User"}
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">{currentUser.email}</p>
            <Badge
              variant="primary"
              className="mt-3 bg-white/20 text-white border-white/30"
            >
              Verified & Signed In
            </Badge>
          </div>

          <CardContent className="p-5 flex flex-col gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-2 text-xs text-slate-600">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="font-medium text-slate-500">User ID</span>
                <span className="font-mono text-[11px] text-slate-700 truncate max-w-[180px]">
                  {currentUser.id}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="font-medium text-slate-500">Security</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Supabase RLS Active
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="font-medium text-slate-500">Session</span>
                <span className="text-blue-600 font-semibold">
                  Persistent Cookie Active
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                variant="primary"
                onClick={() => router.push("/scanner")}
                className="w-full justify-between font-bold"
              >
                <span className="flex items-center gap-2">
                  <Scan className="w-4 h-4" />
                  <span>Go to Scanner & Upload Bill</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                variant="secondary"
                onClick={() => router.push("/audits")}
                className="w-full justify-between"
              >
                <span>View Audits Archive</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={loading}
                className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 mt-1"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>{loading ? "Signing out..." : "Sign Out"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 max-w-sm mx-auto w-full">
      <div className="text-center py-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 mx-auto flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-3">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          BillLens<span className="text-blue-600">PH</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          Sign in to save statement audits, track case rate deductions, and
          export negotiation briefs.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex p-1 bg-slate-100 rounded-full border border-slate-200/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-1.5 rounded-full transition-all ${
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
              className={`flex-1 py-1.5 rounded-full transition-all ${
                isSignUp
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Create Account
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed animate-in fade-in">
              {successMessage}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={oauthLoading}
            className="w-full border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 h-11"
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
            <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-slate-600 absolute font-semibold">
              or with email
            </span>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? (
                <span>Processing...</span>
              ) : isSignUp ? (
                <span>Create Account</span>
              ) : (
                <span>Sign In</span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-[11px] text-center text-slate-600 px-4">
        Protected under Philippine Data Privacy Act of 2012 (RA 10173).
        Statements of account are stored encrypted with user-isolated RLS.
      </p>
    </div>
  );
}
