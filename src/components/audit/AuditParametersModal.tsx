"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import type { EligibilitySnapshot, StatutoryDiscountType } from "@/types/audit";

export interface AuditParametersModalProps {
  open: boolean;
  privilege: StatutoryDiscountType;
  eligibility: EligibilitySnapshot;
  onClose: () => void;
  onApply: (
    nextPrivilege: StatutoryDiscountType,
    nextEligibility: EligibilitySnapshot
  ) => void;
  subtitle?: string;
  applyLabel?: string;
}

/**
 * Focused modal popup for editing Patient Statutory Privilege (RA 9994 / RA 10754)
 * and PhilHealth NBB / Ward / MDR / Facility Level parameters.
 * Shared across Scan Hub and Audit Studio.
 */
export function AuditParametersModal({
  open,
  privilege,
  eligibility,
  onClose,
  onApply,
  subtitle = "Adjust patient privilege and PhilHealth ward details to recalculate rules.",
  applyLabel = "Apply & Recalculate",
}: AuditParametersModalProps) {
  const [draftPrivilege, setDraftPrivilege] =
    useState<StatutoryDiscountType>(privilege);
  const [draftEligibility, setDraftEligibility] =
    useState<EligibilitySnapshot>(eligibility);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setDraftPrivilege(privilege);
      setDraftEligibility(eligibility);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, privilege, eligibility]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit statutory privilege and PhilHealth membership"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6 transition-opacity duration-150 motion-reduce:transition-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md sm:max-w-lg lg:max-w-xl max-h-[78dvh] lg:max-h-[calc(100dvh-3rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="shrink-0 px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200/80 flex items-center justify-between gap-3 bg-white">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              Audit &amp; PhilHealth Parameters
            </h2>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label="Close parameters modal"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] -mr-1.5 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-5 bg-white">
          {/* Patient Statutory Privilege */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800">
                Patient Statutory Privilege
              </span>
              <span className="hidden sm:inline text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap shrink-0">
                RA 9994 / RA 10754
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Patient Statutory Privilege"
              className="grid grid-cols-3 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
            >
              {(
                [
                  { id: "regular", label: "Regular" },
                  { id: "senior", label: "Senior Citizen (60+)" },
                  { id: "pwd", label: "PWD (RA 10754)" },
                ] as const
              ).map((opt) => {
                const isSelected = draftPrivilege === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setDraftPrivilege(opt.id)}
                    className={cn(
                      "cursor-pointer min-h-[44px] rounded-lg px-1.5 sm:px-2.5 py-1.5 sm:py-2 text-[11px] sm:text-xs leading-tight font-semibold transition-all motion-reduce:transition-none flex items-center justify-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                      isSelected
                        ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="hidden sm:block text-[11px] text-slate-500 leading-relaxed">
              RA 9994 / RA 10754 &amp; PhilHealth Advisory 2023-0036: Senior/PWD
              claim one 20% discount + 12% VAT exemption deducted before
              PhilHealth.
            </p>
          </div>

          <div className="border-t border-slate-200/80 pt-3 sm:pt-4 space-y-3 sm:space-y-4">
            {/* Contributor Type */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-800">
                PhilHealth Contributor Category (NBB Eligibility)
              </span>
              <div
                role="radiogroup"
                aria-label="PhilHealth Contributor Category"
                className="grid grid-cols-2 sm:grid-cols-4 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { id: "unknown", label: "Auto / Not Sure" },
                    { id: "direct", label: "Direct" },
                    { id: "indirect_nbb", label: "Indirect / NBB" },
                    { id: "lifetime", label: "Lifetime" },
                  ] as const
                ).map((opt) => {
                  const isSelected = draftEligibility.contributor_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setDraftEligibility((prev) => ({
                          ...prev,
                          contributor_type: opt.id,
                        }))
                      }
                      className={cn(
                        "cursor-pointer min-h-[44px] rounded-lg px-2 py-1.5 text-[11px] sm:text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 leading-relaxed">
                NBB covers Indigent, Sponsored, Kasambahay, Senior (RA 10645),
                Solo Parent (PC 2026-0015), and PWD (PC 2026-0017).
              </p>
            </div>

            {/* Accommodation Type */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-800">
                Room / Ward Accommodation Type
              </span>
              <div
                role="radiogroup"
                aria-label="Room / Ward Accommodation Type"
                className="grid grid-cols-3 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
              >
                {(
                  [
                    { id: "unknown", label: "Auto / Not Sure" },
                    { id: "basic_ward", label: "Basic / Ward (NBB)" },
                    { id: "non_basic_private", label: "Private Room" },
                  ] as const
                ).map((opt) => {
                  const isSelected =
                    draftEligibility.accommodation_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setDraftEligibility((prev) => ({
                          ...prev,
                          accommodation_type: opt.id,
                        }))
                      }
                      className={cn(
                        "cursor-pointer min-h-[44px] rounded-lg px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs leading-tight font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                        isSelected
                          ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MDR & Facility Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-slate-800">
                  MDR / PIN Presented?
                </span>
                <div
                  role="radiogroup"
                  aria-label="MDR / PIN Presented"
                  className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 gap-1"
                >
                  {(
                    [
                      { val: true, label: "Yes, Presented" },
                      { val: false, label: "Not Yet" },
                    ] as const
                  ).map((opt) => {
                    const isSelected =
                      draftEligibility.has_mdr_or_pin === opt.val;
                    return (
                      <button
                        key={String(opt.val)}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() =>
                          setDraftEligibility((prev) => ({
                            ...prev,
                            has_mdr_or_pin: opt.val,
                          }))
                        }
                        className={cn(
                          "cursor-pointer min-h-[44px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
                          isSelected
                            ? "bg-white text-slate-900 font-bold shadow-xs border border-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="modal-facility-level-select"
                  className="block text-xs font-bold text-slate-800"
                >
                  Hospital Facility Level
                </label>
                <SelectMenu
                  id="modal-facility-level-select"
                  ariaLabel="Hospital Facility Level"
                  placement="top"
                  value={draftEligibility.facility_level}
                  onChange={(val) =>
                    setDraftEligibility((prev) => ({
                      ...prev,
                      facility_level:
                        val as EligibilitySnapshot["facility_level"],
                    }))
                  }
                  options={[
                    { value: "unknown", label: "Auto / Not Sure" },
                    { value: "level_1", label: "Level 1 Hospital" },
                    { value: "level_2", label: "Level 2 Hospital" },
                    { value: "level_3", label: "Level 3 Tertiary" },
                    { value: "asc", label: "ASC / Dialysis Center" },
                  ]}
                />
              </div>
            </div>

            {!draftEligibility.has_mdr_or_pin && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Pre-Discharge Reminder:</strong> Present digital
                  MDR/PIN via PhilHealth Portal or eGovPH app before paying at
                  the cashier to ensure Case Rate deduction.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 px-4 py-2.5 sm:px-5 sm:py-3 border-t border-slate-200/80 bg-slate-50/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-full text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(draftPrivilege, draftEligibility)}
            className="min-h-[44px] px-6 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-bold shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
