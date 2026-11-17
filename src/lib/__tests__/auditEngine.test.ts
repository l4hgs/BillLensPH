import { describe, expect, it } from "vitest";
import { runAuditEngine } from "@/lib/auditEngine";
import { mergeExtractedBills } from "@/lib/gemini";
import {
  bestPackageForDiagnosis,
  findMatchingAlias,
} from "@/lib/itemMatcher";
import {
  normalizeSeedPackage,
  parseCatalogCsv,
  selectActivePackagesForDate,
  toCatalogPackage,
} from "@/lib/packageCatalog";
import {
  ensureBillPackagesInCatalog,
  hasCatalogMatchForBill,
} from "@/lib/caseRateDiscovery";
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

    // Standard RA 9994 / RA 10754: 11,200 / 1.12 = 10,000 VAT-exempt -> 20% = 2,000 discount -> 3,200 total relief
    const standardRes = runAuditEngine(bill, {
      auditId: "test-senior-default",
      referencePackages: CATALOG,
    });
    expect(standardRes.line_items[0].status).toBe("review_worthy");
    expect(standardRes.senior_pwd_savings).toBeCloseTo(3200, 2);

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
    // 11,200 / 1.12 = 10,000 -> 25% = 2,500 discount + 1,200 VAT = 3,700 relief
    expect(customRes.senior_pwd_savings).toBeCloseTo(3700, 2);
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
          philhealth_deduction: 3600,
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
    expect(hasCatalogMatchForBill(bill, packages)).toBe(true);

    const result = runAuditEngine(bill, {
      auditId: "fixture-autodiscover",
      referencePackages: packages,
    });

    expect(result.detected_case_packages[0]?.code).toBe("N10");
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
});
