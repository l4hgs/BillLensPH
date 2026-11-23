import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageRemove = vi.fn();

const mockSupabaseClient = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
  storage: {
    from: () => ({
      remove: mockStorageRemove,
      download: vi.fn(),
    }),
  },
};

const mockCreateClient = vi.fn(async () => mockSupabaseClient);

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

function makePostRequest(url: string, body: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("API Route Auth, Role & Validation Gates", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    mockCreateClient.mockResolvedValue(mockSupabaseClient);
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  it("returns 401 for unauthenticated requests across all protected endpoints", async () => {
    const { POST: postOcr } = await import("@/app/api/audit/ocr/route");
    const { POST: postChat } = await import("@/app/api/audit/chat/route");
    const { POST: postRates } = await import("@/app/api/rates/route");
    const { POST: postDiscover } = await import(
      "@/app/api/rates/discover/route"
    );
    const { DELETE: deleteAudit } = await import(
      "@/app/api/audit/[id]/route"
    );

    const ocrRes = await postOcr(
      makePostRequest("http://localhost/api/audit/ocr", "{}")
    );
    const chatRes = await postChat(
      makePostRequest("http://localhost/api/audit/chat", "{}")
    );
    const ratesRes = await postRates(
      makePostRequest("http://localhost/api/rates", "{}")
    );
    const discoverRes = await postDiscover(
      makePostRequest("http://localhost/api/rates/discover", "{}")
    );
    const deleteRes = await deleteAudit(
      new NextRequest("http://localhost/api/audit/audit-123", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "audit-123" }) }
    );

    expect(ocrRes.status).toBe(401);
    expect(chatRes.status).toBe(401);
    expect(ratesRes.status).toBe(401);
    expect(discoverRes.status).toBe(401);
    expect(deleteRes.status).toBe(401);
  });

  it("returns 400 for malformed JSON request bodies on POST endpoints", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });

    // Allow POST /api/rates to pass the admin gate so it reaches JSON parsing
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "admin" },
            error: null,
          }),
        }),
      }),
    });

    const { POST: postOcr } = await import("@/app/api/audit/ocr/route");
    const { POST: postChat } = await import("@/app/api/audit/chat/route");
    const { POST: postRates } = await import("@/app/api/rates/route");
    const { POST: postDiscover } = await import(
      "@/app/api/rates/discover/route"
    );

    const badJson = "{not-valid-json";

    const ocrRes = await postOcr(
      makePostRequest("http://localhost/api/audit/ocr", badJson)
    );
    const chatRes = await postChat(
      makePostRequest("http://localhost/api/audit/chat", badJson)
    );
    const ratesRes = await postRates(
      makePostRequest("http://localhost/api/rates", badJson)
    );
    const discoverRes = await postDiscover(
      makePostRequest("http://localhost/api/rates/discover", badJson)
    );

    expect(ocrRes.status).toBe(400);
    expect(chatRes.status).toBe(400);
    expect(ratesRes.status).toBe(400);
    expect(discoverRes.status).toBe(400);

    expect(await ocrRes.json()).toEqual({ error: "Invalid JSON request body." });
    expect(await chatRes.json()).toEqual({ error: "Invalid JSON request body." });
    expect(await ratesRes.json()).toEqual({
      error: "Invalid JSON request body.",
    });
    expect(await discoverRes.json()).toEqual({
      error: "Invalid JSON request body.",
    });
  });

  it("returns 403 when a non-admin member attempts POST /api/rates", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "member-1" } },
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

    const { POST: postRates } = await import("@/app/api/rates/route");
    const res = await postRates(
      makePostRequest(
        "http://localhost/api/rates",
        JSON.stringify({ case_code: "47562", procedure_keyword: "Test" })
      )
    );

    expect(res.status).toBe(403);
  });

  it("returns sanitized 500 payloads without leaking raw stack traces or internal details", async () => {
    const consoleErrSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockCreateClient.mockRejectedValue(
      new Error("INTERNAL_DB_FAILURE: postgres://secret-host/db")
    );

    const { POST: postOcr } = await import("@/app/api/audit/ocr/route");
    const { POST: postChat } = await import("@/app/api/audit/chat/route");
    const { POST: postRates } = await import("@/app/api/rates/route");
    const { POST: postDiscover } = await import(
      "@/app/api/rates/discover/route"
    );
    const { DELETE: deleteAudit } = await import(
      "@/app/api/audit/[id]/route"
    );

    const responses = await Promise.all([
      postOcr(makePostRequest("http://localhost/api/audit/ocr", "{}")),
      postChat(makePostRequest("http://localhost/api/audit/chat", "{}")),
      postRates(makePostRequest("http://localhost/api/rates", "{}")),
      postDiscover(
        makePostRequest("http://localhost/api/rates/discover", "{}")
      ),
      deleteAudit(
        new NextRequest("http://localhost/api/audit/audit-123", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "audit-123" }) }
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain("INTERNAL_DB_FAILURE");
      expect(text).not.toContain("postgres://");
      expect(text).not.toContain("secret-host");
    }

    consoleErrSpy.mockRestore();
  });
});
