"use client";

import React, { useEffect, useRef, useState } from "react";
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

  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const updateIndicator = () => {
      const key = activeTier ?? "all";
      const el = tabRefs.current[key];
      if (!el) return;
      setIndicatorStyle({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    };

    updateIndicator();

    const container = tablistRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeTier, items.length]);

  return (
    <div className="w-full space-y-3">
      {/* 1. Top Section: Compact Full-Width Financial Impact Metrics (Stacked vertically on mobile) */}
      {grossTotal !== undefined && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 border-b border-slate-200/80 pb-3 sm:pb-3.5 gap-2.5 sm:gap-0 text-center sm:text-left">
          {/* Total Billed */}
          <div className="pb-2.5 sm:pb-0 sm:pr-4 lg:pr-5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Billed
            </span>
            <span className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 block tracking-tight font-mono tabular-nums whitespace-nowrap">
              {formatPHP(grossTotal)}
            </span>
            {actualOutOfPocket !== undefined && (
              <span className="text-[11px] text-slate-500 block leading-tight">
                Hospital asks:{" "}
                <strong className="font-semibold text-slate-700 font-mono tabular-nums">
                  {formatPHP(actualOutOfPocket)}
                </strong>
              </span>
            )}
          </div>

          {/* Potential Savings */}
          <div className="py-2.5 sm:py-0 sm:px-4 lg:px-5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Potential Savings
            </span>
            <span className="text-lg sm:text-xl xl:text-2xl font-black text-amber-700 block tracking-tight font-mono tabular-nums whitespace-nowrap">
              {formatPHP(potentialSavings)}
            </span>
            <span className="text-[11px] text-slate-500 block leading-tight">
              Discounts &amp; ACR
            </span>
          </div>

          {/* Fair Balance Due */}
          <div className="pt-2.5 sm:pt-0 sm:pl-4 lg:pl-5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Fair Balance Due
            </span>
            <span className="text-lg sm:text-xl xl:text-2xl font-black text-emerald-700 block tracking-tight font-mono tabular-nums whitespace-nowrap">
              {formatPHP(fairOutOfPocket ?? (grossTotal - potentialSavings))}
            </span>
            <span className="text-[11px] text-slate-500 block leading-tight">
              Est. fair out-of-pocket
            </span>
          </div>
        </div>
      )}

      {/* 2. Slim Proportional Visual Progress Bar */}
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
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

      {/* 3. Merged Single-Row Interactive Breakdown & Filter Tabs (Sliding Indicator, Fixed Button Size) */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Filter line items by audit tier"
        className="relative grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60"
      >
        {indicatorStyle && (
          <div
            aria-hidden="true"
            className="absolute rounded-lg bg-white border border-slate-200/80 shadow-xs pointer-events-none z-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              left: `${indicatorStyle.left}px`,
              top: `${indicatorStyle.top}px`,
              width: `${indicatorStyle.width}px`,
              height: `${indicatorStyle.height}px`,
            }}
          />
        )}
        {(
          [
            {
              id: null,
              label: "All",
              count: items.length,
              amount: totalAmount,
              dot: null,
            },
            ...TIER_ORDER.map((tier) => {
              const found = stats.find((s) => s.tier === tier);
              return {
                id: tier,
                label: TIER_META[tier].label,
                count: found?.count ?? 0,
                amount: found?.amount ?? 0,
                dot: TIER_META[tier].bar,
              };
            }),
          ] as const
        ).map((tab) => {
          const isSelected = activeTier === tab.id;
          const key = tab.id ?? "all";
          return (
            <button
              key={tab.label}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectTier(tab.id)}
              className={cn(
                "relative z-10 min-h-[46px] sm:min-h-[54px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-transparent text-left transition-colors duration-200 ease-out motion-reduce:transition-none cursor-pointer flex flex-col justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                isSelected
                  ? "text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <div className="flex items-center justify-between gap-1.5 w-full">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold truncate">
                  {tab.dot && (
                    <span className={cn("h-2 w-2 rounded-full shrink-0", tab.dot)} />
                  )}
                  <span className="truncate">{tab.label}</span>
                </span>
                <span
                  className={cn(
                    "text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.2 rounded-full shrink-0",
                    isSelected
                      ? "bg-slate-100 text-slate-800"
                      : "bg-slate-200/60 text-slate-500"
                  )}
                >
                  {tab.count}
                </span>
              </div>
              <span className="text-xs font-black text-slate-900 font-mono tabular-nums mt-0.5 whitespace-nowrap">
                {formatPHP(tab.amount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

