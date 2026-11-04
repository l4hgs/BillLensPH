"use client";

import React from "react";
import { Pencil, PenLine } from "lucide-react";
import { TIER_META, TrafficLightBadge } from "@/components/audit/TrafficLight";
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
        "rounded-2xl border bg-white p-3.5 shadow-xs transition-colors",
        override ? "border-blue-200/90" : "border-slate-200/80"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-sm font-bold leading-snug text-slate-900">
              {item.description}
            </h4>
            {override && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                <PenLine className="h-2.5 w-2.5" />
                Edited
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600">
            {item.category} · {item.quantity} × {formatPHP(item.unit_price)}
          </p>
        </div>

        <div className="shrink-0 space-y-1.5 text-right">
          <div>
            {totalChanged && original && (
              <span className="block text-[11px] text-slate-500 line-through">
                {formatPHP(original.total_amount)}
              </span>
            )}
            <span className="block text-sm font-black text-slate-900">
              {formatPHP(item.total_amount)}
            </span>
          </div>
          <TrafficLightBadge tier={item.status} />
        </div>
      </div>

      {item.flag_reason && (
        <p
          className={cn(
            "mt-2.5 rounded-xl border px-3 py-2 text-xs leading-relaxed",
            meta.callout
          )}
        >
          {item.flag_reason}
          {item.suggested_deduction ? (
            <span className="mt-1 block font-bold">
              Potential savings: {formatPHP(item.suggested_deduction)}
            </span>
          ) : null}
        </p>
      )}

      {override?.note && (
        <p className="mt-2 text-xs italic leading-relaxed text-slate-600">
          Your note: {override.note}
        </p>
      )}

      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${item.description}`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
    </li>
  );
}

