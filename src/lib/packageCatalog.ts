import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  CatalogPackage,
  ExtractedLineItem,
  PackageAlias,
  StatutoryRule,
} from "@/types/audit";

type PackageRow = Database["public"]["Tables"]["philhealth_packages"]["Row"];
type AliasRow = Database["public"]["Tables"]["package_item_aliases"]["Row"];
type StatutoryRuleRow = Database["public"]["Tables"]["statutory_rules"]["Row"];

export interface PackageCatalogResult {
  packages: CatalogPackage[];
  statutoryRule?: StatutoryRule;
  statutoryRules?: StatutoryRule[];
  /** Set when the catalog could not be loaded or is empty. */
  error: string | null;
}

/**
 * Fallback matcher tokens keyed by `case_code` (contains zero peso amounts or
 * rate definitions). Used when `package_item_aliases` rows have not yet been
 * seeded in the database for a package row.
 */
const DEFAULT_CODE_ALIASES: Record<string, string[]> = {
  "47562": [
    "trocar",
    "laparoscopic cannula",
    "co2 insufflation",
    "insufflation",
    "endoclip",
    "endoscopic clip",
    "titanium clip",
    "clip applier",
    "drape pack",
    "surgical drape",
    "surgical gown",
    "suture",
    "skin closure",
    "pacu",
    "recovery room",
    "lactated ringer",
  ],
  "47600": [
    "laparotomy tray",
    "laparotomy pad",
    "retractor",
    "suction tubing",
    "suture",
    "vicryl",
    "chromic",
    "jackson pratt",
    "penrose",
    "surgical drain",
    "cefazolin",
    "pacu",
  ],
  "44970": [
    "trocar",
    "endoloop",
    "endoscopic clip",
    "co2 insufflation",
    "insufflation",
    "laparoscopic grasper",
    "laparoscopic dissector",
    "surgical drape",
    "cefazolin",
    "pacu",
    "recovery room",
  ],
  "44950": [
    "appendectomy set",
    "surgical drape",
    "retractor",
    "suture",
    "surgical gauze",
    "laparotomy pad",
    "scalpel blade",
    "pacu",
  ],
  "93458": [
    "introducer sheath",
    "sheath",
    "judkins",
    "pigtail catheter",
    "diagnostic catheter",
    "guidewire",
    "contrast media",
    "iohexol",
    "iopamidol",
    "heparin",
    "manifold",
    "pressure line",
    "compression device",
    "tr band",
  ],
  "92920": [
    "guiding catheter",
    "guidewire",
    "ptca",
    "balloon catheter",
    "inflation device",
    "indeflator",
    "introducer sheath",
    "contrast media",
    "iohexol",
    "nitroglycerin",
    "heparin",
    "act test",
    "closure dressing",
  ],
  "59400": [
    "delivery room",
    "delivery pack",
    "episiotomy",
    "lidocaine",
    "oxytocin",
    "cord clamp",
    "suction bulb",
    "vitamin k",
    "erythromycin eye",
    "hygiene kit",
  ],
  "59510": [
    "spinal anesthesia tray",
    "spinal needle",
    "bupivacaine",
    "laparotomy drape",
    "suture",
    "oxytocin",
    "methylergometrine",
    "pacu",
  ],
  "90935": [
    "dialyzer",
    "dialysate",
    "blood tubing",
    "tubing line",
    "fistula needle",
    "avf needle",
    "heparin",
    "saline flush",
  ],
  "J18.9": [
    "chest x ray",
    "chest xray",
    "cbc",
    "urinalysis",
    "sputum",
    "ceftriaxone",
    "ampicillin",
    "iv cannula",
    "infusion set",
    "oxygen",
    "salbutamol",
    "ipratropium",
    "nebulization",
  ],
  "J18.0": [
    "arterial blood gas",
    "abg",
    "serum electrolytes",
    "blood culture",
    "chest x ray",
    "infusion set",
    "microdrip",
    "high flow oxygen",
  ],
  "A97.1": [
    "cbc",
    "hematocrit",
    "platelet count",
    "ns1",
    "dengue igm",
    "iv cannula",
    "stopcock",
    "extension tubing",
    "oral rehydration",
    "paracetamol",
  ],
  "A09.9": [
    "fecalysis",
    "urinalysis",
    "normosol",
    "infusion set",
    "oral rehydration",
    "zinc",
  ],
  "58150": [
    "retractor",
    "surgical drape",
    "suture",
    "vicryl",
    "electrocautery",
    "grounding pad",
    "laparotomy sponge",
    "foley catheter",
    "urine bag",
    "pacu",
  ],
  "49505": [
    "hernia mesh",
    "polypropylene mesh",
    "prolene",
    "suture",
    "surgical drape",
    "electrosurgery",
    "spinal anesthesia tray",
    "compression bandage",
    "pacu",
  ],
  "66984": [
    "phacoemulsification",
    "phaco",
    "intraocular lens",
    "iol",
    "viscoelastic",
    "ovd",
    "balanced salt solution",
    "bss",
    "eye drape",
    "eye shield",
    "mydriatic",
  ],
  I10: [
    "ecg",
    "electrocardiogram",
    "creatinine",
    "bun",
    "blood glucose",
    "nicardipine",
    "infusion set",
    "urine protein",
  ],
  "E11.1": [
    "capillary blood glucose",
    "cbg",
    "test strip",
    "blood ketone",
    "abg",
    "serum electrolytes",
    "regular insulin",
    "potassium chloride",
    "infusion pump",
    "urinalysis",
  ],
};

export function defaultAliasesForCode(caseCode: string): PackageAlias[] {
  const tokens = DEFAULT_CODE_ALIASES[caseCode.toUpperCase()] ?? [];
  return tokens.map((alias) => ({ alias, kind: "token" }));
}

/** Maps a `philhealth_packages` row plus its aliases to the engine's shape. */
export function toCatalogPackage(
  row: {
    case_code: string;
    procedure_keyword: string;
    hci_fee: number | string | null;
    prof_fee: number | string | null;
    total_case_rate: number | string | null;
    inclusive_items: string[] | null;
    circular_id?: string | null;
    circular_number?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    superseded_by?: string | null;
    source_url?: string | null;
    is_verified?: boolean | null;
    is_estimated_split?: boolean | null;
  },
  aliases?: PackageAlias[]
): CatalogPackage {
  const resolvedAliases =
    aliases && aliases.length > 0
      ? aliases
      : defaultAliasesForCode(row.case_code);

  const isAiGrounded = Boolean(row.source_url?.startsWith("ai_grounded"));
  const isVerified =
    typeof row.is_verified === "boolean" ? row.is_verified : !isAiGrounded;

  const split = reconcilePackageSplit(
    Number(row.hci_fee) || 0,
    Number(row.prof_fee) || 0,
    Number(row.total_case_rate) || 0,
    { case_code: row.case_code, is_verified: isVerified }
  );

  const resolvedCircularNumber = formatCircularNumber(
    row.circular_number,
    row.circular_id
  );
  const resolvedEstimatedSplit =
    typeof row.is_estimated_split === "boolean"
      ? row.is_estimated_split
      : split.is_estimated_split;

  return {
    code: row.case_code,
    keyword: row.procedure_keyword,
    hci_fee: split.hci_fee,
    prof_fee: split.prof_fee,
    total_rate: split.total_case_rate,
    inclusive_items: row.inclusive_items || [],
    circular_id: row.circular_id ?? undefined,
    ...(resolvedCircularNumber ? { circular_number: resolvedCircularNumber } : {}),
    effective_from: row.effective_from ?? undefined,
    effective_to: row.effective_to ?? null,
    ...(row.superseded_by !== undefined
      ? { superseded_by: row.superseded_by }
      : {}),
    source_url: row.source_url ?? null,
    is_verified: isVerified,
    ...(resolvedEstimatedSplit ? { is_estimated_split: true } : {}),
    aliases: resolvedAliases,
  };
}

/** Backward-compatible mapper alias used by UI pages. */
export const toMatchedPackage = toCatalogPackage;

function toAlias(row: Pick<AliasRow, "alias" | "kind">): PackageAlias {
  return { alias: row.alias, kind: row.kind === "regex" ? "regex" : "token" };
}

export function toStatutoryRule(
  row: Pick<
    StatutoryRuleRow,
    | "rule_code"
    | "label"
    | "vat_divisor"
    | "discount_rate"
    | "incomplete_threshold"
    | "eligible_categories"
    | "citation"
  > & {
    effective_from?: string | null;
    effective_to?: string | null;
  }
): StatutoryRule {
  return {
    rule_code: row.rule_code,
    label: row.label,
    vat_divisor: Number(row.vat_divisor) || 1.12,
    discount_rate: Number(row.discount_rate) || 0.2,
    incomplete_threshold: Number(row.incomplete_threshold) || 0.8,
    eligible_categories: (row.eligible_categories ??
      []) as ExtractedLineItem["category"][],
    citation: row.citation || "RA 9994 / RA 10754",
    ...(row.effective_from ? { effective_from: row.effective_from } : {}),
    ...(row.effective_to !== undefined
      ? { effective_to: row.effective_to }
      : {}),
  };
}

/**
 * Given multiple versioned rows in `statutory_rules`, selects the single active
 * statutory rule for `serviceDate` (YYYY-MM-DD). Falls back to the latest
 * `effective_from` version when `serviceDate` is missing or outside explicit windows.
 */
export function selectStatutoryRuleForDate(
  rules: StatutoryRule[],
  serviceDate?: string,
  ruleCode = "SENIOR_PWD"
): StatutoryRule | undefined {
  if (!Array.isArray(rules) || rules.length === 0) return undefined;

  const matchingCode = rules.filter(
    (r) => (r.rule_code || "").toUpperCase() === ruleCode.toUpperCase()
  );
  const candidates = matchingCode.length > 0 ? matchingCode : rules;

  if (candidates.length === 1) {
    return candidates[0];
  }

  const parsedTarget =
    serviceDate && /^\d{4}-\d{2}-\d{2}/.test(serviceDate.trim())
      ? serviceDate.trim().slice(0, 10)
      : null;

  const sorted = [...candidates].sort((a, b) => {
    const fromA = a.effective_from || "0000-00-00";
    const fromB = b.effective_from || "0000-00-00";
    return fromB.localeCompare(fromA);
  });

  if (parsedTarget) {
    const matchingDate = sorted.find((r) => {
      const from = r.effective_from || "0000-00-00";
      const to = r.effective_to || "9999-12-31";
      return from <= parsedTarget && parsedTarget <= to;
    });
    if (matchingDate) {
      return matchingDate;
    }
  }

  return sorted[0];
}

/**
 * Given multiple versioned rows per `case_code`, selects the single active
 * package version for each `case_code` on `serviceDate` (YYYY-MM-DD).
 * If `serviceDate` is missing or no version covers that exact date, picks the
 * version with the latest `effective_from`.
 */
export function selectActivePackagesForDate(
  packages: CatalogPackage[],
  serviceDate?: string
): CatalogPackage[] {
  const byCode = new Map<string, CatalogPackage[]>();
  for (const pkg of packages) {
    const key = pkg.code.toUpperCase();
    const list = byCode.get(key) ?? [];
    list.push(pkg);
    byCode.set(key, list);
  }

  const parsedTarget =
    serviceDate && /^\d{4}-\d{2}-\d{2}/.test(serviceDate.trim())
      ? serviceDate.trim().slice(0, 10)
      : null;

  const selected: CatalogPackage[] = [];

  for (const versions of byCode.values()) {
    if (versions.length === 1) {
      selected.push(versions[0]);
      continue;
    }

    // Sort descending by effective_from (latest first)
    const sorted = [...versions].sort((a, b) => {
      const fromA = a.effective_from || "0000-00-00";
      const fromB = b.effective_from || "0000-00-00";
      return fromB.localeCompare(fromA);
    });

    if (parsedTarget) {
      const matchingDate = sorted.find((v) => {
        const from = v.effective_from || "0000-00-00";
        const to = v.effective_to || "9999-12-31";
        return from <= parsedTarget && parsedTarget <= to;
      });
      if (matchingDate) {
        selected.push(matchingDate);
        continue;
      }
    }

    selected.push(sorted[0]);
  }

  return selected;
}

/**
 * Loads the PhilHealth package catalog with matcher aliases and statutory rules.
 * This is the single source of truth for case rates: there is no hardcoded
 * `BUILTIN_PACKAGES` fallback, so an empty table is reported clearly.
 */
export async function loadPackageCatalog(
  supabase: SupabaseClient<Database>
): Promise<PackageCatalogResult> {
  const { data: packageRows, error: packageError } = await supabase
    .from("philhealth_packages")
    .select("*");

  if (packageError) {
    return {
      packages: [],
      error: `Could not load PhilHealth packages: ${packageError.message}`,
    };
  }
  if (!packageRows || packageRows.length === 0) {
    return {
      packages: [],
      error:
        "The PhilHealth package catalog is empty. Run supabase/seeds/seed_philhealth_packages.sql before analyzing bills.",
    };
  }

  const { data: aliasRows } = await supabase
    .from("package_item_aliases")
    .select("package_id, alias, kind");

  const aliasesByPackage = new Map<string, PackageAlias[]>();
  for (const row of (aliasRows ?? []) as Array<
    Pick<AliasRow, "package_id" | "alias" | "kind">
  >) {
    const list = aliasesByPackage.get(row.package_id) ?? [];
    list.push(toAlias(row));
    aliasesByPackage.set(row.package_id, list);
  }

  let statutoryRule: StatutoryRule | undefined;
  let statutoryRules: StatutoryRule[] = [];
  try {
    const { data: ruleRows } = await supabase
      .from("statutory_rules")
      .select("*");
    if (Array.isArray(ruleRows) && ruleRows.length > 0) {
      statutoryRules = (ruleRows as StatutoryRuleRow[]).map((r) =>
        toStatutoryRule(r)
      );
      statutoryRule = selectStatutoryRuleForDate(statutoryRules);
    }
  } catch {
    // Optional table before migration 004 is applied
  }

  return {
    packages: (packageRows as PackageRow[]).map((row) =>
      toCatalogPackage(row, aliasesByPackage.get(row.id))
    ),
    statutoryRule,
    statutoryRules,
    error: null,
  };
}

export interface SeedPackageInput {
  case_code: string;
  procedure_keyword: string;
  circular_id: string;
  circular_number?: string;
  effective_from: string;
  effective_to?: string | null;
  superseded_by?: string | null;
  source_url?: string | null;
  is_verified?: boolean;
  is_estimated_split?: boolean;
  hci_fee: number;
  prof_fee: number;
  total_case_rate: number;
  inclusive_items: string[];
  aliases: PackageAlias[];
}

function splitDelimitedList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[|;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Tolerance (in pesos) before `hci_fee + prof_fee` is treated as inconsistent with `total_case_rate`. */
const PACKAGE_SPLIT_TOLERANCE = 1;

/** Official PhilHealth ACR HCI share for surgical RVS (numeric) codes: 60% HCI / 40% PF. */
const RVS_SURGICAL_HCI_SHARE = 0.6;

/** Official PhilHealth ACR HCI share for medical ICD-10 (alphanumeric) codes and AI fallback: 70% HCI / 30% PF. */
const ICD_MEDICAL_HCI_SHARE = 0.7;

export function isNumericRvsCode(caseCode?: string | null): boolean {
  return /^\d+$/.test((caseCode ?? "").trim());
}

export function formatCircularNumber(
  circularNumber?: string | null,
  circularId?: string | null
): string | undefined {
  const explicit = circularNumber?.trim();
  if (explicit) return explicit;
  const id = circularId?.trim();
  if (!id) return undefined;
  return /^PC-/i.test(id) ? id.toUpperCase() : `PC-${id}`;
}

function roundPeso(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Enforces consistency between `hci_fee`, `prof_fee`, and `total_case_rate`:
 *  1. If an explicit HCI/PF split is present (`hci + prof > 0`), it takes
 *     precedence (`is_estimated_split: false`), normalizing `total_case_rate`
 *     if it differs by more than ₱1.
 *  2. If a verified circular package (`is_verified === true`) omits the split,
 *     derives 60% HCI / 40% PF for numeric RVS surgical codes or 70% HCI / 30% PF
 *     for alphanumeric ICD-10 medical codes (`is_estimated_split: false`).
 *  3. If an unverified / AI-discovered package omits the split, applies the
 *     70% HCI / 30% PF fallback and flags `is_estimated_split: true`.
 */
export function reconcilePackageSplit(
  rawHci: number,
  rawProf: number,
  rawTotal: number,
  options?: { case_code?: string | null; is_verified?: boolean }
): {
  hci_fee: number;
  prof_fee: number;
  total_case_rate: number;
  is_estimated_split: boolean;
} {
  const hci = roundPeso(Math.max(0, Number.isFinite(rawHci) ? rawHci : 0));
  const prof = roundPeso(Math.max(0, Number.isFinite(rawProf) ? rawProf : 0));
  const total =
    Number.isFinite(rawTotal) && rawTotal > 0 ? roundPeso(rawTotal) : 0;
  const splitSum = roundPeso(hci + prof);

  if (splitSum > 0) {
    const total_case_rate =
      total > 0 && Math.abs(total - splitSum) <= PACKAGE_SPLIT_TOLERANCE
        ? total
        : splitSum;
    return {
      hci_fee: hci,
      prof_fee: prof,
      total_case_rate,
      is_estimated_split: false,
    };
  }

  if (total > 0) {
    const isVerified = options?.is_verified === true;
    const hciShare =
      isVerified && isNumericRvsCode(options?.case_code)
        ? RVS_SURGICAL_HCI_SHARE
        : ICD_MEDICAL_HCI_SHARE;
    const hci_fee = roundPeso(total * hciShare);
    return {
      hci_fee,
      prof_fee: roundPeso(total - hci_fee),
      total_case_rate: total,
      is_estimated_split: !isVerified,
    };
  }

  return {
    hci_fee: 0,
    prof_fee: 0,
    total_case_rate: 0,
    is_estimated_split: false,
  };
}

/**
 * Normalizes a raw JSON or CSV record into a validated `SeedPackageInput`.
 * Throws an error if required fields (`case_code`, `procedure_keyword`) are missing.
 */
export function normalizeSeedPackage(
  raw: Record<string, unknown>
): SeedPackageInput {
  const case_code = String(raw.case_code ?? raw.code ?? "").trim();
  const procedure_keyword = String(
    raw.procedure_keyword ?? raw.keyword ?? ""
  ).trim();

  if (!case_code || !procedure_keyword) {
    throw new Error(
      "Each PhilHealth package requires both `case_code` and `procedure_keyword`."
    );
  }

  const circular_id =
    String(raw.circular_id ?? "2024-0037").trim() || "2024-0037";
  const circular_number = formatCircularNumber(
    typeof raw.circular_number === "string" ? raw.circular_number : null,
    circular_id
  );
  const effective_from =
    String(raw.effective_from ?? "2024-10-01")
      .trim()
      .slice(0, 10) || "2024-10-01";
  const effective_to =
    typeof raw.effective_to === "string" && raw.effective_to.trim()
      ? raw.effective_to.trim().slice(0, 10)
      : null;
  const superseded_by =
    typeof raw.superseded_by === "string" && raw.superseded_by.trim()
      ? raw.superseded_by.trim()
      : null;
  const source_url =
    typeof raw.source_url === "string" && raw.source_url.trim()
      ? raw.source_url.trim()
      : null;

  const is_verified =
    typeof raw.is_verified === "boolean"
      ? raw.is_verified
      : typeof raw.isVerified === "boolean"
        ? raw.isVerified
        : source_url?.startsWith("ai_grounded")
          ? false
          : undefined;

  const { hci_fee, prof_fee, total_case_rate, is_estimated_split } =
    reconcilePackageSplit(
      Number(raw.hci_fee ?? raw.hciFee ?? 0),
      Number(raw.prof_fee ?? raw.profFee ?? 0),
      Number(raw.total_case_rate ?? raw.total_rate ?? raw.totalRate),
      { case_code, is_verified: is_verified === true }
    );

  const inclusive_items = splitDelimitedList(
    raw.inclusive_items ?? raw.inclusiveItems
  );

  const rawAliases = raw.aliases;
  const aliases: PackageAlias[] = [];
  if (Array.isArray(rawAliases)) {
    for (const entry of rawAliases) {
      if (typeof entry === "string" && entry.trim()) {
        aliases.push({ alias: entry.trim().toLowerCase(), kind: "token" });
      } else if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).alias === "string"
      ) {
        const rec = entry as Record<string, unknown>;
        const aliasText = String(rec.alias).trim().toLowerCase();
        if (aliasText) {
          aliases.push({
            alias: aliasText,
            kind: rec.kind === "regex" ? "regex" : "token",
          });
        }
      }
    }
  } else if (typeof rawAliases === "string") {
    for (const token of splitDelimitedList(rawAliases)) {
      aliases.push({ alias: token.toLowerCase(), kind: "token" });
    }
  }

  return {
    case_code,
    procedure_keyword,
    circular_id,
    ...(circular_number ? { circular_number } : {}),
    effective_from,
    effective_to,
    ...(superseded_by !== null ? { superseded_by } : {}),
    source_url,
    ...(is_verified !== undefined ? { is_verified } : {}),
    ...(is_estimated_split ? { is_estimated_split } : {}),
    hci_fee,
    prof_fee,
    total_case_rate,
    inclusive_items,
    aliases,
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses a CSV string of PhilHealth case rates into `SeedPackageInput[]`.
 * Pipe (`|`) or semicolon (`;`) separates multiple `inclusive_items` or `aliases` inside a cell.
 */
export function parseCatalogCsv(csvText: string): SeedPackageInput[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    throw new Error(
      "CSV must include a header row and at least one package row."
    );
  }

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );
  const results: SeedPackageInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    results.push(normalizeSeedPackage(record));
  }

  return results;
}

/**
 * Idempotently upserts one or more `SeedPackageInput` items and their matcher
 * aliases into Supabase.
 */
export async function upsertCatalogPackages(
  supabase: SupabaseClient<Database>,
  packages: SeedPackageInput[]
): Promise<{ upsertedPackages: number; upsertedAliases: number }> {
  let upsertedPackages = 0;
  let upsertedAliases = 0;

  for (const pkg of packages) {
    // 1. Check if (case_code, effective_from) already exists
    const { data: existing } = await supabase
      .from("philhealth_packages")
      .select("id")
      .eq("case_code", pkg.case_code)
      .eq("effective_from", pkg.effective_from)
      .maybeSingle();

    let packageId = existing?.id;

    const isVerified =
      typeof pkg.is_verified === "boolean"
        ? pkg.is_verified
        : !Boolean(pkg.source_url?.startsWith("ai_grounded"));

    if (packageId) {
      const updatePayload = {
        procedure_keyword: pkg.procedure_keyword,
        circular_id: pkg.circular_id,
        effective_to: pkg.effective_to ?? null,
        source_url: pkg.source_url ?? null,
        is_verified: isVerified,
        hci_fee: pkg.hci_fee,
        prof_fee: pkg.prof_fee,
        total_case_rate: pkg.total_case_rate,
        inclusive_items: pkg.inclusive_items,
      };
      let { error: updateErr } = await supabase
        .from("philhealth_packages")
        .update(updatePayload)
        .eq("id", packageId);

      if (updateErr && /is_verified/i.test(updateErr.message)) {
        const fallbackPayload = { ...updatePayload };
        delete (fallbackPayload as Record<string, unknown>).is_verified;
        const retry = await supabase
          .from("philhealth_packages")
          .update(fallbackPayload)
          .eq("id", packageId);
        updateErr = retry.error;
      }

      if (updateErr) {
        throw new Error(
          `Failed to update package ${pkg.case_code}: ${updateErr.message}`
        );
      }
      upsertedPackages++;
    } else {
      const insertPayload = {
        case_code: pkg.case_code,
        procedure_keyword: pkg.procedure_keyword,
        circular_id: pkg.circular_id,
        effective_from: pkg.effective_from,
        effective_to: pkg.effective_to ?? null,
        source_url: pkg.source_url ?? null,
        is_verified: isVerified,
        hci_fee: pkg.hci_fee,
        prof_fee: pkg.prof_fee,
        total_case_rate: pkg.total_case_rate,
        inclusive_items: pkg.inclusive_items,
      };
      let { data: inserted, error: insertErr } = await supabase
        .from("philhealth_packages")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr && /is_verified/i.test(insertErr.message)) {
        const fallbackPayload = { ...insertPayload };
        delete (fallbackPayload as Record<string, unknown>).is_verified;
        const retry = await supabase
          .from("philhealth_packages")
          .insert(fallbackPayload)
          .select("id")
          .single();
        inserted = retry.data;
        insertErr = retry.error;
      }

      if (insertErr || !inserted) {
        throw new Error(
          `Failed to insert package ${pkg.case_code}: ${insertErr?.message}`
        );
      }
      packageId = inserted.id;
      upsertedPackages++;
    }

    // 2. Sync aliases for this package
    if (packageId && pkg.aliases.length > 0) {
      for (const aliasItem of pkg.aliases) {
        const { error: aliasErr } = await supabase
          .from("package_item_aliases")
          .upsert(
            {
              package_id: packageId,
              alias: aliasItem.alias,
              kind: aliasItem.kind,
            },
            { onConflict: "package_id,alias" }
          );
        if (!aliasErr) {
          upsertedAliases++;
        }
      }
    }
  }

  return { upsertedPackages, upsertedAliases };
}
