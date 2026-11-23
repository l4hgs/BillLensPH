import { describe, expect, it } from "vitest";
import { applyOverridesToBill, statusOverridesFrom } from "../auditOverrides";
import { runAuditEngine } from "../auditEngine";
import type { AuditOverrides, ExtractedBillData } from "@/types/audit";

const BASE_BILL: ExtractedBillData = {
  hospital_name: "Metro Care Medical Center",
  statement_number: "SOA-2026-0412",
  case_rate_codes_detected: [],
  is_senior_or_pwd: true,
  statutory_discount_type: "senior",
  line_items: [
    {
      id: "item-1",
      description: "Amoxicillin 500mg Capsule",
      category: "Drugs/Medicines",
      quantity: 2,
      unit_price: 560,
      total_amount: 1120,
      philhealth_deducted: 0,
      discount_applied: 0,
      balance: 1120,
      is_vat_exempt: false,
    },
    {
      id: "item-2",
      description: "Complete Blood Count (CBC)",
      category: "Laboratory/Diagnostics",
      quantity: 1,
      unit_price: 500,
      total_amount: 500,
      philhealth_deducted: 0,
      discount_applied: 0,
      balance: 500,
    },
  ],
  gross_total: 1620,
  philhealth_total: 0,
  senior_pwd_discount_total: 0,
  net_balance_due: 1620,
};

describe("applyOverridesToBill", () => {
  it("edits line-item amounts and quantities and shifts bill totals without mutating pristine OCR", () => {
    const overrides: AuditOverrides = {
      "item-1": {
        quantity: 3,
        unit_price: 560,
        total_amount: 1680,
      },
    };

    const updated = applyOverridesToBill(BASE_BILL, overrides);

    // Pristine OCR input remains untouched
    expect(BASE_BILL.line_items[0].quantity).toBe(2);
    expect(BASE_BILL.line_items[0].total_amount).toBe(1120);
    expect(BASE_BILL.gross_total).toBe(1620);

    // Overridden bill reflects new quantity, amount, balance, and shifted bill totals
    expect(updated.line_items[0].quantity).toBe(3);
    expect(updated.line_items[0].total_amount).toBe(1680);
    expect(updated.line_items[0].balance).toBe(1680);
    expect(updated.gross_total).toBe(2180);
    expect(updated.net_balance_due).toBe(2180);

    const audit = runAuditEngine(updated, {
      auditId: "override-qty-amount",
      referencePackages: [],
      statutoryDiscountType: "senior",
    });

    // Item 1 (VAT-inclusive drug ₱1,680): 1680 - (1680 / 1.12 * 0.80) = 480
    // Item 2 (VAT-exempt lab ₱500): 500 * 0.20 = 100
    expect(audit.gross_total).toBe(2180);
    expect(audit.senior_pwd_savings).toBeCloseTo(580, 2);
    expect(audit.fair_out_of_pocket).toBeCloseTo(1600, 2);
  });

  it("propagates category overrides and is_vat_exempt toggles cleanly into runAuditEngine", () => {
    const overrides: AuditOverrides = {
      "item-1": {
        is_vat_exempt: true,
      },
      "item-2": {
        category: "Medical Supplies",
        is_vat_exempt: false,
        total_amount: 1120,
        unit_price: 1120,
      },
    };

    const updated = applyOverridesToBill(BASE_BILL, overrides);

    expect(updated.line_items[0].is_vat_exempt).toBe(true);
    expect(updated.line_items[1].category).toBe("Medical Supplies");
    expect(updated.line_items[1].is_vat_exempt).toBe(false);
    expect(updated.gross_total).toBe(2240);
    expect(updated.net_balance_due).toBe(2240);

    const audit = runAuditEngine(updated, {
      auditId: "override-category-vat",
      referencePackages: [],
      statutoryDiscountType: "senior",
    });

    const item1 = audit.line_items.find((i) => i.id === "item-1");
    const item2 = audit.line_items.find((i) => i.id === "item-2");

    // Item 1 toggled to VAT-exempt -> straight 20% discount (1120 * 0.20 = 224)
    expect(item1?.vat_treatment).toBe("vat_exempt_service");
    expect(item1?.suggested_deduction).toBeCloseTo(224, 2);

    // Item 2 recategorized to Medical Supplies (VAT-inclusive) -> 1120 - (1120/1.12*0.80) = 320
    expect(item2?.vat_treatment).toBe("vat_inclusive_goods");
    expect(item2?.suggested_deduction).toBeCloseTo(320, 2);

    expect(audit.senior_pwd_savings).toBeCloseTo(544, 2);
    expect(audit.fair_out_of_pocket).toBeCloseTo(1696, 2);
  });

  it("extracts manual tier overrides and respects them in runAuditEngine", () => {
    const overrides: AuditOverrides = {
      "item-1": {
        status: "covered",
        note: "Confirmed covered by HMO",
      },
    };

    const updated = applyOverridesToBill(BASE_BILL, overrides);
    const manualStatusOverrides = statusOverridesFrom(overrides);

    expect(manualStatusOverrides).toEqual({ "item-1": "covered" });

    const audit = runAuditEngine(updated, {
      auditId: "override-tier",
      referencePackages: [],
      statutoryDiscountType: "senior",
      manualStatusOverrides,
    });

    const item1 = audit.line_items.find((i) => i.id === "item-1");
    const item2 = audit.line_items.find((i) => i.id === "item-2");

    expect(item1?.status).toBe("covered");
    expect(item1?.is_manual_override).toBe(true);
    expect(item2?.status).toBe("review_worthy");
    expect(audit.senior_pwd_savings).toBeCloseTo(100, 2);
  });
});
