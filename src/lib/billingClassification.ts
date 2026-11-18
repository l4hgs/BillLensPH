import type {
  ExtractedLineItem,
  StatutoryVatTreatment,
} from "@/types/audit";

type Category = ExtractedLineItem["category"];

/**
 * Hospital facility cost centers (ward, ER, OR/DR). `Room & Board` is the
 * codebase's ROOM_AND_ER bucket: Emergency Room facility/nursing charges are
 * hospital services and are 100% eligible for the RA 9994 / RA 10754 discount
 * (BIR RR 7-2010), so these are always eligible regardless of the configured
 * `statutory_rules.eligible_categories`.
 */
export const FACILITY_SERVICE_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  "Room & Board",
  "Operating Room",
]);

/** Goods that carry 12% VAT in their price unless marked VAT-exempt. */
const VAT_INCLUSIVE_GOODS: ReadonlySet<Category> = new Set<Category>([
  "Drugs/Medicines",
  "Medical Supplies",
]);

/**
 * NIRC Sec. 109(G) (as amended by RA 10963): medical, dental, hospital,
 * diagnostic and physician professional services are VAT-exempt for every
 * patient, so the Senior/PWD relief is a straight 20% of the billed amount.
 * Only drugs/medicines and medical supplies need the 12% VAT stripped first.
 */
export function vatTreatmentFor(
  category: Category,
  isVatExemptGoods: boolean
): StatutoryVatTreatment {
  if (VAT_INCLUSIVE_GOODS.has(category) && !isVatExemptGoods) {
    return "vat_inclusive_goods";
  }
  return "vat_exempt_service";
}

/** Rounds to centavos the way hospital billing systems post line discounts. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Expected Senior/PWD statutory relief for a single eligible line.
 * - VAT-inclusive goods: Billed − (Billed ÷ 1.12 × 0.80)
 * - VAT-exempt services: Billed × 0.20
 */
export function computeStatutoryRelief(
  billed: number,
  treatment: StatutoryVatTreatment,
  vatDivisor: number,
  discountRate: number
): number {
  if (!(billed > 0)) return 0;
  if (treatment === "vat_inclusive_goods") {
    return round2(billed - (billed / vatDivisor) * (1 - discountRate));
  }
  return round2(billed * discountRate);
}

const SUPPLY_PATTERN =
  /\b(central\s+suppl(y|ies)|csr|medical\s+suppl(y|ies)|supplies|sterile|kit|pack|tray)\b/i;
const PHARMACY_PATTERN = /\b(pharmacy|drugs?|medicines?|medications?)\b/i;
const PROFESSIONAL_FEE_PATTERN =
  /\b(professional\s+fees?|pf|doctor'?s?\s+fees?|physician'?s?\s+fees?|surgeon'?s?\s+fees?|anesthesiologist)\b/i;
const DIAGNOSTIC_PATTERN =
  /\b(x-?\s?ray|laborator(y|ies)|lab|radiology|ct\s*-?\s*scan|mri|ultrasound|ultrasonography|pulmonary|respiratory|ecg|ekg|2d\s*echo|echocardiogra\w*|cardio\w*|histopath\w*|patholog\w*|imaging|diagnostics?|endoscopy|blood\s+bank)\b/i;
const EMERGENCY_PATTERN =
  /\b(emergency(\s+(room|dept|department|services?|fees?))?|er\s+(fees?|charges?|services?|room)|e\.r\.)/i;
const OPERATING_PATTERN =
  /\b((operating|delivery|recovery|labor)\s+room|pacu|(or|dr)\s+(fees?|charges?))\b/i;
const WARD_PATTERN =
  /\b(room\s*(&|and)\s*board|ward|icu|nicu|picu|private\s+room|semi-?\s?private|accommodation|room\s+(rates?|charges?|fees?))\b/i;

/**
 * Routes an OCR line to the correct statutory bucket by its cost-center name
 * when the model fell back to `Miscellaneous` (e.g. "Emergency Room" ->
 * `Room & Board` / ROOM_AND_ER). Explicit non-misc categories are kept.
 */
export function resolveBillingCategory(
  description: string,
  category: Category
): Category {
  if (category !== "Miscellaneous") return category;
  const text = description || "";
  if (EMERGENCY_PATTERN.test(text)) return "Room & Board";
  if (OPERATING_PATTERN.test(text)) return "Operating Room";
  if (SUPPLY_PATTERN.test(text)) return "Medical Supplies";
  if (PHARMACY_PATTERN.test(text)) return "Drugs/Medicines";
  if (PROFESSIONAL_FEE_PATTERN.test(text)) return "Professional Fees";
  if (DIAGNOSTIC_PATTERN.test(text)) return "Laboratory/Diagnostics";
  if (WARD_PATTERN.test(text)) return "Room & Board";
  return category;
}

export type SoaCreditKind = "statutory_discount" | "philhealth" | "payment";

const STATUTORY_CREDIT_PATTERN =
  /\b(senior(\s+citizens?)?|sc|pwd|osca|pdao|ra\s*9994|ra\s*10754)\b[\s\S]*\bdisc(ount)?s?\b|\bdisc(ount)?s?\b[\s\S]*\b(senior|sc|pwd)\b/i;
const PHILHEALTH_CREDIT_PATTERN =
  /^\s*(less[:\s-]*)?phil\s*-?\s*health\b(?![\s\S]*\b(lab|test|x-?ray)\b)/i;
const PAYMENT_CREDIT_PATTERN =
  /^\s*(less[:\s-]*)?(partial\s+|cash\s+|advance\s+|initial\s+)?(payments?|deposits?|amount\s+paid|paid|hmo|guarantor|guarantee\s+letter|refund)\b/i;

/**
 * Detects rows from the SOA `PAYMENT/CN` column (Senior/PWD discount credits,
 * PhilHealth deductions, cash/HMO payments). These are credits, never
 * chargeable line items.
 */
export function detectSoaCreditRow(description: string): SoaCreditKind | null {
  const text = (description || "").trim();
  if (!text) return null;
  if (STATUTORY_CREDIT_PATTERN.test(text)) return "statutory_discount";
  if (PHILHEALTH_CREDIT_PATTERN.test(text)) return "philhealth";
  if (PAYMENT_CREDIT_PATTERN.test(text)) return "payment";
  return null;
}
