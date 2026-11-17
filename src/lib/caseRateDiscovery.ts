import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CatalogPackage, ExtractedBillData } from "@/types/audit";
import { bestPackageForDiagnosis } from "@/lib/itemMatcher";
import {
  normalizeSeedPackage,
  toCatalogPackage,
  upsertCatalogPackages,
  type SeedPackageInput,
} from "@/lib/packageCatalog";

export interface CaseRateDiscoveryInput {
  query?: string;
  diagnosis?: string;
  codes?: string[];
}

const DISCOVERY_SYSTEM_PROMPT = `You are a Philippine PhilHealth All-Case-Rates (ACR) Medical Coding & Benefit Package Specialist.
Given a clinical diagnosis, surgical procedure, RVS code, or ICD-10 code from a Philippine hospital statement, return the matching official PhilHealth All-Case-Rates (ACR) package(s) aligned with PhilHealth Circular 2024-0037 (and related ACR circulars).

Return ONLY valid JSON matching this exact structure (no markdown fences, no commentary):
{
  "packages": [
    {
      "case_code": "string (Official 5-digit RVS code for procedures or ICD-10 code for medical conditions, e.g. '43235', 'I63.9', 'N39.0', 'O82')",
      "procedure_keyword": "string (Official descriptive title of the PhilHealth Case Rate package)",
      "circular_id": "string (e.g. '2024-0037')",
      "effective_from": "2024-10-01",
      "source_url": "ai_grounded:philhealth-acr",
      "hci_fee": number (Health Care Institution fee in PHP, typically 60%-70% of total_case_rate),
      "prof_fee": number (Professional Fee share in PHP, typically 30%-40% of total_case_rate),
      "total_case_rate": number (Exact sum of hci_fee + prof_fee in PHP),
      "inclusive_items": [
        "string (5 to 8 human-readable mandatory bundled inclusions such as ward/OR use, routine labs, standard supplies, and bundled medications)"
      ],
      "aliases": [
        "string (6 to 10 short lowercase specific supply, lab, or drug tokens that hospitals commonly unbundle on itemized bills, e.g. 'cbc', 'urinalysis', 'iv cannula', 'infusion set', 'suture', 'pacu'. NEVER include generic words like 'standard', 'routine', 'surgical', 'basic', or 'fee')"
      ]
    }
  ]
}

Rules:
1. If the user provides a general condition or procedure query (e.g., "Thyroidectomy", "UTI", "Stroke", "Sepsis"), return the 1 to 3 most relevant PhilHealth Case Rate packages.
2. Ensure hci_fee + prof_fee === total_case_rate and all amounts are realistic Philippine Peso (PHP) PhilHealth ACR rates.
3. Never return an empty packages array if the input describes any recognizable medical condition, symptom, or surgical procedure.`;

/**
 * Checks whether an extracted hospital bill already matches at least one
 * package in the loaded catalog (by RVS/ICD-10 code or diagnosis tokens).
 */
export function hasCatalogMatchForBill(
  bill: Pick<
    ExtractedBillData,
    "case_rate_codes_detected" | "primary_diagnosis"
  >,
  packages: CatalogPackage[]
): boolean {
  const codeSet = new Set(packages.map((p) => p.code.toUpperCase()));
  for (const rawCode of bill.case_rate_codes_detected ?? []) {
    const normalized = rawCode.trim().toUpperCase();
    if (normalized && codeSet.has(normalized)) {
      return true;
    }
  }

  if (bill.primary_diagnosis && bill.primary_diagnosis.trim()) {
    const matched = bestPackageForDiagnosis(bill.primary_diagnosis, packages);
    if (matched) return true;
  }

  return false;
}

/**
 * Uses Gemini Flash to automatically resolve official PhilHealth Case Rate
 * packages for any diagnosis, procedure, or RVS/ICD-10 code not yet in the DB.
 */
export async function discoverPhilHealthPackageWithGemini(
  input: CaseRateDiscoveryInput
): Promise<SeedPackageInput[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured for automatic case rate discovery."
    );
  }

  const parts: string[] = [];
  if (input.query?.trim()) {
    parts.push(`Search Query: "${input.query.trim()}"`);
  }
  if (input.diagnosis?.trim()) {
    parts.push(`Patient Primary Diagnosis: "${input.diagnosis.trim()}"`);
  }
  if (input.codes && input.codes.length > 0) {
    parts.push(`Detected RVS / ICD-10 Codes: ${input.codes.join(", ")}`);
  }

  if (parts.length === 0) {
    return [];
  }

  const userPrompt = `${DISCOVERY_SYSTEM_PROMPT}\n\nResolve the official PhilHealth Case Rate package(s) for:\n${parts.join("\n")}`;

  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const models = Array.from(
    new Set([
      ...(configuredModel ? [configuredModel] : []),
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite-preview",
    ])
  );

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1,
            max_output_tokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini discovery error (${response.status} on ${model}): ${errText}`
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

      const rawText = (textPart?.text || "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      if (!rawText) {
        throw new Error(`Empty response from Gemini discovery (${model}).`);
      }

      const parsed = JSON.parse(rawText) as {
        packages?: unknown[];
      };
      const rawList = Array.isArray(parsed.packages)
        ? parsed.packages
        : Array.isArray(parsed)
          ? (parsed as unknown[])
          : [];

      const normalized: SeedPackageInput[] = [];
      for (const item of rawList) {
        if (item && typeof item === "object") {
          try {
            normalized.push(
              normalizeSeedPackage({
                ...(item as Record<string, unknown>),
                source_url:
                  (item as Record<string, unknown>).source_url ||
                  "ai_grounded:philhealth-acr",
              })
            );
          } catch {
            // Skip malformed item
          }
        }
      }

      if (normalized.length > 0) {
        return normalized;
      }
    } catch (err: unknown) {
      lastError =
        err instanceof Error ? err : new Error("Case rate discovery failed.");
    }
  }

  if (lastError) {
    throw lastError;
  }
  return [];
}

/**
 * Ensures that if a scanned hospital bill has a diagnosis or RVS/ICD-10 code
 * not yet present in `currentPackages`, Gemini automatically resolves the
 * PhilHealth Case Rate package, caches it into Supabase (best-effort), and
 * merges it into the active catalog for immediate auditing.
 */
export async function ensureBillPackagesInCatalog(
  supabase: SupabaseClient<Database> | null,
  bill: Pick<
    ExtractedBillData,
    "case_rate_codes_detected" | "primary_diagnosis"
  >,
  currentPackages: CatalogPackage[],
  discoverFn: (
    input: CaseRateDiscoveryInput
  ) => Promise<SeedPackageInput[]> = discoverPhilHealthPackageWithGemini
): Promise<{
  packages: CatalogPackage[];
  discovered: CatalogPackage[];
}> {
  if (hasCatalogMatchForBill(bill, currentPackages)) {
    return { packages: currentPackages, discovered: [] };
  }

  const hasDiagnosis = Boolean(bill.primary_diagnosis?.trim());
  const hasCodes =
    Array.isArray(bill.case_rate_codes_detected) &&
    bill.case_rate_codes_detected.some((c) => c.trim().length > 0);

  if (!hasDiagnosis && !hasCodes) {
    return { packages: currentPackages, discovered: [] };
  }

  try {
    const seedInputs = await discoverFn({
      diagnosis: bill.primary_diagnosis,
      codes: bill.case_rate_codes_detected,
    });

    if (seedInputs.length === 0) {
      return { packages: currentPackages, discovered: [] };
    }

    // Best-effort cache into Supabase so future scans and `/rates` have it stored
    if (supabase) {
      try {
        await upsertCatalogPackages(supabase, seedInputs);
      } catch (cacheErr) {
        console.warn(
          "Auto-discovered PhilHealth package could not be cached to DB (using in-memory for audit):",
          cacheErr
        );
      }
    }

    const discoveredCatalog: CatalogPackage[] = seedInputs.map((item) =>
      toCatalogPackage(
        {
          case_code: item.case_code,
          procedure_keyword: item.procedure_keyword,
          hci_fee: item.hci_fee,
          prof_fee: item.prof_fee,
          total_case_rate: item.total_case_rate,
          inclusive_items: item.inclusive_items,
          circular_id: item.circular_id,
          effective_from: item.effective_from,
          effective_to: item.effective_to ?? null,
          source_url: item.source_url ?? "ai_grounded:philhealth-acr",
        },
        item.aliases
      )
    );

    const existingKeys = new Set(
      currentPackages.map(
        (p) => `${p.code.toUpperCase()}::${p.effective_from || "2024-10-01"}`
      )
    );
    const merged = [...currentPackages];
    for (const pkg of discoveredCatalog) {
      const key = `${pkg.code.toUpperCase()}::${pkg.effective_from || "2024-10-01"}`;
      if (!existingKeys.has(key)) {
        merged.push(pkg);
        existingKeys.add(key);
      }
    }

    return { packages: merged, discovered: discoveredCatalog };
  } catch (err) {
    console.warn("Automatic PhilHealth case rate discovery skipped:", err);
    return { packages: currentPackages, discovered: [] };
  }
}
