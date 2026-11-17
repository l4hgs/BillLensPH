"use client";

import React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Scale,
  ShieldCheck,
} from "lucide-react";
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

export function buildPlainTextNegotiationBrief(
  audit: AuditEngineResult,
  meta: NegotiationBriefMeta
): string {
  const reviewItems = audit.line_items.filter(
    (item) => item.status === "review_worthy"
  );
  const potentialSavings =
    audit.disputed_overcharge_total +
    audit.senior_pwd_savings +
    (audit.case_rate_shortfall ?? 0) +
    (audit.nbb_savings ?? 0);

  const discountType = normalizeStatutoryDiscountType(
    meta.statutoryDiscountType ?? audit.statutory_discount_type,
    meta.isSeniorOrPwd || audit.senior_pwd_savings > 0
  );
  const isPwd = discountType === "pwd";
  const hasStatutoryPrivilege =
    discountType !== "regular" ||
    meta.isSeniorOrPwd ||
    audit.senior_pwd_savings > 0;
  const hasNbbEntitlement =
    (audit.nbb_savings ?? 0) > 0 ||
    ((audit.eligibility_snapshot?.contributor_type === "indirect_nbb" ||
      audit.eligibility_snapshot?.contributor_type === "lifetime" ||
      hasStatutoryPrivilege) &&
      audit.eligibility_snapshot?.accommodation_type === "basic_ward");

  const pkgLines =
    audit.detected_case_packages.length > 0
      ? audit.detected_case_packages
          .map(
            (pkg) =>
              `  • ${pkg.keyword} (RVS/ICD Code: ${pkg.code}) — Total Case Rate: ${formatPHP(
                pkg.total_rate
              )} (HCI Fee: ${formatPHP(pkg.hci_fee)} | PF Share: ${formatPHP(
                pkg.prof_fee
              )})`
          )
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
    `To: Head of Billing & PhilHealth Claims Section / Medical Social Service`,
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
    `   • Total Identified Adjustments:       ${formatPHP(potentialSavings)}`,
    `   • Estimated Fair Balance Due:         ${formatPHP(audit.fair_out_of_pocket)}`,
    "",
    "2. MATCHED PHILHEALTH CASE RATE PACKAGE(S)",
    pkgLines,
    "",
    `3. ITEMIZED SCHEDULE OF FLAGGED CHARGES FOR REVIEW (${reviewItems.length} ITEM(S))`,
    itemLines,
    "",
    "4. STATUTORY & REGULATORY BASIS",
    "   • PhilHealth All Case Rates (ACR) Policy: Mandatory operating room, delivery room, and ward supplies, diagnostic tests, and bundled drugs included in the Health Care Institution (HCI) fee should not be billed separately as out-of-pocket charges.",
    ...(hasStatutoryPrivilege
      ? [
          isPwd
            ? "   • Republic Act No. 10754 (An Act Expanding the Benefits and Privileges of Persons with Disability), PDAO Guidelines, PhilHealth Advisory No. 2023-0036 & PhilHealth Circular 0056-2012: Entitles the PWD patient to a 12% VAT exemption FIRST, followed by a mandatory 20% discount on the VAT-exempt balance across HCI and Professional Fees, with PhilHealth Case Rate benefits deducted LAST. Unresolved violations may be escalated to the local LGU Persons with Disability Affairs Office (PDAO) or the PhilHealth Callback Channel (0917-898-7442)."
            : "   • Republic Act No. 9994 (Expanded Senior Citizens Act), OSCA Guidelines, PhilHealth Advisory No. 2023-0036 & PhilHealth Circular 0056-2012: Entitles the Senior Citizen patient to a 12% VAT exemption FIRST, followed by a mandatory 20% discount on the VAT-exempt balance across HCI and Professional Fees, with PhilHealth Case Rate benefits deducted LAST. Unresolved violations may be escalated to the local LGU Office for Senior Citizens Affairs (OSCA) or the PhilHealth Callback Channel (0917-898-7442).",
        ]
      : []),
    ...(hasNbbEntitlement
      ? [
          "   • PhilHealth Circular 2016-0020 & Republic Act No. 11223 (Universal Health Care Act — No Balance Billing / Zero Co-Payment Policy): Qualified Indirect Contributors (Indigent, Sponsored, Kasambahay, Senior Citizen under RA 10645, Solo Parent under PC 2026-0015, PWD under PC 2026-0017) and Lifetime Members admitted in basic/ward accommodation are entitled to Zero Co-Payment (₱0.00 out-of-pocket) for covered confinement services.",
        ]
      : []),
    "   • RA 11463 (Malasakit Centers Act): Please issue an updated, certified Statement of Account reflecting reconciled PhilHealth and statutory deductions to support our Medical Social Service / Malasakit / DSWD / PCSO guarantee letter endorsement.",
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
    (item) => item.status === "review_worthy"
  );
  const coveredItems = audit.line_items.filter(
    (item) => item.status === "covered"
  );
  const outOfPocketItems = audit.line_items.filter(
    (item) => item.status === "out_of_pocket"
  );
  const potentialSavings =
    audit.disputed_overcharge_total +
    audit.senior_pwd_savings +
    (audit.case_rate_shortfall ?? 0) +
    (audit.nbb_savings ?? 0);

  const discountType = normalizeStatutoryDiscountType(
    meta.statutoryDiscountType ?? audit.statutory_discount_type,
    meta.isSeniorOrPwd || audit.senior_pwd_savings > 0
  );
  const isPwd = discountType === "pwd";
  const hasStatutoryPrivilege =
    discountType !== "regular" ||
    meta.isSeniorOrPwd ||
    audit.senior_pwd_savings > 0;
  const hasNbbEntitlement =
    (audit.nbb_savings ?? 0) > 0 ||
    ((audit.eligibility_snapshot?.contributor_type === "indirect_nbb" ||
      audit.eligibility_snapshot?.contributor_type === "lifetime" ||
      hasStatutoryPrivilege) &&
      audit.eligibility_snapshot?.accommodation_type === "basic_ward");

  const admissionDate = meta.admissionDate || ocr?.admission_date;
  const dischargeDate = meta.dischargeDate || ocr?.discharge_date;

  return (
    <article
      aria-label="Formal Hospital Billing Negotiation Brief"
      className="rounded-2xl border border-[#CBD5E1] bg-white p-6 text-[#1E293B] shadow-soft sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      {/* Top Document Letterhead */}
      <header className="flex flex-col justify-between gap-4 border-b-2 border-[#1E293B] pb-5 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2563EB]">
            <FileText className="h-4 w-4" />
            <span>BillLens PH · Patient Financial Advocacy Brief</span>
          </div>
          <h1 className="text-lg font-black tracking-tight text-[#1E293B] sm:text-xl">
            REQUEST FOR ITEMIZED BILLING RECONCILIATION
          </h1>
          <p className="text-xs font-medium text-[#64748B]">
            PhilHealth All Case Rates (ACR) &amp; Statutory Benefit Verification
          </p>
        </div>

        <div className="rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] px-3.5 py-2.5 text-left sm:text-right print:bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
            Audit Reference
          </p>
          <p className="font-mono text-xs font-bold text-[#1E293B]">
            #{audit.audit_id.slice(0, 12).toUpperCase()}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Date: {meta.preparedDate}
          </p>
        </div>
      </header>

      {/* Recipient & Patient Metadata Grid */}
      <section className="print-avoid-break my-5 grid grid-cols-1 gap-4 rounded-xl border border-[#CBD5E1] bg-[#F3F4F6]/60 p-4 text-xs sm:grid-cols-2 print:bg-white">
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748B]">
            Addressed To
          </p>
          <p className="font-bold text-[#1E293B]">
            Head of Billing &amp; PhilHealth Claims Section
          </p>
          <p className="flex items-center gap-1.5 font-semibold text-[#1E293B]">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
            <span>{audit.hospital_name}</span>
          </p>
          <p className="text-[11px] text-[#64748B]">
            Copy Furnished: Medical Social Service / Malasakit Center Desk
          </p>
        </div>

        <div className="space-y-1 border-t border-[#CBD5E1] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#64748B]">
            Patient &amp; Statement Details
          </p>
          <p className="text-xs">
            <span className="font-semibold text-[#64748B]">Patient Name: </span>
            <span className="font-bold text-[#1E293B]">
              {audit.patient_name || "Patient on Record"}
            </span>
          </p>
          <p className="text-xs">
            <span className="font-semibold text-[#64748B]">
              Statement / SOA #:{" "}
            </span>
            <span className="font-bold text-[#1E293B]">
              {audit.statement_number || "Per Attached ISA"}
            </span>
          </p>
          {(admissionDate || dischargeDate) && (
            <p className="text-xs">
              <span className="font-semibold text-[#64748B]">
                Confinement Period:{" "}
              </span>
              <span className="font-semibold text-[#1E293B]">
                {admissionDate || "—"} to {dischargeDate || "Present"}
              </span>
            </p>
          )}
          <p className="text-xs">
            <span className="font-semibold text-[#64748B]">
              Statutory Status:{" "}
            </span>
            <span className="font-bold text-[#1E293B]">
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
      <section className="space-y-2 text-xs leading-relaxed text-[#1E293B]">
        <p className="font-bold">Dear Billing &amp; PhilHealth Claims Officer,</p>
        <p>
          Good day. On behalf of patient{" "}
          <strong className="font-bold">
            {audit.patient_name || "named above"}
          </strong>
          , we respectfully request an itemized review and reconciliation of our
          Statement of Account at{" "}
          <strong className="font-bold">{audit.hospital_name}</strong> prior to
          final settlement. Specifically, we kindly ask your office to verify the
          bundled PhilHealth All Case Rates (ACR) coverage and statutory discount
          computations summarized below:
        </p>
      </section>

      {/* Section 1: Executive Financial Summary */}
      <section className="print-avoid-break mt-5 space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1E293B]">
          <span>1. Executive Financial Audit Summary</span>
        </h2>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-3">
            <span className="block text-[10px] font-bold uppercase text-[#64748B]">
              Gross Billed
            </span>
            <span className="mt-0.5 block text-sm font-black text-[#1E293B] sm:text-base">
              {formatPHP(audit.gross_total)}
            </span>
            <span className="text-[10px] text-[#64748B]">
              {audit.line_items.length} line items
            </span>
          </div>

          <div className="rounded-xl border border-[#CBD5E1] bg-white p-3">
            <span className="block text-[10px] font-bold uppercase text-[#64748B]">
              PhilHealth Benefit
            </span>
            <span className="mt-0.5 block text-sm font-black text-[#2563EB] sm:text-base">
              {formatPHP(audit.philhealth_coverage_total)}
            </span>
            <span className="text-[10px] text-[#64748B]">
              {audit.detected_case_packages.length > 0
                ? `Case Code ${audit.detected_case_packages.map((p) => p.code).join(", ")}`
                : "ACR Case Rate"}
            </span>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
            <span className="block text-[10px] font-bold uppercase text-amber-800">
              Requested Adjustment
            </span>
            <span className="mt-0.5 block text-sm font-black text-amber-900 sm:text-base">
              {formatPHP(potentialSavings)}
            </span>
            <span className="text-[10px] text-amber-800">
              {reviewItems.length} flagged item
              {reviewItems.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
            <span className="block text-[10px] font-bold uppercase text-emerald-800">
              Reconciled Balance
            </span>
            <span className="mt-0.5 block text-sm font-black text-emerald-900 sm:text-base">
              {formatPHP(audit.fair_out_of_pocket)}
            </span>
            <span className="text-[10px] text-emerald-800">
              vs. {formatPHP(audit.actual_out_of_pocket)} stated
            </span>
          </div>
        </div>

        {/* Matched PhilHealth Case Rate Breakdown */}
        {audit.detected_case_packages.length > 0 && (
          <div className="rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] p-3.5 text-xs print:bg-white">
            <p className="font-bold text-[#1E293B]">
              Matched PhilHealth All Case Rate (ACR) Package Breakdown:
            </p>
            <ul className="mt-1.5 space-y-1">
              {audit.detected_case_packages.map((pkg) => (
                <li
                  key={pkg.code}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span className="font-semibold text-[#1E293B]">
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-[#2563EB]" />
                    {pkg.keyword} (Code:{" "}
                    <span className="font-mono font-bold">{pkg.code}</span>)
                  </span>
                  <span className="text-[#64748B]">
                    HCI Fee:{" "}
                    <strong className="text-[#1E293B]">
                      {formatPHP(pkg.hci_fee)}
                    </strong>{" "}
                    · Doctor PF Share:{" "}
                    <strong className="text-[#1E293B]">
                      {formatPHP(pkg.prof_fee)}
                    </strong>{" "}
                    · Total Case Rate:{" "}
                    <strong className="text-[#2563EB]">
                      {formatPHP(pkg.total_rate)}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Section 2: Schedule of Flagged Line Items for Billing Review */}
      <section className="mt-6 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#1E293B]">
            2. Itemized Schedule of Charges Requested for Reconciliation (
            {reviewItems.length})
          </h2>
          <span className="text-[11px] font-semibold text-[#64748B]">
            🟢 {coveredItems.length} Covered · 🟡 {reviewItems.length} To Review
            · 🔴 {outOfPocketItems.length} Out-of-Pocket
          </span>
        </div>

        {reviewItems.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              No Unbundled or Disputed Line Items Flagged
            </p>
            <p className="mt-1 text-emerald-800">
              All extracted line items on this statement align with matched
              PhilHealth case rate rules and applicable statutory discounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#CBD5E1]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#CBD5E1] bg-[#F3F4F6] text-[10px] font-extrabold uppercase tracking-wider text-[#64748B] print:bg-white">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Line Item &amp; Basis for Inquiry</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Billed Amount</th>
                  <th className="px-3 py-2.5 text-right">
                    Requested Adjustment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {reviewItems.map((item, index) => (
                  <tr key={item.id} className="print-avoid-break align-top">
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-[#64748B]">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-[#1E293B]">
                        {item.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        Qty: {item.quantity} × {formatPHP(item.unit_price)}
                        {item.matched_package_code
                          ? ` · Matched Package ${item.matched_package_code}`
                          : ""}
                      </p>
                      {item.flag_reason && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                          <span>{item.flag_reason}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-medium text-[#64748B] whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#1E293B] whitespace-nowrap">
                      {formatPHP(item.total_amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-900 whitespace-nowrap">
                      {item.suggested_deduction && item.suggested_deduction > 0
                        ? `-${formatPHP(item.suggested_deduction)}`
                        : "Verify Coverage"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1E293B] bg-[#F3F4F6] font-bold text-[#1E293B] print:bg-white">
                  <td colSpan={3} className="px-3 py-2.5 text-right text-xs">
                    Total Requested Billing &amp; Statutory Adjustments:
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {formatPHP(
                      reviewItems.reduce((sum, i) => sum + i.total_amount, 0)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-900 whitespace-nowrap">
                    -{formatPHP(potentialSavings)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Section 3: Statutory & PhilHealth Regulatory Basis */}
      <section className="print-avoid-break mt-6 space-y-2 rounded-xl border border-[#CBD5E1] bg-[#F3F4F6]/60 p-4 text-xs print:bg-white">
        <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1E293B]">
          <Scale className="h-3.5 w-3.5 text-[#2563EB]" />
          <span>3. Applicable Statutory &amp; PhilHealth Circular Basis</span>
        </h2>

        <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-[#1E293B]">
          <li>
            <strong>
              PhilHealth All Case Rates (ACR) Policy &amp; Anti-Unbundling Rule:
            </strong>{" "}
            Under PhilHealth Circulars governing All Case Rates, mandatory
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
          <li>
            <strong>
              Republic Act No. 11463 (Malasakit Centers Act) &amp; Medical
              Social Service Endorsement:
            </strong>{" "}
            For any remaining legitimate out-of-pocket balance after PhilHealth
            and statutory deductions, we respectfully request an updated,
            certified Final Statement of Account and Clinical Abstract so our
            family may submit them for{" "}
            <strong>
              Malasakit Center / DOH MAIP / DSWD AICS / PCSO MAP
            </strong>{" "}
            Guarantee Letter assistance.
          </li>
        </ul>
      </section>

      {/* Sign-Off & Hospital Billing Acknowledgment */}
      <section className="print-avoid-break mt-7 pt-2 text-xs">
        <p className="text-xs leading-relaxed text-[#1E293B]">
          Thank you very much for your kind assistance, transparency, and
          continued service to Filipino patients.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
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

