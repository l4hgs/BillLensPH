import type { ExtractedBillData, ExtractedLineItem } from "@/types/audit";

const SYSTEM_PROMPT = `
You are the BillLens PH Medical Billing Vision Engine, specialized in parsing Philippine Hospital Itemized Statements of Account (ISAs), Statements of Account (SOAs), and PhilHealth Claim Forms (CF2/CF3).

TASK:
Examine the uploaded bill/statement image and extract all structured billing data into valid JSON matching the exact schema specified below.

PHILIPPINE BILLING CONVENTIONS TO DETECT:
1. Hospital Header: Institution name (e.g., St. Luke's, The Medical City, Makati Medical Center, PGH, Chong Hua, provincial DOH hospitals), patient name, statement/SOA number, admission date, discharge date.
2. Case Codes / Diagnoses: Look for RVS codes (e.g., 47562, 44970, 93458, 59400, 59510, 90935) or ICD-10 codes (e.g., J18.9, A97.1, A09.9), or procedure names.
3. Tabular Itemized Charges:
   - Drugs and Medicines (antibiotics, IV fluids, analgesics, anesthetics)
   - Medical Supplies (gloves, syringes, drape packs, trocars, catheters, sutures, blades)
   - Laboratory / Radiology (CBC, chest x-ray, ultrasound, CT, angiogram)
   - Room and Board (ward, semi-private, private, ICU, PACU)
   - Operating Room / Delivery Room fees
   - Professional Fees (Attending physician, surgeon, anesthesiologist)
   - Miscellaneous / Administrative fees
4. Deductions and Subsidies:
   - PhilHealth benefit deduction (HCI fee portion, PF portion)
   - Senior Citizen / PWD 20% discount and 12% VAT exemption if noted
   - HMO / Health insurance coverage (Maxicare, Intellicare, Medicard, PhilCare, etc.)
   - Net balance due / out-of-pocket remaining

REQUIRED JSON OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown formatting, no code fences, just the raw JSON object):
{
  "hospital_name": "String",
  "patient_name": "String or null",
  "admission_date": "YYYY-MM-DD or string or null",
  "discharge_date": "YYYY-MM-DD or string or null",
  "statement_number": "String or null",
  "case_rate_codes_detected": ["String"],
  "diagnosis_or_procedure": "String or null",
  "is_senior_or_pwd": boolean,
  "line_items": [
    {
      "id": "item-1",
      "description": "String",
      "category": "Drugs/Medicines" | "Medical Supplies" | "Laboratory/Diagnostics" | "Room & Board" | "Operating Room" | "Professional Fees" | "Miscellaneous",
      "quantity": number,
      "unit_price": number,
      "total_amount": number,
      "philhealth_deducted": number,
      "discount_applied": number,
      "balance": number
    }
  ],
  "gross_total": number,
  "philhealth_total": number,
  "senior_pwd_discount_total": number,
  "net_balance_due": number
}
`;

export interface GeminiVisionOptions {
  base64Data: string;
  mimeType: string;
  promptOverride?: string;
}

export async function extractBillWithGemini(
  options: GeminiVisionOptions
): Promise<ExtractedBillData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. Please check .env.local."
    );
  }

  // Prioritize the latest fast Gemini 3 & 3.5 Flash models (plus optional GEMINI_MODEL override)
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const models = Array.from(
    new Set([
      ...(configuredModel ? [configuredModel] : []),
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite-preview",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ])
  );
  let lastError: Error | null = null;
  let firstNon404Error: Error | null = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          {
            parts: [
              {
                text: options.promptOverride || SYSTEM_PROMPT,
              },
              {
                inline_data: {
                  mime_type: options.mimeType,
                  data: options.base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1,
          max_output_tokens: 8192,
        },
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const apiErr = new Error(
          `Gemini API error (${response.status} on ${model}): ${errorBody}`
        );
        if (response.status !== 404 && !firstNon404Error) {
          firstNon404Error = apiErr;
        }
        throw apiErr;
      }

      const json = await response.json();
      const parts: Array<{ text?: string; thought?: boolean }> =
        json.candidates?.[0]?.content?.parts || [];
      const textPart =
        parts.find(
          (p) => !p.thought && typeof p.text === "string" && p.text.trim().startsWith("{")
        ) ||
        parts.find((p) => !p.thought && typeof p.text === "string") ||
        parts[parts.length - 1];
      const rawText = textPart?.text || "";

      if (!rawText) {
        throw new Error(`No text response received from Gemini Vision model (${model}).`);
      }

      // Strip code fence wrappers or surrounding prose if present
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      const jsonSlice =
        firstBrace !== -1 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;

      const parsed: ExtractedBillData = JSON.parse(jsonSlice);

      // Validate and sanitize data
      return sanitizeExtractedBill(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next model fallback
    }
  }

  throw (
    firstNon404Error ||
    lastError ||
    new Error("Failed to process bill image with Gemini.")
  );
}

/**
 * Runs Gemini Vision OCR across one or more bill pages and merges them into a
 * single `ExtractedBillData` record without dropping pages 2..N.
 */
export async function extractMultiPageBillWithGemini(
  pages: GeminiVisionOptions[]
): Promise<ExtractedBillData> {
  if (pages.length === 0) {
    throw new Error("At least one bill page is required for OCR.");
  }
  const extractedPages: ExtractedBillData[] = [];
  for (const page of pages) {
    const result = await extractBillWithGemini(page);
    extractedPages.push(result);
  }
  return mergeExtractedBills(extractedPages);
}

const DEFAULT_HOSPITAL_NAME = "Philippine Healthcare Institution";

/**
 * Merges per-page `ExtractedBillData` results into one combined statement.
 * Page 2+ line item IDs are prefixed (`page2-item-1`, `page3-item-1`, ...) so
 * line IDs never collide across pages and Audit Studio overrides stay uniquely keyed.
 */
export function mergeExtractedBills(
  pages: ExtractedBillData[]
): ExtractedBillData {
  if (pages.length === 0) {
    return sanitizeExtractedBill({});
  }
  if (pages.length === 1) {
    return pages[0];
  }

  const mergedItems: ExtractedLineItem[] = [];
  const codeSet = new Set<string>();

  let hospitalName = DEFAULT_HOSPITAL_NAME;
  let patientName: string | undefined;
  let admissionDate: string | undefined;
  let dischargeDate: string | undefined;
  let statementNumber: string | undefined;
  let diagnosisOrProcedure: string | undefined;
  let isSeniorOrPwd = false;

  pages.forEach((page, pageIndex) => {
    const pageNum = pageIndex + 1;
    if (
      hospitalName === DEFAULT_HOSPITAL_NAME &&
      page.hospital_name &&
      page.hospital_name !== DEFAULT_HOSPITAL_NAME
    ) {
      hospitalName = page.hospital_name;
    }
    if (!patientName && page.patient_name) patientName = page.patient_name;
    if (!admissionDate && page.admission_date)
      admissionDate = page.admission_date;
    if (!dischargeDate && page.discharge_date)
      dischargeDate = page.discharge_date;
    if (!statementNumber && page.statement_number)
      statementNumber = page.statement_number;
    if (!diagnosisOrProcedure && page.diagnosis_or_procedure) {
      diagnosisOrProcedure = page.diagnosis_or_procedure;
    }
    if (page.is_senior_or_pwd) isSeniorOrPwd = true;

    for (const code of page.case_rate_codes_detected) {
      const trimmed = code.trim();
      if (trimmed) codeSet.add(trimmed);
    }

    page.line_items.forEach((item, itemIdx) => {
      const itemId =
        pageNum === 1
          ? `item-${itemIdx + 1}`
          : `page${pageNum}-item-${itemIdx + 1}`;
      mergedItems.push({
        ...item,
        id: itemId,
      });
    });
  });

  const combinedItemsGross = mergedItems.reduce(
    (sum, item) => sum + item.total_amount,
    0
  );
  const lastPage = pages[pages.length - 1];

  // If the final page carries a cumulative grand total that covers the combined
  // line items, prefer the final page's summary block; otherwise sum across pages.
  const lastPageHasGrandTotal =
    lastPage.gross_total >= combinedItemsGross * 0.9 &&
    combinedItemsGross > 0;

  const grossTotal = lastPageHasGrandTotal
    ? lastPage.gross_total
    : Math.max(
        combinedItemsGross,
        pages.reduce((sum, p) => sum + p.gross_total, 0)
      );

  const philhealthTotal = lastPageHasGrandTotal
    ? lastPage.philhealth_total ||
      Math.max(...pages.map((p) => p.philhealth_total))
    : Math.max(
        mergedItems.reduce(
          (sum, item) => sum + (item.philhealth_deducted || 0),
          0
        ),
        pages.reduce((sum, p) => sum + p.philhealth_total, 0)
      );

  const seniorDiscountTotal = lastPageHasGrandTotal
    ? lastPage.senior_pwd_discount_total ||
      Math.max(...pages.map((p) => p.senior_pwd_discount_total))
    : Math.max(
        mergedItems.reduce(
          (sum, item) => sum + (item.discount_applied || 0),
          0
        ),
        pages.reduce((sum, p) => sum + p.senior_pwd_discount_total, 0)
      );

  const netBalanceDue = lastPageHasGrandTotal
    ? lastPage.net_balance_due
    : Math.max(0, grossTotal - philhealthTotal - seniorDiscountTotal);

  return {
    hospital_name: hospitalName,
    patient_name: patientName,
    admission_date: admissionDate,
    discharge_date: dischargeDate,
    statement_number: statementNumber,
    case_rate_codes_detected: Array.from(codeSet),
    diagnosis_or_procedure: diagnosisOrProcedure,
    is_senior_or_pwd: isSeniorOrPwd,
    line_items: mergedItems,
    gross_total: grossTotal,
    philhealth_total: philhealthTotal,
    senior_pwd_discount_total: seniorDiscountTotal,
    net_balance_due: netBalanceDue,
  };
}

function sanitizeExtractedBill(data: Partial<ExtractedBillData>): ExtractedBillData {
  const lineItems: ExtractedLineItem[] = Array.isArray(data.line_items)
    ? data.line_items.map((item, index) => ({
        // Ids are index-based (never model-supplied) so they are always unique;
        // Audit Studio overrides are keyed by this id.
        id: `item-${index + 1}`,
        description: String(item.description || "Unspecified Medical Charge").trim(),
        category: sanitizeCategory(item.category),
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: Number(item.unit_price) || Number(item.total_amount) || 0,
        total_amount: Number(item.total_amount) || 0,
        philhealth_deducted: Number(item.philhealth_deducted) || 0,
        discount_applied: Number(item.discount_applied) || 0,
        balance:
          item.balance !== null &&
          item.balance !== undefined &&
          Number.isFinite(Number(item.balance))
            ? Number(item.balance)
            : Math.max(
                0,
                (Number(item.total_amount) || 0) -
                  (Number(item.philhealth_deducted) || 0) -
                  (Number(item.discount_applied) || 0)
              ),
      }))
    : [];

  const computedGross = lineItems.reduce((acc, curr) => acc + curr.total_amount, 0);

  return {
    hospital_name: String(data.hospital_name || "Philippine Healthcare Institution").trim(),
    patient_name: data.patient_name ? String(data.patient_name).trim() : undefined,
    admission_date: data.admission_date ? String(data.admission_date) : undefined,
    discharge_date: data.discharge_date ? String(data.discharge_date) : undefined,
    statement_number: data.statement_number ? String(data.statement_number) : undefined,
    case_rate_codes_detected: Array.isArray(data.case_rate_codes_detected)
      ? data.case_rate_codes_detected.map(String)
      : [],
    diagnosis_or_procedure: data.diagnosis_or_procedure
      ? String(data.diagnosis_or_procedure)
      : undefined,
    is_senior_or_pwd: Boolean(data.is_senior_or_pwd),
    line_items: lineItems,
    gross_total: Number(data.gross_total) || computedGross,
    philhealth_total: Number(data.philhealth_total) || 0,
    senior_pwd_discount_total: Number(data.senior_pwd_discount_total) || 0,
    net_balance_due:
      Number(data.net_balance_due) ||
      Math.max(
        0,
        (Number(data.gross_total) || computedGross) -
          (Number(data.philhealth_total) || 0) -
          (Number(data.senior_pwd_discount_total) || 0)
      ),
  };
}

function sanitizeCategory(
  cat: unknown
): ExtractedLineItem["category"] {
  const validCategories: ExtractedLineItem["category"][] = [
    "Drugs/Medicines",
    "Medical Supplies",
    "Laboratory/Diagnostics",
    "Room & Board",
    "Operating Room",
    "Professional Fees",
    "Miscellaneous",
  ];

  if (typeof cat === "string" && validCategories.includes(cat as ExtractedLineItem["category"])) {
    return cat as ExtractedLineItem["category"];
  }

  const str = String(cat || "").toLowerCase();
  if (str.includes("drug") || str.includes("med") || str.includes("pharmacy")) return "Drugs/Medicines";
  if (str.includes("supply") || str.includes("material") || str.includes("sterile")) return "Medical Supplies";
  if (str.includes("lab") || str.includes("xray") || str.includes("radiology") || str.includes("scan")) return "Laboratory/Diagnostics";
  if (str.includes("room") || str.includes("board") || str.includes("bed") || str.includes("ward")) return "Room & Board";
  if (str.includes("operating") || str.includes("or") || str.includes("dr") || str.includes("delivery") || str.includes("pacu")) return "Operating Room";
  if (str.includes("prof") || str.includes("pf") || str.includes("doctor") || str.includes("physician") || str.includes("surgeon")) return "Professional Fees";
  return "Miscellaneous";
}

