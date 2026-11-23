import { describe, expect, it } from "vitest";
import {
  reconcilePackageSplit,
  selectActivePackagesForDate,
  toCatalogPackage,
} from "@/lib/packageCatalog";
import type { CatalogPackage } from "@/types/audit";

describe("packageCatalog — split rules & circular time travel", () => {
  it("preserves explicit HCI/PF splits with is_estimated_split = false", () => {
    const split = reconcilePackageSplit(28080, 18720, 46800, {
      case_code: "44950",
      is_verified: true,
    });
    expect(split).toEqual({
      hci_fee: 28080,
      prof_fee: 18720,
      total_case_rate: 46800,
      is_estimated_split: false,
    });

    // Normalizes inconsistent total when explicit split differs by > ₱1
    const normalized = reconcilePackageSplit(14000, 6000, 25000, {
      case_code: "44950",
      is_verified: true,
    });
    expect(normalized.total_case_rate).toBe(20000);
    expect(normalized.is_estimated_split).toBe(false);
  });

  it("derives 60/40 for verified RVS numeric codes and 70/30 for verified ICD-10 alphanumeric codes", () => {
    const rvs = reconcilePackageSplit(0, 0, 46800, {
      case_code: "44950",
      is_verified: true,
    });
    expect(rvs).toEqual({
      hci_fee: 28080,
      prof_fee: 18720,
      total_case_rate: 46800,
      is_estimated_split: false,
    });

    const icd = reconcilePackageSplit(0, 0, 22500, {
      case_code: "J18.9",
      is_verified: true,
    });
    expect(icd).toEqual({
      hci_fee: 15750,
      prof_fee: 6750,
      total_case_rate: 22500,
      is_estimated_split: false,
    });
  });

  it("applies 70/30 fallback with is_estimated_split = true for unverified packages without explicit split", () => {
    const unverified = reconcilePackageSplit(0, 0, 20000, {
      case_code: "44950",
      is_verified: false,
    });
    expect(unverified).toEqual({
      hci_fee: 14000,
      prof_fee: 6000,
      total_case_rate: 20000,
      is_estimated_split: true,
    });
  });

  it("selects PC-2013-0035 for <= 2024-12-31 and PC-2024-0037 for >= 2025-01-01", () => {
    const catalog: CatalogPackage[] = [
      toCatalogPackage({
        case_code: "44950",
        procedure_keyword: "Open Appendectomy",
        circular_id: "2013-0035",
        circular_number: "PC-2013-0035",
        effective_from: "2014-01-01",
        effective_to: "2024-12-31",
        superseded_by: "PC-2024-0037",
        is_verified: true,
        hci_fee: 18720,
        prof_fee: 12480,
        total_case_rate: 31200,
        inclusive_items: [],
      }),
      toCatalogPackage({
        case_code: "44950",
        procedure_keyword: "Open Appendectomy",
        circular_id: "2024-0037",
        circular_number: "PC-2024-0037",
        effective_from: "2025-01-01",
        effective_to: null,
        is_verified: true,
        hci_fee: 28080,
        prof_fee: 18720,
        total_case_rate: 46800,
        inclusive_items: [],
      }),
    ];

    const pre2025 = selectActivePackagesForDate(catalog, "2024-11-10");
    expect(pre2025).toHaveLength(1);
    expect(pre2025[0].total_rate).toBe(31200);
    expect(pre2025[0].circular_number).toBe("PC-2013-0035");

    const post2025 = selectActivePackagesForDate(catalog, "2025-01-02");
    expect(post2025).toHaveLength(1);
    expect(post2025[0].total_rate).toBe(46800);
    expect(post2025[0].circular_number).toBe("PC-2024-0037");
  });
});
