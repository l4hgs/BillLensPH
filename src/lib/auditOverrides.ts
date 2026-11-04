import type {
  AuditOverrides,
  AuditTier,
  ExtractedBillData,
  ExtractedLineItem,
  ItemOverride,
} from "@/types/audit";

/**
 * Pure helpers for the Audit Studio's Manual Override flow.
 *
 * OCR output is never mutated. User corrections live in a separate
 * `AuditOverrides` map and are layered on top before the rule engine re-runs,
 * so any item can be reset to exactly what the AI read.
 */

const ITEM_FIELDS = [
  "description",
  "category",
  "quantity",
  "unit_price",
  "total_amount",
] as const;

/** Balance an item would have, given the amounts the hospital already deducted. */
function remainingBalance(item: ExtractedLineItem, total: number): number {
  return Math.max(
    0,
    total - (item.philhealth_deducted || 0) - (item.discount_applied || 0)
  );
}

export function originalBalance(item: ExtractedLineItem): number {
  return item.balance ?? remainingBalance(item, item.total_amount);
}

/**
 * Layers user edits onto the pristine OCR bill.
 *
 * Bill-level figures (gross total, balance due) are shifted by the net change
 * of the edited items rather than recomputed from scratch, because hospitals
 * often state totals that include charges that are not itemized.
 */
export function applyOverridesToBill(
  ocr: ExtractedBillData,
  overrides: AuditOverrides
): ExtractedBillData {
  let grossDelta = 0;
  let balanceDelta = 0;

  const lineItems = ocr.line_items.map((item) => {
    const override = overrides[item.id];
    if (!override) return item;

    const total = override.total_amount ?? item.total_amount;
    const merged: ExtractedLineItem = {
      ...item,
      description: override.description?.trim() || item.description,
      category: override.category ?? item.category,
      quantity: override.quantity ?? item.quantity,
      unit_price: override.unit_price ?? item.unit_price,
      total_amount: total,
    };

    if (total !== item.total_amount) {
      merged.balance = remainingBalance(item, total);
      grossDelta += total - item.total_amount;
      balanceDelta += merged.balance - originalBalance(item);
    }

    return merged;
  });

  return {
    ...ocr,
    line_items: lineItems,
    gross_total: Math.max(0, ocr.gross_total + grossDelta),
    net_balance_due: Math.max(0, ocr.net_balance_due + balanceDelta),
  };
}

/** Extracts the user-chosen traffic-light tiers for the rule engine. */
export function statusOverridesFrom(
  overrides: AuditOverrides
): Record<string, AuditTier> {
  const result: Record<string, AuditTier> = {};
  for (const [id, override] of Object.entries(overrides)) {
    if (override.status) result[id] = override.status;
  }
  return result;
}

export interface OverrideDraft {
  description: string;
  category: ExtractedLineItem["category"];
  quantity: number;
  unit_price: number;
  total_amount: number;
  status: AuditTier | "auto";
  note: string;
}

/**
 * Turns the modal's draft into a minimal override: only fields that differ from
 * the OCR value are kept. Returns null when nothing differs, so "save without
 * changes" clears the override instead of storing noise.
 */
export function diffOverride(
  original: ExtractedLineItem,
  draft: OverrideDraft
): ItemOverride | null {
  const override: ItemOverride = {};

  for (const field of ITEM_FIELDS) {
    const next = draft[field];
    if (next !== original[field]) {
      (override as Record<string, unknown>)[field] = next;
    }
  }

  if (typeof override.description === "string") {
    override.description = override.description.trim();
    if (!override.description || override.description === original.description) {
      delete override.description;
    }
  }

  if (draft.status !== "auto") override.status = draft.status;

  const note = draft.note.trim();
  if (note) override.note = note;

  return Object.keys(override).length > 0 ? override : null;
}

export function countOverrides(overrides: AuditOverrides): number {
  return Object.keys(overrides).length;
}

