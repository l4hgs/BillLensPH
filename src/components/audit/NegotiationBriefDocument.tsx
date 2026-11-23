"use client";

import React from "react";
import { formatPHP } from "@/lib/utils";
import { normalizeStatutoryDiscountType } from "@/lib/auditEngine";
import type {
  AuditEngineResult,
  ExtractedBillData,
  StatutoryDiscountType,
} from "@/types/audit";

export interface NegotiationBriefMeta {
  representativeName: string;
  relationship: string;
  contactInfo: string;
  preparedDate: string;
  admissionDate?: string;
  dischargeDate?: string;
  isSeniorOrPwd: boolean;
  statutoryDiscountType?: StatutoryDiscountType;
}

interface NegotiationBriefDocumentProps {
  audit: AuditEngineResult;
  ocr?: ExtractedBillData | null;
  meta: NegotiationBriefMeta;
}

function formatCircularLabel(circularNumber?: string): string | null {
  if (!circularNumber?.trim()) return null;
  const trimmed = circularNumber.trim();
  if (/^PhilHealth Circular/i.test(trimmed)) return trimmed;
  const cleaned = trimmed.replace(/^PC-/i, "");
  return `PhilHealth Circular No. ${cleaned}`;
}

export function buildPlainTextNegotiationBrief(
  audit: AuditEngineResult,
  meta: NegotiationBriefMeta
): string {
  const reviewItems = audit.line_items.filter(
    (item) =>
      item.status === "review_worthy" ||
      item.status === "itemized_verification"
  );
  const arithmeticAdjustment = Math.max(0, audit.arithmetic_discrepancy ?? 0);
  const potentialSavings =
    audit.disputed_overcharge_total +
    audit.senior_pwd_savings +
    (audit.case_rate_shortfall ?? 0) +
    (audit.nbb_savings ?? 0) +
    arithmeticAdjustment;

  const discountType = normalizeStatutoryDiscountType(
    meta.statutoryDiscountType ?? audit.statutory_discount_type,
    meta.isSeniorOrPwd || audit.senior_pwd_savings > 0
  );
  const isPwd = discountType === "pwd";
  const hasStatutoryPrivilege =
    discountType !== "regular" ||
    meta.isSeniorOrPwd ||
    audit.senior_pwd_savings > 0;
  const facilityOwnership =
    audit.facility_ownership ??
    audit.eligibility_snapshot?.facility_ownership ??
    "private";
  const isGovernmentFacility = facilityOwnership === "government";
  const hasNbbEntitlement =
    audit.is_nbb_eligible === true ||
    (audit.nbb_savings ?? 0) > 0 ||
    (isGovernmentFacility &&
      (audit.eligibility_snapshot?.contributor_type === "indirect_nbb" ||
        audit.eligibility_snapshot?.contributor_type === "lifetime" ||
        hasStatutoryPrivilege) &&
      audit.eligibility_snapshot?.accommodation_type === "basic_ward");

  const primaryCircularLabel = formatCircularLabel(
    audit.circular_number ??
      audit.detected_case_packages[0]?.circular_number ??
      audit.detected_case_packages[0]?.circular_id
  );
  const reconciledBalanceLabel =
    audit.reconciled_balance_label ||
    ((audit.statutory_reconciliation?.philhealth_deducted ?? 0) > 0
      ? "Reconciled Balance Due (After PhilHealth Case Rate)"
      : "Reconciled Balance Due (Before PhilHealth Case Rate)");

  const pkgLines =
    audit.detected_case_packages.length > 0
      ? audit.detected_case_packages
          .map((pkg) => {
            const circ = formatCircularLabel(
              pkg.circular_number ?? pkg.circular_id
            );
            return `  • ${pkg.keyword} (RVS/ICD Code: ${pkg.code}${circ ? ` · ${circ}` : ""}) — Total Case Rate: ${formatPHP(
              pkg.total_rate
            )} (HCI Fee: ${formatPHP(pkg.hci_fee)} | PF Share: ${formatPHP(
              pkg.prof_fee
            )}${pkg.is_estimated_split ? " — est. 70/30 split" : ""})`;
          })
          .join("\n")
      : "  • Standard PhilHealth / Statutory Review (No specific RVS/ICD package matched)";

  const itemLines =
    reviewItems.length > 0
      ? reviewItems
          .map(
            (item, idx) =>
              `  ${idx + 1}. ${item.description} [${item.category}]\n     Billed: ${
                item.quantity
              } × ${formatPHP(item.unit_price)} = ${formatPHP(
                item.total_amount
              )}${
                item.suggested_deduction && item.suggested_deduction > 0
                  ? ` | Requested Adjustment: -${formatPHP(item.suggested_deduction)}`
                  : ""
              }\n     Basis: ${
                item.flag_reason ||
                "Subject to PhilHealth ACR bundling / statutory discount verification."
              }`
          )
          .join("\n\n")
      : "  • All itemized charges appear aligned with matched PhilHealth case rates.";

  return [
    "======================================================================",
    "FORMAL REQUEST FOR ITEMIZED BILLING RECONCILIATION & BENEFIT REVIEW",
    "======================================================================",
    `Date Prepared: ${meta.preparedDate}`,
    `To: Head of Billing & PhilHealth Claims Section${isGovernmentFacility ? " / Medical Social Service (Malasakit Center Desk)" : ""}`,
    `Institution: ${audit.hospital_name}`,
    `Patient Name: ${audit.patient_name || "Patient on Record"}`,
    `Statement / SOA No.: ${audit.statement_number || "Per Attached Statement"}`,
    `Audit Reference ID: ${audit.audit_id}`,
    "",
    "Dear Billing & PhilHealth Claims Officer,",
    "",
    "Good day. On behalf of the patient named above, we respectfully request a line-item reconciliation of our Itemized Statement of Account (ISA) prior to final settlement, pursuant to PhilHealth All Case Rates (ACR) anti-unbundling guidelines and applicable statutory discounts.",
    "",
    "1. EXECUTIVE FINANCIAL SUMMARY",
    `   • Total Gross Hospital Bill:          ${formatPHP(audit.gross_total)}`,
    `   • Hospital Stated Net Balance:        ${formatPHP(audit.actual_out_of_pocket)}`,
    `   • PhilHealth Case Rate Benefit:       ${formatPHP(audit.philhealth_coverage_total)}`,
    `   • ${isPwd ? "PWD Statutory Savings (RA 10754):" : "Senior Citizen / PWD Savings:    "}   ${formatPHP(audit.senior_pwd_savings)}`,
    `   • Flagged Unbundled / Review Items:   ${formatPHP(audit.disputed_overcharge_total)}`,
    ...(audit.case_rate_shortfall && audit.case_rate_shortfall > 0
      ? [
          `   • Under-Deducted Case Rate Shortfall: ${formatPHP(audit.case_rate_shortfall)}`,
        ]
      : []),
    ...(audit.nbb_savings && audit.nbb_savings > 0
      ? [
          `   • No Balance Billing (NBB) Relief:    ${formatPHP(audit.nbb_savings)}`,
        ]
      : []),
    ...(audit.statutory_reconciliation &&
    audit.statutory_reconciliation.already_credited > 0
      ? [
          `   • Total Statutory Discount Entitled:  ${formatPHP(audit.statutory_reconciliation.total_entitled)}`,
          `   • Less Discount Already Credited:     -${formatPHP(audit.statutory_reconciliation.already_credited)}`,
        ]
      : []),
    ...(arithmeticAdjustment > 0
      ? [
          `   • SOA Arithmetic / Rounding Adj.:     ${formatPHP(arithmeticAdjustment)}`,
        ]
      : []),
    `   • Total Identified Adjustments:       ${formatPHP(potentialSavings)}`,
    `   • ${reconciledBalanceLabel}: ${formatPHP(audit.fair_out_of_pocket)}`,
    "",
    "2. MATCHED PHILHEALTH CASE RATE PACKAGE(S)",
    pkgLines,
    "",
    `3. ITEMIZED SCHEDULE OF FLAGGED CHARGES FOR REVIEW (${reviewItems.length} ITEM(S))`,
    itemLines,
    "",
    "4. STATUTORY & REGULATORY BASIS",
    `   • PhilHealth All Case Rates (ACR) Policy${primaryCircularLabel ? ` (${primaryCircularLabel})` : ""}: Mandatory operating room, delivery room, and ward supplies, diagnostic tests, and bundled drugs included in the Health Care Institution (HCI) fee should not be billed separately as out-of-pocket charges.`,
    ...(hasStatutoryPrivilege
      ? [
          isPwd
            ? "   • Republic Act No. 10754 (An Act Expanding the Benefits and Privileges of Persons with Disability), PDAO Guidelines, PhilHealth Advisory No. 2023-0036 & PhilHealth Circular 0056-2012: Entitles the PWD patient to a 12% VAT exemption FIRST, followed by a mandatory 20% discount on the VAT-exempt balance across HCI and Professional Fees, with PhilHealth Case Rate benefits deducted LAST. Unresolved violations may be escalated to the local LGU Persons with Disability Affairs Office (PDAO) or the PhilHealth Callback Channel (0917-898-7442)."
            : "   • Republic Act No. 9994 (Expanded Senior Citizens Act), OSCA Guidelines, PhilHealth Advisory No. 2023-0036 & PhilHealth Circular 0056-2012: Entitles the Senior Citizen patient to a 12% VAT exemption FIRST, followed by a mandatory 20% discount on the VAT-exempt balance across HCI and Professional Fees, with PhilHealth Case Rate benefits deducted LAST. Unresolved violations may be escalated to the local LGU Office for Senior Citizens Affairs (OSCA) or the PhilHealth Callback Channel (0917-898-7442).",
        ]
      : []),
    ...(hasNbbEntitlement
      ? [
          "   • PhilHealth Circular 2016-0020, PhilHealth Circular 2017-0017 & Republic Act No. 11223 (Universal Health Care Act — No Balance Billing / Zero Co-Payment Policy): Qualified Indirect Contributors (Indigent, Sponsored, Kasambahay, Senior Citizen under RA 10645, Solo Parent under PC 2026-0015, PWD under PC 2026-0017) and Lifetime Members admitted at a government facility in basic/ward accommodation (or private room when no ward bed was available at admission) are entitled to Zero Co-Payment (₱0.00 out-of-pocket) for covered confinement services.",
        ]
      : []),
    isGovernmentFacility
      ? "   • Republic Act No. 11463 (Malasakit Centers Act): Please issue an updated, certified Statement of Account reflecting reconciled PhilHealth and statutory deductions to support our Medical Social Service / Malasakit Center Desk endorsement for unified DOH, DSWD, PCSO, and PhilHealth assistance."
      : "   • Financial Assistance Routing (Private Hospital): Please issue an updated, certified Final Statement of Account and Clinical Abstract to support our application for DSWD Assistance to Individuals in Crisis Situation (AICS), PCSO Medical Access Program (MAP), and DOH Medical Assistance to Indigent and Financially Incapacitated Patients (MAIP, for DOH-accredited private hospitals).",
    "",
    "Respectfully submitted by:",
    `${meta.representativeName || audit.patient_name || "Authorized Patient Representative"}`,
    `${meta.relationship || "Patient / Authorized Family Representative"}`,
    meta.contactInfo ? `Contact: ${meta.contactInfo}` : null,
    "",
    "Disclaimer: Generated via BillLens PH for hospital billing audit and financial assistance navigation only; not formal medical or legal advice.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function NegotiationBriefDocument({
  audit,
  ocr,
  meta,
}: NegotiationBriefDocumentProps) {
  const reviewItems = audit.line_items.filter(
    (item) =>
      item.status === "review_worthy" ||
      item.status === "itemized_verification"
  );
  const coveredItems = audit.line_items.filter(
    (item) => item.status === "covered"
  );
  const outOfPocketItems = audit.line_items.filter(
    (item) => item.status === "out_of_pocket"
  );
  const arithmeticAdjustment = Math.max(0, audit.arithmetic_discrepancy ?? 0);
  const potentialSavings =
    audit.disputed_overcharge_total +
    audit.senior_pwd_savings +
    (audit.case_rate_shortfall ?? 0) +
    (audit.nbb_savings ?? 0) +
    arithmeticAdjustment;

  const statutoryRecon = audit.statutory_reconciliation;
  const totalStatutoryEntitled =
    statutoryRecon?.total_entitled ??
    reviewItems.reduce(
      (sum, item) =>
        sum +
        (item.expected_statutory_relief ??
          (item.statutory_discount_eligible
            ? item.suggested_deduction || 0
            : 0)),
      0
    );
  const alreadyCreditedStatutory =
    statutoryRecon?.already_credited ??
    (ocr?.senior_pwd_discount_total || 0);

  const discountType = normalizeStatutoryDiscountType(
    meta.statutoryDiscountType ?? audit.statutory_discount_type,
    meta.isSeniorOrPwd || audit.senior_pwd_savings > 0
  );
  const isPwd = discountType === "pwd";
  const hasStatutoryPrivilege =
    discountType !== "regular" ||
    meta.isSeniorOrPwd ||
    audit.senior_pwd_savings > 0;
  const facilityOwnership =
    audit.facility_ownership ??
    audit.eligibility_snapshot?.facility_ownership ??
    "private";
  const isGovernmentFacility = facilityOwnership === "government";
  const hasNbbEntitlement =
    audit.is_nbb_eligible === true ||
    (audit.nbb_savings ?? 0) > 0 ||
    (isGovernmentFacility &&
      (audit.eligibility_snapshot?.contributor_type === "indirect_nbb" ||
        audit.eligibility_snapshot?.contributor_type === "lifetime" ||
        hasStatutoryPrivilege) &&
      audit.eligibility_snapshot?.accommodation_type === "basic_ward");

  const primaryCircularLabel = formatCircularLabel(
    audit.circular_number ??
      audit.detected_case_packages[0]?.circular_number ??
      audit.detected_case_packages[0]?.circular_id
  );
  const reconciledBalanceLabel =
    audit.reconciled_balance_label ||
    ((ocr?.philhealth_total ??
      audit.statutory_reconciliation?.philhealth_deducted ??
      0) > 0
      ? "Reconciled Balance Due (After PhilHealth Case Rate)"
      : "Reconciled Balance Due (Before PhilHealth Case Rate)");

  const admissionDate = meta.admissionDate || ocr?.admission_date;
  const dischargeDate = meta.dischargeDate || ocr?.discharge_date;

  return (
    <article
      aria-label="Formal Hospital Billing Negotiation Brief"
      className="mx-auto max-w-4xl bg-white p-6 sm:p-10 rounded-2xl border border-slate-200/80 text-slate-900 print:max-w-none print:rounded-none print:border-0 print:p-0"
    >
      {/* Top Document Letterhead (No Decorative Icons, Crisp Reference Block) */}
      <header className="flex flex-col justify-between gap-4 border-b-2 border-slate-900 pb-5 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
            BillLens PH · Patient Financial Advocacy Brief
          </p>
          <h1 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
            REQUEST FOR ITEMIZED BILLING RECONCILIATION
          </h1>
          <p className="text-xs font-medium text-slate-500">
            PhilHealth All Case Rates (ACR) &amp; Statutory Benefit Verification
          </p>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Audit Reference
          </p>
          <p className="font-mono text-xs font-bold text-slate-900 mt-0.5">
            #{audit.audit_id.slice(0, 12).toUpperCase()}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Date: {meta.preparedDate}
          </p>
        </div>
      </header>

      {/* Recipient & Patient Metadata Grid (Hairline Dividers, No Heavy Gray Box) */}
      <section className="print-avoid-break my-5 grid grid-cols-1 gap-4 border-b border-slate-200/80 pb-5 text-xs sm:grid-cols-2 sm:gap-6 print:grid-cols-2 print:gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Addressed To
          </p>
          <p className="font-bold text-slate-900">
            Head of Billing &amp; PhilHealth Claims Section
          </p>
          <p className="font-semibold text-slate-800">{audit.hospital_name}</p>
          {isGovernmentFacility && (
            <p className="text-[11px] text-slate-500">
              Copy Furnished: Medical Social Service / Malasakit Center Desk
            </p>
          )}
        </div>

        <div className="space-y-1 border-t border-slate-200/80 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 print:border-l print:border-t-0 print:pl-6 print:pt-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Patient &amp; Statement Details
          </p>
          <p className="text-xs">
            <span className="font-medium text-slate-500">Patient Name: </span>
            <span className="font-bold text-slate-900">
              {audit.patient_name || "Patient on Record"}
            </span>
          </p>
          <p className="text-xs">
            <span className="font-medium text-slate-500">Statement / SOA #: </span>
            <span className="font-bold text-slate-900 font-mono">
              {audit.statement_number || "Per Attached ISA"}
            </span>
          </p>
          {(admissionDate || dischargeDate) && (
            <p className="text-xs">
              <span className="font-medium text-slate-500">Confinement Period: </span>
              <span className="font-semibold text-slate-900 font-mono tabular-nums">
                {admissionDate || "—"} to {dischargeDate || "Present"}
              </span>
            </p>
          )}
          <p className="text-xs">
            <span className="font-medium text-slate-500">Statutory Status: </span>
            <span className="font-bold text-slate-900">
              {isPwd
                ? "Person with Disability — PWD (RA 10754 / PDAO)"
                : hasStatutoryPrivilege
                  ? "Senior Citizen (60+) (RA 9994 / OSCA)"
                  : "Standard PhilHealth Member / Dependent"}
            </span>
          </p>
        </div>
      </section>

      {/* Formal Salutation & Opening Statement */}
      <section className="space-y-2 text-xs leading-relaxed text-slate-800">
        <p className="font-bold text-slate-900">
          Dear Billing &amp; PhilHealth Claims Officer,
        </p>
        <p>
          Good day. On behalf of patient{" "}
          <strong className="font-bold text-slate-900">
            {audit.patient_name || "named above"}
          </strong>
          , we respectfully request an itemized review and reconciliation of our
          Statement of Account at{" "}
          <strong className="font-bold text-slate-900">{audit.hospital_name}</strong>{" "}
          prior to final settlement. Specifically, we kindly ask your office to
          verify the bundled PhilHealth All Case Rates (ACR) coverage and
          statutory discount computations summarized below:
        </p>
      </section>

      {/* Section 1: Executive Financial Summary (Full-Width Hairline Strip, Only Peso Figures Colored) */}
      <section className="print-avoid-break mt-6 space-y-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
          1. Executive Financial Audit Summary
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x print:divide-y-0 print:divide-x divide-slate-200/80 border-y border-slate-200/80 py-3.5 gap-3 sm:gap-0 print:gap-0">
          <div className="pr-3 sm:pr-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Gross Billed
            </span>
            <span className="mt-1 block text-base sm:text-lg font-black text-slate-900 font-mono tabular-nums whitespace-nowrap">
              {formatPHP(audit.gross_total)}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {audit.line_items.length} line items
            </span>
          </div>

          <div className="pl-3 sm:px-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              PhilHealth Benefit
            </span>
            <span className="mt-1 block text-base sm:text-lg font-black text-[#2563EB] font-mono tabular-nums whitespace-nowrap">
              {formatPHP(audit.philhealth_coverage_total)}
            </span>
            <span className="text-[11px] text-slate-500">
              {audit.detected_case_packages.length > 0
                ? `Case Code ${audit.detected_case_packages.map((p) => p.code).join(", ")}`
                : "ACR Case Rate"}
            </span>
          </div>

          <div className="pt-3 sm:pt-0 pr-3 sm:px-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Requested Adjustment
            </span>
            <span className="mt-1 block text-base sm:text-lg font-black text-amber-700 font-mono tabular-nums whitespace-nowrap">
              {formatPHP(potentialSavings)}
            </span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {reviewItems.length} flagged item
              {reviewItems.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="pt-3 sm:pt-0 pl-3 sm:pl-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Reconciled Balance
            </span>
            <span className="mt-1 block text-base sm:text-lg font-black text-emerald-700 font-mono tabular-nums whitespace-nowrap">
              {formatPHP(audit.fair_out_of_pocket)}
            </span>
            <span className="text-[11px] text-slate-500">
              vs. <span className="font-mono tabular-nums">{formatPHP(audit.actual_out_of_pocket)}</span> stated
            </span>
          </div>
        </div>

        {/* Matched PhilHealth Case Rate Breakdown */}
        {audit.detected_case_packages.length > 0 && (
          <div className="border-l-2 border-[#2563EB] pl-3.5 py-0.5 text-xs">
            <p className="font-bold text-slate-900">
              Matched PhilHealth All Case Rate (ACR) Package Breakdown:
            </p>
            <ul className="mt-1 space-y-1">
              {audit.detected_case_packages.map((pkg) => (
                <li
                  key={pkg.code}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-slate-900">
                    {pkg.keyword} (Code:{" "}
                    <span className="font-mono font-bold">{pkg.code}</span>
                    {formatCircularLabel(pkg.circular_number ?? pkg.circular_id)
                      ? ` · ${formatCircularLabel(pkg.circular_number ?? pkg.circular_id)}`
                      : ""}
                    )
                  </span>
                  <span className="text-slate-500">
                    HCI Fee:{" "}
                    <strong className="text-slate-900 font-mono tabular-nums">
                      {formatPHP(pkg.hci_fee)}
                    </strong>{" "}
                    · Doctor PF Share:{" "}
                    <strong className="text-slate-900 font-mono tabular-nums">
                      {formatPHP(pkg.prof_fee)}
                    </strong>{" "}
                    · Total Case Rate:{" "}
                    <strong className="text-[#2563EB] font-mono tabular-nums">
                      {formatPHP(pkg.total_rate)}
                    </strong>
                    {pkg.is_estimated_split && (
                      <span className="ml-1.5 text-[10px] font-medium text-amber-700">
                        (est. 70/30 split)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Section 2: Schedule of Flagged Line Items for Billing Review */}
      <section className="mt-6 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
            2. Itemized Schedule of Charges Requested for Reconciliation (
            {reviewItems.length})
          </h2>
          <span className="text-[11px] font-medium text-slate-500">
            {coveredItems.length} Covered · {reviewItems.length} To Review ·{" "}
            {outOfPocketItems.length} Out-of-Pocket
          </span>
        </div>

        {reviewItems.length === 0 ? (
          <div className="border-l-2 border-emerald-500 pl-3.5 py-1 text-xs">
            <p className="font-bold text-slate-900">
              No Unbundled or Disputed Line Items Flagged
            </p>
            <p className="mt-0.5 text-slate-600">
              All extracted line items on this statement align with matched
              PhilHealth case rate rules and applicable statutory discounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible border-y border-slate-200/80">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 print:bg-white">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Line Item &amp; Basis for Inquiry</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Billed Amount</th>
                  <th className="px-3 py-2.5 text-right">
                    Requested Adjustment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {reviewItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className="print-avoid-break align-top"
                    style={{
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                    }}
                  >
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-slate-500">
                      <div className="print-avoid-break">{index + 1}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="print-avoid-break">
                        <p className="font-bold text-slate-900">
                          {item.description}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Qty: <span className="font-mono tabular-nums">{item.quantity}</span> × <span className="font-mono tabular-nums">{formatPHP(item.unit_price)}</span>
                          {item.matched_package_code
                            ? ` · Matched Package ${item.matched_package_code}`
                            : ""}
                        </p>
                        {item.flag_reason && (
                          <p className="mt-1 border-l-2 border-amber-400 pl-2.5 text-[11px] text-slate-600">
                            {item.flag_reason}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-medium text-[#64748B] whitespace-nowrap">
                      <div className="print-avoid-break">{item.category}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#1E293B] whitespace-nowrap">
                      <div className="print-avoid-break">
                        {formatPHP(item.total_amount)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-amber-900 whitespace-nowrap">
                      <div className="print-avoid-break">
                        {item.suggested_deduction &&
                        item.suggested_deduction > 0
                          ? `-${formatPHP(item.suggested_deduction)}`
                          : "Verify Coverage"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Single Final Non-Repeating Reconciliation Summary Footer */}
            <div
              className="print-avoid-break border-t-2 border-[#1E293B] bg-[#F3F4F6]/80 px-4 py-3 text-xs text-[#1E293B] print:bg-white"
              style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
            >
              <div className="space-y-1.5">
                {hasStatutoryPrivilege && totalStatutoryEntitled > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-[#475569]">
                        Total Statutory Discount Entitled (
                        {isPwd ? "RA 10754" : "RA 9994"} / NIRC Sec. 109(G)):
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-[#1E293B] whitespace-nowrap">
                        -{formatPHP(totalStatutoryEntitled)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-[#475569]">
                        Less: Senior/PWD Discount Already Credited on SOA:
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-[#475569] whitespace-nowrap">
                        {alreadyCreditedStatutory > 0
                          ? `+${formatPHP(alreadyCreditedStatutory)}`
                          : formatPHP(0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold text-[#1E293B]">
                        Net Additional Statutory Adjustment Requested:
                      </span>
                      <span className="font-mono tabular-nums font-bold text-amber-900 whitespace-nowrap">
                        -{formatPHP(audit.senior_pwd_savings)}
                      </span>
                    </div>
                  </>
                )}

                {audit.disputed_overcharge_total > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-[#475569]">
                      Unbundled PhilHealth Case Rate Inclusions Flagged:
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-amber-900 whitespace-nowrap">
                      -{formatPHP(audit.disputed_overcharge_total)}
                    </span>
                  </div>
                )}

                {(audit.case_rate_shortfall ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-[#475569]">
                      Under-Deducted PhilHealth Case Rate Shortfall:
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-amber-900 whitespace-nowrap">
                      -{formatPHP(audit.case_rate_shortfall ?? 0)}
                    </span>
                  </div>
                )}

                {(audit.arithmetic_discrepancy ?? 0) !== 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-[#475569]">
                      SOA Arithmetic / Rounding Adjustment:
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-amber-900 whitespace-nowrap">
                      -{formatPHP(Math.abs(audit.arithmetic_discrepancy ?? 0))}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 border-t border-[#CBD5E1] pt-1.5 font-bold text-[#1E293B]">
                  <span>
                    Total Requested Billing &amp; Statutory Adjustments (Billed:{" "}
                    <span className="font-mono tabular-nums">
                      {formatPHP(
                        reviewItems.reduce((sum, i) => sum + i.total_amount, 0)
                      )}
                    </span>
                    ):
                  </span>
                  <span className="font-mono tabular-nums text-amber-900 whitespace-nowrap">
                    -{formatPHP(potentialSavings)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-[#CBD5E1] pt-1.5 font-black text-emerald-900">
                  <span>{reconciledBalanceLabel}:</span>
                  <span className="font-mono tabular-nums text-sm whitespace-nowrap">
                    {formatPHP(audit.fair_out_of_pocket)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section 3: Statutory & PhilHealth Regulatory Basis (Clean Editorial Band, No Gray Box or Icons) */}
      <section className="print-avoid-break mt-6 space-y-2 border-t border-slate-200/80 pt-5 text-xs">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
          3. Applicable Statutory &amp; PhilHealth Circular Basis
        </h2>

        <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-[#1E293B]">
          <li>
            <strong>
              PhilHealth All Case Rates (ACR) Policy &amp; Anti-Unbundling Rule
              {primaryCircularLabel ? ` (${primaryCircularLabel})` : ""}:
            </strong>{" "}
            Under {primaryCircularLabel || "PhilHealth Circulars governing All Case Rates"}, mandatory
            supplies, routine diagnostics, operating/delivery room fees, and
            medicines necessary for the procedure are bundled inside the{" "}
            <strong>Health Care Institution (HCI) Fee</strong> and{" "}
            <strong>Professional Fee (PF)</strong> case rate allocation and
            should not be separately billed as out-of-pocket charges without
            documented clinical justification.
          </li>
          {hasStatutoryPrivilege && (
            <li>
              {isPwd ? (
                <>
                  <strong>
                    Republic Act No. 10754 (An Act Expanding the Benefits and
                    Privileges of Persons with Disability), PDAO Guidelines,
                    PhilHealth Advisory No. 2023-0036 &amp; PhilHealth Circular
                    0056-2012:
                  </strong>{" "}
                  Entitles qualified Person with Disability (PWD) patients to a{" "}
                  <strong>12% Value-Added Tax (VAT) exemption FIRST</strong>,
                  followed by a mandatory <strong>20% discount</strong> on the
                  VAT-exempt balance across hospital (HCI) charges, diagnostic
                  tests, medicines, and physicians&apos; professional fees (PF),
                  with{" "}
                  <strong>PhilHealth Case Rate benefits deducted LAST</strong>.
                  Any refusal to apply the sequential discount prior to
                  discharge may be reported to the local LGU{" "}
                  <strong>
                    Persons with Disability Affairs Office (PDAO)
                  </strong>{" "}
                  or the{" "}
                  <strong>PhilHealth Callback Channel (0917-898-7442)</strong>.
                </>
              ) : (
                <>
                  <strong>
                    Republic Act No. 9994 (Expanded Senior Citizens Act), OSCA
                    Guidelines, PhilHealth Advisory No. 2023-0036 &amp;
                    PhilHealth Circular 0056-2012:
                  </strong>{" "}
                  Entitles qualified Senior Citizen (60+) patients to a{" "}
                  <strong>12% Value-Added Tax (VAT) exemption FIRST</strong>,
                  followed by a mandatory <strong>20% discount</strong> on the
                  VAT-exempt balance across hospital (HCI) charges, diagnostic
                  tests, medicines, and physicians&apos; professional fees (PF),
                  with{" "}
                  <strong>PhilHealth Case Rate benefits deducted LAST</strong>.
                  Any refusal to apply the sequential discount prior to
                  discharge may be reported to the local LGU{" "}
                  <strong>
                    Office for Senior Citizens Affairs (OSCA)
                  </strong>{" "}
                  or the{" "}
                  <strong>PhilHealth Callback Channel (0917-898-7442)</strong>.
                </>
              )}
            </li>
          )}
          {hasNbbEntitlement && (
            <li>
              <strong>
                PhilHealth Circular 2016-0020 &amp; Republic Act No. 11223
                (Universal Health Care Act — No Balance Billing / Zero
                Co-Payment Policy):
              </strong>{" "}
              Entitles qualified Indirect Contributors (Indigent, Sponsored,
              Kasambahay, Senior Citizens under RA 10645, Solo Parents under PC
              2026-0015, and PWDs under PC 2026-0017) and Lifetime Members
              admitted in <strong>Basic / Ward accommodation</strong> to{" "}
              <strong>Zero Co-Payment (₱0.00 out-of-pocket)</strong> for covered
              hospital confinement services.
            </li>
          )}
          {isGovernmentFacility ? (
            <li>
              <strong>
                Republic Act No. 11463 (Malasakit Centers Act) &amp; Medical
                Social Service Endorsement:
              </strong>{" "}
              For any remaining legitimate out-of-pocket balance after PhilHealth
              and statutory deductions, we respectfully request an updated,
              certified Final Statement of Account and Clinical Abstract for{" "}
              <strong>Medical Social Service / Malasakit Center Desk</strong>{" "}
              processing of unified DOH, DSWD, PCSO, and PhilHealth assistance.
            </li>
          ) : (
            <li>
              <strong>
                Medical Financial Assistance Routing (Private Hospital):
              </strong>{" "}
              For any remaining legitimate out-of-pocket balance after PhilHealth
              and statutory deductions, we respectfully request an updated,
              certified Final Statement of Account and Clinical Abstract to
              support our application for{" "}
              <strong>
                DSWD Assistance to Individuals in Crisis Situation (AICS)
              </strong>
              , <strong>PCSO Medical Access Program (MAP)</strong>, and{" "}
              <strong>
                DOH Medical Assistance to Indigent and Financially Incapacitated
                Patients (MAIP)
              </strong>{" "}
              <em>(for DOH-accredited private hospitals)</em>.
            </li>
          )}
        </ul>
      </section>

      {/* Sign-Off & Hospital Billing Acknowledgment */}
      <section className="print-avoid-break mt-7 pt-2 text-xs">
        <p className="text-xs leading-relaxed text-[#1E293B]">
          Thank you very much for your kind assistance, transparency, and
          continued service to Filipino patients.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 print:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Respectfully Submitted By:
            </p>
            <div className="mt-6 border-b border-[#1E293B] pb-1 font-bold text-[#1E293B]">
              {meta.representativeName ||
                audit.patient_name ||
                "Patient / Authorized Family Representative"}
            </div>
            <p className="text-[11px] text-[#64748B]">
              {meta.relationship || "Patient / Authorized Representative"}
              {meta.contactInfo ? ` · ${meta.contactInfo}` : ""}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Received &amp; Verified By (Hospital Billing / PhilHealth Desk):
            </p>
            <div className="mt-6 border-b border-[#1E293B] pb-1 font-semibold text-[#64748B]">
              Signature Over Printed Name &amp; Date/Time
            </div>
            <p className="text-[11px] text-[#64748B]">
              {audit.hospital_name} — Billing &amp; Claims Section
            </p>
          </div>
        </div>
      </section>

      {/* Mandatory Non-Medical Disclaimer Footer */}
      <footer className="mt-8 border-t border-[#CBD5E1] pt-3 text-center text-[10px] text-[#64748B]">
        Prepared with <strong>BillLens PH</strong> · Automated Hospital ISA
        Auditor &amp; PhilHealth Case Rate Navigator.{" "}
        <em>
          Disclaimer: This document provides financial and billing audit
          information for patient-hospital reconciliation only and does not
          constitute formal medical or legal advice.
        </em>
      </footer>
    </article>
  );
}

