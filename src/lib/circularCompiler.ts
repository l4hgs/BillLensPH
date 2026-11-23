import type { CatalogPackage } from "@/types/audit";
import {
  fetchGeminiWithRetry,
  getGeminiModelFallbackList,
} from "@/lib/gemini";
import {
  formatCircularNumber,
  reconcilePackageSplit,
} from "@/lib/packageCatalog";

export interface CompiledCircularPackage {
  case_code: string;
  procedure_keyword: string;
  hci_fee: number;
  prof_fee: number;
  total_case_rate: number;
  inclusive_items: string[];
  aliases: string[];
}

export interface CompiledCircularResult {
  circular_number: string;
  effective_from: string;
  supersedes_circular: string | null;
  summary_notes: string;
  packages: CompiledCircularPackage[];
}

export type CircularDiffStatus = "NEW" | "RATE_UPDATED" | "UNCHANGED";

export interface CircularDiffRow {
  case_code: string;
  procedure_keyword: string;
  status: CircularDiffStatus;
  old_total_case_rate: number | null;
  old_hci_fee: number | null;
  old_prof_fee: number | null;
  old_circular_number: string | null;
  new_total_case_rate: number;
  new_hci_fee: number;
  new_prof_fee: number;
  delta_total: number;
  delta_hci: number;
  delta_prof: number;
  inclusive_items: string[];
  aliases: string[];
}

export interface CircularCompilerInput {
  rawText?: string;
  pdfBase64?: string;
  mimeType?: string;
}

const COMPILER_SYSTEM_PROMPT = `You are the BillLens PH PhilHealth Circular Policy Compiler.
Your job is to extract structured PhilHealth All-Case-Rates (ACR) package updates from an official PhilHealth Circular PDF or annex text.

Return ONLY valid JSON (no markdown fences, no commentary) matching this exact schema:
{
  "circular_number": "string (e.g. 'PC-2024-0037' or 'PC-2026-0005')",
  "effective_from": "YYYY-MM-DD (effective date of the circular; default to today if unspecified)",
  "supersedes_circular": "string or null (e.g. 'PC-2013-0035' if mentioned, else null)",
  "summary_notes": "string (1-2 sentence summary of the circular's rate adjustment or scope)",
  "packages": [
    {
      "case_code": "string (5-digit RVS code or ICD-10 code, e.g. '44950', 'J18.9')",
      "procedure_keyword": "string (Official descriptive title of the case rate package)",
      "hci_fee": number (Health Care Institution fee in PHP; 0 if only total_case_rate is listed),
      "prof_fee": number (Professional Fee in PHP; 0 if only total_case_rate is listed),
      "total_case_rate": number (Total case rate in PHP),
      "inclusive_items": ["string (mandatory bundled inclusions mentioned in the circular, if any)"],
      "aliases": ["string (short lowercase supply/lab/drug matcher tokens, if applicable)"]
    }
  ]
}

Rules:
1. Extract every distinct case rate row present in the document or annex.
2. Preserve exact Philippine Peso amounts without currency symbols or commas.
3. If the circular specifies a percentage increase over a listed base rate, output the final adjusted rate.
4. Always prefix circular_number with 'PC-' (e.g., 'PC-2024-0037').`;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pure UTC date helper: returns `YYYY-MM-DD` minus 1 calendar day
 * so superseded circular rows close cleanly on `effective_from - 1 day`.
 */
export function subtractOneDay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    throw new Error(`Invalid ISO date "${isoDate}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Compiles a PhilHealth circular (PDF or pasted annex text) into structured,
 * split-normalized package candidates using Gemini Flash (without DB writes).
 */
export async function compilePhilHealthCircularWithGemini(
  input: CircularCompilerInput
): Promise<CompiledCircularResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured for circular compilation."
    );
  }

  const hasText = Boolean(input.rawText?.trim());
  const hasPdf = Boolean(input.pdfBase64?.trim());
  if (!hasText && !hasPdf) {
    throw new Error("Provide either circular text or a PDF document.");
  }

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [{ text: COMPILER_SYSTEM_PROMPT }];

  if (hasText) {
    parts.push({
      text: `PHILHEALTH CIRCULAR / ANNEX TEXT:\n\n${input.rawText!.trim()}`,
    });
  }

  if (hasPdf) {
    const cleanedBase64 = input.pdfBase64!.replace(
      /^data:[^;]+;base64,/,
      ""
    );
    parts.push({
      inline_data: {
        mime_type: input.mimeType || "application/pdf",
        data: cleanedBase64,
      },
    });
  }

  const models = getGeminiModelFallbackList();
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetchGeminiWithRetry(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1,
            max_output_tokens: 8192,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini circular compiler error (${response.status} on ${model}): ${errText}`
        );
      }

      const json = await response.json();
      const candidateParts: Array<{ text?: string; thought?: boolean }> =
        json.candidates?.[0]?.content?.parts || [];
      const textPart =
        candidateParts.find(
          (p) =>
            !p.thought &&
            typeof p.text === "string" &&
            p.text.trim().startsWith("{")
        ) ||
        candidateParts.find((p) => !p.thought && typeof p.text === "string") ||
        candidateParts[candidateParts.length - 1];

      const rawOutput = (textPart?.text || "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      if (!rawOutput) {
        throw new Error(`Empty response from Gemini compiler (${model}).`);
      }

      const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
      const rawPackages = Array.isArray(parsed.packages) ? parsed.packages : [];

      const seenCodes = new Set<string>();
      const packages: CompiledCircularPackage[] = [];

      for (const entry of rawPackages) {
        if (!entry || typeof entry !== "object") continue;
        const rec = entry as Record<string, unknown>;
        const case_code = String(rec.case_code ?? rec.code ?? "").trim();
        const procedure_keyword = String(
          rec.procedure_keyword ?? rec.keyword ?? ""
        ).trim();
        if (!case_code || !procedure_keyword) continue;

        const key = case_code.toUpperCase();
        if (seenCodes.has(key)) continue;
        seenCodes.add(key);

        const split = reconcilePackageSplit(
          Number(rec.hci_fee ?? rec.hciFee ?? 0),
          Number(rec.prof_fee ?? rec.profFee ?? 0),
          Number(rec.total_case_rate ?? rec.total_rate ?? rec.totalRate ?? 0),
          { case_code, is_verified: true }
        );

        if (split.total_case_rate <= 0) continue;

        const inclusive_items = Array.isArray(rec.inclusive_items)
          ? rec.inclusive_items.map((x) => String(x).trim()).filter(Boolean)
          : [];
        const aliases = Array.isArray(rec.aliases)
          ? rec.aliases
              .map((x) => String(x).trim().toLowerCase())
              .filter(Boolean)
          : [];

        packages.push({
          case_code,
          procedure_keyword,
          hci_fee: split.hci_fee,
          prof_fee: split.prof_fee,
          total_case_rate: split.total_case_rate,
          inclusive_items,
          aliases,
        });
      }

      const circular_number =
        formatCircularNumber(
          typeof parsed.circular_number === "string"
            ? parsed.circular_number
            : null,
          "2025-0001"
        ) || "PC-2025-0001";

      const rawDate =
        typeof parsed.effective_from === "string"
          ? parsed.effective_from.trim().slice(0, 10)
          : "";
      const effective_from = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : new Date().toISOString().slice(0, 10);

      const supersedes_circular =
        typeof parsed.supersedes_circular === "string" &&
        parsed.supersedes_circular.trim()
          ? formatCircularNumber(parsed.supersedes_circular.trim()) ??
            parsed.supersedes_circular.trim()
          : null;

      const summary_notes =
        typeof parsed.summary_notes === "string" && parsed.summary_notes.trim()
          ? parsed.summary_notes.trim()
          : `Compiled ${packages.length} case rate package(s) from ${circular_number}.`;

      return {
        circular_number,
        effective_from,
        supersedes_circular,
        summary_notes,
        packages,
      };
    } catch (err: unknown) {
      lastError =
        err instanceof Error
          ? err
          : new Error("Failed to compile PhilHealth circular.");
    }
  }

  throw lastError ?? new Error("Failed to compile PhilHealth circular.");
}

/**
 * Pure deterministic diff helper comparing compiled circular packages against
 * currently active catalog packages.
 */
export function computeCircularDiff(
  compiledPackages: CompiledCircularPackage[],
  existingActivePackages: CatalogPackage[]
): CircularDiffRow[] {
  const existingByCode = new Map<string, CatalogPackage>();
  for (const pkg of existingActivePackages) {
    existingByCode.set(pkg.code.trim().toUpperCase(), pkg);
  }

  return compiledPackages.map((compiled) => {
    const existing = existingByCode.get(compiled.case_code.trim().toUpperCase());

    if (!existing) {
      return {
        case_code: compiled.case_code,
        procedure_keyword: compiled.procedure_keyword,
        status: "NEW",
        old_total_case_rate: null,
        old_hci_fee: null,
        old_prof_fee: null,
        old_circular_number: null,
        new_total_case_rate: compiled.total_case_rate,
        new_hci_fee: compiled.hci_fee,
        new_prof_fee: compiled.prof_fee,
        delta_total: compiled.total_case_rate,
        delta_hci: compiled.hci_fee,
        delta_prof: compiled.prof_fee,
        inclusive_items: compiled.inclusive_items,
        aliases: compiled.aliases,
      };
    }

    const delta_total = round2(compiled.total_case_rate - existing.total_rate);
    const delta_hci = round2(compiled.hci_fee - existing.hci_fee);
    const delta_prof = round2(compiled.prof_fee - existing.prof_fee);

    const hasRateChange =
      Math.abs(delta_total) > 0.005 ||
      Math.abs(delta_hci) > 0.005 ||
      Math.abs(delta_prof) > 0.005;

    return {
      case_code: compiled.case_code,
      procedure_keyword: compiled.procedure_keyword || existing.keyword,
      status: hasRateChange ? "RATE_UPDATED" : "UNCHANGED",
      old_total_case_rate: existing.total_rate,
      old_hci_fee: existing.hci_fee,
      old_prof_fee: existing.prof_fee,
      old_circular_number:
        existing.circular_number ??
        (existing.circular_id ? `PC-${existing.circular_id}` : null),
      new_total_case_rate: compiled.total_case_rate,
      new_hci_fee: compiled.hci_fee,
      new_prof_fee: compiled.prof_fee,
      delta_total,
      delta_hci,
      delta_prof,
      inclusive_items:
        compiled.inclusive_items.length > 0
          ? compiled.inclusive_items
          : existing.inclusive_items,
      aliases: compiled.aliases,
    };
  });
}
