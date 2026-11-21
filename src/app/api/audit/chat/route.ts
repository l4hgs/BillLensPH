import { NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeEligibilitySnapshot,
  normalizeStatutoryDiscountType,
  runAuditEngine,
} from "@/lib/auditEngine";
import { getGeminiModelFallbackList } from "@/lib/gemini";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import {
  applyOverridesToBill,
  statusOverridesFrom,
} from "@/lib/auditOverrides";
import { buildSystemPrompt } from "@/lib/chatbotPrompt";
import type {
  AuditEngineResult,
  AuditOverrides,
  ExtractedBillData,
} from "@/types/audit";

export const maxDuration = 60;

function isAuditEngineResult(value: unknown): value is AuditEngineResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as AuditEngineResult).line_items) &&
    typeof (value as AuditEngineResult).gross_total === "number"
  );
}

function isExtractedBillData(value: unknown): value is ExtractedBillData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ExtractedBillData).line_items)
  );
}

function isAuditOverrides(value: unknown): value is AuditOverrides {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToUIMessages(rawMessages: unknown): UIMessage[] {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .map((msg, index): UIMessage | null => {
      if (!msg || typeof msg !== "object") return null;
      const record = msg as Record<string, unknown>;
      const role =
        record.role === "user" ||
        record.role === "assistant" ||
        record.role === "system"
          ? record.role
          : "user";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `msg-${index + 1}`;

      if (Array.isArray(record.parts) && record.parts.length > 0) {
        return {
          id,
          role,
          parts: record.parts as UIMessage["parts"],
        };
      }

      if (typeof record.content === "string") {
        return {
          id,
          role,
          parts: [{ type: "text", text: record.content }],
        };
      }

      if (typeof record.text === "string") {
        return {
          id,
          role,
          parts: [{ type: "text", text: record.text }],
        };
      }

      return null;
    })
    .filter((m): m is UIMessage => m !== null);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY environment variable is not configured. Please check .env.local.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const auditId: string | undefined =
      typeof body.audit_id === "string"
        ? body.audit_id
        : typeof body.auditId === "string"
          ? body.auditId
          : undefined;

    const clientSnapshot: AuditEngineResult | null = isAuditEngineResult(
      body.audit_snapshot
    )
      ? body.audit_snapshot
      : null;

    const uiMessages = normalizeToUIMessages(body.messages);
    if (uiMessages.length === 0) {
      return NextResponse.json(
        { error: "At least one chat message is required." },
        { status: 400 }
      );
    }

    // 1. Fetch audit context from Supabase if audit_id is provided
    let resolvedAudit: AuditEngineResult | null = clientSnapshot;

    if (auditId) {
      try {
        const supabase = await createClient();
        const { data: row } = await supabase
          .from("audits")
          .select("*")
          .eq("id", auditId)
          .maybeSingle();

        if (row) {
          if (clientSnapshot) {
            // Prefer live client snapshot if the user has active unsaved overrides in the Studio,
            // while ensuring hospital_name / totals stay aligned with the DB row if missing.
            resolvedAudit = {
              ...clientSnapshot,
              hospital_name:
                clientSnapshot.hospital_name ||
                row.hospital_name ||
                "Philippine Healthcare Institution",
            };
          } else if (isAuditEngineResult(row.audit_results)) {
            resolvedAudit = row.audit_results;
          } else {
            const raw = (row.raw_extracted_data ?? {}) as Record<
              string,
              unknown
            >;
            if (isExtractedBillData(raw.ocr)) {
              const overrides = isAuditOverrides(raw.overrides)
                ? raw.overrides
                : {};
              const isSenior =
                typeof raw.is_senior_or_pwd === "boolean"
                  ? raw.is_senior_or_pwd
                  : Boolean(raw.ocr.is_senior_or_pwd);
              const discountType = normalizeStatutoryDiscountType(
                raw.statutory_discount_type ?? raw.ocr.statutory_discount_type,
                isSenior
              );
              const eligibilitySnapshot = normalizeEligibilitySnapshot(
                row.eligibility_snapshot ??
                  raw.eligibility_snapshot ??
                  raw.ocr.eligibility_snapshot
              );

              const catalog = await loadPackageCatalog(supabase);

              resolvedAudit = runAuditEngine(
                applyOverridesToBill(raw.ocr, overrides),
                {
                  auditId: row.id,
                  statutoryDiscountType: discountType,
                  isSeniorOrPwdOverride: discountType !== "regular",
                  eligibilitySnapshot,
                  referencePackages: catalog.packages,
                  statutoryRule: catalog.statutoryRule,
                  statutoryRules: catalog.statutoryRules,
                  manualStatusOverrides: statusOverridesFrom(overrides),
                }
              );
            }
          }
        }
      } catch (dbErr) {
        console.warn(
          "Could not load audit row from Supabase in /api/audit/chat, using snapshot fallback:",
          dbErr
        );
      }
    }

    // 2. Build system prompt with injected Philippine billing & audit context
    const systemPrompt = buildSystemPrompt(resolvedAudit);
    const modelMessages: ModelMessage[] =
      await convertToModelMessages(uiMessages);

    // 3. Stream response from Gemini Flash via Vercel AI SDK
    const google = createGoogleGenerativeAI({
      apiKey,
      headers: { "x-goog-api-key": apiKey },
    });
    const modelId = getGeminiModelFallbackList(
      process.env.GEMINI_CHAT_MODEL
    )[0];

    const result = streamText({
      model: google(modelId),
      system: systemPrompt,
      messages: modelMessages,
      temperature: 0.2,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: uiMessages,
        onError: (error) => {
          console.error("Gemini Chatbot stream error:", error);
          if (error instanceof Error) return error.message;
          return "Failed to stream response from Gemini Flash.";
        },
      }),
    });
  } catch (err: unknown) {
    console.error("Audit Chatbot Chat API error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to generate Chatbot response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
