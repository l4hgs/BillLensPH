import type {
  ExtractedBillData,
  AuditEngineResult,
  AuditedLineItem,
  AuditFlag,
  AuditTier,
  CatalogPackage,
  MatchedCasePackage,
  StatutoryDiscountType,
  StatutoryRule,
} from "@/types/audit";
import { formatPHP } from "./utils";
import {
  bestPackageForDiagnosis,
  containsPhrase,
  findMatchingAlias,
  normalizeText,
} from "./itemMatcher";
import {
  defaultAliasesForCode,
  selectActivePackagesForDate,
  toCatalogPackage,
  toMatchedPackage,
} from "./packageCatalog";

export { toCatalogPackage, toMatchedPackage };

/**
 * Rule engine for a single bill. Pure function: the PhilHealth package catalog
 * is passed in (see `packageCatalog.ts`) and nothing here holds peso rates,
 * so changing a case rate or circular is a data change, not a code change.
 */

export interface AuditOptions {
  auditId: string;
  isSeniorOrPwdOverride?: boolean;
  /** Mutually exclusive statutory privilege ('none' | 'senior' | 'pwd' — no double-stacking per RA 9994 IRR). */
  statutoryDiscountType?: StatutoryDiscountType;
  /** Packages from the `philhealth_packages` catalog (may omit `aliases` if mapped from UI state). */
  referencePackages?: Array<CatalogPackage | MatchedCasePackage>;
  /** Optional parameterized Senior/PWD statutory rule from `statutory_rules`. */
  statutoryRule?: StatutoryRule;
  /** Per-item tier chosen by the user in the Audit Studio, keyed by line item id. */
  manualStatusOverrides?: Record<string, AuditTier>;
}

const DEFAULT_STATUTORY_RULE: StatutoryRule = {
  rule_code: "SENIOR_PWD",
  label: "Senior Citizen (60+) & PWD Statutory Relief",
  vat_divisor: 1.12,
  discount_rate: 0.2,
  incomplete_threshold: 0.8,
  eligible_categories: [
    "Drugs/Medicines",
    "Medical Supplies",
    "Laboratory/Diagnostics",
    "Professional Fees",
    "Room & Board",
  ],
  citation: "RA 9994 / RA 10754",
};

/** Categories that are never treated as bundled HCI supplies (PF is its own bucket). */
const NEVER_UNBUNDLED: ReadonlySet<string> = new Set(["Professional Fees"]);

function ensureCatalogPackage(
  pkg: CatalogPackage | MatchedCasePackage
): CatalogPackage {
  if ("aliases" in pkg && Array.isArray(pkg.aliases)) {
    return pkg;
  }
  return {
    ...pkg,
    aliases: defaultAliasesForCode(pkg.code),
  };
}

/** Drops matcher-only data before a package is stored in audit results. */
function toPublicPackage(pkg: CatalogPackage): MatchedCasePackage {
  return {
    code: pkg.code,
    keyword: pkg.keyword,
    total_rate: pkg.total_rate,
    hci_fee: pkg.hci_fee,
    prof_fee: pkg.prof_fee,
    inclusive_items: pkg.inclusive_items,
    ...(pkg.circular_id ? { circular_id: pkg.circular_id } : {}),
    ...(pkg.effective_from ? { effective_from: pkg.effective_from } : {}),
    ...(pkg.effective_to !== undefined
      ? { effective_to: pkg.effective_to }
      : {}),
    ...(pkg.source_url !== undefined ? { source_url: pkg.source_url } : {}),
  };
}

/**
 * Finds the case-rate packages that apply to a bill, in priority order:
 * explicit case codes, then the diagnosis text, then a line item that names
 * the procedure or its code.
 */
function matchPackages(
  extracted: ExtractedBillData,
  catalog: CatalogPackage[]
): CatalogPackage[] {
  const matched: CatalogPackage[] = [];
  const add = (pkg: CatalogPackage) => {
    if (!matched.some((m) => m.code.toLowerCase() === pkg.code.toLowerCase())) {
      matched.push(pkg);
    }
  };

  for (const code of extracted.case_rate_codes_detected) {
    const wanted = normalizeText(code);
    const pkg = catalog.find((p) => normalizeText(p.code) === wanted);
    if (pkg) add(pkg);
  }
  if (matched.length > 0) return matched;

  if (extracted.diagnosis_or_procedure) {
    const pkg = bestPackageForDiagnosis(
      extracted.diagnosis_or_procedure,
      catalog
    );
    if (pkg) add(pkg);
  }
  if (matched.length > 0) return matched;

  for (const item of extracted.line_items) {
    for (const pkg of catalog) {
      if (
        containsPhrase(item.description, pkg.keyword) ||
        containsPhrase(item.description, pkg.code)
      ) {
        add(pkg);
      }
    }
  }
  return matched;
}

export function runAuditEngine(
  extracted: ExtractedBillData,
  options: AuditOptions
): AuditEngineResult {
  const resolvedDiscountType: StatutoryDiscountType =
    options.statutoryDiscountType ??
    (options.isSeniorOrPwdOverride === false
      ? "none"
      : options.isSeniorOrPwdOverride === true
        ? extracted.statutory_discount_type &&
          extracted.statutory_discount_type !== "none"
          ? extracted.statutory_discount_type
          : "senior"
        : extracted.statutory_discount_type ??
          (extracted.is_senior_or_pwd ? "senior" : "none"));

  const isSeniorOrPwd = resolvedDiscountType !== "none";
  const privilegeLabel =
    resolvedDiscountType === "pwd"
      ? "PWD (RA 10754)"
      : "Senior Citizen (RA 9994)";
  const escalationAgency =
    resolvedDiscountType === "pwd"
      ? "Persons with Disability Affairs Office (PDAO)"
      : "Office for Senior Citizens Affairs (OSCA)";

  const statutoryRule = options.statutoryRule ?? DEFAULT_STATUTORY_RULE;
  const serviceDate = extracted.discharge_date || extracted.admission_date;
  const normalizedCatalog = (options.referencePackages ?? []).map(
    ensureCatalogPackage
  );
  const catalog = selectActivePackagesForDate(normalizedCatalog, serviceDate);

  const flags: AuditFlag[] = [];

  if (catalog.length === 0) {
    flags.push({
      type: "compliance_note",
      severity: "low",
      title: "PhilHealth package catalog unavailable",
      description:
        "No PhilHealth case-rate packages were loaded, so case-rate matching and unbundling checks were skipped. Only Senior/PWD checks were applied.",
      potential_savings: 0,
    });
  }

  // 1. Identify active PhilHealth case rate packages
  const matchedPackages = matchPackages(extracted, catalog);

  for (const pkg of matchedPackages) {
    if (pkg.aliases.length === 0) {
      flags.push({
        type: "compliance_note",
        severity: "low",
        title: `No matching terms for ${pkg.keyword} (${pkg.code})`,
        description: `Package ${pkg.code} has no item aliases in the catalog, so bundled-supply checks were skipped for it.`,
        potential_savings: 0,
      });
    }
  }

  let disputedOverchargeTotal = 0;
  let estimatedSeniorSavings = 0;
  let hasLineLevelSequenceFlag = false;

  // 2. Audit every line item
  const auditedItems: AuditedLineItem[] = extracted.line_items.map((item) => {
    const manualStatus = options.manualStatusOverrides?.[item.id];
    if (manualStatus === "covered" || manualStatus === "out_of_pocket") {
      return {
        ...item,
        status: manualStatus,
        is_manual_override: true,
        flag_reason:
          "Tier set manually; automatic checks skipped for this item.",
      };
    }

    let status: AuditedLineItem["status"] = "out_of_pocket";
    let flagReason: string | undefined;
    let matchedPkgCode: string | undefined;
    let matchedPkgName: string | undefined;
    let isUnbundled = false;
    let statutoryEligible = false;
    let suggestedDeduction: number | undefined;

    // Check A: Fully covered or zero remaining balance
    const itemBalance =
      item.balance ??
      Math.max(
        0,
        item.total_amount -
          (item.philhealth_deducted || 0) -
          (item.discount_applied || 0)
      );
    if (
      itemBalance <= 0 ||
      (item.philhealth_deducted &&
        item.philhealth_deducted >= item.total_amount)
    ) {
      return { ...item, status: "covered" };
    }

    // Check B: Anti-Unbundling against matched PhilHealth packages
    if (!NEVER_UNBUNDLED.has(item.category) && itemBalance > 0) {
      for (const pkg of matchedPackages) {
        const alias = findMatchingAlias(item.description, pkg.aliases);
        if (!alias) continue;

        status = "review_worthy";
        isUnbundled = true;
        matchedPkgCode = pkg.code;
        matchedPkgName = pkg.keyword;
        flagReason = `Hospital charged ${formatPHP(itemBalance)} out-of-pocket for "${item.description}", which is a mandatory inclusive item under PhilHealth Case Rate ${pkg.code} (${pkg.keyword}).`;
        suggestedDeduction = itemBalance;
        disputedOverchargeTotal += itemBalance;

        flags.push({
          type: "unbundled_charge",
          severity: "high",
          title: `Potential Unbundled Charge: ${item.description}`,
          description: flagReason,
          potential_savings: itemBalance,
          item_id: item.id,
        });
        break;
      }
    }

    // Check C: Statutory Senior Citizen / PWD Discount & Mandatory Sequence
    // Under PhilHealth Advisory No. 2023-0036 and RA 9994 / RA 10754:
    //   1. 12% VAT Exemption is deducted FIRST from gross VAT-inclusive charges (unless already VAT-exempt).
    //   2. 20% Senior/PWD Discount is applied NEXT to the VAT-exempt amount.
    //   3. PhilHealth Case Rate benefit is deducted LAST from the remaining balance.
    if (!isUnbundled && isSeniorOrPwd) {
      if (statutoryRule.eligible_categories.includes(item.category)) {
        statutoryEligible = true;
        const currentDiscount = item.discount_applied || 0;
        const philhealthOnItem = item.philhealth_deducted || 0;
        const alreadyVatExempt =
          Boolean(item.is_vat_exempt) ||
          /\bvat[-\s]?exempt\b/i.test(item.description);

        const expectedVatExempt = alreadyVatExempt
          ? item.total_amount
          : item.total_amount / statutoryRule.vat_divisor;
        const vatSaved = Math.max(0, item.total_amount - expectedVatExempt);
        const expectedDiscount =
          expectedVatExempt * statutoryRule.discount_rate;
        const fullStatutoryRelief = vatSaved + expectedDiscount;

        // Statutory relief cannot exceed the remaining charge after PhilHealth
        const maxPossibleRelief = Math.min(
          fullStatutoryRelief,
          Math.max(0, item.total_amount - philhealthOnItem)
        );
        const discountPct = Math.round(statutoryRule.discount_rate * 100);

        // Detect Reversed Deduction Sequence ("PhilHealth First" violation):
        // Hospital applied a discount (> 0) AND deducted PhilHealth (> 0), but computed
        // the 20% discount AFTER subtracting PhilHealth instead of BEFORE.
        if (
          philhealthOnItem > 0 &&
          currentDiscount > 0 &&
          currentDiscount < maxPossibleRelief - 1
        ) {
          status = "review_worthy";
          hasLineLevelSequenceFlag = true;
          const sequenceOvercharge = Math.max(
            0,
            maxPossibleRelief - currentDiscount
          );
          suggestedDeduction = (suggestedDeduction || 0) + sequenceOvercharge;
          estimatedSeniorSavings += sequenceOvercharge;

          const sequenceReason = `Hospital deducted PhilHealth (${formatPHP(philhealthOnItem)}) BEFORE computing the ${discountPct}% ${privilegeLabel} discount on "${item.description}", unlawfully reducing your statutory relief by ${formatPHP(sequenceOvercharge)}. Under PhilHealth Advisory No. 2023-0036, PhilHealth Circular 0056-2012, and ${statutoryRule.citation}, the 12% VAT exemption and ${discountPct}% discount must be deducted from gross charges FIRST, and PhilHealth deducted LAST.`;
          flagReason = flagReason
            ? `${flagReason} ${sequenceReason}`
            : sequenceReason;

          flags.push({
            type: "wrong_deduction_sequence",
            severity: "high",
            title: `Wrong Deduction Sequence: ${item.description}`,
            description: `${sequenceReason} If the billing office refuses to recompute before discharge, report to your LGU ${escalationAgency} or PhilHealth Callback Channel (0917-898-7442).`,
            potential_savings: sequenceOvercharge,
            item_id: item.id,
          });
        } else if (
          currentDiscount <
          expectedDiscount * statutoryRule.incomplete_threshold
        ) {
          status = "review_worthy";
          const missedRelief = Math.max(0, maxPossibleRelief - currentDiscount);
          suggestedDeduction = (suggestedDeduction || 0) + missedRelief;
          estimatedSeniorSavings += missedRelief;
          const vatNote = alreadyVatExempt ? "(VAT-exempt item)" : "+ 12% VAT exemption";
          flagReason = flagReason
            ? `${flagReason} Also missing statutory ${privilegeLabel} ${discountPct}% discount ${vatNote} (potential relief: ${formatPHP(missedRelief)}).`
            : `Missing or incomplete statutory ${privilegeLabel} ${discountPct}% discount ${vatNote} under ${statutoryRule.citation} (potential relief: ${formatPHP(missedRelief)}).`;

          flags.push({
            type: "missing_statutory_discount",
            severity: "medium",
            title: `Missing Senior/PWD Relief: ${item.description}`,
            description: `Eligible for ${statutoryRule.citation} statutory discount (deducted prior to PhilHealth per Advisory 2023-0036). Expected savings: ${formatPHP(missedRelief)}.`,
            potential_savings: missedRelief,
            item_id: item.id,
          });
        }
      }
    }

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

  // 2b. Statement-Summary Level Reversed Deduction Sequence Check:
  //     When a hospital applies Senior/PWD discount and PhilHealth as lump sums in the SOA footer
  //     (e.g., Gross ₱112,000 -> VAT-Exempt ₱100,000 -> -PhilHealth ₱20,000 -> -20% Discount ₱16,000 = ₱64,000 due
  //      instead of the legal ₱60,000 due, creating a ₱4,000 overcharge).
  if (
    isSeniorOrPwd &&
    !hasLineLevelSequenceFlag &&
    extracted.philhealth_total > 0 &&
    extracted.senior_pwd_discount_total > 0
  ) {
    const summaryVatExempt = extracted.gross_total / statutoryRule.vat_divisor;
    const legalVatAndDiscount =
      extracted.gross_total -
      summaryVatExempt +
      summaryVatExempt * statutoryRule.discount_rate;
    const legalNetPayable = Math.max(
      0,
      extracted.gross_total - legalVatAndDiscount - extracted.philhealth_total
    );

    if (extracted.net_balance_due > legalNetPayable + 1) {
      const summaryOvercharge = Math.max(
        0,
        extracted.net_balance_due - legalNetPayable
      );
      const additionalSavings = Math.max(
        0,
        summaryOvercharge - estimatedSeniorSavings
      );
      estimatedSeniorSavings += additionalSavings;

      flags.unshift({
        type: "wrong_deduction_sequence",
        severity: "high",
        title: `Statutory Violation: PhilHealth Deducted Before ${privilegeLabel} Discount`,
        description: `Statement summary shows PhilHealth (${formatPHP(extracted.philhealth_total)}) was subtracted prior to computing the ${Math.round(statutoryRule.discount_rate * 100)}% ${privilegeLabel} discount, inflating your net payable to ${formatPHP(extracted.net_balance_due)} instead of ${formatPHP(legalNetPayable)} (overcharge of ${formatPHP(summaryOvercharge)}). Under PhilHealth Advisory No. 2023-0036, PhilHealth Circular 0056-2012, and ${statutoryRule.citation}, the 12% VAT exemption and 20% discount must be applied FIRST across HCI and Professional Fees before deducting PhilHealth. Report unresolved violations to ${escalationAgency} or PhilHealth Callback Channel (0917-898-7442).`,
        potential_savings: summaryOvercharge,
      });
    }
  }

  // 3. Separate HCI Fee vs PF Share Cap Verification & Fair Out-of-Pocket Math
  const grossTotal = extracted.gross_total;
  const actualOutOfPocket = extracted.net_balance_due;

  const totalHciCap = matchedPackages.reduce((sum, p) => sum + p.hci_fee, 0);
  const totalPfCap = matchedPackages.reduce((sum, p) => sum + p.prof_fee, 0);
  const totalPhilHealthRate = matchedPackages.reduce(
    (sum, p) => sum + p.total_rate,
    0
  );

  const lineLevelHciDeducted = extracted.line_items
    .filter((i) => i.category !== "Professional Fees")
    .reduce((sum, i) => sum + (i.philhealth_deducted || 0), 0);
  const lineLevelPfDeducted = extracted.line_items
    .filter((i) => i.category === "Professional Fees")
    .reduce((sum, i) => sum + (i.philhealth_deducted || 0), 0);
  const hasLineLevelSplit = lineLevelHciDeducted + lineLevelPfDeducted > 0;

  let caseRateShortfall = 0;

  if (matchedPackages.length > 0) {
    if (hasLineLevelSplit) {
      const hciShortfall = Math.max(0, totalHciCap - lineLevelHciDeducted);
      const pfShortfall = Math.max(0, totalPfCap - lineLevelPfDeducted);

      if (
        hciShortfall > 0 &&
        lineLevelHciDeducted < totalHciCap * 0.9 &&
        extracted.philhealth_total < totalPhilHealthRate * 0.9
      ) {
        caseRateShortfall += hciShortfall;
        flags.unshift({
          type: "excess_hci_charge",
          severity: "high",
          title: "Under-Deducted PhilHealth HCI Facility Fee",
          description: `Hospital deducted ${formatPHP(lineLevelHciDeducted)} for the Health Care Institution (HCI) portion, but the case rate HCI allocation for ${matchedPackages.map((p) => `${p.keyword} (${p.code})`).join(", ")} is ${formatPHP(totalHciCap)}.`,
          potential_savings: hciShortfall,
        });
      }

      if (
        pfShortfall > 0 &&
        lineLevelPfDeducted < totalPfCap * 0.9 &&
        extracted.philhealth_total < totalPhilHealthRate * 0.9
      ) {
        caseRateShortfall += pfShortfall;
        flags.unshift({
          type: "excess_hci_charge",
          severity: "high",
          title: "Under-Deducted PhilHealth Professional Fee (PF) Share",
          description: `Hospital deducted ${formatPHP(lineLevelPfDeducted)} for the Doctor's Professional Fee (PF) portion, but the case rate PF allocation for ${matchedPackages.map((p) => `${p.keyword} (${p.code})`).join(", ")} is ${formatPHP(totalPfCap)}.`,
          potential_savings: pfShortfall,
        });
      }
    } else if (extracted.philhealth_total < totalPhilHealthRate * 0.9) {
      caseRateShortfall = Math.max(
        0,
        totalPhilHealthRate - extracted.philhealth_total
      );
      flags.unshift({
        type: "excess_hci_charge",
        severity: "high",
        title: "Under-Deducted PhilHealth Case Rate",
        description: `Hospital deducted ${formatPHP(extracted.philhealth_total)}, but the official PhilHealth Circular rate for ${matchedPackages.map((p) => `${p.keyword} (${p.code})`).join(", ")} is ${formatPHP(totalPhilHealthRate)} (HCI: ${formatPHP(totalHciCap)} | PF: ${formatPHP(totalPfCap)}). Verify Claim Form 2 with the billing department.`,
        potential_savings: caseRateShortfall,
      });
    }
  }

  const totalDisputable = disputedOverchargeTotal + estimatedSeniorSavings;
  const fairOutOfPocket = Math.max(0, actualOutOfPocket - totalDisputable);

  // Generate Negotiation Brief Summary
  let negotiationBrief = `AUDIT REPORT SUMMARY for Statement #${extracted.statement_number || "N/A"}\n`;
  negotiationBrief += `Facility: ${extracted.hospital_name}\n`;
  negotiationBrief += `Total Billed: ${formatPHP(grossTotal)} | Current Due: ${formatPHP(actualOutOfPocket)}\n`;

  if (matchedPackages.length > 0) {
    negotiationBrief += `Identified Case Packages: ${matchedPackages.map((p) => `${p.keyword} (Case ${p.code} - ${formatPHP(p.total_rate)})`).join("; ")}\n\n`;
  }

  if (disputedOverchargeTotal > 0) {
    negotiationBrief += `⚠️ UNBUNDLED HOSPITAL CHARGES FLAGGED: ${formatPHP(disputedOverchargeTotal)}\n`;
    negotiationBrief += `Under PhilHealth All-Case-Rates, mandatory surgical/medical consumables are inclusive to the facility fee.\n\n`;
  }

  if (estimatedSeniorSavings > 0) {
    negotiationBrief += `⚠️ STATUTORY ${privilegeLabel.toUpperCase()} RELIEF DISCREPANCY: ${formatPHP(estimatedSeniorSavings)}\n`;
    negotiationBrief += `Applicable under ${statutoryRule.citation}, PhilHealth Advisory No. 2023-0036, and PhilHealth Circular 0056-2012 (12% VAT exemption and 20% discount must be deducted from gross charges FIRST, before subtracting PhilHealth).\n`;
    negotiationBrief += `Escalation Path: Local LGU ${escalationAgency} or PhilHealth Callback Channel (0917-898-7442).\n\n`;
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
    statutory_discount_type: resolvedDiscountType,
    detected_case_packages: matchedPackages.map(toPublicPackage),
    line_items: auditedItems,
    flags,
    negotiation_brief_summary: negotiationBrief,
    audited_at: new Date().toISOString(),
  };
}
