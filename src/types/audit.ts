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
  /** ISO timestamp from `audits.created_at`, used for sorting and date filters. */
  createdAt: string;
  /** Total disputable amount for analyzed audits; undefined until the audit engine has run. */
  flaggedAmount?: number;
  isLive?: boolean;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

// ============================================================================
// Week 3 AI Vision OCR & Rule-Based Matching Types
// ============================================================================

export type AuditTier =
  | "covered"
  | "review_worthy"
  | "itemized_verification"
  | "out_of_pocket";

export type FacilityOwnership = "government" | "private";

export type StatutoryDiscountType = "regular" | "senior" | "pwd";

export type PhilHealthContributorType =
  | "direct"
  | "indirect_nbb"
  | "lifetime"
  | "unknown";

export type AccommodationType =
  | "basic_ward"
  | "non_basic_private"
  | "unknown";

export type FacilityLevel =
  | "level_1"
  | "level_2"
  | "level_3"
  | "asc"
  | "unknown";

/**
 * Per-audit PhilHealth Member Eligibility & Ward Accommodation snapshot
 * used to evaluate No Balance Billing (NBB) / Zero Co-Payment rules
 * (PhilHealth Circular 2016-0020 & RA 11223) and MDR/PIN readiness.
 */
export interface EligibilitySnapshot {
  contributor_type: PhilHealthContributorType;
  accommodation_type: AccommodationType;
  has_mdr_or_pin: boolean;
  facility_level: FacilityLevel;
  /** Hospital ownership ('government' | 'private'); NBB Zero Co-Payment applies only to government facilities. */
  facility_ownership?: FacilityOwnership;
  /** True when a government hospital had no basic/ward bed available at admission (NBB private-room exception). */
  no_ward_bed_available?: boolean;
}

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

/**
 * How the Senior/PWD statutory relief is computed for a line item.
 * - `vat_inclusive_goods`: Drugs/Medicines & Medical Supplies carry 12% VAT in
 *   their price, so relief = Billed − (Billed ÷ 1.12 × 0.80).
 * - `vat_exempt_service`: hospital, diagnostic and physician services are
 *   already VAT-exempt under NIRC Sec. 109(G) (RA 10963), so relief = Billed × 0.20.
 */
export type StatutoryVatTreatment = "vat_inclusive_goods" | "vat_exempt_service";

export interface AuditedLineItem extends ExtractedLineItem {
  status: AuditTier;
  flag_reason?: string;
  matched_package_code?: string;
  matched_package_name?: string;
  suggested_deduction?: number;
  /** Signed peso adjustment requested (-billed_amount for NBB write-offs; 0 for itemized_verification). */
  requested_adjustment?: number;
  is_unbundled_overcharge?: boolean;
  statutory_discount_eligible?: boolean;
  /** True when the user manually changed this item's tier in the Audit Studio. */
  is_manual_override?: boolean;
  /** VAT basis used for the statutory relief computation. */
  vat_treatment?: StatutoryVatTreatment;
  /** Full statutory relief this line is entitled to (before credits). */
  expected_statutory_relief?: number;
  /** Senior/PWD credit already granted on the SOA and allocated to this line. */
  statutory_credit_applied?: number;
}

/**
 * Bill-level reconciliation of the statutory discount against credits already
 * printed on the SOA, so partial discounts are never double-counted.
 */
export interface StatutoryReconciliation {
  /** Sum of expected relief across all eligible lines (RA 9994 / NIRC Sec. 109(G)). */
  total_entitled: number;
  /** Senior/PWD discount already credited on the SOA (footer credit + line-level discounts, de-duplicated). */
  already_credited: number;
  /** max(0, total_entitled − already_credited). */
  net_additional: number;
  /** Cash / HMO / deposit payments already posted on the SOA. */
  cash_or_hmo_payments: number;
  /** PhilHealth deductions already posted on the SOA. */
  philhealth_deducted: number;
  /** Sum of chargeable line items. */
  computed_gross: number;
  /** computed_gross − already_credited − payments − PhilHealth. */
  computed_balance: number;
  /** Balance due as printed on the SOA. */
  stated_balance: number;
  /** stated_balance − computed_balance (positive = hospital overstated the balance). */
  arithmetic_discrepancy: number;
  /** stated_balance − arithmetic_discrepancy − net_additional (before PhilHealth case-rate claims). */
  reconciled_balance: number;
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
  is_vat_exempt?: boolean;
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
  statement_date?: string;
  statement_number?: string;
  case_rate_codes_detected: string[];
  diagnosis_or_procedure?: string;
  primary_diagnosis?: string;
  line_items: ExtractedLineItem[];
  gross_total: number;
  philhealth_total: number;
  /** Senior/PWD discount already credited on the SOA (e.g. the "Senior Citizen Discount" row in the PAYMENT/CN column). */
  senior_pwd_discount_total: number;
  /** Cash, deposit, HMO or guarantor payments already posted on the SOA (never chargeable line items). */
  cash_or_hmo_payments_total?: number;
  net_balance_due: number;
  is_senior_or_pwd?: boolean;
  /** Mutually exclusive statutory privilege (RA 9994 Senior Citizen vs RA 10754 PWD; no double-stacking). */
  statutory_discount_type?: StatutoryDiscountType;
  /** Optional PhilHealth membership & accommodation snapshot captured at scan/audit time. */
  eligibility_snapshot?: EligibilitySnapshot;
  /** Inferred or user-selected hospital ownership ('government' | 'private'). */
  facility_ownership?: FacilityOwnership;
}

export interface AuditFlag {
  type:
    | "unbundled_charge"
    | "missing_statutory_discount"
    | "wrong_deduction_sequence"
    | "excess_hci_charge"
    | "nbb_violation"
    | "arithmetic_discrepancy"
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
  /** Official circular reference (e.g., "PC-2024-0037"). */
  circular_number?: string;
  effective_from?: string;
  effective_to?: string | null;
  /** Circular number that superseded this version (e.g., "PC-2024-0037"). */
  superseded_by?: string | null;
  source_url?: string | null;
  /** False when the package was auto-discovered by AI rather than verified from an official PhilHealth circular. */
  is_verified?: boolean;
  /** True when `hci_fee` / `prof_fee` were estimated via the 70/30 fallback rather than explicitly listed in a circular. */
  is_estimated_split?: boolean;
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
  circular_number?: string;
  effective_from?: string;
  effective_to?: string | null;
  superseded_by?: string | null;
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
  case_rate_shortfall?: number;
  nbb_savings?: number;
  /** Positive amount by which the SOA's stated balance exceeds its own line arithmetic. */
  arithmetic_discrepancy?: number;
  /** Statutory discount vs. SOA credit reconciliation (present for Senior/PWD audits). */
  statutory_reconciliation?: StatutoryReconciliation;
  philhealth_coverage_total: number;
  senior_pwd_savings: number;
  statutory_discount_type: StatutoryDiscountType;
  eligibility_snapshot?: EligibilitySnapshot;
  /** Primary matched PhilHealth circular number (e.g., "PC-2024-0037"). */
  circular_number?: string;
  /** Hospital ownership ('government' | 'private') governing NBB & assistance routing. */
  facility_ownership: FacilityOwnership;
  /** Strict PhilHealth NBB eligibility (government facility + NBB member + basic ward or no-ward-bed exception). */
  is_nbb_eligible: boolean;
  /** Dynamic reconciled balance label based on whether PhilHealth was already deducted on the SOA. */
  reconciled_balance_label: string;
  detected_case_packages: MatchedCasePackage[];
  line_items: AuditedLineItem[];
  flags: AuditFlag[];
  negotiation_brief_summary: string;
  audited_at: string;
}
