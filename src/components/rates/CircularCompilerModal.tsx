"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileUp,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { reconcilePackageSplit } from "@/lib/packageCatalog";
import type { CircularDiffRow } from "@/lib/circularCompiler";

interface EditableDiffRow extends CircularDiffRow {
  selected: boolean;
}

export interface CircularCompilerModalProps {
  open: boolean;
  onClose: () => void;
  onPublished: (summary: {
    publishedCount: number;
    supersededCount: number;
    circular_number: string;
  }) => void;
}

function CompilerDiffSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Compiling PhilHealth circular policy rules"
      className="space-y-4 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">
        Compiling PhilHealth circular policy rules...
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-16 rounded-xl bg-slate-100 border border-slate-200/70" />
        <div className="h-16 rounded-xl bg-slate-100 border border-slate-200/70" />
        <div className="h-16 rounded-xl bg-slate-100 border border-slate-200/70" />
      </div>
      <div className="h-12 rounded-xl bg-slate-100/80 border border-slate-200/70" />
      <div className="border border-slate-200/80 rounded-xl divide-y divide-slate-200/80 overflow-hidden">
        <div className="h-10 bg-slate-50" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="px-3 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-4 w-4 rounded bg-slate-200/70 shrink-0" />
              <div className="h-4 w-16 rounded bg-slate-200/70 shrink-0" />
              <div className="h-4 w-48 rounded bg-slate-100" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-5 w-20 rounded-full bg-slate-100" />
              <div className="h-4 w-20 rounded bg-slate-100" />
              <div className="h-4 w-20 rounded bg-slate-200/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CircularCompilerModal({
  open,
  onClose,
  onPublished,
}: CircularCompilerModalProps) {
  const [step, setStep] = useState<"ingest" | "compiling" | "review">("ingest");
  const [inputMode, setInputMode] = useState<"pdf" | "text">("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Compiled HITL review state
  const [circularNumber, setCircularNumber] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [supersedesCircular, setSupersedesCircular] = useState("");
  const [summaryNotes, setSummaryNotes] = useState("");
  const [rows, setRows] = useState<EditableDiffRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "compiling" && !isPublishing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, step, isPublishing, onClose]);

  const resetModal = () => {
    setStep("ingest");
    setErrorMsg(null);
    setPdfFile(null);
    setRawText("");
    setRows([]);
    setCircularNumber("");
    setEffectiveFrom("");
    setSupersedesCircular("");
    setSummaryNotes("");
  };

  const handleClose = () => {
    if (step === "compiling" || isPublishing) return;
    resetModal();
    onClose();
  };

  const handleCompile = async () => {
    setErrorMsg(null);
    if (inputMode === "pdf" && !pdfFile) {
      setErrorMsg("Select a PhilHealth Circular PDF file (max 10 MB).");
      return;
    }
    if (inputMode === "text" && rawText.trim().length < 10) {
      setErrorMsg("Paste at least 10 characters of circular or annex text.");
      return;
    }

    setStep("compiling");
    try {
      let res: Response;
      if (inputMode === "pdf" && pdfFile) {
        const formData = new FormData();
        formData.append("file", pdfFile);
        res = await fetch("/api/rates/compile", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/rates/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText.trim() }),
        });
      }

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        circular_number?: string;
        effective_from?: string;
        supersedes_circular?: string | null;
        summary_notes?: string;
        diff?: CircularDiffRow[];
      };

      if (!res.ok) {
        setErrorMsg(
          payload.error || "Could not compile circular. Please try again."
        );
        setStep("ingest");
        return;
      }

      const diffRows = Array.isArray(payload.diff) ? payload.diff : [];
      if (diffRows.length === 0) {
        setErrorMsg(
          "No PhilHealth case rate rows were detected in the document."
        );
        setStep("ingest");
        return;
      }

      setCircularNumber(payload.circular_number || "PC-2025-0001");
      setEffectiveFrom(
        payload.effective_from || new Date().toISOString().slice(0, 10)
      );
      setSupersedesCircular(payload.supersedes_circular || "");
      setSummaryNotes(payload.summary_notes || "");
      setRows(
        diffRows.map((row) => ({
          ...row,
          selected: row.status !== "UNCHANGED",
        }))
      );
      setStep("review");
    } catch {
      setErrorMsg("Network error while compiling circular. Please try again.");
      setStep("ingest");
    }
  };

  const handleRowRateChange = (index: number, nextTotalRaw: string) => {
    const parsed = Number(nextTotalRaw);
    const nextTotal = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const split = reconcilePackageSplit(0, 0, nextTotal, {
          case_code: row.case_code,
          is_verified: true,
        });
        const oldTotal = row.old_total_case_rate ?? 0;
        const deltaTotal =
          row.old_total_case_rate === null
            ? split.total_case_rate
            : Math.round((split.total_case_rate - oldTotal) * 100) / 100;
        const nextStatus =
          row.old_total_case_rate === null
            ? "NEW"
            : Math.abs(deltaTotal) > 0.005
              ? "RATE_UPDATED"
              : "UNCHANGED";
        return {
          ...row,
          new_total_case_rate: split.total_case_rate,
          new_hci_fee: split.hci_fee,
          new_prof_fee: split.prof_fee,
          delta_total: deltaTotal,
          delta_hci:
            row.old_hci_fee === null
              ? split.hci_fee
              : Math.round((split.hci_fee - row.old_hci_fee) * 100) / 100,
          delta_prof:
            row.old_prof_fee === null
              ? split.prof_fee
              : Math.round((split.prof_fee - row.old_prof_fee) * 100) / 100,
          status: nextStatus,
        };
      })
    );
  };

  const selectedPublishable = rows.filter(
    (r) => r.selected && r.status !== "UNCHANGED"
  );

  const handlePublish = async () => {
    if (selectedPublishable.length === 0 || isPublishing) return;
    setErrorMsg(null);
    setIsPublishing(true);

    try {
      const res = await fetch("/api/rates/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          circular_number: circularNumber.trim(),
          effective_from: effectiveFrom.trim(),
          supersedes_circular: supersedesCircular.trim() || null,
          items: selectedPublishable,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        publishedCount?: number;
        supersededCount?: number;
        circular_number?: string;
      };

      if (!res.ok) {
        setErrorMsg(
          payload.error || "Could not publish circular rates. Please try again."
        );
        return;
      }

      onPublished({
        publishedCount: payload.publishedCount ?? selectedPublishable.length,
        supersededCount: payload.supersededCount ?? 0,
        circular_number: payload.circular_number ?? circularNumber.trim(),
      });
      resetModal();
      onClose();
    } catch {
      setErrorMsg("Network error while publishing circular rates.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="circular-compiler-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90dvh] bg-white border border-slate-200 shadow-lg rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200/80 flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <h2
              id="circular-compiler-title"
              className="text-base sm:text-lg font-extrabold text-slate-900"
            >
              PhilHealth Circular Policy Compiler
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === "ingest" &&
                "Upload an official PhilHealth circular PDF or paste annex text to preview versioned rate changes."}
              {step === "compiling" &&
                "Extracting structured case rates and computing catalog diff..."}
              {step === "review" &&
                "Review and verify every rate diff before publishing to the live catalog."}
            </p>
          </div>
          <button
            type="button"
            disabled={step === "compiling" || isPublishing}
            onClick={handleClose}
            aria-label="Close circular compiler"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === "ingest" && (
            <div className="space-y-4">
              {/* Segmented Input Mode Tabs */}
              <div
                role="tablist"
                aria-label="Circular input format"
                className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === "pdf"}
                  onClick={() => setInputMode("pdf")}
                  className={cn(
                    "min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                    inputMode === "pdf"
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <FileUp className="w-4 h-4" />
                  <span>Upload Circular PDF</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === "text"}
                  onClick={() => setInputMode("text")}
                  className={cn(
                    "min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                    inputMode === "text"
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  <span>Paste Circular / Annex Text</span>
                </button>
              </div>

              {inputMode === "pdf" ? (
                <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#2563EB]/60 bg-slate-50/70 px-6 py-10 text-center cursor-pointer transition-colors">
                  <FileUp className="w-8 h-8 text-[#2563EB]" />
                  <span className="text-sm font-bold text-slate-900">
                    {pdfFile
                      ? pdfFile.name
                      : "Choose PhilHealth Circular PDF (max 10 MB)"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {pdfFile
                      ? `${(pdfFile.size / 1024).toFixed(1)} KB · Click to replace`
                      : "Official PhilHealth Circular or Annex PDF table"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPdfFile(f);
                      setErrorMsg(null);
                    }}
                    className="sr-only"
                  />
                </label>
              ) : (
                <div className="space-y-1.5">
                  <label
                    htmlFor="circular-raw-text"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Circular / Annex Text
                  </label>
                  <textarea
                    id="circular-raw-text"
                    rows={9}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste PhilHealth Circular No. 2024-0037 text or case rate annex table rows here..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
              )}
            </div>
          )}

          {step === "compiling" && <CompilerDiffSkeleton />}

          {step === "review" && (
            <div className="space-y-4">
              {/* Editable Circular Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="compiler-circular-number"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Circular Number
                  </label>
                  <input
                    id="compiler-circular-number"
                    type="text"
                    value={circularNumber}
                    onChange={(e) => setCircularNumber(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="compiler-effective-from"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Effective Date
                  </label>
                  <input
                    id="compiler-effective-from"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="compiler-supersedes"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    Supersedes Circular
                  </label>
                  <input
                    id="compiler-supersedes"
                    type="text"
                    value={supersedesCircular}
                    onChange={(e) => setSupersedesCircular(e.target.value)}
                    placeholder="e.g. PC-2013-0035"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {summaryNotes && (
                <div className="border-l-2 border-[#2563EB] pl-3.5 py-1 text-xs text-slate-600 leading-relaxed">
                  {summaryNotes}
                </div>
              )}

              {/* Side-by-Side Diff Table */}
              <div className="border border-slate-200/80 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-3 w-10">Pick</th>
                      <th className="py-2.5 px-3">Case Code</th>
                      <th className="py-2.5 px-3">Procedure</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Old Rate</th>
                      <th className="py-2.5 px-3 text-right">New Rate (PHP)</th>
                      <th className="py-2.5 px-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {rows.map((row, idx) => (
                      <tr
                        key={row.case_code}
                        className={cn(
                          "hover:bg-slate-50/70 transition-colors",
                          row.status === "UNCHANGED" && "opacity-65"
                        )}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            disabled={row.status === "UNCHANGED"}
                            checked={row.selected}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, selected: e.target.checked }
                                    : r
                                )
                              )
                            }
                            aria-label={`Select ${row.case_code} ${row.procedure_keyword}`}
                            className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.case_code}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 max-w-[220px]">
                          <span className="font-semibold block truncate">
                            {row.procedure_keyword}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                            HCI {formatPHP(row.new_hci_fee)} · PF{" "}
                            {formatPHP(row.new_prof_fee)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                              row.status === "NEW" &&
                                "bg-emerald-50 text-emerald-800 border-emerald-200",
                              row.status === "RATE_UPDATED" &&
                                "bg-amber-50 text-amber-800 border-amber-200",
                              row.status === "UNCHANGED" &&
                                "bg-slate-100 text-slate-600 border-slate-200"
                            )}
                          >
                            {row.status === "NEW"
                              ? "New"
                              : row.status === "RATE_UPDATED"
                                ? "Rate Updated"
                                : "Unchanged"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {row.old_total_case_rate !== null
                            ? formatPHP(row.old_total_case_rate)
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.new_total_case_rate}
                            onChange={(e) =>
                              handleRowRateChange(idx, e.target.value)
                            }
                            aria-label={`New total case rate for ${row.case_code}`}
                            className="w-28 min-h-[36px] rounded-lg border border-slate-200 px-2 py-1 text-right font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                          />
                        </td>
                        <td
                          className={cn(
                            "py-2.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap",
                            row.delta_total > 0 && "text-emerald-700",
                            row.delta_total < 0 && "text-rose-700",
                            row.delta_total === 0 && "text-slate-400"
                          )}
                        >
                          {row.delta_total > 0
                            ? `+${formatPHP(row.delta_total)}`
                            : row.delta_total < 0
                              ? formatPHP(row.delta_total)
                              : "₱0.00"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pinned Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-slate-200/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            {step === "review" && (
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setStep("ingest")}
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step === "compiling" || isPublishing}
              onClick={handleClose}
              className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancel
            </button>

            {step === "ingest" && (
              <button
                type="button"
                onClick={handleCompile}
                className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                Compile Policy Rules
              </button>
            )}

            {step === "review" && (
              <button
                type="button"
                disabled={selectedPublishable.length === 0 || isPublishing}
                onClick={handlePublish}
                className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold shadow-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Approve &amp; Publish Verified Rates (
                      {selectedPublishable.length})
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
