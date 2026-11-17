"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Database,
  AlertCircle,
  Plus,
  Upload,
  X,
  FileText,
  Tag,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/utils";
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

export default function RatesPage() {
  const supabase = useMemo(() => createClient(), []);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          if (!cancelled) {
            setIsAdmin(profile?.role === "admin");
          }
        } else {
          setIsAdmin(false);
        }

        const result = await loadPackageCatalog(supabase);
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
      setDiscoveryError(
        err instanceof Error
          ? err.message
          : "Automatic AI case rate discovery failed."
      );
    } finally {
      setDiscovering(false);
    }
  }, []);

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

      setAdminFeedback({
        type: "success",
        message: `Synced ${caseCode.trim()} (${data.upsertedPackages} package, ${data.upsertedAliases} alias tokens).`,
      });
      setCaseCode("");
      setProcedureKeyword("");
      setHciFee("");
      setProfFee("");
      setInclusiveItemsText("");
      setAliasesText("");
      await refreshCatalog();
    } catch (err: unknown) {
      setAdminFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Save failed.",
      });
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

      setAdminFeedback({
        type: "success",
        message: `Imported ${data.upsertedPackages} package(s) and ${data.upsertedAliases} matcher alias(es).`,
      });
      setBulkInput("");
      await refreshCatalog();
    } catch (err: unknown) {
      setAdminFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Bulk import failed.",
      });
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
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#CBD5E1] shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200/80">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>PhilHealth All-Case-Rates (Versioned Catalog)</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                <Database className="w-3 h-3" />
                <span>Database Single Catalog</span>
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Benefit Case Rates Directory
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Versioned PhilHealth circulars covering hospital facility (HCI)
              caps, physician professional fee (PF) caps, and mandatory bundled
              supplies.
            </p>
          </div>

          {isAdmin && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setAdminFeedback(null);
                setShowAdminModal((prev) => !prev);
              }}
              className="shrink-0 rounded-full text-xs font-bold gap-1.5"
            >
              {showAdminModal ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  Close Rate Manager
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Manage / Import Circulars
                </>
              )}
            </Button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 border-t border-[#CBD5E1] mt-4 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Staff Catalog Manager Drawer / Panel */}
      {showAdminModal && (
        <Card className="border-blue-300 bg-white shadow-md">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#CBD5E1] pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  PhilHealth Circular Rate Manager
                </h2>
                <p className="text-[11px] text-slate-600">
                  Add a versioned RVS/ICD-10 package or import a CSV/JSON
                  circular without code changes.
                </p>
              </div>
              <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAdminMode("single")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    adminMode === "single"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Single Case Rate
                </button>
                <button
                  type="button"
                  onClick={() => setAdminMode("csv")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    adminMode === "csv"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  CSV / JSON Import
                </button>
              </div>
            </div>

            {adminFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium border ${
                  adminFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                    : "bg-rose-50 text-rose-900 border-rose-200"
                }`}
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                      className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                    className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
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
                    className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="rounded-full text-xs font-bold"
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
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
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
                  className="w-full font-mono rounded-xl border border-[#CBD5E1] px-3 py-2 text-[11px] text-slate-900"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || !bulkInput.trim()}
                    className="rounded-full text-xs font-bold"
                  >
                    {saving ? "Importing..." : "Sync Batch to Catalog"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Input */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setDiscoveryError(null);
              setSearchQuery(e.target.value);
            }}
            placeholder="Search any medical condition, surgery, RVS, or ICD-10 code (e.g. Thyroidectomy, Stroke, 44970)..."
            className="w-full bg-white border border-[#CBD5E1] rounded-full pl-11 pr-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-soft transition-all"
          />
        </div>
        {searchQuery.trim().length >= 2 && (
          <Button
            type="button"
            size="sm"
            disabled={discovering}
            onClick={() => void handleAiDiscover(searchQuery)}
            className="rounded-full text-xs font-bold gap-1.5 shrink-0 h-11 px-4"
          >
            {discovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Resolving ACR...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Auto-Discover</span>
              </>
            )}
          </Button>
        )}
      </div>

      {discoveryError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between">
          <span>{discoveryError}</span>
          <button
            type="button"
            onClick={() => setDiscoveryError(null)}
            className="font-bold text-amber-800 hover:underline ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-600">
        <span>
          Showing <strong>{filtered.length}</strong> package
          {filtered.length === 1 ? "" : "s"}
        </span>
        <span className="text-[11px] text-slate-600">
          Unlisted procedures are resolved automatically via Gemini ACR
          grounding
        </span>
      </div>

      {/* Case Package Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-600 bg-white rounded-2xl border border-[#CBD5E1]">
            Loading PhilHealth packages from catalog...
          </div>
        ) : catalogError ? (
          <div className="p-8 text-center text-xs text-rose-800 bg-rose-50 rounded-2xl border border-rose-200 space-y-2">
            <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
            <p className="font-bold text-sm">Catalog Unavailable</p>
            <p className="text-rose-700">{catalogError}</p>
            <p className="text-[11px] text-rose-700">
              Run <code>npm run seed:packages</code> to sync the PhilHealth
              catalog.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-600 bg-white rounded-2xl border border-[#CBD5E1] space-y-3">
            {discovering ? (
              <>
                <Loader2 className="w-6 h-6 text-blue-600 mx-auto animate-spin" />
                <p className="font-bold text-slate-900">
                  Auto-discovering PhilHealth ACR package for &ldquo;
                  {searchQuery.trim()}&rdquo;...
                </p>
                <p className="text-slate-600">
                  Resolving official RVS/ICD-10 code, HCI/PF fee split, and
                  mandatory bundled supplies via Gemini Flash.
                </p>
              </>
            ) : (
              <>
                <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-800">
                  No local package found for &ldquo;{searchQuery.trim()}&rdquo;
                </p>
                <p className="text-slate-600">
                  Click below to resolve the official PhilHealth All-Case-Rates
                  package with AI and cache it to the catalog.
                </p>
                {searchQuery.trim().length >= 2 && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAiDiscover(searchQuery)}
                      className="rounded-full text-xs font-bold gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Resolve &ldquo;{searchQuery.trim()}&rdquo; with Gemini ACR
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          filtered.map((pkg) => {
            const cardKey = `${pkg.code}-${pkg.effectiveFrom}`;
            const isExpanded = expandedKey === cardKey;
            const isRVS = /^\d+$/.test(pkg.code);
            return (
              <Card
                key={cardKey}
                onClick={() => toggleExpand(cardKey)}
                className={`transition-all bg-white cursor-pointer group border ${
                  isExpanded
                    ? "border-blue-400 shadow-md ring-1 ring-blue-500/10"
                    : "border-[#CBD5E1] hover:border-blue-200 hover:shadow-card-hover"
                }`}
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {isRVS ? `RVS ${pkg.code}` : `ICD-10 ${pkg.code}`}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 uppercase">
                          {pkg.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          <FileText className="w-2.5 h-2.5" />
                          Circ. {pkg.circularId} ({pkg.effectiveFrom})
                        </span>
                        {(!pkg.isVerified || pkg.isAiDiscovered) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                            <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                            AI-Estimated (Unverified)
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                        {pkg.keyword}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">
                        Fixed Benefit
                      </span>
                      <span className="font-black text-sm sm:text-base text-emerald-800">
                        {formatPHP(pkg.totalRate)}
                      </span>
                    </div>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {pkg.description}
                    </p>
                  )}

                  {/* Fee Breakdown Row */}
                  <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-3">
                      <span>
                        Facility (HCI) Cap:{" "}
                        <strong className="text-slate-800">
                          {formatPHP(pkg.hciFee)}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Prof. Fee (PF) Cap:{" "}
                        <strong className="text-slate-800">
                          {formatPHP(pkg.profFee)}
                        </strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      aria-label="Toggle details"
                    >
                      <span>
                        {isExpanded ? "Hide Inclusions" : "View Inclusions"}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Expandable Inclusions Drawer */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-blue-100/70 bg-blue-50/40 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 rounded-b-2xl space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          Mandatory Package Inclusions (Cannot be Unbundled)
                        </span>
                        <Badge variant="neutral" className="text-[10px]">
                          {pkg.inclusiveItems.length} Inclusions
                        </Badge>
                      </div>
                      <p className="text-[11px] text-blue-950/80 leading-relaxed">
                        Under PhilHealth All-Case-Rates rules, accredited
                        facilities are prohibited from charging patients
                        separate out-of-pocket fees for these items when the
                        case rate is claimed:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {pkg.inclusiveItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5 text-xs text-slate-700 bg-white/90 p-2 rounded-xl border border-blue-100/70 shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="leading-snug">{item}</span>
                          </div>
                        ))}
                      </div>

                      {pkg.aliases.length > 0 && (
                        <div className="pt-2 border-t border-blue-200/60 space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                            <Tag className="w-3 h-3 text-blue-600" />
                            Engine Matcher Tokens ({pkg.aliases.length})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {pkg.aliases.map((alias) => (
                              <span
                                key={alias}
                                className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white text-slate-700 border border-blue-200"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
