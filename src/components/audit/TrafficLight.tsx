"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Wallet, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatPHP } from "@/lib/utils";
import type { AuditTier, AuditedLineItem } from "@/types/audit";

/**
 * Single source of truth for the three-tier traffic-light system.
 * Every tier pairs a color with an icon and a text label so the meaning never
 * depends on color alone.
 */
export const TIER_ORDER: AuditTier[] = [
  "covered",
  "review_worthy",
  "out_of_pocket",
];

export const TIER_META: Record<
  AuditTier,
  {
    label: string;
    short: string;
    description: string;
    badge: "covered" | "review" | "out-of-pocket";
    Icon: React.ComponentType<{ className?: string }>;
    bar: string;
    tile: string;
    tileActive: string;
    iconWrap: string;
    callout: string;
  }
> = {
  covered: {
    label: "Fully Covered",
    short: "Covered",
    description: "Settled by PhilHealth or other deductions",
    badge: "covered",
    Icon: CheckCircle2,
    bar: "bg-emerald-500",
    tile: "border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50",
    tileActive: "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20",
    iconWrap: "bg-emerald-100 text-emerald-700",
    callout: "bg-emerald-50 border-emerald-200 text-emerald-900",
  },
  review_worthy: {
    label: "Review-Worthy",
    short: "Review",
    description: "Possible overcharge or missing deduction",
    badge: "review",
    Icon: AlertTriangle,
    bar: "bg-amber-500",
    tile: "border-amber-200/80 bg-amber-50/40 hover:bg-amber-50",
    tileActive: "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20",
    iconWrap: "bg-amber-100 text-amber-700",
    callout: "bg-amber-50 border-amber-200 text-amber-900",
  },
  out_of_pocket: {
    label: "Out-of-Pocket",
    short: "Out-of-pocket",
    description: "Valid charges you are expected to pay",
    badge: "out-of-pocket",
    Icon: Wallet,
    bar: "bg-rose-500",
    tile: "border-rose-200/80 bg-rose-50/40 hover:bg-rose-50",
    tileActive: "border-rose-500 bg-rose-50 ring-2 ring-rose-500/20",
    iconWrap: "bg-rose-100 text-rose-700",
    callout: "bg-rose-50 border-rose-200 text-rose-900",
  },
};

interface TrafficLightBadgeProps {
  tier: AuditTier;
  className?: string;
}

export function TrafficLightBadge({ tier, className }: TrafficLightBadgeProps) {
  const meta = TIER_META[tier];
  return (
    <Badge variant={meta.badge} dot className={cn("whitespace-nowrap", className)}>
      {meta.label}
    </Badge>
  );
}

interface TrafficLightSummaryProps {
  items: Pick<AuditedLineItem, "status" | "total_amount">[];
  activeTier: AuditTier | null;
  onSelectTier: (tier: AuditTier | null) => void;
  grossTotal?: number;
  actualOutOfPocket?: number;
  potentialSavings?: number;
  fairOutOfPocket?: number;
}

/**
 * Modern unified financial impact & traffic-light triage dashboard.
 * Shows top-line numbers (Total, Savings, Fair Balance), a slim proportional bar,
 * and 3 interactive triage buttons to filter the line items list without text wrapping.
 */
export function TrafficLightSummary({
  items,
  activeTier,
  onSelectTier,
  grossTotal,
  actualOutOfPocket,
  potentialSavings = 0,
  fairOutOfPocket,
}: TrafficLightSummaryProps) {
  const stats = TIER_ORDER.map((tier) => {
    const tierItems = items.filter((item) => item.status === tier);
    return {
      tier,
      count: tierItems.length,
      amount: tierItems.reduce((sum, item) => sum + item.total_amount, 0),
    };
  });

  const totalAmount = stats.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-soft overflow-hidden">
      {/* 1. Top Section: Key Financial Impact Metrics */}
      {grossTotal !== undefined && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 p-4 sm:p-5 gap-3 sm:gap-0">
          {/* Total Billed */}
          <div className="sm:pr-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Billed
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 block tracking-tight">
              {formatPHP(grossTotal)}
            </span>
            {actualOutOfPocket !== undefined && (
              <span className="text-xs text-slate-500 block">
                Hospital asks: <strong className="font-semibold text-slate-700">{formatPHP(actualOutOfPocket)}</strong>
              </span>
            )}
          </div>

          {/* Potential Savings */}
          <div className="sm:px-4 pt-3 sm:pt-0 space-y-1">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              Potential Savings
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-600 block tracking-tight">
              {formatPHP(potentialSavings)}
            </span>
            <span className="text-xs text-amber-700/80 block">
              Unbundled &amp; missed discounts
            </span>
          </div>

          {/* Fair Balance Due */}
          <div className="sm:pl-4 pt-3 sm:pt-0 space-y-1">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              Fair Balance Due
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 block tracking-tight">
              {formatPHP(fairOutOfPocket ?? (grossTotal - potentialSavings))}
            </span>
            <span className="text-xs text-emerald-700/80 block">
              Estimated fair out-of-pocket
            </span>
          </div>
        </div>
      )}

      {/* 2. Middle Section: Slim Proportional Visual Progress Bar */}
      <div className="px-4 sm:px-5 pt-1 pb-3.5">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner"
          role="img"
          aria-label={`Bill breakdown: ${stats
            .map((s) => `${TIER_META[s.tier].label} ${s.count} items`)
            .join(", ")}`}
        >
          {totalAmount > 0 &&
            stats.map((s) =>
              s.amount > 0 ? (
                <div
                  key={s.tier}
                  className={cn("h-full transition-all", TIER_META[s.tier].bar)}
                  style={{ width: `${(s.amount / totalAmount) * 100}%` }}
                />
              ) : null
            )}
        </div>
      </div>

      {/* 3. Bottom Section: Interactive Line-Item Triage Filter Strip */}
      <div className="p-3.5 sm:p-4 bg-slate-50/50 border-t border-slate-100">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {stats.map(({ tier, count, amount }) => {
            const meta = TIER_META[tier];
            const isActive = activeTier === tier;
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectTier(isActive ? null : tier)}
                className={cn(
                  "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  isActive
                    ? "bg-white border-blue-500 shadow-xs ring-2 ring-blue-500/20"
                    : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs"
                )}
              >
                {/* Row 1: Icon & Count Badge */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                      isActive ? meta.iconWrap : "bg-slate-100 text-slate-600 group-hover:" + meta.iconWrap
                    )}
                  >
                    <meta.Icon className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
                      isActive
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-600 group-hover:bg-slate-200/80"
                    )}
                  >
                    {count} {count === 1 ? "item" : "items"}
                  </span>
                </div>

                {/* Row 2: Full Title Label */}
                <div className="mt-2 min-w-0">
                  <span className="text-xs font-bold text-slate-800 block leading-snug">
                    {meta.label}
                  </span>
                </div>

                {/* Row 3: Amount & Filter Cue */}
                <div className="flex items-baseline justify-between w-full mt-2 pt-2 border-t border-slate-100/90">
                  <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                    {formatPHP(amount)}
                  </span>
                  {isActive ? (
                    <span className="text-[10px] font-bold text-blue-600">
                      Filtering ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 group-hover:text-blue-600 transition-colors">
                      Filter →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Indicator Bar */}
      {activeTier && (
        <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-blue-50/90 border-t border-blue-100/80 text-xs text-blue-900">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            Filtering by <strong>{TIER_META[activeTier].label}</strong> (
            {stats.find((s) => s.tier === activeTier)?.count || 0}{" "}
            {(stats.find((s) => s.tier === activeTier)?.count ?? 0) === 1 ? "item" : "items"})
          </span>
          <button
            type="button"
            onClick={() => onSelectTier(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200/80 text-[11px] font-bold text-blue-700 shadow-2xs hover:bg-blue-100/60 hover:text-blue-900 transition-colors cursor-pointer"
          >
            <span>Show all items</span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
    </div>
  );
}

