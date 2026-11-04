import type {
  ExtractedBillData,
  AuditEngineResult,
  AuditedLineItem,
  AuditFlag,
  AuditTier,
  MatchedCasePackage,
} from "@/types/audit";
import { formatPHP } from "./utils";

// Fallback seed packages for matching if database lookup is empty
const BUILTIN_PACKAGES: MatchedCasePackage[] = [
  {
    code: "47562",
    keyword: "Laparoscopic Cholecystectomy",
    hci_fee: 23250,
    prof_fee: 15500,
    total_rate: 38750,
    inclusive_items: [
      "laparoscopic",
      "trocar",
      "cannula",
      "clip",
      "insufflation",
      "co2",
      "camera",
      "grasper",
      "dissector",
      "sterile drape",
      "surgical gown",
      "suture",
      "pacu",
      "recovery room",
      "iv fluid",
      "saline",
      "lactated ringer",
    ],
  },
  {
    code: "44970",
    keyword: "Laparoscopic Appendectomy",
    hci_fee: 18000,
    prof_fee: 12000,
    total_rate: 30000,
    inclusive_items: [
      "laparoscopic",
      "trocar",
      "camera",
      "endoloop",
      "clip",
      "insufflation",
      "co2",
      "pacu",
      "recovery room",
      "drape",
      "cefazolin",
    ],
  },
  {
    code: "44950",
    keyword: "Appendectomy (Open)",
    hci_fee: 14400,
    prof_fee: 9600,
    total_rate: 24000,
    inclusive_items: [
      "appendectomy",
      "drape",
      "suture",
      "sponge",
      "laparotomy pad",
      "scalpel blade",
      "iv fluid",
      "pacu",
    ],
  },
  {
    code: "93458",
    keyword: "Coronary Angiography",
    hci_fee: 28500,
    prof_fee: 19000,
    total_rate: 47500,
    inclusive_items: [
      "sheath",
      "catheter",
      "guidewire",
      "contrast",
      "iohexol",
      "iopamidol",
      "fluoroscopy",
      "cath lab",
      "heparin",
      "compression bandage",
      "drape",
    ],
  },
  {
    code: "92920",
    keyword: "Percutaneous Coronary Intervention (PCI)",
    hci_fee: 54000,
    prof_fee: 36000,
    total_rate: 90000,
    inclusive_items: [
      "balloon",
      "ptca",
      "guidewire",
      "indeflator",
      "inflation device",
      "guiding catheter",
      "cath lab",
      "heparin",
      "act test",
      "contrast",
    ],
  },
  {
    code: "59400",
    keyword: "Normal Spontaneous Delivery (NSD)",
    hci_fee: 6500,
    prof_fee: 3900,
    total_rate: 10400,
    inclusive_items: [
      "delivery room",
      "labor",
      "oxytocin",
      "episiotomy",
      "lidocaine",
      "cord clamp",
      "suction bulb",
      "vitamin k",
      "erythromycin",
      "room and board",
    ],
  },
  {
    code: "59510",
    keyword: "Cesarean Section Delivery",
    hci_fee: 15600,
    prof_fee: 10400,
    total_rate: 26000,
    inclusive_items: [
      "operating room",
      "delivery",
      "spinal needle",
      "spinal anesthesia",
      "bupivacaine",
      "suture",
      "oxytocin",
      "methylergometrine",
      "pacu",
      "recovery",
    ],
  },
  {
    code: "90935",
    keyword: "Hemodialysis Session",
    hci_fee: 4000,
    prof_fee: 0,
    total_rate: 4000,
    inclusive_items: [
      "dialyzer",
      "filter",
      "tubing line",
      "dialysate",
      "fistula needle",
      "avf",
      "heparin",
      "saline flush",
      "nursing care",
    ],
  },
  {
    code: "J18.9",
    keyword: "Community-Acquired Pneumonia (Moderate Risk)",
    hci_fee: 10500,
    prof_fee: 4500,
    total_rate: 15000,
    inclusive_items: [
      "room and board",
      "ward",
      "chest x-ray",
      "xray",
      "cbc",
      "urinalysis",
      "ceftriaxone",
      "ampicillin",
      "iv cannula",
      "infusion set",
      "oxygen",
      "salbutamol",
      "nebulization",
    ],
  },
  {
    code: "A97.1",
    keyword: "Dengue Fever with Warning Signs",
    hci_fee: 9100,
    prof_fee: 3900,
    total_rate: 13000,
    inclusive_items: [
      "room",
      "cbc",
      "platelet",
      "hematocrit",
      "ns1",
      "iv fluid",
      "saline",
      "lactated ringer",
      "cannula",
      "paracetamol",
      "oral rehydration",
    ],
  },
];

/** Maps a `philhealth_packages` database row to the shape the engine matches against. */
export function toMatchedPackage(row: {
  case_code: string;
  procedure_keyword: string;
  hci_fee: number | string | null;
  prof_fee: number | string | null;
  total_case_rate: number | string | null;
  inclusive_items: string[] | null;
}): MatchedCasePackage {
  return {
    code: row.case_code,
    keyword: row.procedure_keyword,
    hci_fee: Number(row.hci_fee) || 0,
    prof_fee: Number(row.prof_fee) || 0,
    total_rate: Number(row.total_case_rate) || 0,
    inclusive_items: row.inclusive_items || [],
  };
}

export interface AuditOptions {
  auditId: string;
  isSeniorOrPwdOverride?: boolean;
  referencePackages?: MatchedCasePackage[];
  /** Per-item tier chosen by the user in the Audit Studio, keyed by line item id. */
  manualStatusOverrides?: Record<string, AuditTier>;
}

export function runAuditEngine(
  extracted: ExtractedBillData,
  options: AuditOptions
): AuditEngineResult {
  const isSeniorOrPwd =
    options.isSeniorOrPwdOverride ?? Boolean(extracted.is_senior_or_pwd);

  const availablePackages =
    options.referencePackages && options.referencePackages.length > 0
      ? options.referencePackages
      : BUILTIN_PACKAGES;

  // 1. Identify active PhilHealth case rate packages
  const matchedPackages: MatchedCasePackage[] = [];

  for (const code of extracted.case_rate_codes_detected) {
    const pkg = availablePackages.find(
      (p) => p.code.toLowerCase() === code.toLowerCase()
    );
    if (pkg && !matchedPackages.some((m) => m.code === pkg.code)) {
      matchedPackages.push(pkg);
    }
  }

  // Also match by procedure/diagnosis keywords if none matched by code
  if (matchedPackages.length === 0 && extracted.diagnosis_or_procedure) {
    const diag = extracted.diagnosis_or_procedure.toLowerCase();
    for (const pkg of availablePackages) {
      if (
        diag.includes(pkg.keyword.toLowerCase()) ||
        pkg.keyword.toLowerCase().split(" ").some((w) => w.length > 4 && diag.includes(w))
      ) {
        matchedPackages.push(pkg);
        break;
      }
    }
  }

  // Fallback: search line items for prominent surgical/procedure indicators
  if (matchedPackages.length === 0) {
    for (const item of extracted.line_items) {
      const desc = item.description.toLowerCase();
      for (const pkg of availablePackages) {
        if (
          desc.includes(pkg.keyword.toLowerCase()) ||
          desc.includes(pkg.code.toLowerCase())
        ) {
          if (!matchedPackages.some((m) => m.code === pkg.code)) {
            matchedPackages.push(pkg);
          }
        }
      }
    }
  }

  const flags: AuditFlag[] = [];
  let disputedOverchargeTotal = 0;
  let estimatedSeniorSavings = 0;

  // 2. Audit every line item
  const auditedItems: AuditedLineItem[] = extracted.line_items.map((item) => {
    // A user-chosen tier of "covered" or "out_of_pocket" is final: it bypasses
    // the rule engine, so no overcharge or discount is counted for the item.
    const manualStatus = options.manualStatusOverrides?.[item.id];
    if (manualStatus === "covered" || manualStatus === "out_of_pocket") {
      return {
        ...item,
        status: manualStatus,
        is_manual_override: true,
        flag_reason: "Tier set manually; automatic checks skipped for this item.",
      };
    }

    const descLower = item.description.toLowerCase();
    let status: AuditedLineItem["status"] = "out_of_pocket";
    let flagReason: string | undefined;
    let matchedPkgCode: string | undefined;
    let matchedPkgName: string | undefined;
    let isUnbundled = false;
    let statutoryEligible = false;
    let suggestedDeduction: number | undefined;

    // Check A: Fully covered or zero remaining balance
    const itemBalance = item.balance ?? (item.total_amount - (item.philhealth_deducted || 0) - (item.discount_applied || 0));
    if (itemBalance <= 0 || (item.philhealth_deducted && item.philhealth_deducted >= item.total_amount)) {
      status = "covered";
      return {
        ...item,
        status,
      };
    }

    // Check B: Anti-Unbundling against matched PhilHealth packages
    for (const pkg of matchedPackages) {
      const isInclusiveItem = pkg.inclusive_items.some((inc) => {
        const incLower = inc.toLowerCase();
        return (
          descLower.includes(incLower) ||
          incLower.split(" ").some((word) => word.length > 4 && descLower.includes(word))
        );
      });

      if (isInclusiveItem && item.total_amount > 0) {
        status = "review_worthy";
        isUnbundled = true;
        matchedPkgCode = pkg.code;
        matchedPkgName = pkg.keyword;
        flagReason = `Hospital charged ${formatPHP(item.total_amount)} for "${item.description}", which is a mandatory inclusive item under PhilHealth Case Rate ${pkg.code} (${pkg.keyword}).`;
        suggestedDeduction = item.total_amount;
        disputedOverchargeTotal += item.total_amount;

        flags.push({
          type: "unbundled_charge",
          severity: "high",
          title: `Potential Unbundled Charge: ${item.description}`,
          description: flagReason,
          potential_savings: item.total_amount,
          item_id: item.id,
        });
        break;
      }
    }

    // Check C: Statutory Senior Citizen / PWD Discount (RA 9994 / RA 10754)
    // Applies to: Drugs/Medicines, Medical Supplies, Laboratory/Diagnostics, Professional Fees, Room & Board
    if (!isUnbundled && isSeniorOrPwd) {
      const eligibleCategories = [
        "Drugs/Medicines",
        "Medical Supplies",
        "Laboratory/Diagnostics",
        "Professional Fees",
        "Room & Board",
      ];

      if (eligibleCategories.includes(item.category)) {
        statutoryEligible = true;
        const currentDiscount = item.discount_applied || 0;

        // Philippine Statutory Rule:
        // VAT Exempt = Price / 1.12
        // Senior/PWD Discount = VAT Exempt * 0.20
        // Effective discount on VAT-inclusive total = ~28.57%
        const expectedVatExempt = item.total_amount / 1.12;
        const expectedDiscount = expectedVatExempt * 0.20;
        const totalExpectedRelief = (item.total_amount - expectedVatExempt) + expectedDiscount;

        if (currentDiscount < expectedDiscount * 0.8) {
          status = "review_worthy";
          const missedRelief = Math.max(0, totalExpectedRelief - currentDiscount);
          suggestedDeduction = (suggestedDeduction || 0) + missedRelief;
          estimatedSeniorSavings += missedRelief;
          flagReason = flagReason
            ? `${flagReason} Also missing statutory Senior/PWD 20% discount + VAT exemption (potential relief: ${formatPHP(missedRelief)}).`
            : `Missing or incomplete statutory Senior/PWD 20% discount + 12% VAT exemption (potential relief: ${formatPHP(missedRelief)}).`;

          flags.push({
            type: "missing_statutory_discount",
            severity: "medium",
            title: `Missing Senior/PWD Relief: ${item.description}`,
            description: `Eligible for RA 9994/RA 10754 statutory discount. Expected savings: ${formatPHP(missedRelief)}.`,
            potential_savings: missedRelief,
            item_id: item.id,
          });
        }
      }
    }

    // Check D: If not unbundled and no statutory dispute, it remains out-of-pocket
    if (status === "out_of_pocket") {
      // General out of pocket
    }

    // Manual "flag for review" from the Audit Studio: keep any rule-based
    // findings, but make sure the item is surfaced as review-worthy.
    let isManual = false;
    if (manualStatus === "review_worthy" && status !== "review_worthy") {
      status = "review_worthy";
      isManual = true;
      flagReason = flagReason ?? "Manually flagged for review.";
    }

    return {
      ...item,
      status,
      flag_reason: flagReason,
      matched_package_code: matchedPkgCode,
      matched_package_name: matchedPkgName,
      is_unbundled_overcharge: isUnbundled,
      statutory_discount_eligible: statutoryEligible,
      suggested_deduction: suggestedDeduction,
      ...(isManual ? { is_manual_override: true } : {}),
    };
  });

  // Calculate high-level financial totals
  const grossTotal = extracted.gross_total;
  const actualOutOfPocket = extracted.net_balance_due;
  const totalDisputable = disputedOverchargeTotal + estimatedSeniorSavings;
  const fairOutOfPocket = Math.max(0, actualOutOfPocket - totalDisputable);

  const totalPhilHealthRate = matchedPackages.reduce(
    (sum, p) => sum + p.total_rate,
    0
  );

  // General Compliance Flags
  if (matchedPackages.length > 0 && extracted.philhealth_total < totalPhilHealthRate * 0.9) {
    flags.unshift({
      type: "excess_hci_charge",
      severity: "high",
      title: "Under-Deducted PhilHealth Case Rate",
      description: `Hospital deducted ${formatPHP(extracted.philhealth_total)}, but the official PhilHealth Circular rate for ${matchedPackages.map((p) => `${p.keyword} (${p.code})`).join(", ")} is ${formatPHP(totalPhilHealthRate)}. Verify Claim Form 2 with the billing department.`,
      potential_savings: Math.max(0, totalPhilHealthRate - extracted.philhealth_total),
    });
  }

  // Generate Negotiation Brief Summary
  let negotiationBrief = `AUDIT REPORT SUMMARY for Statement #${extracted.statement_number || "N/A"}\n`;
  negotiationBrief += `Facility: ${extracted.hospital_name}\n`;
  negotiationBrief += `Total Billed: ${formatPHP(grossTotal)} | Current Due: ${formatPHP(actualOutOfPocket)}\n`;

  if (matchedPackages.length > 0) {
    negotiationBrief += `Identified Case Packages: ${matchedPackages.map((p) => `${p.keyword} (Case ${p.code} - ${formatPHP(p.total_rate)})`).join("; ")}\n\n`;
  }

  if (disputedOverchargeTotal > 0) {
    negotiationBrief += `⚠️ UNBUNDLED HOSPITAL CHARGES FLAGGED: ${formatPHP(disputedOverchargeTotal)}\n`;
    negotiationBrief += `Under PhilHealth All-Case-Rates (Circular 2024-0001/0037), standard surgical/medical consumables are inclusive to the facility fee.\n\n`;
  }

  if (estimatedSeniorSavings > 0) {
    negotiationBrief += `⚠️ STATUTORY SENIOR/PWD RELIEF DISCREPANCY: ${formatPHP(estimatedSeniorSavings)}\n`;
    negotiationBrief += `Applicable under Republic Act No. 9994 & 10754.\n\n`;
  }

  negotiationBrief += `ADJUSTED FAIR BALANCE DUE: ${formatPHP(fairOutOfPocket)}\n`;
  negotiationBrief += `Estimated Total Patient Savings: ${formatPHP(totalDisputable)}`;

  return {
    audit_id: options.auditId,
    hospital_name: extracted.hospital_name,
    patient_name: extracted.patient_name,
    statement_number: extracted.statement_number,
    gross_total: grossTotal,
    actual_out_of_pocket: actualOutOfPocket,
    fair_out_of_pocket: fairOutOfPocket,
    disputed_overcharge_total: disputedOverchargeTotal,
    philhealth_coverage_total: extracted.philhealth_total || totalPhilHealthRate,
    senior_pwd_savings: estimatedSeniorSavings,
    detected_case_packages: matchedPackages,
    line_items: auditedItems,
    flags,
    negotiation_brief_summary: negotiationBrief,
    audited_at: new Date().toISOString(),
  };
}
