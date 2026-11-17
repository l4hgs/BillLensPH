import type { CompressionResult } from "@/lib/imageCompression";

export interface ScannedPage {
  id: string;
  originalName: string;
  result: CompressionResult;
  storagePath?: string;
}

export type PipelineStage =
  | "idle"
  | "compressing"
  | "ready"
  | "uploading"
  | "staging_db"
  | "analyzing_ocr"
  | "completed"
  | "error";

export interface StagedFileMeta {
  path: string;
  signed_url: string | null;
  original_name: string;
  mime_type: string;
  original_size: number;
  compressed_size: number;
  compression_ratio: number;
  width: number;
  height: number;
}

export interface AuditDoc {
  id: string;
  facility: string;
  total: number;
  fileSize: string;
  fileType: "PDF" | "DOCX" | "Scan";
  dateText: string;
  isLive?: boolean;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

// ============================================================================
// Week 3 AI Vision OCR & Rule-Based Matching Types
// ============================================================================

export type AuditTier = "covered" | "review_worthy" | "out_of_pocket";

export type StatutoryDiscountType = "none" | "senior" | "pwd";

export interface ExtractedLineItem {
  id: string;
  description: string;
  category:
    | "Drugs/Medicines"
    | "Medical Supplies"
    | "Laboratory/Diagnostics"
    | "Room & Board"
    | "Operating Room"
    | "Professional Fees"
    | "Miscellaneous";
  quantity: number;
  unit_price: number;
  total_amount: number;
  philhealth_deducted?: number;
  discount_applied?: number;
  balance?: number;
  /** True when the line item is already VAT-exempt (e.g. TRAIN/CREATE VAT-exempt medicines), so 20% discount applies directly without dividing by 1.12. */
  is_vat_exempt?: boolean;
}

export interface AuditedLineItem extends ExtractedLineItem {
  status: AuditTier;
  flag_reason?: string;
  matched_package_code?: string;
  matched_package_name?: string;
  suggested_deduction?: number;
  is_unbundled_overcharge?: boolean;
  statutory_discount_eligible?: boolean;
  /** True when the user manually changed this item's tier in the Audit Studio. */
  is_manual_override?: boolean;
}

/**
 * A user correction to a single OCR line item (Week 4 Manual Override).
 * Stored non-destructively next to the pristine OCR output so any item can be
 * reset to what the AI originally read.
 */
export interface ItemOverride {
  description?: string;
  category?: ExtractedLineItem["category"];
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  /** Forces the traffic-light tier, bypassing the rule engine for this item. */
  status?: AuditTier;
  note?: string;
}

export type AuditOverrides = Record<string, ItemOverride>;

export interface ExtractedBillData {
  hospital_name: string;
  patient_name?: string;
  admission_date?: string;
  discharge_date?: string;
  statement_number?: string;
  case_rate_codes_detected: string[];
  diagnosis_or_procedure?: string;
  line_items: ExtractedLineItem[];
  gross_total: number;
  philhealth_total: number;
  senior_pwd_discount_total: number;
  net_balance_due: number;
  is_senior_or_pwd?: boolean;
  /** Mutually exclusive statutory privilege (RA 9994 Senior Citizen vs RA 10754 PWD; no double-stacking). */
  statutory_discount_type?: StatutoryDiscountType;
}

export interface AuditFlag {
  type:
    | "unbundled_charge"
    | "missing_statutory_discount"
    | "wrong_deduction_sequence"
    | "excess_hci_charge"
    | "compliance_note";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  potential_savings: number;
  item_id?: string;
}

export interface MatchedCasePackage {
  code: string;
  keyword: string;
  total_rate: number;
  hci_fee: number;
  prof_fee: number;
  /** Human-readable inclusions from the PhilHealth circular (display only). */
  inclusive_items: string[];
  circular_id?: string;
  effective_from?: string;
  effective_to?: string | null;
  source_url?: string | null;
}

/**
 * A short matcher term for one package inclusion (e.g. "trocar", "pacu").
 * `token` aliases match whole words (plurals allowed); `regex` aliases are
 * raw patterns tested against the normalized line description.
 */
export interface PackageAlias {
  alias: string;
  kind: "token" | "regex";
}

/** A package as loaded from the catalog, with the aliases the matcher uses. */
export interface CatalogPackage extends MatchedCasePackage {
  aliases: PackageAlias[];
}

/**
 * Parameterized statutory discount rule (e.g. RA 9994 / RA 10754 Senior & PWD),
 * loaded from the `statutory_rules` table so rate/category updates do not
 * require editing TypeScript code.
 */
export interface StatutoryRule {
  rule_code: string;
  label: string;
  vat_divisor: number;
  discount_rate: number;
  incomplete_threshold: number;
  eligible_categories: ExtractedLineItem["category"][];
  citation: string;
}

export interface AuditEngineResult {
  audit_id: string;
  hospital_name: string;
  patient_name?: string;
  statement_number?: string;
  gross_total: number;
  actual_out_of_pocket: number;
  fair_out_of_pocket: number;
  disputed_overcharge_total: number;
  philhealth_coverage_total: number;
  senior_pwd_savings: number;
  statutory_discount_type?: StatutoryDiscountType;
  detected_case_packages: MatchedCasePackage[];
  line_items: AuditedLineItem[];
  flags: AuditFlag[];
  negotiation_brief_summary: string;
  audited_at: string;
}
