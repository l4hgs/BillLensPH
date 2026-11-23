import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  computeCircularDiff,
  subtractOneDay,
  type CompiledCircularPackage,
} from "@/lib/circularCompiler";
import { toCatalogPackage } from "@/lib/packageCatalog";
import type { CatalogPackage } from "@/types/audit";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

const mockCreateClient = vi.fn(async () => mockSupabaseClient);

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("circularCompiler — diff computation & admin auth guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue(mockSupabaseClient);
  });

  it("classifies NEW, RATE_UPDATED (with exact peso deltas), and UNCHANGED rows accurately", () => {
    const existing: CatalogPackage[] = [
      toCatalogPackage({
        case_code: "44950",
        procedure_keyword: "Open Appendectomy",
        circular_id: "2013-0035",
        circular_number: "PC-2013-0035",
        effective_from: "2014-01-01",
        is_verified: true,
        hci_fee: 18720,
        prof_fee: 12480,
        total_case_rate: 31200,
        inclusive_items: ["Appendectomy set"],
      }),
      toCatalogPackage({
        case_code: "J18.9",
        procedure_keyword: "Pneumonia Moderate Risk",
        circular_id: "2024-0037",
        circular_number: "PC-2024-0037",
        effective_from: "2025-01-01",
        is_verified: true,
        hci_fee: 15750,
        prof_fee: 6750,
        total_case_rate: 22500,
        inclusive_items: ["CBC"],
      }),
    ];

    const compiled: CompiledCircularPackage[] = [
      {
        case_code: "44950",
        procedure_keyword: "Open Appendectomy",
        hci_fee: 28080,
        prof_fee: 18720,
        total_case_rate: 46800,
        inclusive_items: [],
        aliases: [],
      },
      {
        case_code: "J18.9",
        procedure_keyword: "Pneumonia Moderate Risk",
        hci_fee: 15750,
        prof_fee: 6750,
        total_case_rate: 22500,
        inclusive_items: [],
        aliases: [],
      },
      {
        case_code: "43235",
        procedure_keyword: "Upper GI Endoscopy",
        hci_fee: 10800,
        prof_fee: 7200,
        total_case_rate: 18000,
        inclusive_items: ["Endoscopy room"],
        aliases: ["endoscopy"],
      },
    ];

    const diff = computeCircularDiff(compiled, existing);
    expect(diff).toHaveLength(3);

    const updated = diff.find((d) => d.case_code === "44950");
    expect(updated?.status).toBe("RATE_UPDATED");
    expect(updated?.old_total_case_rate).toBe(31200);
    expect(updated?.new_total_case_rate).toBe(46800);
    expect(updated?.delta_total).toBe(15600);
    expect(updated?.delta_hci).toBe(9360);
    expect(updated?.delta_prof).toBe(6240);

    const unchanged = diff.find((d) => d.case_code === "J18.9");
    expect(unchanged?.status).toBe("UNCHANGED");
    expect(unchanged?.delta_total).toBe(0);

    const created = diff.find((d) => d.case_code === "43235");
    expect(created?.status).toBe("NEW");
    expect(created?.old_total_case_rate).toBeNull();
    expect(created?.delta_total).toBe(18000);
  });

  it("computes previous day accurately across year boundaries", () => {
    expect(subtractOneDay("2025-01-01")).toBe("2024-12-31");
    expect(subtractOneDay("2026-03-01")).toBe("2026-02-28");
  });

  it("rejects non-admin users with 403 on /api/rates/compile and /api/rates/publish", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "member-42" } },
    });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "member" },
            error: null,
          }),
        }),
      }),
    });

    const { POST: postCompile } = await import(
      "@/app/api/rates/compile/route"
    );
    const { POST: postPublish } = await import(
      "@/app/api/rates/publish/route"
    );

    const compileRes = await postCompile(
      new NextRequest("http://localhost/api/rates/compile", {
        method: "POST",
        body: JSON.stringify({ text: "PC-2024-0037 Annex A" }),
        headers: { "content-type": "application/json" },
      })
    );
    const publishRes = await postPublish(
      new NextRequest("http://localhost/api/rates/publish", {
        method: "POST",
        body: JSON.stringify({
          circular_number: "PC-2024-0037",
          effective_from: "2025-01-01",
          items: [],
        }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(compileRes.status).toBe(403);
    expect(publishRes.status).toBe(403);
  });
});
