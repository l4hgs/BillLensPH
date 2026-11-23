import { describe, expect, it } from "vitest";
import {
  normalizeStatutoryDiscountType,
  runAuditEngine,
} from "@/lib/auditEngine";
import {
  detectVatExemptFromDescription,
  GEMINI_FLASH_MODELS,
  getGeminiModelFallbackList,
  mergeExtractedBills,
  sanitizeExtractedBill,
} from "@/lib/gemini";
import {
  bestPackageForDiagnosis,
  findMatchingAlias,
} from "@/lib/itemMatcher";
import {
  normalizeSeedPackage,
  parseCatalogCsv,
  selectActivePackagesForDate,
  selectStatutoryRuleForDate,
  toCatalogPackage,
} from "@/lib/packageCatalog";
import {
  ensureBillPackagesInCatalog,
  hasCatalogMatchForBill,
} from "@/lib/caseRateDiscovery";
import { buildPlainTextNegotiationBrief } from "@/components/audit/NegotiationBriefDocument";
import type {
  CatalogPackage,
  ExtractedBillData,
  StatutoryRule,
} from "@/types/audit";

const CHOLE_PACKAGE_2024_LATE: CatalogPackage = toCatalogPackage(
  {
    case_code: "47562",
    procedure_keyword: "Laparoscopic Cholecystectomy",
    hci_fee: 23250,
    prof_fee: 15500,
    total_case_rate: 38750,
    inclusive_items: [
      "Standard surgical trocars and cannulas",
      "Endoscopic surgical clips",
      "Post-anesthesia care unit (PACU) recovery room charges",
    ],
    circular_id: "2024-0037",
    effective_from: "2024-10-01",
    effective_to: null,
  },
  [
    { alias: "trocar", kind: "token" },
    { alias: "endoscopic clip", kind: "token" },
    { alias: "titanium clip", kind: "token" },
    { alias: "pacu", kind: "token" },
  ]
);

const CHOLE_PACKAGE_2024_EARLY: CatalogPackage = toCatalogPackage(
  {
    case_code: "47562",
    procedure_keyword: "Laparoscopic Cholecystectomy",
    hci_fee: 18600,
    prof_fee: 12400,
    total_case_rate: 31000,
    inclusive_items: ["Standard surgical trocars and cannulas"],
    circular_id: "2024-0001",
    effective_from: "2024-01-01",
    effective_to: "2024-09-30",
  },
  [{ alias: "trocar", kind: "token" }]
);

const APPENDECTOMY_PACKAGE: CatalogPackage = toCatalogPackage(
  {
    case_code: "44970",
    procedure_keyword: "Laparoscopic Appendectomy",
    hci_fee: 18000,
    prof_fee: 12000,
    total_case_rate: 30000,
    inclusive_items: ["Standard surgical trocars", "Endoloop"],
    circular_id: "2024-0037",
    effective_from: "2024-10-01",
    effective_to: null,
  },
  [
    { alias: "trocar", kind: "token" },
    { alias: "endoloop", kind: "token" },
  ]
);

const CATALOG: CatalogPackage[] = [
  CHOLE_PACKAGE_2024_LATE,
  CHOLE_PACKAGE_2024_EARLY,
  APPENDECTOMY_PACKAGE,
];

describe("Normalized token & alias matcher (itemMatcher)", () => {
  it("flags specific supply tokens (singular & plural) but never generic >4-char words", () => {
    const aliases = CHOLE_PACKAGE_2024_LATE.aliases;

    expect(
      findMatchingAlias("Disposable Surgical Trocars (2 pcs)", aliases)?.alias
    ).toBe("trocar");

    // Regression guard: under the old `word.length > 4` rule, both "standard"
    // and "surgical" matched "Standard surgical trocars and cannulas".
    expect(
      findMatchingAlias("Standard Surgical Consult Fee", aliases)
    ).toBeUndefined();
    expect(
      findMatchingAlias("Routine Operating Room Nursing Care", aliases)
    ).toBeUndefined();
  });

  it("picks Laparoscopic Appendectomy over Laparoscopic Cholecystectomy when given full diagnosis", () => {
    const match = bestPackageForDiagnosis(
      "Acute Appendicitis - Laparoscopic Appendectomy",
      [CHOLE_PACKAGE_2024_LATE, APPENDECTOMY_PACKAGE]
    );
    expect(match?.code).toBe("44970");
  });
});

describe("Golden fixture bills (runAuditEngine)", () => {
  it("1. Flags unbundled mandatory supply while leaving unrelated lines unflagged", () => {
    const bill: ExtractedBillData = {
      hospital_name: "The Medical City",
      case_rate_codes_detected: ["47562"],
      discharge_date: "2026-10-12",
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Laparoscopic Trocar Port & Titanium Clip Set",
          category: "Medical Supplies",
          quantity: 1,
          unit_price: 14200,
          total_amount: 14200,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 14200,
        },
        {
          id: "item-2",
          description: "Standard Surgical Consult & Ward Kit",
          category: "Miscellaneous",
          quantity: 1,
          unit_price: 2500,
          total_amount: 2500,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 2500,
        },
      ],
      gross_total: 55450,
      philhealth_total: 38750,
      senior_pwd_discount_total: 0,
      net_balance_due: 16700,
    };

    const res = runAuditEngine(bill, {
      auditId: "test-unbundled",
      referencePackages: CATALOG,
    });

    const item1 = res.line_items.find((i) => i.id === "item-1");
    const item2 = res.line_items.find((i) => i.id === "item-2");

    expect(item1?.status).toBe("review_worthy");
    expect(item1?.is_unbundled_overcharge).toBe(true);
    expect(item2?.status).toBe("out_of_pocket");
    expect(item2?.is_unbundled_overcharge).toBe(false);
    expect(res.disputed_overcharge_total).toBe(14200);
    expect(res.fair_out_of_pocket).toBe(2500);
  });

  it("2. Flags under-deducted PhilHealth HCI and PF case rate buckets separately", () => {
    const bill: ExtractedBillData = {
      hospital_name: "St. Luke's Medical Center",
      case_rate_codes_detected: ["47562"],
      discharge_date: "2026-10-12",
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Operating Room & Ward Accommodation",
          category: "Room & Board",
          quantity: 1,
          unit_price: 30000,
          total_amount: 30000,
          philhealth_deducted: 15000, // Short of 23,250 HCI cap
          discount_applied: 0,
          balance: 15000,
        },
        {
          id: "item-2",
          description: "General Surgeon Professional Fee",
          category: "Professional Fees",
          quantity: 1,
          unit_price: 20000,
          total_amount: 20000,
          philhealth_deducted: 10000, // Short of 15,500 PF cap
          discount_applied: 0,
          balance: 10000,
        },
      ],
      gross_total: 50000,
      philhealth_total: 25000,
      senior_pwd_discount_total: 0,
      net_balance_due: 25000,
    };

    const res = runAuditEngine(bill, {
      auditId: "test-under-deducted",
      referencePackages: CATALOG,
    });

    const excessFlags = res.flags.filter((f) => f.type === "excess_hci_charge");
    expect(excessFlags.length).toBe(2);
    expect(
      excessFlags.some((f) => f.title.includes("HCI Facility Fee"))
    ).toBe(true);
    expect(
      excessFlags.some((f) => f.title.includes("Professional Fee (PF)"))
    ).toBe(true);
    // HCI shortfall (23,250 - 15,000 = 8,250) + PF shortfall (15,500 - 10,000 = 5,500) = 13,750
    // Fair out-of-pocket drops from 25,000 due by the 13,750 HCI+PF gap to 11,250
    expect(res.case_rate_shortfall).toBe(13750);
    expect(res.fair_out_of_pocket).toBe(11250);
  });

  it("3. Flags missed Senior/PWD statutory discount and honors parameterized statutory_rules", () => {
    const bill: ExtractedBillData = {
      hospital_name: "Cardinal Santos Medical Center",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      line_items: [
        {
          id: "item-1",
          description: "Comprehensive Metabolic Panel & Chest CT",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 11200,
          total_amount: 11200,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 11200,
        },
      ],
      gross_total: 11200,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 11200,
    };

    // Under NIRC Sec. 109(G) (RA 10963), Laboratory/Diagnostics is already VAT-exempt -> straight 20% = 2,240 relief
    const standardRes = runAuditEngine(bill, {
      auditId: "test-senior-default",
      referencePackages: CATALOG,
    });
    expect(standardRes.line_items[0].status).toBe("review_worthy");
    expect(standardRes.senior_pwd_savings).toBeCloseTo(2240, 2);

    // Custom statutory rule from DB (e.g. 25% discount rate)
    const customRule: StatutoryRule = {
      rule_code: "SENIOR_PWD",
      label: "Updated Circular Relief",
      vat_divisor: 1.12,
      discount_rate: 0.25,
      incomplete_threshold: 0.8,
      eligible_categories: ["Laboratory/Diagnostics"],
      citation: "RA 9994 Updated Circular",
    };
    const customRes = runAuditEngine(bill, {
      auditId: "test-senior-custom",
      referencePackages: CATALOG,
      statutoryRule: customRule,
    });
    // 11,200 * 25% = 2,800 relief on VAT-exempt diagnostic service
    expect(customRes.senior_pwd_savings).toBeCloseTo(2800, 2);
  });

  it("4. Classifies fully covered lines as green ('covered') with zero flags", () => {
    const bill: ExtractedBillData = {
      hospital_name: "Makati Medical Center",
      case_rate_codes_detected: ["44970"],
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Surgical Ward Accommodation (2 Days)",
          category: "Room & Board",
          quantity: 2,
          unit_price: 3500,
          total_amount: 7000,
          philhealth_deducted: 7000,
          discount_applied: 0,
          balance: 0,
        },
      ],
      gross_total: 7000,
      philhealth_total: 30000,
      senior_pwd_discount_total: 0,
      net_balance_due: 0,
    };

    const res = runAuditEngine(bill, {
      auditId: "test-covered",
      referencePackages: CATALOG,
    });

    expect(res.line_items[0].status).toBe("covered");
    expect(res.flags).toHaveLength(0);
    expect(res.fair_out_of_pocket).toBe(0);
  });

  it("5. Leaves unmatched diagnosis without false package matches and emits compliance note when catalog is empty", () => {
    const bill: ExtractedBillData = {
      hospital_name: "Provincial General Hospital",
      case_rate_codes_detected: [],
      diagnosis_or_procedure: "Observation for Minor Viral Exanthem",
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Outpatient Consultation Fee",
          category: "Professional Fees",
          quantity: 1,
          unit_price: 1500,
          total_amount: 1500,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 1500,
        },
      ],
      gross_total: 1500,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 1500,
    };

    const withCatalog = runAuditEngine(bill, {
      auditId: "test-unmatched",
      referencePackages: CATALOG,
    });
    expect(withCatalog.detected_case_packages).toHaveLength(0);
    expect(withCatalog.flags).toHaveLength(0);

    const emptyCatalog = runAuditEngine(bill, {
      auditId: "test-empty-catalog",
      referencePackages: [],
    });
    expect(
      emptyCatalog.flags.some(
        (f) =>
          f.type === "compliance_note" &&
          f.title.includes("PhilHealth package catalog unavailable")
      )
    ).toBe(true);
  });
});

describe("Versioned packages & Multi-page OCR merge", () => {
  it("selects the package version active on admission/discharge date and falls back to latest when date is absent", () => {
    const earlySelected = selectActivePackagesForDate(CATALOG, "2024-06-15");
    const early47562 = earlySelected.find((p) => p.code === "47562");
    expect(early47562?.total_rate).toBe(31000);
    expect(early47562?.circular_id).toBe("2024-0001");

    const lateSelected = selectActivePackagesForDate(CATALOG, "2026-10-12");
    const late47562 = lateSelected.find((p) => p.code === "47562");
    expect(late47562?.total_rate).toBe(38750);
    expect(late47562?.circular_id).toBe("2024-0037");

    const nullDateSelected = selectActivePackagesForDate(CATALOG, undefined);
    const default47562 = nullDateSelected.find((p) => p.code === "47562");
    expect(default47562?.total_rate).toBe(38750);
  });

  it("merges a 3-page SOA without dropping pages 2-3 and prefixes page2/page3 line IDs", () => {
    const page1: ExtractedBillData = {
      hospital_name: "St. Luke's Medical Center - BGC",
      patient_name: "JUAN DELA CRUZ",
      statement_number: "SOA-991",
      case_rate_codes_detected: ["93458"],
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Telemetry Room",
          category: "Room & Board",
          quantity: 1,
          unit_price: 10000,
          total_amount: 10000,
          balance: 10000,
        },
      ],
      gross_total: 10000,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 10000,
    };

    const page2: ExtractedBillData = {
      hospital_name: "Philippine Healthcare Institution",
      case_rate_codes_detected: [],
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Introducer Sheath & Catheter",
          category: "Medical Supplies",
          quantity: 1,
          unit_price: 8000,
          total_amount: 8000,
          balance: 8000,
        },
      ],
      gross_total: 8000,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 8000,
    };

    const page3: ExtractedBillData = {
      hospital_name: "Philippine Healthcare Institution",
      case_rate_codes_detected: ["92920"],
      is_senior_or_pwd: true,
      line_items: [
        {
          id: "item-1",
          description: "Cardiologist Professional Fee",
          category: "Professional Fees",
          quantity: 1,
          unit_price: 22000,
          total_amount: 22000,
          balance: 22000,
        },
      ],
      gross_total: 40000,
      philhealth_total: 15000,
      senior_pwd_discount_total: 0,
      net_balance_due: 25000,
    };

    const merged = mergeExtractedBills([page1, page2, page3]);

    expect(merged.hospital_name).toBe("St. Luke's Medical Center - BGC");
    expect(merged.case_rate_codes_detected).toEqual(["93458", "92920"]);
    expect(merged.is_senior_or_pwd).toBe(true);
    expect(merged.line_items.map((i) => i.id)).toEqual([
      "item-1",
      "page2-item-1",
      "page3-item-1",
    ]);
    expect(merged.gross_total).toBe(40000);
    expect(merged.net_balance_due).toBe(25000);
  });

  it("parses CSV and JSON circular rows into normalized versioned packages with aliases", () => {
    const csv = [
      "case_code,procedure_keyword,circular_id,effective_from,hci_fee,prof_fee,total_case_rate,inclusive_items,aliases",
      '66984,"Cataract Extraction with IOL",2024-0037,2024-10-01,10800,7200,18000,"Foldable IOL|Balanced Salt Solution","phaco|intraocular lens|iol|bss"',
      '92920,"Percutaneous Coronary Intervention",2024-0037,2024-10-01,54000,36000,90000,"Guiding catheter|PTCA balloon","ptca|balloon catheter|indeflator"',
    ].join("\n");

    const parsed = parseCatalogCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      case_code: "66984",
      procedure_keyword: "Cataract Extraction with IOL",
      circular_id: "2024-0037",
      effective_from: "2024-10-01",
      effective_to: null,
      source_url: null,
      hci_fee: 10800,
      prof_fee: 7200,
      total_case_rate: 18000,
      inclusive_items: ["Foldable IOL", "Balanced Salt Solution"],
      aliases: [
        { alias: "phaco", kind: "token" },
        { alias: "intraocular lens", kind: "token" },
        { alias: "iol", kind: "token" },
        { alias: "bss", kind: "token" },
      ],
    });

    const single = normalizeSeedPackage({
      code: "59510",
      keyword: "Cesarean Section Delivery",
      hciFee: 15600,
      profFee: 10400,
      inclusiveItems: ["Spinal needle", "Oxytocin"],
      aliases: ["spinal needle", "oxytocin"],
    });
    expect(single.total_case_rate).toBe(26000);
    expect(single.aliases).toHaveLength(2);
  });

  it("auto-discovers and merges unlisted PhilHealth packages when a bill diagnosis is not yet in the catalog", async () => {
    const bill: ExtractedBillData = {
      hospital_name: "Philippine General Hospital",
      primary_diagnosis: "Acute Pyelonephritis",
      case_rate_codes_detected: ["N10"],
      is_senior_or_pwd: false,
      line_items: [
        {
          id: "item-1",
          description: "Routine Urinalysis & CBC",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 950,
          total_amount: 950,
          balance: 950,
        },
        {
          id: "item-2",
          description: "Attending Physician Fee",
          category: "Professional Fees",
          quantity: 1,
          unit_price: 5000,
          total_amount: 5000,
          philhealth_deducted: 3600,
          balance: 1400,
        },
      ],
      gross_total: 15950,
      philhealth_total: 12000,
      senior_pwd_discount_total: 0,
      net_balance_due: 3950,
    };

    expect(hasCatalogMatchForBill(bill, CATALOG)).toBe(false);

    const { packages, discovered } = await ensureBillPackagesInCatalog(
      null,
      bill,
      CATALOG,
      async () => [
        normalizeSeedPackage({
          case_code: "N10",
          procedure_keyword: "Acute Pyelonephritis / Complicated UTI",
          circular_id: "2024-0037",
          effective_from: "2024-10-01",
          hci_fee: 8400,
          prof_fee: 3600,
          total_case_rate: 12000,
          inclusive_items: ["Routine urinalysis and CBC", "Standard IV fluids"],
          aliases: ["urinalysis", "cbc", "iv cannula"],
        }),
      ]
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0].code).toBe("N10");
    expect(discovered[0].is_verified).toBe(false);
    expect(hasCatalogMatchForBill(bill, packages)).toBe(true);

    const result = runAuditEngine(bill, {
      auditId: "fixture-autodiscover",
      referencePackages: packages,
    });

    expect(result.detected_case_packages[0]?.code).toBe("N10");
    expect(result.detected_case_packages[0]?.is_verified).toBe(false);
    expect(result.line_items[0].status).toBe("review_worthy");
    expect(result.disputed_overcharge_total).toBe(950);
  });

  it("flags WRONG_DEDUCTION_SEQUENCE when hospital subtracts PhilHealth before computing the 20% Senior/PWD discount (PhilHealth Advisory 2023-0036)", () => {
    // Exact audit_engine.md scenario:
    // Gross: ₱112,000 -> VAT-Exempt: ₱100,000 (saves ₱12,000 VAT).
    // Hospital wrongly deducts PhilHealth (₱20,000) first -> ₱80,000, then takes 20% discount (₱16,000) -> ₱64,000 due.
    // Legally mandated sequence: ₱100,000 - ₱20,000 (20% Senior) - ₱20,000 (PhilHealth) = ₱60,000 due (₱4,000 overcharge).
    const bill: ExtractedBillData = {
      hospital_name: "Private Tertiary Hospital",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      statutory_discount_type: "senior",
      line_items: [
        {
          id: "item-1",
          description: "Private Room & Hospital Care",
          category: "Room & Board",
          quantity: 1,
          unit_price: 112000,
          total_amount: 112000,
          philhealth_deducted: 20000,
          discount_applied: 28000, // 12,000 VAT + 16,000 reversed-order 20% discount (instead of 32,000)
          balance: 64000,
        },
      ],
      gross_total: 112000,
      philhealth_total: 20000,
      senior_pwd_discount_total: 28000,
      net_balance_due: 64000,
    };

    const res = runAuditEngine(bill, {
      auditId: "fixture-wrong-sequence",
      referencePackages: CATALOG,
      statutoryDiscountType: "senior",
    });

    const seqFlag = res.flags.find(
      (f) => f.type === "wrong_deduction_sequence"
    );
    expect(seqFlag).toBeDefined();
    expect(seqFlag?.severity).toBe("high");
    expect(seqFlag?.description).toContain("2023-0036");
    expect(seqFlag?.description).toContain("0917-898-7442");
    expect(res.senior_pwd_savings).toBeCloseTo(4000, 2);
    expect(res.fair_out_of_pocket).toBeCloseTo(60000, 2);
  });

  it("applies 20% discount without dividing by 1.12 on already VAT-exempt medicines (TRAIN/CREATE law)", () => {
    const bill: ExtractedBillData = {
      hospital_name: "Manila Doctors Hospital",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      statutory_discount_type: "pwd",
      line_items: [
        {
          id: "item-1",
          description: "Maintenance Antihypertensive Drug [VAT-Exempt]",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 5000,
          total_amount: 5000,
          is_vat_exempt: true,
          discount_applied: 0,
          balance: 5000,
        },
      ],
      gross_total: 5000,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 5000,
    };

    const res = runAuditEngine(bill, {
      auditId: "fixture-vat-exempt-drug",
      referencePackages: CATALOG,
    });

    expect(res.statutory_discount_type).toBe("pwd");
    expect(res.senior_pwd_savings).toBeCloseTo(1000, 2);
    expect(res.fair_out_of_pocket).toBeCloseTo(4000, 2);
  });

  it("explicitly cites RA 10754 and PDAO guidelines for PWD audits (never defaulting to RA 9994 / OSCA)", () => {
    const bill: ExtractedBillData = {
      hospital_name: "Chong Hua Hospital",
      patient_name: "ANA SANTOS",
      statement_number: "CHH-2026-102",
      case_rate_codes_detected: [],
      statutory_discount_type: "pwd",
      line_items: [
        {
          id: "item-1",
          description: "Private Room & Diagnostic Workup",
          category: "Room & Board",
          quantity: 1,
          unit_price: 11200,
          total_amount: 11200,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 11200,
        },
      ],
      gross_total: 11200,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 11200,
    };

    const pwdAudit = runAuditEngine(bill, {
      auditId: "fixture-pwd-citation",
      statutoryDiscountType: "pwd",
      referencePackages: CATALOG,
    });

    expect(pwdAudit.statutory_discount_type).toBe("pwd");
    const missingFlag = pwdAudit.flags.find(
      (f) => f.type === "missing_statutory_discount"
    );
    expect(missingFlag).toBeDefined();
    expect(missingFlag?.title).toContain("PWD (RA 10754)");
    expect(missingFlag?.description).toContain("RA 10754");
    expect(missingFlag?.description).toContain("PDAO");
    expect(missingFlag?.description).not.toContain("RA 9994");
    expect(pwdAudit.negotiation_brief_summary).toContain("RA 10754");
    expect(pwdAudit.negotiation_brief_summary).toContain("PDAO");
    expect(pwdAudit.negotiation_brief_summary).not.toContain("OSCA");

    const plainBrief = buildPlainTextNegotiationBrief(pwdAudit, {
      representativeName: "Ana Santos",
      relationship: "Patient",
      contactInfo: "0917-000-0000",
      preparedDate: "November 17, 2026",
      isSeniorOrPwd: true,
      statutoryDiscountType: "pwd",
    });
    expect(plainBrief).toContain("Republic Act No. 10754");
    expect(plainBrief).toContain("Persons with Disability Affairs Office (PDAO)");
    expect(plainBrief).not.toContain("Republic Act No. 9994");
    expect(normalizeStatutoryDiscountType("regular")).toBe("regular");
    expect(normalizeStatutoryDiscountType("none")).toBe("regular");
  });

  it("extracts is_vat_exempt on OCR line items with VX/VAT-exempt markers and statutory exempt drugs", () => {
    expect(detectVatExemptFromDescription("Losartan 50mg Tablet [VX]")).toBe(
      true
    );
    expect(
      detectVatExemptFromDescription("Metformin 500mg Film-Coated Tablet")
    ).toBe(true);
    expect(detectVatExemptFromDescription("Standard Sterile Gauze Pad")).toBe(
      false
    );

    const sanitized = sanitizeExtractedBill({
      hospital_name: "PGH",
      statutory_discount_type: "pwd",
      line_items: [
        {
          id: "raw-1",
          description: "Amlodipine 10mg Tab (VX)",
          category: "Drugs/Medicines",
          quantity: 10,
          unit_price: 50,
          total_amount: 500,
        },
        {
          id: "raw-2",
          description: "Private Ward Room Charge",
          category: "Room & Board",
          quantity: 1,
          unit_price: 5600,
          total_amount: 5600,
        },
      ],
      gross_total: 6100,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 6100,
    });

    expect(sanitized.line_items[0].is_vat_exempt).toBe(true);
    expect(sanitized.line_items[1].is_vat_exempt).toBe(false);

    const audit = runAuditEngine(sanitized, {
      auditId: "fixture-ocr-vat-exempt",
      statutoryDiscountType: "pwd",
      referencePackages: CATALOG,
    });
    // Item 1 (500 VAT-exempt drug): 20% discount = 100
    // Item 2 (5600 Room & Board — VAT-exempt hospital service under NIRC Sec. 109(G)): 20% discount = 1120
    // Total statutory savings = 100 + 1120 = 1220 -> Fair OOP = 6100 - 1220 = 4880
    expect(audit.senior_pwd_savings).toBeCloseTo(1220, 2);
    expect(audit.fair_out_of_pocket).toBeCloseTo(4880, 2);
  });

  it("selects statutory_rules by the bill's statement/discharge date and consolidates Gemini model fallbacks", () => {
    const rules: StatutoryRule[] = [
      {
        rule_code: "SENIOR_PWD",
        label: "Legacy 2016 Rule",
        vat_divisor: 1.12,
        discount_rate: 0.2,
        incomplete_threshold: 0.8,
        eligible_categories: ["Laboratory/Diagnostics"],
        citation: "RA 9994 / RA 10754 (2016 IRR)",
        effective_from: "2016-03-23",
        effective_to: "2024-12-31",
      },
      {
        rule_code: "SENIOR_PWD",
        label: "Updated 2025 Circular Rule",
        vat_divisor: 1.12,
        discount_rate: 0.25,
        incomplete_threshold: 0.8,
        eligible_categories: ["Laboratory/Diagnostics"],
        citation: "RA 9994 / RA 10754 (2025 Joint Circular)",
        effective_from: "2025-01-01",
        effective_to: null,
      },
    ];

    expect(selectStatutoryRuleForDate(rules, "2024-06-15")?.discount_rate).toBe(
      0.2
    );
    expect(selectStatutoryRuleForDate(rules, "2026-03-10")?.discount_rate).toBe(
      0.25
    );

    const bill2024: ExtractedBillData = {
      hospital_name: "Manila Doctors Hospital",
      discharge_date: "2024-06-15",
      case_rate_codes_detected: [],
      statutory_discount_type: "senior",
      line_items: [
        {
          id: "item-1",
          description: "Diagnostic Lab Panel",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 11200,
          total_amount: 11200,
          balance: 11200,
        },
      ],
      gross_total: 11200,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 11200,
    };

    const res2024 = runAuditEngine(bill2024, {
      auditId: "test-dated-rule-2024",
      statutoryDiscountType: "senior",
      statutoryRules: rules,
      referencePackages: CATALOG,
    });
    expect(res2024.senior_pwd_savings).toBeCloseTo(2240, 2);

    const res2026 = runAuditEngine(
      { ...bill2024, discharge_date: "2026-03-10" },
      {
        auditId: "test-dated-rule-2026",
        statutoryDiscountType: "senior",
        statutoryRules: rules,
        referencePackages: CATALOG,
      }
    );
    expect(res2026.senior_pwd_savings).toBeCloseTo(2800, 2);

    const fallbackModels = getGeminiModelFallbackList("gemini-custom-test");
    expect(fallbackModels[0]).toBe("gemini-custom-test");
    expect(fallbackModels).toContain(GEMINI_FLASH_MODELS[0]);
  });

  it("enforces No Balance Billing (NBB) Zero Co-Payment in basic/ward accommodation vs. private-room co-pay rules and MDR reminder", () => {
    const wardBill: ExtractedBillData = {
      hospital_name: "Philippine General Hospital",
      patient_name: "ROSA DELA CRUZ",
      statement_number: "PGH-2026-8801",
      case_rate_codes_detected: ["44970"],
      statutory_discount_type: "regular",
      line_items: [
        {
          id: "item-1",
          description: "Basic Charity Ward Room & Board (3 Days)",
          category: "Room & Board",
          quantity: 3,
          unit_price: 2000,
          total_amount: 6000,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 6000,
        },
        {
          id: "item-2",
          description: "Operating Room & Surgical Care",
          category: "Operating Room",
          quantity: 1,
          unit_price: 30000,
          total_amount: 30000,
          philhealth_deducted: 30000,
          discount_applied: 0,
          balance: 0,
        },
      ],
      gross_total: 36000,
      philhealth_total: 30000,
      senior_pwd_discount_total: 0,
      net_balance_due: 6000,
    };

    // Case A: Indirect/NBB member in Basic Ward -> remaining ₱6,000 balance is flagged as NBB violation -> Fair OOP = ₱0
    const nbbWardResult = runAuditEngine(wardBill, {
      auditId: "test-nbb-basic-ward",
      referencePackages: CATALOG,
      eligibilitySnapshot: {
        contributor_type: "indirect_nbb",
        accommodation_type: "basic_ward",
        has_mdr_or_pin: false,
        facility_level: "level_3",
      },
    });

    const nbbFlag = nbbWardResult.flags.find((f) => f.type === "nbb_violation");
    expect(nbbFlag).toBeDefined();
    expect(nbbFlag?.severity).toBe("high");
    expect(nbbFlag?.description).toContain("2016-0020");
    expect(nbbFlag?.description).toContain("11223");
    expect(nbbWardResult.nbb_savings).toBe(6000);
    expect(nbbWardResult.fair_out_of_pocket).toBe(0);

    // Also verifies missing MDR/PIN pre-discharge reminder
    const mdrFlag = nbbWardResult.flags.find(
      (f) =>
        f.type === "compliance_note" &&
        f.title.includes("MDR / PIN")
    );
    expect(mdrFlag).toBeDefined();
    expect(mdrFlag?.description).toContain("PhilHealth Member Portal");
    expect(mdrFlag?.description).toContain("eGovPH Super App");

    const briefText = buildPlainTextNegotiationBrief(nbbWardResult, {
      representativeName: "Rosa Dela Cruz",
      relationship: "Patient",
      contactInfo: "0917-123-4567",
      preparedDate: "November 17, 2026",
      isSeniorOrPwd: false,
      statutoryDiscountType: "regular",
    });
    expect(briefText).toContain("PhilHealth Circular 2016-0020");
    expect(briefText).toContain("Republic Act No. 11223");

    // Case B: Indirect/NBB member in Non-Basic Private Room -> NBB zero co-pay is waived, patient pays remaining ₱6,000 co-pay
    const privateRoomResult = runAuditEngine(wardBill, {
      auditId: "test-nbb-private-room",
      referencePackages: CATALOG,
      eligibilitySnapshot: {
        contributor_type: "indirect_nbb",
        accommodation_type: "non_basic_private",
        has_mdr_or_pin: true,
        facility_level: "level_3",
      },
    });

    expect(
      privateRoomResult.flags.some((f) => f.type === "nbb_violation")
    ).toBe(false);
    expect(privateRoomResult.nbb_savings).toBe(0);
    expect(privateRoomResult.fair_out_of_pocket).toBe(6000);
    expect(
      privateRoomResult.flags.some(
        (f) =>
          f.type === "compliance_note" &&
          f.title.includes("Private Room Co-Payment Applies")
      )
    ).toBe(true);
  });

  it("audits MCU-FDT Senior Citizen SOA #2023-750454 with 8/8 eligible items, two-tier NIRC Sec. 109(G) VAT rules, ₱1,240 credit reconciliation, and ₱39,562.17 reconciled balance", () => {
    const rawMcuSoa = sanitizeExtractedBill({
      hospital_name: "MCU-FDT Medical Foundation Inc.",
      patient_name: "Escario, Amparo Arellano",
      statement_number: "2023-750454",
      admission_date: "2023-04-28",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      statutory_discount_type: "senior",
      line_items: [
        {
          id: "raw-1",
          description: "X-Ray",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 1942.0,
          total_amount: 1942.0,
        },
        {
          id: "raw-2",
          description: "Central Supply Room",
          category: "Medical Supplies",
          quantity: 1,
          unit_price: 1942.0,
          total_amount: 1942.0,
        },
        {
          id: "raw-3",
          description: "Pharmacy - Main",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 2583.34,
          total_amount: 2583.34,
        },
        {
          id: "raw-4",
          description: "Emergency Room",
          // Simulate OCR returning Miscellaneous to verify automatic ROOM_AND_ER rescue
          category: "Miscellaneous",
          quantity: 1,
          unit_price: 25193.96,
          total_amount: 25193.96,
        },
        {
          id: "raw-5",
          description: "Dept of Clinical Laboratories",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 14163.68,
          total_amount: 14163.68,
        },
        {
          id: "raw-6",
          description: "Pulmonary Section",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 2383.06,
          total_amount: 2383.06,
        },
        {
          id: "raw-7",
          description: "CT - Scan",
          category: "Laboratory/Diagnostics",
          quantity: 1,
          unit_price: 6200.0,
          total_amount: 6200.0,
        },
        {
          id: "raw-8",
          description: "Professional Fee",
          category: "Professional Fees",
          quantity: 1,
          unit_price: 2666.67,
          total_amount: 2666.67,
        },
        // Simulate PAYMENT/CN credit rows accidentally included by OCR
        {
          id: "raw-credit-1",
          description: "Senior Citizen Discount",
          category: "Miscellaneous",
          quantity: 1,
          unit_price: 1240.0,
          total_amount: 1240.0,
        },
        {
          id: "raw-credit-2",
          description: "Payment",
          category: "Miscellaneous",
          quantity: 1,
          unit_price: 4960.0,
          total_amount: 4960.0,
        },
      ],
      gross_total: 56325.0,
      philhealth_total: 0,
      senior_pwd_discount_total: 1240.0,
      net_balance_due: 50125.5,
    });

    // Credit rows must be stripped out of chargeable line_items and folded into totals
    expect(rawMcuSoa.line_items).toHaveLength(8);
    expect(rawMcuSoa.senior_pwd_discount_total).toBe(1240.0);
    expect(rawMcuSoa.cash_or_hmo_payments_total).toBe(4960.0);

    // Emergency Room must be mapped to Room & Board (never Miscellaneous)
    const erItem = rawMcuSoa.line_items.find(
      (i) => i.description === "Emergency Room"
    );
    expect(erItem?.category).toBe("Room & Board");

    const audit = runAuditEngine(rawMcuSoa, {
      auditId: "b91f6dc2-280",
      statutoryDiscountType: "senior",
      referencePackages: CATALOG,
    });

    // 1. All 8 line items classified & audited (0 Out-of-Pocket skipped)
    expect(audit.line_items).toHaveLength(8);
    expect(
      audit.line_items.filter((i) => i.status === "out_of_pocket")
    ).toHaveLength(0);
    expect(
      audit.line_items.filter((i) => i.status === "review_worthy")
    ).toHaveLength(8);

    // 2. Central Supply Room (₱1,942.00) & Pharmacy - Main (₱2,583.34) compute 12% VAT removal + 20% SC discount
    const csr = audit.line_items.find(
      (i) => i.description === "Central Supply Room"
    );
    const pharmacy = audit.line_items.find(
      (i) => i.description === "Pharmacy - Main"
    );
    expect(csr?.vat_treatment).toBe("vat_inclusive_goods");
    expect(csr?.suggested_deduction).toBeCloseTo(554.86, 2);
    expect(pharmacy?.vat_treatment).toBe("vat_inclusive_goods");
    expect(pharmacy?.suggested_deduction).toBeCloseTo(738.1, 2);

    // 3. Emergency Room, diagnostics, and Professional Fee compute straight 20% SC discount (NIRC Sec. 109(G))
    const xray = audit.line_items.find((i) => i.description === "X-Ray");
    const er = audit.line_items.find((i) => i.description === "Emergency Room");
    const labs = audit.line_items.find(
      (i) => i.description === "Dept of Clinical Laboratories"
    );
    const pulm = audit.line_items.find(
      (i) => i.description === "Pulmonary Section"
    );
    const ct = audit.line_items.find((i) => i.description === "CT - Scan");
    const pf = audit.line_items.find(
      (i) => i.description === "Professional Fee"
    );

    expect(xray?.suggested_deduction).toBeCloseTo(388.4, 2);
    expect(er?.suggested_deduction).toBeCloseTo(5038.79, 2);
    expect(labs?.suggested_deduction).toBeCloseTo(2832.74, 2);
    expect(pulm?.suggested_deduction).toBeCloseTo(476.61, 2);
    expect(ct?.suggested_deduction).toBeCloseTo(1240.0, 2);
    expect(ct?.statutory_credit_applied).toBeCloseTo(1240.0, 2);
    expect(pf?.suggested_deduction).toBeCloseTo(533.33, 2);

    // 4. Existing ₱1,240.00 credit netted out + ₱0.50 SOA arithmetic discrepancy -> Reconciled Balance ₱39,562.17
    expect(audit.statutory_reconciliation?.total_entitled).toBeCloseTo(
      11802.83,
      2
    );
    expect(audit.statutory_reconciliation?.already_credited).toBeCloseTo(
      1240.0,
      2
    );
    expect(audit.senior_pwd_savings).toBeCloseTo(10562.83, 2);
    expect(audit.arithmetic_discrepancy).toBeCloseTo(0.5, 2);
    expect(audit.fair_out_of_pocket).toBeCloseTo(39562.17, 2);
  });

  it("applies No Balance Billing (NBB) Zero Co-Payment for Senior/PWD in Basic Ward and waives it in Private Room", () => {
    const baseNbbBill: ExtractedBillData = {
      hospital_name: "Government Regional Medical Center",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      statutory_discount_type: "senior",
      line_items: [
        {
          id: "item-1",
          description: "Basic Ward Accommodation & Nursing Care",
          category: "Room & Board",
          quantity: 3,
          unit_price: 2000,
          total_amount: 6000,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 6000,
        },
      ],
      gross_total: 6000,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 6000,
    };

    const wardAudit = runAuditEngine(baseNbbBill, {
      auditId: "nbb-basic-ward",
      referencePackages: CATALOG,
      statutoryDiscountType: "senior",
      eligibilitySnapshot: {
        contributor_type: "indirect_nbb",
        accommodation_type: "basic_ward",
        has_mdr_or_pin: true,
        facility_level: "level_2",
      },
    });

    const nbbFlag = wardAudit.flags.find((f) => f.type === "nbb_violation");
    expect(nbbFlag).toBeDefined();
    expect(nbbFlag?.severity).toBe("high");
    expect(wardAudit.senior_pwd_savings).toBeCloseTo(1200, 2);
    expect(wardAudit.nbb_savings).toBeCloseTo(4800, 2);
    expect(wardAudit.fair_out_of_pocket).toBe(0);
    expect(wardAudit.negotiation_brief_summary).not.toContain("⚠️");
    expect(wardAudit.negotiation_brief_summary).not.toContain("📋");

    const privateAudit = runAuditEngine(baseNbbBill, {
      auditId: "nbb-private-room",
      referencePackages: CATALOG,
      statutoryDiscountType: "senior",
      eligibilitySnapshot: {
        contributor_type: "indirect_nbb",
        accommodation_type: "non_basic_private",
        has_mdr_or_pin: true,
        facility_level: "level_2",
      },
    });

    expect(privateAudit.flags.some((f) => f.type === "nbb_violation")).toBe(
      false
    );
    expect(
      privateAudit.flags.some((f) =>
        f.title.includes("Private Room Co-Payment Applies")
      )
    ).toBe(true);
    expect(privateAudit.nbb_savings).toBe(0);
    expect(privateAudit.fair_out_of_pocket).toBeCloseTo(4800, 2);
  });

  it("enforces PhilHealth 2nd Case Rate rule (100% primary + 50% secondary, max 2 packages)", () => {
    const dualCatalog: CatalogPackage[] = [
      {
        code: "47562",
        keyword: "Laparoscopic Cholecystectomy",
        total_rate: 38750,
        hci_fee: 24750,
        prof_fee: 14000,
        inclusive_items: ["Trocar", "Endoclip"],
        aliases: [{ alias: "endoclip", kind: "token" }],
      },
      {
        code: "44970",
        keyword: "Laparoscopic Appendectomy",
        total_rate: 24000,
        hci_fee: 14400,
        prof_fee: 9600,
        inclusive_items: ["Trocar", "PACU"],
        aliases: [{ alias: "trocar", kind: "token" }],
      },
      {
        code: "J18.9",
        keyword: "Pneumonia Moderate Risk",
        total_rate: 15000,
        hci_fee: 10500,
        prof_fee: 4500,
        inclusive_items: ["CBC", "Chest X-Ray"],
        aliases: [],
      },
    ];

    const bill: ExtractedBillData = {
      hospital_name: "St. Luke's Medical Center",
      // 3 codes detected: 47562 (₱38,750 primary 100%), 44970 (₱24,000 secondary 50% = ₱12,000), J18.9 (excluded)
      case_rate_codes_detected: ["44970", "47562", "J18.9"],
      line_items: [
        {
          id: "item-1",
          description: "Operating Room & Surgical Care",
          category: "Operating Room",
          quantity: 1,
          unit_price: 90000,
          total_amount: 90000,
          philhealth_deducted: 0,
          discount_applied: 0,
          balance: 90000,
        },
      ],
      gross_total: 90000,
      philhealth_total: 25000,
      senior_pwd_discount_total: 0,
      net_balance_due: 65000,
    };

    const audit = runAuditEngine(bill, {
      auditId: "dual-case-rate",
      referencePackages: dualCatalog,
      statutoryDiscountType: "regular",
    });

    // Combined expected rate: 38,750 + (24,000 * 0.5) = 50,750; shortfall = 50,750 - 25,000 = 25,750
    expect(audit.case_rate_shortfall).toBeCloseTo(25750, 2);
    const secondRateNote = audit.flags.find((f) =>
      f.title.includes("2nd Case Rate Rule Applied")
    );
    expect(secondRateNote).toBeDefined();
    expect(secondRateNote?.description).toContain("100%");
    expect(secondRateNote?.description).toContain("50%");
    expect(secondRateNote?.description).toContain("J18.9");
    expect(audit.negotiation_brief_summary).toContain(
      "PhilHealth 2nd Case Rate Rule"
    );
    expect(audit.negotiation_brief_summary).not.toContain("⚠️");
  });

  it("refines check 2b summary-level VAT math on mixed VATable goods and VAT-exempt hospital services", () => {
    // Mixed bill:
    // - Pharmacy (VAT-inclusive goods): ₱11,200 -> legal relief = 11,200 - (11,200 / 1.12 * 0.80) = ₱3,200
    // - Room & Board (NIRC Sec. 109(G) VAT-exempt service): ₱20,000 -> legal relief = 20,000 * 0.20 = ₱4,000
    // Total legal relief = ₱7,200. With PhilHealth ₱10,000, legalNetPayable = 31,200 - 7,200 - 10,000 = ₱14,000.
    // Hospital credited ₱4,000 in summary and printed ₱17,200 due -> summary overcharge = ₱3,200.
    const mixedBill: ExtractedBillData = {
      hospital_name: "Makati Medical Center",
      case_rate_codes_detected: [],
      is_senior_or_pwd: true,
      statutory_discount_type: "senior",
      line_items: [
        {
          id: "item-1",
          description: "Pharmacy - Antibiotics",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 11200,
          total_amount: 11200,
          philhealth_deducted: 0,
          discount_applied: 3200,
          balance: 8000,
        },
        {
          id: "item-2",
          description: "Room & Board - Ward",
          category: "Room & Board",
          quantity: 1,
          unit_price: 20000,
          total_amount: 20000,
          philhealth_deducted: 0,
          discount_applied: 4000,
          balance: 16000,
        },
      ],
      gross_total: 31200,
      philhealth_total: 10000,
      senior_pwd_discount_total: 4000,
      net_balance_due: 17200,
    };

    const audit = runAuditEngine(mixedBill, {
      auditId: "summary-vat-2b",
      referencePackages: [],
      statutoryDiscountType: "senior",
    });

    const seqFlag = audit.flags.find(
      (f) => f.type === "wrong_deduction_sequence"
    );
    expect(seqFlag).toBeDefined();
    expect(seqFlag?.potential_savings).toBeCloseTo(3200, 2);
    expect(audit.senior_pwd_savings).toBeCloseTo(3200, 2);
    expect(audit.fair_out_of_pocket).toBeCloseTo(14000, 2);
  });

  it("deduplicates overlapping tail/head lines in mergeExtractedBills while preserving mid-page duplicates and clamping negatives", () => {
    const page1: ExtractedBillData = {
      hospital_name: "Philippine General Hospital",
      case_rate_codes_detected: ["47562"],
      line_items: [
        {
          id: "item-1",
          description: "Operating Room Fee",
          category: "Operating Room",
          quantity: 1,
          unit_price: 10000,
          total_amount: 10000,
        },
        {
          id: "item-2",
          description: "Cefazolin 1g IV",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 350,
          total_amount: 350,
        },
        {
          id: "item-3",
          description: "IV Cannula G18",
          category: "Medical Supplies",
          quantity: 2,
          unit_price: 150,
          total_amount: 300,
        },
      ],
      gross_total: 10650,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 10650,
    };

    const page2: ExtractedBillData = {
      hospital_name: "Philippine General Hospital",
      case_rate_codes_detected: ["47562"],
      line_items: [
        // Overlapping tail from page 1
        {
          id: "item-1",
          description: "Cefazolin 1g IV",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 350,
          total_amount: 350,
        },
        {
          id: "item-2",
          description: "IV Cannula G18",
          category: "Medical Supplies",
          quantity: 2,
          unit_price: 150,
          total_amount: 300,
        },
        // New charge + legitimate second dose of Cefazolin later on page 2 + negative OCR noise
        {
          id: "item-3",
          description: "Recovery Room",
          category: "Room & Board",
          quantity: 1,
          unit_price: 2000,
          total_amount: 2000,
        },
        {
          id: "item-4",
          description: "Cefazolin 1g IV",
          category: "Drugs/Medicines",
          quantity: 1,
          unit_price: 350,
          total_amount: 350,
        },
        {
          id: "item-5",
          description: "Unrecognized Adjustment",
          category: "Miscellaneous",
          quantity: 1,
          unit_price: -500,
          total_amount: -500,
        },
      ],
      gross_total: 2500,
      philhealth_total: 0,
      senior_pwd_discount_total: 0,
      net_balance_due: 2500,
    };

    const merged = mergeExtractedBills([page1, page2]);

    // 3 from page 1 + 3 non-overlapping from page 2 = 6 items
    expect(merged.line_items).toHaveLength(6);
    expect(
      merged.line_items.filter((i) => i.description === "Cefazolin 1g IV")
    ).toHaveLength(2);
    expect(merged.line_items[5].total_amount).toBe(0);
    // Gross total = 10,000 + 350 + 300 + 2,000 + 350 + 0 = 13,000
    expect(merged.gross_total).toBeCloseTo(13000, 2);
  });

  it("reconciles HCI/PF splits in normalizeSeedPackage and flags 70/30 estimated splits in runAuditEngine", () => {
    const inconsistent = normalizeSeedPackage({
      case_code: "99991",
      procedure_keyword: "Inconsistent Split Procedure",
      hci_fee: 14000,
      prof_fee: 6000,
      total_case_rate: 25000,
    });
    expect(inconsistent.total_case_rate).toBe(20000);
    expect(inconsistent.is_estimated_split).toBeUndefined();

    const totalOnly = normalizeSeedPackage({
      case_code: "99992",
      procedure_keyword: "Total Only AI Procedure",
      total_case_rate: 10000,
      source_url: "ai_grounded:philhealth-acr",
      is_verified: false,
    });
    expect(totalOnly.hci_fee).toBe(7000);
    expect(totalOnly.prof_fee).toBe(3000);
    expect(totalOnly.is_estimated_split).toBe(true);

    const catalogPkg = toCatalogPackage(
      {
        case_code: totalOnly.case_code,
        procedure_keyword: totalOnly.procedure_keyword,
        hci_fee: totalOnly.hci_fee,
        prof_fee: totalOnly.prof_fee,
        total_case_rate: totalOnly.total_case_rate,
        inclusive_items: totalOnly.inclusive_items,
        source_url: totalOnly.source_url,
        is_verified: totalOnly.is_verified,
        is_estimated_split: totalOnly.is_estimated_split,
      },
      totalOnly.aliases
    );

    const audit = runAuditEngine(
      {
        hospital_name: "City General Hospital",
        case_rate_codes_detected: ["99992"],
        line_items: [
          {
            id: "item-1",
            description: "Ward Care",
            category: "Room & Board",
            quantity: 1,
            unit_price: 15000,
            total_amount: 15000,
          },
        ],
        gross_total: 15000,
        philhealth_total: 10000,
        senior_pwd_discount_total: 0,
        net_balance_due: 5000,
      },
      {
        auditId: "estimated-split-note",
        referencePackages: [catalogPkg],
        statutoryDiscountType: "regular",
      }
    );

    expect(audit.detected_case_packages[0].is_estimated_split).toBe(true);
    expect(
      audit.flags.some((f) => f.title === "Estimated 70/30 HCI/PF Split Used")
    ).toBe(true);
  });
});
