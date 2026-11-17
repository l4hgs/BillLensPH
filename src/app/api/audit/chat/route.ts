import { NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeEligibilitySnapshot,
  normalizeStatutoryDiscountType,
  runAuditEngine,
} from "@/lib/auditEngine";
import { getGeminiModelFallbackList } from "@/lib/gemini";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import {
  applyOverridesToBill,
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { formatPHP } from "@/lib/utils";
import type {
  AuditEngineResult,
  AuditOverrides,
  AuditedLineItem,
  ExtractedBillData,
} from "@/types/audit";

export const maxDuration = 60;

function isAuditEngineResult(value: unknown): value is AuditEngineResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as AuditEngineResult).line_items) &&
    typeof (value as AuditEngineResult).gross_total === "number"
  );
}

function isExtractedBillData(value: unknown): value is ExtractedBillData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ExtractedBillData).line_items)
  );
}

function isAuditOverrides(value: unknown): value is AuditOverrides {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatItemList(items: AuditedLineItem[], maxItems = 25): string {
  if (items.length === 0) return "  - None";
  const slice = items.slice(0, maxItems);
  const lines = slice.map((item) => {
    const qtyUnit = `${item.quantity} × ${formatPHP(item.unit_price)}`;
    const savingsNote =
      item.suggested_deduction && item.suggested_deduction > 0
        ? ` | Suggested Deduction: ${formatPHP(item.suggested_deduction)}`
        : "";
    const reasonText = item.flag_reason
      ? `\n    Reason: ${item.flag_reason}`
      : "";
    return `  - [${item.category}] "${item.description}" (${qtyUnit} = ${formatPHP(
      item.total_amount
    )})${savingsNote}${reasonText}`;
  });
  if (items.length > maxItems) {
    lines.push(`  - ...and ${items.length - maxItems} additional item(s).`);
  }
  return lines.join("\n");
}

function buildAuditContextBlock(audit: AuditEngineResult | null): string {
  if (!audit) {
    return [
      "=== PATIENT AUDIT CONTEXT ===",
      "No specific hospital bill is attached to this chat session yet.",
      "Answer general questions about Philippine hospital billing, PhilHealth All Case Rates (ACR), Senior Citizen / PWD discounts (RA 9994 / RA 10754), and Malasakit Center / DSWD / PCSO medical assistance clearly.",
    ].join("\n");
  }

  const lineItems = Array.isArray(audit.line_items) ? audit.line_items : [];
  const coveredItems = lineItems.filter((i) => i.status === "covered");
  const yellowItems = lineItems.filter(
    (i) => i.status === "review_worthy"
  );
  const redItems = lineItems.filter((i) => i.status === "out_of_pocket");

  const detectedPackages = Array.isArray(audit.detected_case_packages)
    ? audit.detected_case_packages
    : [];
  const matchedPackagesText =
    detectedPackages.length > 0
      ? detectedPackages
          .map(
            (pkg) =>
              `  - ${pkg.keyword || "Package"} (RVS/ICD Code: ${pkg.code || "N/A"}) | Total Case Rate: ${formatPHP(
                pkg.total_rate || 0
              )} (Health Care Institution / HCI Fee: ${formatPHP(
                pkg.hci_fee || 0
              )}, Doctor's Professional Fee / PF Share: ${formatPHP(
                pkg.prof_fee || 0
              )})`
          )
          .join("\n")
      : "  - No specific PhilHealth Case Rate package matched yet.";

  const flags = Array.isArray(audit.flags) ? audit.flags : [];
  const flagsText =
    flags.length > 0
      ? flags
          .map(
            (f) =>
              `  - [${(f.severity || "info").toUpperCase()}] ${f.title || "Notice"}: ${
                f.description || ""
              } (Est. Savings: ${formatPHP(f.potential_savings || 0)})`
          )
          .join("\n")
      : "  - None";

  const seniorPwdSavings = Number(audit.senior_pwd_savings) || 0;
  const disputedOvercharge = Number(audit.disputed_overcharge_total) || 0;
  const caseRateShortfall = Number(audit.case_rate_shortfall) || 0;
  const nbbSavings = Number(audit.nbb_savings) || 0;
  const totalPotentialSavings =
    disputedOvercharge + seniorPwdSavings + caseRateShortfall + nbbSavings;
  const statutoryLabel =
    audit.statutory_discount_type === "pwd"
      ? "PWD (RA 10754 / PDAO)"
      : audit.statutory_discount_type === "senior"
        ? "Senior Citizen (60+) (RA 9994 / OSCA)"
        : "Senior Citizen (60+) / PWD (RA 9994 / RA 10754)";
  const eligibility = normalizeEligibilitySnapshot(audit.eligibility_snapshot);

  return [
    "=== ACTIVE HOSPITAL BILL AUDIT CONTEXT ===",
    `Hospital / Facility: ${audit.hospital_name || "Philippine Healthcare Institution"}`,
    audit.patient_name ? `Patient Name: ${audit.patient_name}` : null,
    audit.statement_number
      ? `Statement / SOA Number: ${audit.statement_number}`
      : null,
    `Patient Statutory Privilege: ${audit.statutory_discount_type || "regular"}`,
    `PhilHealth Contributor Type: ${eligibility.contributor_type} | Accommodation: ${eligibility.accommodation_type} | MDR/PIN Presented: ${eligibility.has_mdr_or_pin ? "Yes" : "No (Remind patient to pull MDR via PhilHealth Member Portal or eGovPH Super App before paying)"} | Facility Level: ${eligibility.facility_level}`,
    `${statutoryLabel} Audit Savings Detected: ${
      seniorPwdSavings > 0
        ? `Yes (${formatPHP(seniorPwdSavings)})`
        : "None flagged"
    }`,
    nbbSavings > 0
      ? `No Balance Billing (NBB) / Zero Co-Payment Relief (PhilHealth Circular 2016-0020 & RA 11223): ${formatPHP(nbbSavings)}`
      : null,
    audit.negotiation_brief_summary
      ? `Audit Summary: ${audit.negotiation_brief_summary}`
      : null,
    "",
    "--- FINANCIAL SUMMARY ---",
    `- Total Gross Billed: ${formatPHP(Number(audit.gross_total) || 0)}`,
    `- PhilHealth Case Rate Coverage Applied/Expected: ${formatPHP(
      Number(audit.philhealth_coverage_total) || 0
    )}`,
    `- Statutory Senior/PWD Savings Identified: ${formatPHP(seniorPwdSavings)}`,
    `- Flagged Unbundled / Overcharge Total: ${formatPHP(disputedOvercharge)}`,
    `- Combined Potential Savings: ${formatPHP(totalPotentialSavings)}`,
    `- Hospital Stated Net Balance: ${formatPHP(Number(audit.actual_out_of_pocket) || 0)}`,
    `- Estimated Fair Out-of-Pocket Balance (after corrections): ${formatPHP(
      Number(audit.fair_out_of_pocket) || 0
    )}`,
    "",
    "--- MATCHED PHILHEALTH CASE RATE PACKAGE(S) ---",
    matchedPackagesText,
    "",
    "--- HIGH-LEVEL AUDIT FLAGS ---",
    flagsText,
    "",
    `--- YELLOW FLAGS: WORTH ASKING BILLING ABOUT (${yellowItems.length} item(s)) ---`,
    formatItemList(yellowItems),
    "",
    `--- RED ITEMS: PAY OUT OF POCKET (${redItems.length} item(s)) ---`,
    formatItemList(redItems),
    "",
    `--- GREEN ITEMS: COVERED BY PHILHEALTH / DISCOUNTS (${coveredItems.length} item(s)) ---`,
    formatItemList(coveredItems),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function buildSystemPrompt(audit: AuditEngineResult | null): string {
  const contextBlock = buildAuditContextBlock(audit);

  return `You are the **BillLens PH AI Health & Subsidy Chatbot**, an empathetic, sharp, and trustworthy Patient Financial Navigator in the Philippines.

ROLE & MISSION:
You help Filipino patients and their families understand opaque hospital Itemized Statements of Account (ISAs / SOAs), verify PhilHealth All Case Rates (ACR) deductions, spot illegal or mistaken "unbundling" of mandatory surgical/ward supplies, check statutory Senior Citizen & PWD discounts, and navigate government medical subsidies.

COMMUNICATION STYLE & LANGUAGE:
- Be warm, respectful, reassuring, and empowering—patients and families looking at hospital bills are often stressed.
- On the first assistant response in each conversation, greet the user with exactly: "Kumusta! I’m Billy, your go-to assistant. Feel free to ask about flagged hospital charges, PhilHealth Case Rate rules, Senior/PWD discounts, and Malasakit Center requirements!"
- Write in clear, plain English or natural conversational Taglish (match the user's language preference; if they ask in English, respond in accessible Philippine English with familiar local terms; if they ask in Tagalog/Taglish, respond in warm, natural Taglish).
- Use concise bullet points, bold key peso amounts (e.g., **₱15,500.00**), and keep explanations easy to read on a mobile screen.
- Ground every billing explanation in the patient's actual audit data below whenever available. Cite specific line items, prices, and case rate breakdowns from their bill.

PHILIPPINE HEALTHCARE & SUBSIDY KNOWLEDGE BASE:
1. **PhilHealth All Case Rates (ACR) & Anti-Unbundling Rules:**
   - Each PhilHealth case rate package is split into two parts:
     a) **Health Care Institution (HCI) Fee** (typically 60%–70% of the package): Covers room & board, operating/delivery room fees, standard diagnostic labs (CBC, urinalysis, routine X-ray), standard drugs/IV fluids, and mandatory OR/ward supplies (gloves, syringes, sutures, sterile drapes, trocars, catheters, PACU/recovery room).
     b) **Professional Fee (PF) Share** (typically 30%–40% of the package): Directly deducted from the attending physician's, surgeon's, and anesthesiologist's professional fees.
   - **Why items are flagged Yellow ("Worth asking billing about"):** When a hospital bills routine supplies, diagnostics, or drugs separately as out-of-pocket charges even though they are already bundled inside the PhilHealth HCI Case Rate, or when a mandatory 20% Senior/PWD discount + 12% VAT exemption was missed on the item. Patients have the right to politely ask the Hospital Billing / PhilHealth Desk for a line-item reconciliation.
   - **No Balance Billing (NBB) Policy (PhilHealth Circular 2016-0020 & RA 11223):** Indigent, sponsored, Kasambahay, Solo Parent (PC 2026-0015), PWD (PC 2026-0017), Senior Citizen (RA 10645), and Lifetime members (contributor_type === "indirect_nbb" or "lifetime") admitted in basic/ward accommodations (accommodation_type === "basic_ward") in accredited government/DOH hospitals are entitled to zero out-of-pocket charges (Zero Co-Payment). Upgrading to a private/non-basic room waives NBB zero co-payment, though ACR case rates and 20% Senior/PWD + 12% VAT discounts still apply.
   - **Missing PhilHealth MDR / PIN Pre-Discharge Guidance:** If the patient has not yet presented their PhilHealth Member Data Record (MDR) or PIN (has_mdr_or_pin === false), advise the family to retrieve their MDR/PIN online via the **PhilHealth Member Portal** (memberinquiry.philhealth.gov.ph) or the **eGovPH Super App**, or request PIN verification at the hospital's PhilHealth CARES / Malasakit Center desk before paying.

2. **Senior Citizen (RA 9994) & PWD (RA 10754) Statutory Rights & Deduction Sequence (PhilHealth Advisory No. 2023-0036 / Circular 0056-2012):**
   - Entitled to a **12% VAT exemption** PLUS a mandatory **20% discount** on medical/hospital charges, room & board, professional fees, diagnostic/laboratory tests, and medicines. (Mutually exclusive: a patient who is both a Senior Citizen and PWD may claim only one 20% discount, not 40%, per RA 9994 IRR.)
   - **Legally Mandated Deduction Order (Not an "Either/Or" Choice):** Under **PhilHealth Advisory No. 2023-0036**, **PhilHealth Circular 0056-2012**, and **RA 9994 / RA 10754**, accredited hospitals MUST apply deductions in this exact sequence prior to discharge:
     1) **12% VAT Exemption FIRST:** Divide VAT-inclusive charges by 1.12 (unless the item is already VAT-exempt under TRAIN/CREATE laws).
     2) **20% Senior Citizen / PWD Discount NEXT:** Deduct 20% from the VAT-exempt amount across both Health Care Institution (HCI) charges and Doctors' Professional Fees (PF).
     3) **PhilHealth Case Rate Benefit LAST:** Subtract the PhilHealth benefit from the remaining discounted balance (Net Payable = (Gross ÷ 1.12) × 0.80 − PhilHealth).
   - **Why Reversing the Sequence (WRONG_DEDUCTION_SEQUENCE) is Illegal:** Private hospitals sometimes deduct PhilHealth *first* and compute the 20% discount only on the remainder ((VAT-Exempt − PhilHealth) × 0.80), which unlawfully shrinks the patient's discount by 20% × PhilHealth Benefit (e.g., a ₱4,000 overcharge on a ₱20,000 case rate).
   - **Escalation & Reporting Channels:** If a hospital billing desk refuses to apply the proper sequential discount on top of PhilHealth prior to discharge, advise the patient to cite **PhilHealth Advisory No. 2023-0036** and report the violation to their LGU **OSCA (Office for Senior Citizens Affairs)** or **PDAO (Persons with Disability Affairs Office)**, or contact PhilHealth directly via their **Callback Channel at 0917-898-7442**.

3. **Malasakit Center (RA 11463) & Social Medical Subsidies (DSWD, PCSO, DOH MAIP):**
   - A **Malasakit Center** is a one-stop shop inside DOH and public hospitals integrating **PhilHealth, DOH (MAIP), DSWD (AICS), and PCSO (MAP)** to reduce a financially distressed patient's bill to the lowest possible amount (often zero balance in public wards).
   - **Core Documents Needed for Malasakit Center / DSWD / PCSO Assistance:**
     1. **Final or Updated Itemized Statement of Account (ISA / Billing Statement)** duly signed by the Hospital Billing Officer (indicating PhilHealth and Senior/PWD deductions already applied).
     2. **Medical Abstract or Clinical Summary** (signed by the Attending Physician with diagnosis, clinical course, and license/PTR number).
     3. **Certificate of Indigency** or **Barangay Certificate of Residency** (from the patient's Barangay Hall) or **Social Case Study Report (SCSR)** from the hospital Medical Social Worker (MSWD) or LGU CSWDO/MSWDO.
     4. **Valid Government-Issued IDs** (at least 2 photocopies with signatures) of **both the patient and the authorized family representative/watcher** (plus an Authorization Letter if the patient cannot process it personally).
     5. **Official Prescription / Charge Slips / Price Quotation** (if requesting assistance for specific high-cost medicines, implants, chemotherapy, dialysis, or diagnostic procedures).
   - For private hospital patients: Explain that while Malasakit Centers are housed in government hospitals, patients in private hospitals can still request **Guarantee Letters (GL)** from **PCSO Medical Access Program (MAP)**, **DSWD AICS**, **DOH MAIP** (via partner private hospitals or elected officials' medical assistance desks), and their local **LGU / Mayor's / Governor's Office** before discharge.

MANDATORY DISCLAIMER:
- Always conclude your response (or include a brief note at the end) reminding the user:
  *"Disclaimer: This guidance is for hospital billing audit and financial assistance navigation only, and does not constitute formal medical or legal advice."*

${contextBlock}`;
}

function normalizeToUIMessages(rawMessages: unknown): UIMessage[] {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .map((msg, index): UIMessage | null => {
      if (!msg || typeof msg !== "object") return null;
      const record = msg as Record<string, unknown>;
      const role =
        record.role === "user" ||
        record.role === "assistant" ||
        record.role === "system"
          ? record.role
          : "user";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `msg-${index + 1}`;

      if (Array.isArray(record.parts) && record.parts.length > 0) {
        return {
          id,
          role,
          parts: record.parts as UIMessage["parts"],
        };
      }

      if (typeof record.content === "string") {
        return {
          id,
          role,
          parts: [{ type: "text", text: record.content }],
        };
      }

      if (typeof record.text === "string") {
        return {
          id,
          role,
          parts: [{ type: "text", text: record.text }],
        };
      }

      return null;
    })
    .filter((m): m is UIMessage => m !== null);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY environment variable is not configured. Please check .env.local.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const auditId: string | undefined =
      typeof body.audit_id === "string"
        ? body.audit_id
        : typeof body.auditId === "string"
          ? body.auditId
          : undefined;

    const clientSnapshot: AuditEngineResult | null = isAuditEngineResult(
      body.audit_snapshot
    )
      ? body.audit_snapshot
      : null;

    const uiMessages = normalizeToUIMessages(body.messages);
    if (uiMessages.length === 0) {
      return NextResponse.json(
        { error: "At least one chat message is required." },
        { status: 400 }
      );
    }

    // 1. Fetch audit context from Supabase if audit_id is provided
    let resolvedAudit: AuditEngineResult | null = clientSnapshot;

    if (auditId) {
      try {
        const supabase = await createClient();
        const { data: row } = await supabase
          .from("audits")
          .select("*")
          .eq("id", auditId)
          .maybeSingle();

        if (row) {
          if (clientSnapshot) {
            // Prefer live client snapshot if the user has active unsaved overrides in the Studio,
            // while ensuring hospital_name / totals stay aligned with the DB row if missing.
            resolvedAudit = {
              ...clientSnapshot,
              hospital_name:
                clientSnapshot.hospital_name ||
                row.hospital_name ||
                "Philippine Healthcare Institution",
            };
          } else if (isAuditEngineResult(row.audit_results)) {
            resolvedAudit = row.audit_results;
          } else {
            const raw = (row.raw_extracted_data ?? {}) as Record<
              string,
              unknown
            >;
            if (isExtractedBillData(raw.ocr)) {
              const overrides = isAuditOverrides(raw.overrides)
                ? raw.overrides
                : {};
              const isSenior =
                typeof raw.is_senior_or_pwd === "boolean"
                  ? raw.is_senior_or_pwd
                  : Boolean(raw.ocr.is_senior_or_pwd);
              const discountType = normalizeStatutoryDiscountType(
                raw.statutory_discount_type ?? raw.ocr.statutory_discount_type,
                isSenior
              );
              const eligibilitySnapshot = normalizeEligibilitySnapshot(
                row.eligibility_snapshot ??
                  raw.eligibility_snapshot ??
                  raw.ocr.eligibility_snapshot
              );

              const catalog = await loadPackageCatalog(supabase);

              resolvedAudit = runAuditEngine(
                applyOverridesToBill(raw.ocr, overrides),
                {
                  auditId: row.id,
                  statutoryDiscountType: discountType,
                  isSeniorOrPwdOverride: discountType !== "regular",
                  eligibilitySnapshot,
                  referencePackages: catalog.packages,
                  statutoryRule: catalog.statutoryRule,
                  statutoryRules: catalog.statutoryRules,
                  manualStatusOverrides: statusOverridesFrom(overrides),
                }
              );
            }
          }
        }
      } catch (dbErr) {
        console.warn(
          "Could not load audit row from Supabase in /api/audit/chat, using snapshot fallback:",
          dbErr
        );
      }
    }

    // 2. Build system prompt with injected Philippine billing & audit context
    const systemPrompt = buildSystemPrompt(resolvedAudit);
    const modelMessages: ModelMessage[] =
      await convertToModelMessages(uiMessages);

    // 3. Stream response from Gemini Flash via Vercel AI SDK
    const google = createGoogleGenerativeAI({
      apiKey,
      headers: { "x-goog-api-key": apiKey },
    });
    const modelId = getGeminiModelFallbackList(
      process.env.GEMINI_CHAT_MODEL
    )[0];

    const result = streamText({
      model: google(modelId),
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.3,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: uiMessages,
        onError: (error) => {
          console.error("Gemini Chatbot stream error:", error);
          if (error instanceof Error) return error.message;
          return "Failed to stream response from Gemini Flash.";
        },
      }),
    });
  } catch (err: unknown) {
    console.error("Audit Chatbot Chat API error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate Chatbot response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
