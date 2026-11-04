"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, Wallet } from "lucide-react";
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
}

/**
 * Proportional bar plus one filter tile per tier. Selecting a tile filters the
 * line-item list; selecting it again clears the filter.
 */
export function TrafficLightSummary({
  items,
  activeTier,
  onSelectTier,
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
    <div className="space-y-3">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                isActive ? meta.tileActive : meta.tile
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  meta.iconWrap
                )}
              >
                <meta.Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {meta.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    {count} {count === 1 ? "item" : "items"}
                  </span>
                </span>
                <span className="block text-sm font-black text-slate-900">
                  {formatPHP(amount)}
                </span>
                <span className="block text-[11px] leading-snug text-slate-600">
                  {meta.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

