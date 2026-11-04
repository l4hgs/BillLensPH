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
}

export interface AuditFlag {
  type: "unbundled_charge" | "missing_statutory_discount" | "excess_hci_charge" | "compliance_note";
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
  inclusive_items: string[];
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
  detected_case_packages: MatchedCasePackage[];
  line_items: AuditedLineItem[];
  flags: AuditFlag[];
  negotiation_brief_summary: string;
  audited_at: string;
}
