"use client";

import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Plus,
  Upload,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/ToastProvider";
import { formatPHP, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import type { CatalogPackage } from "@/types/audit";

export interface PhilHealthPackage {
  code: string;
  keyword: string;
  hciFee: number;
  profFee: number;
  totalRate: number;
  inclusiveItems: string[];
  aliases: string[];
  circularId: string;
  effectiveFrom: string;
  isAiDiscovered?: boolean;
  isVerified: boolean;
  description: string;
  category:
    | "Surgical"
    | "Medical"
    | "Cardiovascular"
    | "Maternal"
    | "Renal"
    | "General";
}

function inferCategory(
  keyword: string,
  code: string
): PhilHealthPackage["category"] {
  const k = keyword.toLowerCase();
  if (
    k.includes("cholecystectomy") ||
    k.includes("appendectomy") ||
    k.includes("cataract") ||
    k.includes("hernia") ||
    k.includes("hysterectomy") ||
    k.includes("repair")
  ) {
    return "Surgical";
  }
  if (
    k.includes("coronary") ||
    k.includes("angio") ||
    k.includes("cardiac") ||
    k.includes("hypertens")
  ) {
    return "Cardiovascular";
  }
  if (
    k.includes("delivery") ||
    k.includes("cesarean") ||
    k.includes("matern") ||
    k.includes("nsd")
  ) {
    return "Maternal";
  }
  if (k.includes("dialysis") || k.includes("renal") || k.includes("kidney")) {
    return "Renal";
  }
  if (
    code.startsWith("J") ||
    code.startsWith("A") ||
    code.startsWith("I") ||
    code.startsWith("E") ||
    k.includes("pneumonia") ||
    k.includes("dengue") ||
    k.includes("gastroenteritis")
  ) {
    return "Medical";
  }
  return "General";
}

function mapCatalogToView(pkg: CatalogPackage): PhilHealthPackage {
  const hciFee = Number(pkg.hci_fee) || 0;
  const profFee = Number(pkg.prof_fee) || 0;
  const totalRate = Number(pkg.total_rate) || hciFee + profFee;
  const isAiGrounded = Boolean(pkg.source_url?.startsWith("ai_grounded"));
  const isVerified =
    typeof pkg.is_verified === "boolean" ? pkg.is_verified : !isAiGrounded;
  return {
    code: pkg.code,
    keyword: pkg.keyword,
    hciFee,
    profFee,
    totalRate,
    inclusiveItems: pkg.inclusive_items || [],
    aliases: (pkg.aliases || []).map((a) => a.alias),
    circularId: pkg.circular_id || "2024-0037",
    effectiveFrom: pkg.effective_from || "2024-10-01",
    isAiDiscovered: !isVerified || isAiGrounded,
    isVerified,
    category: inferCategory(pkg.keyword, pkg.code),
    description: isVerified
      ? `Official PhilHealth Circular ${pkg.circular_id || "2024-0037"} package covering hospital facility charges (${formatPHP(hciFee)}) and accredited physician professional fees (${formatPHP(profFee)}).`
      : `AI-estimated PhilHealth Case Rate (${pkg.circular_id || "2024-0037"}) covering hospital facility charges (${formatPHP(hciFee)}) and physician professional fees (${formatPHP(profFee)}). Verify against official PhilHealth circulars.`,
  };
}

function RatesCatalogSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading PhilHealth case rates"
      className="divide-y divide-slate-200/80 border-b border-slate-200/80 animate-pulse"
    >
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="py-4 sm:py-5 space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 rounded-full bg-slate-200/80" />
                <div className="h-3.5 w-32 rounded bg-slate-100" />
              </div>
              <div className="h-5 w-64 max-w-full rounded bg-slate-200/80" />
            </div>
            <div className="space-y-1.5 text-right shrink-0">
              <div className="h-3 w-16 rounded bg-slate-100 ml-auto" />
              <div className="h-5 w-24 rounded bg-slate-200/80 ml-auto" />
            </div>
          </div>
          <div className="h-3.5 w-full max-w-xl rounded bg-slate-100" />
          <div className="flex items-center justify-between pt-1">
            <div className="h-3.5 w-52 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RatesPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [packages, setPackages] = useState<PhilHealthPackage[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const attemptedQueriesRef = useRef<Set<string>>(new Set());

  // Admin modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminMode, setAdminMode] = useState<"single" | "csv">("single");
  const [saving, setSaving] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Single package form fields
  const [caseCode, setCaseCode] = useState("");
  const [procedureKeyword, setProcedureKeyword] = useState("");
  const [circularId, setCircularId] = useState("2024-0037");
  const [effectiveFrom, setEffectiveFrom] = useState("2024-10-01");
  const [hciFee, setHciFee] = useState("");
  const [profFee, setProfFee] = useState("");
  const [inclusiveItemsText, setInclusiveItemsText] = useState("");
  const [aliasesText, setAliasesText] = useState("");

  // CSV / JSON bulk input
  const [bulkInput, setBulkInput] = useState("");

  useEffect(() => {
    if (!showAdminModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAdminModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAdminModal]);

  const refreshCatalog = useCallback(async () => {
    const result = await loadPackageCatalog(supabase);
    if (result.error) {
      setCatalogError(result.error);
      setPackages([]);
    } else {
      const sorted = [...result.packages]
        .map(mapCatalogToView)
        .sort((a, b) => a.keyword.localeCompare(b.keyword));
      setPackages(sorted);
      setCatalogError(null);
    }
  }, [supabase]);

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem("billlens_is_admin") === "1") {
        setIsAdmin(true);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const checkAdmin = async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          let user = session?.user ?? null;
          if (!user) {
            const {
              data: { user: fetchedUser },
            } = await supabase.auth.getUser();
            user = fetchedUser;
          }
          if (cancelled) return;
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", user.id)
              .maybeSingle();
            if (!cancelled) {
              const admin = profile?.role === "admin";
              setIsAdmin(admin);
              try {
                localStorage.setItem("billlens_is_admin", admin ? "1" : "0");
              } catch {
                // Ignore storage access errors
              }
            }
          } else {
            setIsAdmin(false);
            try {
              localStorage.setItem("billlens_is_admin", "0");
            } catch {
              // Ignore storage access errors
            }
          }
        };

        const [, result] = await Promise.all([
          checkAdmin(),
          loadPackageCatalog(supabase),
        ]);
        if (cancelled) return;
        if (result.error) {
          setCatalogError(result.error);
          setPackages([]);
        } else {
          const sorted = [...result.packages]
            .map(mapCatalogToView)
            .sort((a, b) => a.keyword.localeCompare(b.keyword));
          setPackages(sorted);
          setCatalogError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setCatalogError(
            err instanceof Error
              ? err.message
              : "Could not load package catalog."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const categories = [
    "All",
    "Surgical",
    "Medical",
    "Cardiovascular",
    "Maternal",
    "Renal",
  ];

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return packages.filter((pkg) => {
      const matchesSearch =
        pkg.keyword.toLowerCase().includes(q) ||
        pkg.code.toLowerCase().includes(q) ||
        pkg.circularId.toLowerCase().includes(q) ||
        pkg.inclusiveItems.some((item) => item.toLowerCase().includes(q)) ||
        pkg.aliases.some((alias) => alias.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === "All" || pkg.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [packages, searchQuery, selectedCategory]);

  const toggleExpand = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const handleAiDiscover = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (q.length < 2) return;
    setDiscovering(true);
    setDiscoveryError(null);

    try {
      const response = await fetch("/api/rates/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.packages)) {
        throw new Error(
          data.error || `Could not resolve a PhilHealth Case Rate for "${q}".`
        );
      }

      const discoveredMapped: PhilHealthPackage[] = (
        data.packages as CatalogPackage[]
      ).map(mapCatalogToView);

      setPackages((prev) => {
        const seen = new Set(prev.map((p) => `${p.code}::${p.effectiveFrom}`));
        const next = [...prev];
        for (const pkg of discoveredMapped) {
          const key = `${pkg.code}::${pkg.effectiveFrom}`;
          if (!seen.has(key)) {
            next.push(pkg);
            seen.add(key);
          }
        }
        return next.sort((a, b) => a.keyword.localeCompare(b.keyword));
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Automatic AI case rate discovery failed.";
      setDiscoveryError(msg);
      toast.error(msg);
    } finally {
      setDiscovering(false);
    }
  }, [toast]);

  // Automatically resolve unlisted medical conditions / RVS codes after 900ms when local filter returns 0
  useEffect(() => {
    const q = searchQuery.trim();
    if (
      loading ||
      discovering ||
      q.length < 3 ||
      filtered.length > 0 ||
      attemptedQueriesRef.current.has(q.toLowerCase())
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      attemptedQueriesRef.current.add(q.toLowerCase());
      void handleAiDiscover(q);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [searchQuery, loading, discovering, filtered.length, handleAiDiscover]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAdminFeedback(null);

    try {
      const hci = Number(hciFee) || 0;
      const pf = Number(profFee) || 0;
      const response = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: {
            case_code: caseCode.trim(),
            procedure_keyword: procedureKeyword.trim(),
            circular_id: circularId.trim() || "2024-0037",
            effective_from: effectiveFrom.trim() || "2024-10-01",
            hci_fee: hci,
            prof_fee: pf,
            total_case_rate: hci + pf,
            inclusive_items: inclusiveItemsText
              .split(/\r?\n|\|/)
              .map((s) => s.trim())
              .filter(Boolean),
            aliases: aliasesText
              .split(/[,|\n]/)
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save PhilHealth package.");
      }

      const msg = `Synced ${caseCode.trim()} (${data.upsertedPackages} package, ${data.upsertedAliases} alias tokens).`;
      setAdminFeedback({
        type: "success",
        message: msg,
      });
      toast.success(msg);
      setCaseCode("");
      setProcedureKeyword("");
      setHciFee("");
      setProfFee("");
      setInclusiveItemsText("");
      setAliasesText("");
      await refreshCatalog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setAdminFeedback({
        type: "error",
        message: msg,
      });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;
    setSaving(true);
    setAdminFeedback(null);

    try {
      const trimmed = bulkInput.trim();
      let payload: Record<string, unknown>;

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        payload = Array.isArray(parsed)
          ? { packages: parsed }
          : { packages: parsed.packages ?? [parsed] };
      } else {
        payload = { csv: trimmed };
      }

      const response = await fetch("/api/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to import circular batch.");
      }

      const msg = `Imported ${data.upsertedPackages} package(s) and ${data.upsertedAliases} matcher alias(es).`;
      setAdminFeedback({
        type: "success",
        message: msg,
      });
      toast.success(msg);
      setBulkInput("");
      await refreshCatalog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bulk import failed.";
      setAdminFeedback({
        type: "error",
        message: msg,
      });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setBulkInput(text);
  };

  return (
    <div className="w-full max-w-none space-y-5 sm:space-y-6">
      {/* Full-Width Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 border-b border-slate-200/80 pb-4 sm:pb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Benefit Case Rates Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Versioned PhilHealth circulars covering hospital facility (HCI)
            caps, physician professional fee (PF) caps, and mandatory bundled
            supplies.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAdminFeedback(null);
                setShowAdminModal(true);
              }}
              className="min-h-[44px] rounded-full text-xs font-bold gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manage Circulars</span>
            </Button>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setDiscoveryError(null);
              setSearchQuery(e.target.value);
            }}
            placeholder="Search medical condition, surgery, RVS, or ICD-10 code (e.g. Thyroidectomy, Stroke, 44970)..."
            aria-label="Search PhilHealth case rates by condition, RVS, or ICD-10 code"
            className="w-full min-h-[44px] bg-white border border-slate-200/90 rounded-xl pl-11 pr-11 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all motion-reduce:transition-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search query"
              className="absolute right-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {searchQuery.trim().length >= 2 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={discovering}
            onClick={() => void handleAiDiscover(searchQuery)}
            className="min-h-[44px] rounded-xl text-xs font-bold gap-1.5 shrink-0 px-4"
          >
            {discovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Resolving ACR...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>AI Auto-Discover</span>
              </>
            )}
          </Button>
        )}
      </div>

      {discoveryError && (
        <div
          role="alert"
          className="border-l-2 border-amber-500 bg-amber-50/60 pl-3.5 pr-3 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3"
        >
          <span>{discoveryError}</span>
          <button
            type="button"
            onClick={() => setDiscoveryError(null)}
            className="min-h-[44px] px-2 font-bold text-amber-800 hover:underline shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 rounded-md"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200/80 text-xs font-bold gap-3">
        <div
          role="tablist"
          aria-label="Case rate category filter"
          className="flex items-center gap-4 sm:gap-6 min-w-0 flex-1 overflow-x-auto scrollbar-none"
        >
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "min-h-[44px] py-2.5 transition-all whitespace-nowrap relative font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-t-md",
                  isActive
                    ? "text-[#2563EB]"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {cat}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2563EB] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap font-mono tabular-nums shrink-0">
          {filtered.length} package{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Full-Width Hairline-Divided Case Rate Rows */}
      <div>
        {loading ? (
          <RatesCatalogSkeleton />
        ) : catalogError ? (
          <div className="py-10 px-4 text-center text-xs text-rose-800 border-b border-slate-200/80 space-y-2">
            <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
            <p className="font-bold text-sm text-rose-900">Catalog Unavailable</p>
            <p className="text-rose-700">{catalogError}</p>
            <p className="text-[11px] text-rose-700">
              Run <code>npm run seed:packages</code> to sync the PhilHealth
              catalog.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            key={`empty-${selectedCategory}`}
            className="animate-fade-slide-in motion-reduce:animate-none py-12 px-4 text-center text-xs text-slate-600 border-b border-slate-200/80 space-y-3"
          >
            {discovering ? (
              <>
                <Loader2 className="w-6 h-6 text-[#2563EB] mx-auto animate-spin" />
                <p className="font-bold text-slate-900">
                  Auto-discovering PhilHealth ACR package for &ldquo;
                  {searchQuery.trim()}&rdquo;...
                </p>
                <p className="text-slate-500 max-w-md mx-auto">
                  Resolving official RVS/ICD-10 code, HCI/PF fee split, and
                  mandatory bundled supplies.
                </p>
              </>
            ) : (
              <>
                <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-800">
                  No local package found for &ldquo;{searchQuery.trim()}&rdquo;
                </p>
                <p className="text-slate-500 max-w-md mx-auto">
                  Resolve the official PhilHealth All-Case-Rates package with AI
                  or try a broader procedure keyword.
                </p>
                {searchQuery.trim().length >= 2 && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAiDiscover(searchQuery)}
                      className="min-h-[44px] rounded-full text-xs font-bold gap-1.5 px-5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Resolve &ldquo;{searchQuery.trim()}&rdquo; with AI</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <ul
            key={selectedCategory}
            className="divide-y divide-slate-200/80 border-b border-slate-200/80"
          >
            {filtered.map((pkg, idx) => {
              const cardKey = `${pkg.code}-${pkg.effectiveFrom}`;
              const isExpanded = expandedKey === cardKey;
              const isRVS = /^\d+$/.test(pkg.code);
              return (
                <li
                  key={cardKey}
                  style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}
                  className="animate-rate-item motion-reduce:animate-none py-4 sm:py-5"
                >
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200/80 whitespace-nowrap">
                            {isRVS ? `RVS ${pkg.code}` : `ICD-10 ${pkg.code}`}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            {pkg.category}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            Circ. {pkg.circularId} ({pkg.effectiveFrom})
                          </span>
                          {(!pkg.isVerified || pkg.isAiDiscovered) && (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                              AI-Estimated (Unverified)
                            </span>
                          )}
                        </div>
                        <h2 className="font-bold text-sm sm:text-base text-slate-900 break-words">
                          {pkg.keyword}
                        </h2>
                      </div>

                      <div className="flex items-baseline justify-between sm:block sm:text-right shrink-0 pt-1 sm:pt-0 border-t border-slate-100 sm:border-t-0">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 sm:block">
                          Fixed Benefit
                        </span>
                        <span className="font-black text-sm sm:text-lg text-emerald-700 font-mono tabular-nums whitespace-nowrap">
                          {formatPHP(pkg.totalRate)}
                        </span>
                      </div>
                    </div>

                    {pkg.description && (
                      <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                        {pkg.description}
                      </p>
                    )}

                    {/* Fee Split + Toggle Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          Facility (HCI) Cap:{" "}
                          <strong className="text-slate-900 font-mono tabular-nums">
                            {formatPHP(pkg.hciFee)}
                          </strong>
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          Prof. Fee (PF) Cap:{" "}
                          <strong className="text-slate-900 font-mono tabular-nums">
                            {formatPHP(pkg.profFee)}
                          </strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpand(cardKey)}
                        className="min-h-[44px] min-w-[44px] px-2 -mr-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                      >
                        <span>
                          {isExpanded ? "Hide Inclusions" : `View Inclusions (${pkg.inclusiveItems.length})`}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Expandable Inclusions (Left-Accent Hairline Band, No Mini-Cards) */}
                    {isExpanded && (
                      <div className="mt-2 border-l-2 border-[#2563EB] pl-3.5 sm:pl-4 py-1 space-y-2.5">
                        <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                          Mandatory Package Inclusions (Cannot be Unbundled)
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Under PhilHealth All-Case-Rates rules, accredited
                          facilities are prohibited from charging separate
                          out-of-pocket fees for these items when the case rate
                          is claimed:
                        </p>

                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700">
                          {pkg.inclusiveItems.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span className="leading-snug">{item}</span>
                            </li>
                          ))}
                        </ul>

                        {pkg.aliases.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">
                              Matcher Tokens ({pkg.aliases.length}):{" "}
                            </span>
                            <span className="font-mono">
                              {pkg.aliases.join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Admin Circular Manager Portal Modal (NO backdrop-blur, Escape key supported) */}
      {showAdminModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="PhilHealth Circular Rate Manager"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6"
            onClick={() => setShowAdminModal(false)}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90dvh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    PhilHealth Circular Rate Manager
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add a versioned RVS/ICD-10 package or import a CSV/JSON
                    circular.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close rate manager"
                  onClick={() => setShowAdminModal(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                <div
                  role="tablist"
                  aria-label="Import mode"
                  className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold gap-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminMode === "single"}
                    onClick={() => setAdminMode("single")}
                    className={cn(
                      "min-h-[40px] px-3.5 rounded-lg transition-colors cursor-pointer",
                      adminMode === "single"
                        ? "bg-white text-slate-900 font-bold shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Single Case Rate
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={adminMode === "csv"}
                    onClick={() => setAdminMode("csv")}
                    className={cn(
                      "min-h-[40px] px-3.5 rounded-lg transition-colors cursor-pointer",
                      adminMode === "csv"
                        ? "bg-white text-slate-900 font-bold shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    CSV / JSON Import
                  </button>
                </div>

                {adminFeedback && (
                  <div
                    role="status"
                    className={cn(
                      "p-3 rounded-xl text-xs font-medium border",
                      adminFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                        : "bg-rose-50 text-rose-900 border-rose-200"
                    )}
                  >
                    {adminFeedback.message}
                  </div>
                )}

                {adminMode === "single" ? (
                  <form onSubmit={handleSingleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          RVS / ICD-10 Code *
                        </label>
                        <input
                          type="text"
                          required
                          value={caseCode}
                          onChange={(e) => setCaseCode(e.target.value)}
                          placeholder="e.g. 66984 or J18.9"
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Procedure / Condition Keyword *
                        </label>
                        <input
                          type="text"
                          required
                          value={procedureKeyword}
                          onChange={(e) => setProcedureKeyword(e.target.value)}
                          placeholder="e.g. Cataract Extraction with IOL"
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Circular ID
                        </label>
                        <input
                          type="text"
                          value={circularId}
                          onChange={(e) => setCircularId(e.target.value)}
                          placeholder="2024-0037"
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Effective From
                        </label>
                        <input
                          type="date"
                          value={effectiveFrom}
                          onChange={(e) => setEffectiveFrom(e.target.value)}
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          HCI Fee (₱) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={hciFee}
                          onChange={(e) => setHciFee(e.target.value)}
                          placeholder="10800"
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Prof. Fee (₱) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={profFee}
                          onChange={(e) => setProfFee(e.target.value)}
                          placeholder="7200"
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Inclusive Items (one per line or pipe `|` separated)
                      </label>
                      <textarea
                        rows={2}
                        value={inclusiveItemsText}
                        onChange={(e) => setInclusiveItemsText(e.target.value)}
                        placeholder="Foldable standard mono-focal IOL | Balanced Salt Solution (BSS)"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Matcher Aliases (comma-separated short tokens)
                      </label>
                      <input
                        type="text"
                        value={aliasesText}
                        onChange={(e) => setAliasesText(e.target.value)}
                        placeholder="phaco, intraocular lens, iol, viscoelastic, bss"
                        className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saving}
                        className="min-h-[44px] px-6 rounded-full text-xs font-bold"
                      >
                        {saving ? "Syncing..." : "Save Case Rate"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleBulkSubmit} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700">
                        Paste CSV or JSON Circular Payload
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2563EB] hover:underline cursor-pointer min-h-[44px] px-2">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Load .csv / .json file</span>
                        <input
                          type="file"
                          accept=".csv,.json,text/csv,application/json"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <textarea
                      rows={5}
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder={
                        "case_code,procedure_keyword,circular_id,effective_from,hci_fee,prof_fee,total_case_rate,inclusive_items,aliases\n66984,Cataract Extraction with IOL,2024-0037,2024-10-01,10800,7200,18000,Foldable IOL|Viscoelastic,phaco|iol|bss"
                      }
                      className="w-full font-mono rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saving || !bulkInput.trim()}
                        className="min-h-[44px] px-6 rounded-full text-xs font-bold"
                      >
                        {saving ? "Importing..." : "Sync Batch to Catalog"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
