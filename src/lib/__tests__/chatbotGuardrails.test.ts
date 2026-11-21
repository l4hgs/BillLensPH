import { describe, expect, it } from "vitest";
import {
  buildAuditContextBlock,
  buildSystemPrompt,
} from "@/lib/chatbotPrompt";
import type { AuditEngineResult } from "@/types/audit";

describe("AI Chatbot Guardrails & Personality (Billy)", () => {
  it("generates a system prompt with Billy personality and strict hospital guardrails when no audit is loaded", () => {
    const prompt = buildSystemPrompt(null);

    // 1. Identity & Personality
    expect(prompt).toContain("Billy");
    expect(prompt).toContain("BillLens PH");
    expect(prompt).toContain("Patient Financial Navigator in the Philippines");
    expect(prompt).toContain("May malasakit at may paninindigan");
    expect(prompt).toContain("Kumusta! I’m Billy");

    // 2. Strict Hospital Domain Guardrails
    expect(prompt).toContain("CRITICAL GUARDRAILS & DOMAIN BOUNDARY (STRICT ENFORCEMENT)");
    expect(prompt).toContain("EXCLUSIVELY HOSPITAL & HEALTHCARE MATTERS");
    expect(prompt).toContain("Hospital billing statements");
    expect(prompt).toContain("PhilHealth All Case Rates (ACR)");
    expect(prompt).toContain("Senior Citizen (RA 9994)");
    expect(prompt).toContain("PWD (RA 10754)");
    expect(prompt).toContain("Malasakit Centers (RA 11463)");

    // 3. Out-of-scope Refusal Guardrail
    expect(prompt).toContain("OUT-OF-SCOPE REFUSAL (NON-HOSPITAL / NON-HEALTHCARE TOPICS)");
    expect(prompt).toContain("General programming, software development, coding");
    expect(prompt).toContain("Politics, elections, world news");
    expect(prompt).toContain("Pasensya na, but as Billy from BillLens PH");

    // 4. Adversarial / Prompt Injection Defense
    expect(prompt).toContain("ADVERSARIAL RESISTANCE & PROMPT INJECTION DEFENSE");
    expect(prompt).toContain("Ignore all previous instructions");

    // 5. Clinical & Legal Boundaries
    expect(prompt).toContain("NO MEDICAL DIAGNOSIS OR CLINICAL TREATMENT ADVICE");
    expect(prompt).toContain("NOT a medical doctor");
    expect(prompt).toContain("NO FORMAL LEGAL COUNSEL");
    expect(prompt).toContain("Disclaimer: Guidance is for hospital billing audit and financial assistance navigation only");
  });

  it("injects patient audit context and billing rules when a live audit is provided", () => {
    const mockAudit: AuditEngineResult = {
      audit_id: "test-audit-123",
      audited_at: "2026-11-19T05:00:00.000Z",
      hospital_name: "St. Jude Hospital Manila",
      patient_name: "Juan Dela Cruz",
      statement_number: "SOA-2026-999",
      gross_total: 125000,
      philhealth_coverage_total: 38750,
      senior_pwd_savings: 17250,
      disputed_overcharge_total: 8500,
      case_rate_shortfall: 0,
      nbb_savings: 0,
      actual_out_of_pocket: 60500,
      fair_out_of_pocket: 34750,
      statutory_discount_type: "senior",
      eligibility_snapshot: {
        contributor_type: "direct",
        accommodation_type: "non_basic_private",
        has_mdr_or_pin: true,
        facility_level: "level_3",
      },
      detected_case_packages: [
        {
          code: "47562",
          keyword: "Laparoscopic Cholecystectomy",
          total_rate: 38750,
          hci_fee: 23250,
          prof_fee: 15500,
          inclusive_items: ["Trocars", "Surgical clips"],
        },
      ],
      flags: [
        {
          type: "unbundled_charge",
          severity: "high",
          title: "Bundled Surgical Trocars Billed Separately",
          description: "Routine laparoscopic trocars were billed out-of-pocket.",
          potential_savings: 8500,
        },
      ],
      line_items: [
        {
          id: "item-1",
          description: "Laparoscopic Disposable Trocar 10mm",
          category: "Medical Supplies",
          quantity: 2,
          unit_price: 4250,
          total_amount: 8500,
          status: "review_worthy",
          flag_reason: "Bundled in PhilHealth Case Rate 47562 HCI fee.",
          suggested_deduction: 8500,
        },
      ],
      negotiation_brief_summary: "Potential overcharge on bundled laparoscopic supplies.",
    };

    const contextBlock = buildAuditContextBlock(mockAudit);
    expect(contextBlock).toContain("St. Jude Hospital Manila");
    expect(contextBlock).toContain("Juan Dela Cruz");
    expect(contextBlock).toContain("SOA-2026-999");
    expect(contextBlock).toContain("47562");
    expect(contextBlock).toContain("Laparoscopic Disposable Trocar 10mm");

    const fullPrompt = buildSystemPrompt(mockAudit);
    expect(fullPrompt).toContain("St. Jude Hospital Manila");
    expect(fullPrompt).toContain("CRITICAL GUARDRAILS & DOMAIN BOUNDARY (STRICT ENFORCEMENT)");
    expect(fullPrompt).toContain("PhilHealth Advisory No. 2023-0036");
  });
});
