import type {
  AccommodationType,
  ExtractedBillData,
  AuditEngineResult,
  AuditedLineItem,
  AuditFlag,
  AuditTier,
  CatalogPackage,
  EligibilitySnapshot,
  FacilityLevel,
  MatchedCasePackage,
  PhilHealthContributorType,
  StatutoryDiscountType,
  StatutoryReconciliation,
  StatutoryRule,
} from "@/types/audit";
import { formatPHP } from "./utils";
import { detectVatExemptFromDescription } from "./gemini";
import {
  FACILITY_SERVICE_CATEGORIES,
  computeStatutoryRelief,
  resolveBillingCategory,
  round2,
  vatTreatmentFor,
} from "./billingClassification";
import {
  bestPackageForDiagnosis,
  containsPhrase,
  findMatchingAlias,
  normalizeText,
} from "./itemMatcher";
import {
  defaultAliasesForCode,
  selectActivePackagesForDate,
  selectStatutoryRuleForDate,
  toCatalogPackage,
  toMatchedPackage,
} from "./packageCatalog";

export { toCatalogPackage, toMatchedPackage };

export function normalizeStatutoryDiscountType(
  value?: unknown,
  fallbackIsSeniorOrPwd?: boolean
): StatutoryDiscountType {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "pwd") return "pwd";
    if (normalized === "senior") return "senior";
    if (normalized === "regular" || normalized === "none") return "regular";
  }
  if (typeof fallbackIsSeniorOrPwd === "boolean") {
    return fallbackIsSeniorOrPwd ? "senior" : "regular";
  }
  return "regular";
}

export const DEFAULT_ELIGIBILITY_SNAPSHOT: EligibilitySnapshot = {
  contributor_type: "unknown",
  accommodation_type: "unknown",
  has_mdr_or_pin: true,
  facility_level: "unknown",
};

export function normalizeEligibilitySnapshot(
  raw?: unknown
): EligibilitySnapshot {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ELIGIBILITY_SNAPSHOT };
  }
  const rec = raw as Record<string, unknown>;

  const validContributor: PhilHealthContributorType[] = [
    "direct",
    "indirect_nbb",
    "lifetime",
    "unknown",
  ];
  const contributor_type: PhilHealthContributorType =
    typeof rec.contributor_type === "string" &&
    validContributor.includes(rec.contributor_type as PhilHealthContributorType)
      ? (rec.contributor_type as PhilHealthContributorType)
      : "unknown";

  const validAccommodation: AccommodationType[] = [
    "basic_ward",
    "non_basic_private",
    "unknown",
  ];
  const accommodation_type: AccommodationType =
    typeof rec.accommodation_type === "string" &&
    validAccommodation.includes(rec.accommodation_type as AccommodationType)
      ? (rec.accommodation_type as AccommodationType)
      : "unknown";

  const has_mdr_or_pin =
    typeof rec.has_mdr_or_pin === "boolean" ? rec.has_mdr_or_pin : true;

  const validFacility: FacilityLevel[] = [
    "level_1",
    "level_2",
    "level_3",
    "asc",
    "unknown",
  ];
  const facility_level: FacilityLevel =
    typeof rec.facility_level === "string" &&
    validFacility.includes(rec.facility_level as FacilityLevel)
      ? (rec.facility_level as FacilityLevel)
      : "unknown";

  return {
    contributor_type,
    accommodation_type,
    has_mdr_or_pin,
    facility_level,
  };
}

/**
 * Rule engine for a single bill. Pure function: the PhilHealth package catalog
 * is passed in (see `packageCatalog.ts`) and nothing here holds peso rates,
 * so changing a case rate or circular is a data change, not a code change.
 */

export interface AuditOptions {
  auditId: string;
  isSeniorOrPwdOverride?: boolean;
  /** Mutually exclusive statutory privilege ('regular' | 'senior' | 'pwd' — no double-stacking per RA 9994 IRR). */
  statutoryDiscountType?: StatutoryDiscountType;
  /** Packages from the `philhealth_packages` catalog (may omit `aliases` if mapped from UI state). */
  referencePackages?: Array<CatalogPackage | MatchedCasePackage>;
  /** Optional parameterized Senior/PWD statutory rule from `statutory_rules`. */
  statutoryRule?: StatutoryRule;
  /** Optional list of versioned `statutory_rules` rows to date-select by the bill's statement/discharge date. */
  statutoryRules?: StatutoryRule[];
  /** Optional PhilHealth Member Eligibility & Ward Accommodation snapshot (Migration 007). */
  eligibilitySnapshot?: Partial<EligibilitySnapshot> | null;
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
    "Operating Room",
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
  const isVerified =
    typeof pkg.is_verified === "boolean"
      ? pkg.is_verified
      : !Boolean(pkg.source_url?.startsWith("ai_grounded"));
  return {
    code: pkg.code,
    keyword: pkg.keyword,
    total_rate: pkg.total_rate,
    hci_fee: pkg.hci_fee,
    prof_fee: pkg.prof_fee,
    inclusive_items: pkg.inclusive_items,
    is_verified: isVerified,
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
  const extractedDiscountType = normalizeStatutoryDiscountType(
    extracted.statutory_discount_type,
    extracted.is_senior_or_pwd
  );

  const resolvedDiscountType: StatutoryDiscountType =
    options.statutoryDiscountType !== undefined
      ? normalizeStatutoryDiscountType(options.statutoryDiscountType)
      : options.isSeniorOrPwdOverride === false
        ? "regular"
        : options.isSeniorOrPwdOverride === true
          ? extractedDiscountType !== "regular"
            ? extractedDiscountType
            : "senior"
          : extractedDiscountType;

  const isSeniorOrPwd = resolvedDiscountType !== "regular";
  const privilegeLabel =
    resolvedDiscountType === "pwd"
      ? "PWD (RA 10754)"
      : "Senior Citizen (RA 9994)";
  const escalationAgency =
    resolvedDiscountType === "pwd"
      ? "Persons with Disability Affairs Office (PDAO)"
      : "Office for Senior Citizens Affairs (OSCA)";

  const serviceDate =
    extracted.discharge_date ||
    extracted.statement_date ||
    extracted.admission_date;

  const statutoryRule =
    (options.statutoryRules && options.statutoryRules.length > 0
      ? selectStatutoryRuleForDate(options.statutoryRules, serviceDate)
      : undefined) ??
    options.statutoryRule ??
    DEFAULT_STATUTORY_RULE;

  const effectiveCitation =
    resolvedDiscountType === "pwd"
      ? statutoryRule.citation === "RA 9994 / RA 10754"
        ? "RA 10754 (Expanded Benefits and Privileges of Persons with Disability) & PDAO Guidelines"
        : statutoryRule.citation.includes("10754")
          ? `${statutoryRule.citation} & PDAO Guidelines`
          : `${statutoryRule.citation} / RA 10754 (PDAO Guidelines)`
      : statutoryRule.citation === "RA 9994 / RA 10754"
        ? "RA 9994 (Expanded Senior Citizens Act) & OSCA Guidelines"
        : statutoryRule.citation;

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
  let totalExpectedStatutoryRelief = 0;
  let hasLineLevelSequenceFlag = false;

  // Normalize line item categories up front so cost centers like "Emergency Room"
  // or "Operating Room" are never stranded in "Miscellaneous" on legacy saved bills.
  const normalizedLineItems = extracted.line_items.map((item) => ({
    ...item,
    category: resolveBillingCategory(item.description, item.category),
  }));

  // 2. Audit every line item
  const auditedItems: AuditedLineItem[] = normalizedLineItems.map((item) => {
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
    let vatTreatment: AuditedLineItem["vat_treatment"];
    let expectedStatutoryRelief: number | undefined;

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
        disputedOverchargeTotal = round2(disputedOverchargeTotal + itemBalance);

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

    // Check C: Two-Tier Statutory Senior Citizen / PWD Discount & Mandatory Sequence
    // Under RA 9994 / RA 10754, NIRC Sec. 109(G) (TRAIN Law / RA 10963), and BIR RR 7-2010:
    //   - Tier 1 (VAT-Inclusive Goods: Drugs/Medicines & Medical Supplies):
    //     Unless already VAT-exempt, strip 12% VAT first, then apply 20% discount:
    //     Expected Relief = Billed − (Billed ÷ 1.12 × 0.80).
    //   - Tier 2 (NIRC Sec. 109(G) VAT-Exempt Hospital & Medical Services: Room & Board / ER,
    //     Operating Room, Laboratory/Diagnostics, Professional Fees):
    //     Hospital, diagnostic, and physician services are VAT-exempt by law for all patients,
    //     so apply a straight 20% discount: Expected Relief = Billed × 0.20.
    const isCategoryEligible =
      statutoryRule.eligible_categories.includes(item.category) ||
      (statutoryRule.eligible_categories.includes("Room & Board") &&
        FACILITY_SERVICE_CATEGORIES.has(item.category));

    if (!isUnbundled && isSeniorOrPwd && isCategoryEligible) {
      statutoryEligible = true;
      const currentDiscount = item.discount_applied || 0;
      const philhealthOnItem = item.philhealth_deducted || 0;
      const alreadyVatExemptGoods =
        Boolean(item.is_vat_exempt) ||
        detectVatExemptFromDescription(item.description);

      // If the hospital already applied a discount exceeding the straight 20% rate
      // (meaning the hospital priced the line VAT-inclusive and bundled 12% VAT +
      // partial 20% discount into `discount_applied`), evaluate on VAT-inclusive basis.
      const hospitalBundledVatInDiscount =
        currentDiscount > item.total_amount * statutoryRule.discount_rate + 1;

      vatTreatment = hospitalBundledVatInDiscount
        ? "vat_inclusive_goods"
        : vatTreatmentFor(item.category, alreadyVatExemptGoods);

      const fullStatutoryRelief = computeStatutoryRelief(
        item.total_amount,
        vatTreatment,
        statutoryRule.vat_divisor,
        statutoryRule.discount_rate
      );
      const expectedVatExempt =
        vatTreatment === "vat_inclusive_goods"
          ? item.total_amount / statutoryRule.vat_divisor
          : item.total_amount;
      const expectedDiscount = round2(
        expectedVatExempt * statutoryRule.discount_rate
      );

      // Statutory relief cannot exceed the remaining charge after PhilHealth
      const maxPossibleRelief = round2(
        Math.min(
          fullStatutoryRelief,
          Math.max(0, item.total_amount - philhealthOnItem)
        )
      );
      expectedStatutoryRelief = maxPossibleRelief;
      totalExpectedStatutoryRelief = round2(
        totalExpectedStatutoryRelief + maxPossibleRelief
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
        const sequenceOvercharge = round2(
          Math.max(0, maxPossibleRelief - currentDiscount)
        );
        suggestedDeduction = round2(
          (suggestedDeduction || 0) + sequenceOvercharge
        );
        estimatedSeniorSavings = round2(
          estimatedSeniorSavings + sequenceOvercharge
        );

        const sequenceReason = `Hospital deducted PhilHealth (${formatPHP(philhealthOnItem)}) BEFORE computing the ${discountPct}% ${privilegeLabel} discount on "${item.description}", unlawfully reducing your statutory relief by ${formatPHP(sequenceOvercharge)}. Under PhilHealth Advisory No. 2023-0036, PhilHealth Circular 0056-2012, and ${effectiveCitation}, the 12% VAT exemption and ${discountPct}% discount must be deducted from gross charges FIRST, and PhilHealth deducted LAST.`;
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
        const missedRelief = round2(
          Math.max(0, maxPossibleRelief - currentDiscount)
        );
        suggestedDeduction = round2((suggestedDeduction || 0) + missedRelief);
        estimatedSeniorSavings = round2(estimatedSeniorSavings + missedRelief);
        const vatNote =
          vatTreatment === "vat_inclusive_goods"
            ? "+ 12% VAT exemption"
            : item.category === "Drugs/Medicines" ||
                item.category === "Medical Supplies"
              ? "(VAT-exempt item)"
              : "(VAT-exempt hospital/medical service under NIRC Sec. 109(G))";
        flagReason = flagReason
          ? `${flagReason} Also missing statutory ${privilegeLabel} ${discountPct}% discount ${vatNote} (potential relief: ${formatPHP(missedRelief)}).`
          : `Missing or incomplete statutory ${privilegeLabel} ${discountPct}% discount ${vatNote} under ${effectiveCitation} (potential relief: ${formatPHP(missedRelief)}).`;

        flags.push({
          type: "missing_statutory_discount",
          severity: "medium",
          title: `Missing ${privilegeLabel} Relief: ${item.description}`,
          description: `Eligible for ${effectiveCitation} statutory discount (deducted prior to PhilHealth per Advisory 2023-0036; escalate unresolved violations to LGU ${escalationAgency}). Expected savings: ${formatPHP(missedRelief)}.`,
          potential_savings: missedRelief,
          item_id: item.id,
        });
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
      ...(vatTreatment ? { vat_treatment: vatTreatment } : {}),
      ...(expectedStatutoryRelief !== undefined
        ? { expected_statutory_relief: expectedStatutoryRelief }
        : {}),
      ...(isManual ? { is_manual_override: true } : {}),
    };
  });

  // 2a. Partial Credit Reconciliation (Prevent Double-Counting Existing SOA Credits):
  //     Reconcile `totalExpectedStatutoryRelief` against credits already granted in the
  //     SOA PAYMENT/CN column (`senior_pwd_discount_total`) and per-line `discount_applied`.
  const lineDiscountSum = round2(
    normalizedLineItems.reduce((sum, i) => sum + (i.discount_applied || 0), 0)
  );
  const headerDiscountCredit = round2(extracted.senior_pwd_discount_total || 0);
  const totalAlreadyCreditedDiscount =
    lineDiscountSum > 0 && headerDiscountCredit > 0
      ? Math.abs(headerDiscountCredit - lineDiscountSum) <= 1
        ? Math.max(headerDiscountCredit, lineDiscountSum)
        : round2(headerDiscountCredit + lineDiscountSum)
      : round2(headerDiscountCredit + lineDiscountSum);

  const unallocatedHeaderCredit = Math.max(
    0,
    round2(totalAlreadyCreditedDiscount - lineDiscountSum)
  );

  if (isSeniorOrPwd && unallocatedHeaderCredit > 0) {
    // Annotate any line item whose expected statutory relief matches the lump-sum
    // SOA credit (e.g. CT-Scan ₱6,200 × 20% = ₱1,240.00 Senior Citizen Discount credit)
    for (const item of auditedItems) {
      if (
        item.statutory_discount_eligible &&
        item.expected_statutory_relief !== undefined &&
        Math.abs(item.expected_statutory_relief - unallocatedHeaderCredit) <=
          0.05
      ) {
        item.statutory_credit_applied = unallocatedHeaderCredit;
        if (item.flag_reason) {
          item.flag_reason = `${item.flag_reason} Note: SOA PAYMENT/CN column already credits ${formatPHP(unallocatedHeaderCredit)} (matching this item's 20% discount), which is netted out in the statement reconciliation below.`;
        }
        break;
      }
    }

    if (!hasLineLevelSequenceFlag) {
      estimatedSeniorSavings = Math.max(
        0,
        round2(totalExpectedStatutoryRelief - totalAlreadyCreditedDiscount)
      );
    }
  }

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
      const summaryOvercharge = round2(
        Math.max(0, extracted.net_balance_due - legalNetPayable)
      );
      const additionalSavings = round2(
        Math.max(0, summaryOvercharge - estimatedSeniorSavings)
      );
      estimatedSeniorSavings = round2(
        estimatedSeniorSavings + additionalSavings
      );

      flags.unshift({
        type: "wrong_deduction_sequence",
        severity: "high",
        title: `Statutory Violation: PhilHealth Deducted Before ${privilegeLabel} Discount`,
        description: `Statement summary shows PhilHealth (${formatPHP(extracted.philhealth_total)}) was subtracted prior to computing the ${Math.round(statutoryRule.discount_rate * 100)}% ${privilegeLabel} discount, inflating your net payable to ${formatPHP(extracted.net_balance_due)} instead of ${formatPHP(legalNetPayable)} (overcharge of ${formatPHP(summaryOvercharge)}). Under PhilHealth Advisory No. 2023-0036, PhilHealth Circular 0056-2012, and ${effectiveCitation}, the 12% VAT exemption and 20% discount must be applied FIRST across HCI and Professional Fees before deducting PhilHealth. Report unresolved violations to ${escalationAgency} or PhilHealth Callback Channel (0917-898-7442).`,
        potential_savings: summaryOvercharge,
      });
    }
  }

  // 3. Separate HCI Fee vs PF Share Cap Verification & Fair Out-of-Pocket Math
  const computedItemsGross = round2(
    normalizedLineItems.reduce((sum, i) => sum + i.total_amount, 0)
  );
  const grossTotal = round2(extracted.gross_total || computedItemsGross);
  const actualOutOfPocket = round2(extracted.net_balance_due);

  // 3a. Arithmetic & Rounding Discrepancy Check on the Hospital's Stated Balance
  const explicitCashPayments = round2(
    extracted.cash_or_hmo_payments_total ?? 0
  );
  const philhealthDeductedTotal = round2(extracted.philhealth_total || 0);
  const balanceBeforePayments = round2(
    grossTotal - totalAlreadyCreditedDiscount - philhealthDeductedTotal
  );

  // Support both explicit `cash_or_hmo_payments_total` and legacy saved OCR records
  // where a whole-peso cash/deposit payment (e.g. ₱4,960.00) was subtracted in `net_balance_due`.
  let effectiveCashPayments = explicitCashPayments;
  if (
    effectiveCashPayments === 0 &&
    actualOutOfPocket > 0 &&
    balanceBeforePayments - actualOutOfPocket > 10
  ) {
    const rawGap = balanceBeforePayments - actualOutOfPocket;
    const roundedTenPesoPayment = Math.round(rawGap / 10) * 10;
    const residual = round2(
      actualOutOfPocket - (balanceBeforePayments - roundedTenPesoPayment)
    );
    if (
      roundedTenPesoPayment > 0 &&
      Math.abs(residual) > 0.005 &&
      Math.abs(residual) <= 5
    ) {
      effectiveCashPayments = roundedTenPesoPayment;
    }
  }

  const computedNetBalance = round2(
    grossTotal -
      totalAlreadyCreditedDiscount -
      effectiveCashPayments -
      philhealthDeductedTotal
  );

  let arithmeticDiscrepancy = 0;
  if (
    actualOutOfPocket > 0 &&
    (effectiveCashPayments > 0 ||
      (Math.abs(actualOutOfPocket - computedNetBalance) > 0.005 &&
        Math.abs(actualOutOfPocket - computedNetBalance) <= 100))
  ) {
    const rawDiff = round2(actualOutOfPocket - computedNetBalance);
    if (Math.abs(rawDiff) > 0.005) {
      arithmeticDiscrepancy = rawDiff;
    }
  }

  if (arithmeticDiscrepancy > 0) {
    flags.push({
      type: "arithmetic_discrepancy",
      severity: "medium",
      title: `SOA Arithmetic / Rounding Discrepancy (+${formatPHP(arithmeticDiscrepancy)})`,
      description: `Hospital's stated balance due (${formatPHP(actualOutOfPocket)}) exceeds the computed net balance (${formatPHP(grossTotal)} gross − ${formatPHP(totalAlreadyCreditedDiscount)} statutory discount credit${effectiveCashPayments > 0 ? ` − ${formatPHP(effectiveCashPayments)} payment` : ""}${philhealthDeductedTotal > 0 ? ` − ${formatPHP(philhealthDeductedTotal)} PhilHealth` : ""} = ${formatPHP(computedNetBalance)}) by ${formatPHP(arithmeticDiscrepancy)}.`,
      potential_savings: arithmeticDiscrepancy,
    });
  }

  const totalHciCap = matchedPackages.reduce((sum, p) => sum + p.hci_fee, 0);
  const totalPfCap = matchedPackages.reduce((sum, p) => sum + p.prof_fee, 0);
  const totalPhilHealthRate = matchedPackages.reduce(
    (sum, p) => sum + p.total_rate,
    0
  );

  const lineLevelHciDeducted = normalizedLineItems
    .filter((i) => i.category !== "Professional Fees")
    .reduce((sum, i) => sum + (i.philhealth_deducted || 0), 0);
  const lineLevelPfDeducted = normalizedLineItems
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

  // Ensure applied PhilHealth and statutory deductions on the statement are reflected
  // in the baseline balance before subtracting newly flagged overcharges, statutory
  // relief gaps, and HCI/PF case rate shortfalls.
  const effectiveHospitalDue =
    actualOutOfPocket >= grossTotal &&
    (extracted.philhealth_total > 0 || extracted.senior_pwd_discount_total > 0)
      ? Math.max(
          0,
          round2(
            grossTotal -
              extracted.philhealth_total -
              extracted.senior_pwd_discount_total -
              effectiveCashPayments
          )
        )
      : actualOutOfPocket;

  const eligibilitySnapshot = normalizeEligibilitySnapshot(
    options.eligibilitySnapshot ?? extracted.eligibility_snapshot
  );

  const positiveArithmeticDiscrepancy = Math.max(0, arithmeticDiscrepancy);
  const preNbbDisputable = round2(
    disputedOverchargeTotal +
      estimatedSeniorSavings +
      caseRateShortfall +
      positiveArithmeticDiscrepancy
  );
  const balanceBeforeNbb = Math.max(
    0,
    round2(effectiveHospitalDue - preNbbDisputable)
  );

  // 4. No Balance Billing (NBB) / Zero Co-Payment & MDR Readiness Check
  //    Under PhilHealth Circular 2016-0020 & RA 11223 (UHC Act), Indirect Contributors
  //    (Indigent, Sponsored, Kasambahay, Senior Citizens under RA 10645, Solo Parents
  //    under PC 2026-0015, PWDs under PC 2026-0017), Lifetime Members, and Senior/PWD
  //    patients admitted in Basic / Ward accommodation are entitled to Zero Co-Payment.
  const isNbbQualifiedMember =
    eligibilitySnapshot.contributor_type === "indirect_nbb" ||
    eligibilitySnapshot.contributor_type === "lifetime" ||
    isSeniorOrPwd;

  let nbbSavings = 0;

  if (
    isNbbQualifiedMember &&
    eligibilitySnapshot.accommodation_type === "basic_ward" &&
    balanceBeforeNbb > 0
  ) {
    nbbSavings = balanceBeforeNbb;
    const memberCategoryText =
      eligibilitySnapshot.contributor_type === "indirect_nbb"
        ? "Indirect / NBB-Sponsored Member (Indigent / Sponsored / Kasambahay / Senior RA 10645 / Solo Parent PC 2026-0015 / PWD PC 2026-0017)"
        : eligibilitySnapshot.contributor_type === "lifetime"
          ? "PhilHealth Lifetime Member"
          : privilegeLabel;

    flags.unshift({
      type: "nbb_violation",
      severity: "high",
      title: "Potential No Balance Billing (NBB) / Zero Co-Payment Violation",
      description: `Patient qualifies as ${memberCategoryText} admitted in Basic / Ward accommodation, where remaining covered charges (${formatPHP(nbbSavings)}) should carry Zero Co-Payment (₱0.00 out-of-pocket) under PhilHealth Circular 2016-0020 and Republic Act No. 11223 (Universal Health Care Act). Request NBB zero-balance billing compliance or Medical Social Service / Malasakit Center endorsement prior to discharge.`,
      potential_savings: nbbSavings,
    });
  } else if (
    (eligibilitySnapshot.contributor_type === "indirect_nbb" ||
      eligibilitySnapshot.contributor_type === "lifetime") &&
    eligibilitySnapshot.accommodation_type === "non_basic_private"
  ) {
    flags.push({
      type: "compliance_note",
      severity: "low",
      title: "Private Room Co-Payment Applies (NBB Waived by Upgrade)",
      description:
        "Under PhilHealth Circular 2016-0020 and RA 11223, admission in a non-basic / private room waives No Balance Billing (Zero Co-Payment). Standard PhilHealth All-Case-Rates (ACR) deductions and mandatory Senior/PWD 20% discount + 12% VAT exemption still apply to your statement.",
      potential_savings: 0,
    });
  }

  if (!eligibilitySnapshot.has_mdr_or_pin) {
    flags.unshift({
      type: "compliance_note",
      severity: "medium",
      title: "Pre-Discharge Checklist: Present PhilHealth MDR / PIN Before Paying",
      description:
        "Patient has not yet presented a PhilHealth Member Data Record (MDR) or PhilHealth Identification Number (PIN) at billing. Retrieve your MDR/PIN online via the PhilHealth Member Portal (memberinquiry.philhealth.gov.ph) or the eGovPH Super App, or ask the hospital's PhilHealth CARES / Malasakit Center desk to verify your PIN before settlement so your Case Rate deduction is applied.",
      potential_savings: 0,
    });
  }

  const totalDisputable = round2(preNbbDisputable + nbbSavings);
  const fairOutOfPocket = Math.max(
    0,
    round2(effectiveHospitalDue - totalDisputable)
  );

  const statutoryReconciliation: StatutoryReconciliation | undefined =
    isSeniorOrPwd
      ? {
          total_entitled: totalExpectedStatutoryRelief,
          already_credited: totalAlreadyCreditedDiscount,
          net_additional: estimatedSeniorSavings,
          cash_or_hmo_payments: effectiveCashPayments,
          philhealth_deducted: philhealthDeductedTotal,
          computed_gross: grossTotal,
          computed_balance: computedNetBalance,
          stated_balance: actualOutOfPocket,
          arithmetic_discrepancy: arithmeticDiscrepancy,
          reconciled_balance: fairOutOfPocket,
        }
      : undefined;

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

  if (caseRateShortfall > 0) {
    negotiationBrief += `⚠️ UNDER-DEDUCTED PHILHEALTH CASE RATE: ${formatPHP(caseRateShortfall)}\n`;
    negotiationBrief += `Hospital deducted ${formatPHP(extracted.philhealth_total)} instead of the ${formatPHP(totalPhilHealthRate)} case rate allocation (HCI: ${formatPHP(totalHciCap)} | PF: ${formatPHP(totalPfCap)}).\n\n`;
  }

  if (estimatedSeniorSavings > 0) {
    negotiationBrief += `⚠️ STATUTORY ${privilegeLabel.toUpperCase()} RELIEF DISCREPANCY: ${formatPHP(estimatedSeniorSavings)}\n`;
    if (totalAlreadyCreditedDiscount > 0) {
      negotiationBrief += `Total Statutory Entitlement: ${formatPHP(totalExpectedStatutoryRelief)} | Less Already Credited on SOA: ${formatPHP(totalAlreadyCreditedDiscount)} | Net Additional Relief: ${formatPHP(estimatedSeniorSavings)}\n`;
    }
    negotiationBrief += `Applicable under ${effectiveCitation}, NIRC Sec. 109(G), PhilHealth Advisory No. 2023-0036, and PhilHealth Circular 0056-2012.\n`;
    negotiationBrief += `Escalation Path: Local LGU ${escalationAgency} or PhilHealth Callback Channel (0917-898-7442).\n\n`;
  }

  if (arithmeticDiscrepancy > 0) {
    negotiationBrief += `⚠️ SOA ARITHMETIC / ROUNDING DISCREPANCY: ${formatPHP(arithmeticDiscrepancy)}\n`;
    negotiationBrief += `Printed balance (${formatPHP(actualOutOfPocket)}) exceeds computed net balance (${formatPHP(computedNetBalance)}) by ${formatPHP(arithmeticDiscrepancy)}.\n\n`;
  }

  if (nbbSavings > 0) {
    negotiationBrief += `⚠️ NO BALANCE BILLING (NBB) / ZERO CO-PAYMENT ENTITLEMENT: ${formatPHP(nbbSavings)}\n`;
    negotiationBrief += `Applicable under PhilHealth Circular 2016-0020 and Republic Act No. 11223 (UHC Act) for Basic / Ward accommodation.\n\n`;
  }

  if (!eligibilitySnapshot.has_mdr_or_pin) {
    negotiationBrief += `📋 PRE-DISCHARGE REMINDER: Present your PhilHealth MDR / PIN (retrievable via the PhilHealth Member Portal or eGovPH Super App) to the billing clerk prior to settlement.\n\n`;
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
    case_rate_shortfall: caseRateShortfall,
    nbb_savings: nbbSavings,
    ...(arithmeticDiscrepancy !== 0
      ? { arithmetic_discrepancy: arithmeticDiscrepancy }
      : {}),
    ...(statutoryReconciliation
      ? { statutory_reconciliation: statutoryReconciliation }
      : {}),
    philhealth_coverage_total: extracted.philhealth_total || totalPhilHealthRate,
    senior_pwd_savings: estimatedSeniorSavings,
    statutory_discount_type: resolvedDiscountType,
    eligibility_snapshot: eligibilitySnapshot,
    detected_case_packages: matchedPackages.map(toPublicPackage),
    line_items: auditedItems,
    flags,
    negotiation_brief_summary: negotiationBrief,
    audited_at: new Date().toISOString(),
  };
}
