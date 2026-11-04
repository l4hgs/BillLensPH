"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIER_META, TIER_ORDER } from "@/components/audit/TrafficLight";
import { cn, formatPHP } from "@/lib/utils";
import { diffOverride, type OverrideDraft } from "@/lib/auditOverrides";
import type {
  AuditTier,
  AuditedLineItem,
  ExtractedLineItem,
  ItemOverride,
} from "@/types/audit";

const CATEGORIES: ExtractedLineItem["category"][] = [
  "Drugs/Medicines",
  "Medical Supplies",
  "Laboratory/Diagnostics",
  "Room & Board",
  "Operating Room",
  "Professional Fees",
  "Miscellaneous",
];

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const round2 = (n: number) => Math.round(n * 100) / 100;

interface OverrideModalProps {
  /** The item as currently audited (OCR + any existing override applied). */
  item: AuditedLineItem;
  /** The item exactly as the AI read it, used to compute what changed. */
  original: ExtractedLineItem;
  existing: ItemOverride | undefined;
  onSave: (override: ItemOverride | null) => void;
  onClose: () => void;
}

export function OverrideModal({
  item,
  original,
  existing,
  onSave,
  onClose,
}: OverrideModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const [description, setDescription] = useState(item.description);
  const [category, setCategory] = useState(item.category);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price));
  const [total, setTotal] = useState(String(item.total_amount));
  const [status, setStatus] = useState<AuditTier | "auto">(
    existing?.status ?? "auto"
  );
  const [note, setNote] = useState(existing?.note ?? "");

  // Lock page scroll, restore focus to the opener, and focus the first field.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;

    const nodes = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(value);
    const q = Number(value);
    const p = Number(unitPrice);
    if (Number.isFinite(q) && Number.isFinite(p) && value.trim() !== "") {
      setTotal(String(round2(q * p)));
    }
  };

  const handleUnitPriceChange = (value: string) => {
    setUnitPrice(value);
    const q = Number(quantity);
    const p = Number(value);
    if (Number.isFinite(q) && Number.isFinite(p) && value.trim() !== "") {
      setTotal(String(round2(q * p)));
    }
  };

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!description.trim()) list.push("Description is required.");
    const q = Number(quantity);
    const p = Number(unitPrice);
    const t = Number(total);
    if (quantity.trim() === "" || !Number.isFinite(q) || q < 1)
      list.push("Quantity must be at least 1.");
    if (unitPrice.trim() === "" || !Number.isFinite(p) || p < 0)
      list.push("Unit price must be zero or more.");
    if (total.trim() === "" || !Number.isFinite(t) || t < 0)
      list.push("Total amount must be zero or more.");
    return list;
  }, [description, quantity, unitPrice, total]);

  const draft: OverrideDraft = {
    description,
    category,
    quantity: Number(quantity),
    unit_price: Number(unitPrice),
    total_amount: Number(total),
    status,
    note,
  };

  const pendingOverride = errors.length === 0 ? diffOverride(original, draft) : null;
  const hasOverride = Boolean(existing);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length > 0) return;
    onSave(pendingOverride);
  };

  const inputClass =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  const labelClass = "block text-xs font-bold text-slate-800 mb-1.5";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-title"
        onKeyDown={handleKeyDown}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
            <div className="min-w-0">
              <h2
                id="override-title"
                className="text-base font-bold text-slate-900"
              >
                Edit line item
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Fix an OCR misread or change how this charge is classified. The
                audit recalculates instantly.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">AI read: </span>
              {original.description} ·{" "}
              {original.quantity} × {formatPHP(original.unit_price)} ={" "}
              <span className="font-semibold text-slate-800">
                {formatPHP(original.total_amount)}
              </span>
            </div>

            <div>
              <label htmlFor="ov-description" className={labelClass}>
                Description
              </label>
              <input
                id="ov-description"
                ref={firstFieldRef}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="ov-category" className={labelClass}>
                Category
              </label>
              <select
                id="ov-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ExtractedLineItem["category"])
                }
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="ov-qty" className={labelClass}>
                  Qty
                </label>
                <input
                  id="ov-qty"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ov-unit" className={labelClass}>
                  Unit price
                </label>
                <input
                  id="ov-unit"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={unitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ov-total" className={labelClass}>
                  Total
                </label>
                <input
                  id="ov-total"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <fieldset>
              <legend className={labelClass}>Classification</legend>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition-all",
                    status === "auto"
                      ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/15"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <input
                    type="radio"
                    name="ov-status"
                    value="auto"
                    checked={status === "auto"}
                    onChange={() => setStatus("auto")}
                    className="sr-only"
                  />
                  Automatic
                </label>
                {TIER_ORDER.map((tier) => {
                  const meta = TIER_META[tier];
                  const selected = status === tier;
                  return (
                    <label
                      key={tier}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition-all",
                        selected
                          ? meta.tileActive
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="radio"
                        name="ov-status"
                        value={tier}
                        checked={selected}
                        onChange={() => setStatus(tier)}
                        className="sr-only"
                      />
                      <meta.Icon className="h-3.5 w-3.5 shrink-0" />
                      {meta.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-600">
                &ldquo;Automatic&rdquo; lets the PhilHealth rule engine decide.
                Choosing a tier overrides it for this item only.
              </p>
            </fieldset>

            <div>
              <label htmlFor="ov-note" className={labelClass}>
                Note <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <textarea
                id="ov-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Confirmed with billing that this was a private-room upgrade"
                className={cn(inputClass, "resize-none")}
              />
            </div>

            {errors.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                <ul className="space-y-0.5">
                  {errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            {hasOverride ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => onSave(null)}
                className="text-slate-600"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset to AI value</span>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={errors.length > 0}
                className="flex-1 sm:flex-none font-bold"
              >
                Apply changes
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

