"use client";

import React from "react";
import { Pencil, PenLine } from "lucide-react";
import { TIER_META } from "@/components/audit/TrafficLight";
import { cn, formatPHP } from "@/lib/utils";
import type {
  AuditedLineItem,
  ExtractedLineItem,
  ItemOverride,
} from "@/types/audit";

interface AuditLineItemRowProps {
  item: AuditedLineItem;
  original: ExtractedLineItem | undefined;
  override: ItemOverride | undefined;
  onEdit: () => void;
}

export function AuditLineItemRow({
  item,
  original,
  override,
  onEdit,
}: AuditLineItemRowProps) {
  const meta = TIER_META[item.status];
  const totalChanged =
    original !== undefined && original.total_amount !== item.total_amount;

  return (
    <li
      className={cn(
        "py-4 sm:py-5 px-2 sm:px-3 transition-colors hover:bg-slate-50/70 rounded-lg",
        override && "bg-blue-50/30"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-sm sm:text-base font-bold leading-snug text-slate-900">
              {item.description}
            </h4>
            {override && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <PenLine className="h-2.5 w-2.5" />
                Edited
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {item.category} ·{" "}
            <span className="font-mono tabular-nums text-slate-700">
              {item.quantity}
            </span>{" "}
            ×{" "}
            <span className="font-mono tabular-nums text-slate-700">
              {formatPHP(item.unit_price)}
            </span>
          </p>
        </div>

        {/* Right Cluster: Status Dot + Price, followed by consistently aligned Edit action */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-3">
          <div className="text-right">
            {totalChanged && original && (
              <span className="block text-[11px] text-slate-400 line-through font-mono tabular-nums">
                {formatPHP(original.total_amount)}
              </span>
            )}
            <div className="inline-flex items-center gap-2">
              <span
                className={cn("h-2 w-2 rounded-full shrink-0", meta.bar)}
                title={meta.label}
                aria-label={meta.label}
              />
              <span className="text-sm sm:text-base font-black text-slate-900 font-mono tabular-nums whitespace-nowrap">
                {formatPHP(item.total_amount)}
              </span>
            </div>
          </div>

          <span
            className="hidden sm:block h-4 w-px bg-slate-200/80 shrink-0"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${item.description}`}
            title="Edit item"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg min-h-[44px] min-w-[44px] p-2.5 text-slate-400 transition-colors hover:bg-blue-50/70 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] shrink-0"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {item.flag_reason && (
        <div
          className={cn(
            "mt-3 border-l-2 pl-3.5 py-1 text-xs leading-relaxed",
            item.status === "covered" && "border-emerald-500 text-slate-600",
            item.status === "review_worthy" && "border-amber-500 text-slate-600",
            item.status === "out_of_pocket" && "border-rose-500 text-slate-600"
          )}
        >
          <p>{item.flag_reason}</p>
          {item.suggested_deduction ? (
            <p className="mt-1.5 text-slate-500">
              Potential savings:{" "}
              <span className="font-bold font-mono tabular-nums text-amber-700">
                {formatPHP(item.suggested_deduction)}
              </span>
            </p>
          ) : null}
        </div>
      )}

      {override?.note && (
        <p className="mt-2.5 text-xs italic leading-relaxed text-slate-600">
          Your note: {override.note}
        </p>
      )}
    </li>
  );
}
