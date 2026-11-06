import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import type { AuditEngineResult } from "@/types/audit";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierLabel(status: string): string {
  switch (status) {
    case "covered":
      return "🟢 Covered";
    case "review_worthy":
      return "🟡 Review-worthy";
    case "out_of_pocket":
      return "🔴 Out-of-pocket";
    default:
      return status;
  }
}

function buildAuditContext(audit: AuditEngineResult): string {
  const greenItems = audit.line_items.filter((i) => i.status === "covered");
  const yellowItems = audit.line_items.filter(
    (i) => i.status === "review_worthy"
  );
  const redItems = audit.line_items.filter(
    (i) => i.status === "out_of_pocket"
  );

  const formatItems = (items: typeof audit.line_items) =>
    items
      .map(
        (i) =>
          `  - ${i.description} (${i.category}): ₱${i.total_amount.toLocaleString()}` +
          (i.flag_reason ? ` — Flag: ${i.flag_reason}` : "") +
          (i.suggested_deduction
            ? ` — Suggested deduction: ₱${i.suggested_deduction.toLocaleString()}`
            : "")
      )
      .join("\n");

  const pkgInfo =
    audit.detected_case_packages.length > 0
      ? audit.detected_case_packages
          .map(
            (p) =>
              `  • ${p.keyword} (${p.code}): Total rate ₱${p.total_rate.toLocaleString()} (HCI ₱${p.hci_fee.toLocaleString()} + PF ₱${p.prof_fee.toLocaleString()})\n    Inclusive items: ${p.inclusive_items.join(", ") || "N/A"}`
          )
          .join("\n")
      : "  No PhilHealth case package was matched to this bill.";

  const flagsSummary =
    audit.flags.length > 0
      ? audit.flags
          .map(
            (f) =>
              `  ⚠ [${f.severity.toUpperCase()}] ${f.title}: ${f.description}` +
              (f.potential_savings
                ? ` (potential savings: ₱${f.potential_savings.toLocaleString()})`
                : "")
          )
          .join("\n")
      : "  No additional flags.";

  return `
=== AUDIT CONTEXT (ID: ${audit.audit_id}) ===

Hospital: ${audit.hospital_name}
${audit.patient_name ? `Patient: ${audit.patient_name}` : ""}
${audit.statement_number ? `Statement #: ${audit.statement_number}` : ""}

FINANCIAL SUMMARY:
  Gross total billed:        ₱${audit.gross_total.toLocaleString()}
  Hospital asks (out-of-pocket): ₱${audit.actual_out_of_pocket.toLocaleString()}
  PhilHealth coverage total: ₱${audit.philhealth_coverage_total.toLocaleString()}
  Senior/PWD savings:        ₱${audit.senior_pwd_savings.toLocaleString()}
  Disputed overcharges:      ₱${audit.disputed_overcharge_total.toLocaleString()}
  Fair out-of-pocket:        ₱${audit.fair_out_of_pocket.toLocaleString()}

MATCHED PHILHEALTH CASE PACKAGES:
${pkgInfo}

AUDIT FLAGS:
${flagsSummary}

NEGOTIATION BRIEF:
  ${audit.negotiation_brief_summary}

LINE ITEMS BY STATUS:

${tierLabel("covered")} Items (${greenItems.length}):
${greenItems.length > 0 ? formatItems(greenItems) : "  None"}

${tierLabel("review_worthy")} Items (${yellowItems.length}):
${yellowItems.length > 0 ? formatItems(yellowItems) : "  None"}

${tierLabel("out_of_pocket")} Items (${redItems.length}):
${redItems.length > 0 ? formatItems(redItems) : "  None"}

=== END AUDIT CONTEXT ===
`.trim();
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are BillLens Copilot, a warm and empathetic AI financial navigator for Filipino patients and their families. You help people understand their hospital bills, PhilHealth coverage, and financial assistance options in the Philippines.

CORE BEHAVIOR:
- Speak in clear, accessible language. Default to conversational Taglish (Tagalog-English mix) when the user writes in Filipino, otherwise use plain English.
- When explaining billing items, be specific — reference the actual line items, amounts, and flags from the audit context provided.
- Be empathetic and reassuring. Many patients are stressed about medical costs.
- Always be practical and action-oriented: give step-by-step instructions when advising on what to do.

KNOWLEDGE AREAS:
1. **PhilHealth Case Rate Rules**: Explain what the case rate package covers, what "inclusive items" means (drugs, labs, supplies bundled into the HCI fee are NOT supposed to be billed separately), and what the HCI vs Professional Fee split means.
2. **Unbundling / Overcharges**: If items are flagged yellow or red, explain in plain terms why they may be overcharged. Example: "This lab test is already included in your case rate package — the hospital should not be charging you extra for it."
3. **Senior Citizen / PWD Discounts**: RA 9994 (Senior Citizens Act) mandates a 20% discount and 12% VAT exemption on medical services. RA 10754 extends similar benefits to PWDs. Explain eligibility and how to verify the discount was applied.
4. **Malasakit Center Assistance**: Provide detailed, actionable guidance:
   - What it is: A one-stop shop in DOH-licensed hospitals that consolidates government financial assistance (DSWD AICS, PCSO, DOH MAP, PhilHealth).
   - Requirements: Valid government ID, clinical abstract/medical certificate, itemized billing statement/SOA, Certificate of Indigency from barangay (if applicable), PhilHealth MDR/member data record.
   - Process: Go to the Malasakit Center desk (usually near the billing department), submit documents, they assess and consolidate assistance from multiple agencies.
   - Typical coverage: Can reduce or eliminate remaining balance after PhilHealth for qualified indigent patients.
5. **PCSO / DSWD / DOH Medical Assistance**:
   - PCSO: Accepts walk-in or by mail. Requirements: Medical abstract, doctor's prescription, billing statement, 2 valid IDs, barangay certificate of indigency.
   - DSWD AICS: Crisis Intervention assistance for medical needs. Bring SOA, clinical abstract, valid ID, barangay certificate.
   - DOH MAP (Medical Assistance Program): Available at DOH regional offices and select hospitals.
6. **Hospital Bill Disputes**: Guide patients on how to:
   - Request an itemized breakdown from the billing department.
   - Identify and challenge specific line items that were already included in the PhilHealth case rate.
   - File a complaint with PhilHealth if the hospital refuses to correct unbundled charges.
   - Contact the hospital's Patient Relations or Social Services department.

RESPONSE FORMAT:
- Keep responses focused and scannable. Use bullet points and bold for key information.
- For amounts, always format as ₱XX,XXX.XX.
- When referencing specific bill items, cite them by name and category.
- If you don't know something specific to the patient's situation, say so honestly and suggest where they can get the exact answer.

DISCLAIMER (include naturally at the end of relevant responses, don't repeat it every message):
"_Paalala: Ang mga sagot ko ay para sa billing/financial guidance lamang at hindi po ito medical advice. Para sa mga medikal na katanungan, kumonsulta po sa inyong doktor._"

You have the full audit context below. Use it to give specific, personalized answers about this patient's bill.
`;

// ---------------------------------------------------------------------------
// POST handler — streaming chat
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, auditId } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Missing messages array." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!auditId) {
      return new Response(
        JSON.stringify({ error: "Missing auditId parameter." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Authenticate ─────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "You must be signed in to use Copilot." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Fetch audit record ───────────────────────────────────────────────
    const { data: auditRow, error: fetchErr } = await supabase
      .from("audits")
      .select("audit_results, hospital_name, total_billed, estimated_out_of_pocket")
      .eq("id", auditId)
      .maybeSingle();

    if (fetchErr || !auditRow) {
      return new Response(
        JSON.stringify({
          error: fetchErr?.message || "Audit record not found.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build context string from persisted audit_results
    let auditContext = "";
    const auditResults = auditRow.audit_results as Record<string, Json | undefined> | null;

    if (
      auditResults &&
      typeof auditResults === "object" &&
      Array.isArray((auditResults as unknown as AuditEngineResult).line_items)
    ) {
      auditContext = buildAuditContext(auditResults as unknown as AuditEngineResult);
    } else {
      // Minimal fallback context
      auditContext = [
        `Hospital: ${auditRow.hospital_name}`,
        `Total billed: ₱${(auditRow.total_billed ?? 0).toLocaleString()}`,
        `Estimated out-of-pocket: ₱${(auditRow.estimated_out_of_pocket ?? 0).toLocaleString()}`,
        "(Detailed line-item data is not yet available — the bill may not have been analyzed yet.)",
      ].join("\n");
    }

    // ── Configure Gemini via Vercel AI SDK ────────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI service is not configured." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const modelName =
      process.env.GEMINI_CHAT_MODEL?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-2.5-flash";

    // ── Stream the response ──────────────────────────────────────────────
    const result = streamText({
      model: google(modelName),
      system: `${SYSTEM_PROMPT}\n\n${auditContext}`,
      messages,
      temperature: 0.4,
      maxTokens: 2048,
    });

    return result.toDataStreamResponse();
  } catch (err) {
    console.error("Audit Copilot chat error:", err);
    const message =
      err instanceof Error ? err.message : "Internal chat processing error.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

