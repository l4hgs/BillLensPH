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
    effective_from?: string | null;
    effective_to?: string | null;
    source_url?: string | null;
  },
  aliases?: PackageAlias[]
): CatalogPackage {
  const resolvedAliases =
    aliases && aliases.length > 0
      ? aliases
      : defaultAliasesForCode(row.case_code);

  return {
    code: row.case_code,
    keyword: row.procedure_keyword,
    hci_fee: Number(row.hci_fee) || 0,
    prof_fee: Number(row.prof_fee) || 0,
    total_rate: Number(row.total_case_rate) || 0,
    inclusive_items: row.inclusive_items || [],
    circular_id: row.circular_id ?? undefined,
    effective_from: row.effective_from ?? undefined,
    effective_to: row.effective_to ?? null,
    source_url: row.source_url ?? null,
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
  >
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
  };
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
  try {
    const { data: ruleRow } = await supabase
      .from("statutory_rules")
      .select("*")
      .eq("rule_code", "SENIOR_PWD")
      .maybeSingle();
    if (ruleRow) {
      statutoryRule = toStatutoryRule(ruleRow as StatutoryRuleRow);
    }
  } catch {
    // Optional table before migration 004 is applied
  }

  return {
    packages: (packageRows as PackageRow[]).map((row) =>
      toCatalogPackage(row, aliasesByPackage.get(row.id))
    ),
    statutoryRule,
    error: null,
  };
}

export interface SeedPackageInput {
  case_code: string;
  procedure_keyword: string;
  circular_id: string;
  effective_from: string;
  effective_to?: string | null;
  source_url?: string | null;
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
  const effective_from =
    String(raw.effective_from ?? "2024-10-01")
      .trim()
      .slice(0, 10) || "2024-10-01";
  const effective_to =
    typeof raw.effective_to === "string" && raw.effective_to.trim()
      ? raw.effective_to.trim().slice(0, 10)
      : null;
  const source_url =
    typeof raw.source_url === "string" && raw.source_url.trim()
      ? raw.source_url.trim()
      : null;

  const hci_fee = Math.max(0, Number(raw.hci_fee ?? raw.hciFee ?? 0) || 0);
  const prof_fee = Math.max(0, Number(raw.prof_fee ?? raw.profFee ?? 0) || 0);
  const rawTotal = Number(raw.total_case_rate ?? raw.total_rate ?? raw.totalRate);
  const total_case_rate =
    Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : hci_fee + prof_fee;

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
    effective_from,
    effective_to,
    source_url,
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

    if (packageId) {
      const { error: updateErr } = await supabase
        .from("philhealth_packages")
        .update({
          procedure_keyword: pkg.procedure_keyword,
          circular_id: pkg.circular_id,
          effective_to: pkg.effective_to ?? null,
          source_url: pkg.source_url ?? null,
          hci_fee: pkg.hci_fee,
          prof_fee: pkg.prof_fee,
          total_case_rate: pkg.total_case_rate,
          inclusive_items: pkg.inclusive_items,
        })
        .eq("id", packageId);

      if (updateErr) {
        throw new Error(
          `Failed to update package ${pkg.case_code}: ${updateErr.message}`
        );
      }
      upsertedPackages++;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("philhealth_packages")
        .insert({
          case_code: pkg.case_code,
          procedure_keyword: pkg.procedure_keyword,
          circular_id: pkg.circular_id,
          effective_from: pkg.effective_from,
          effective_to: pkg.effective_to ?? null,
          source_url: pkg.source_url ?? null,
          hci_fee: pkg.hci_fee,
          prof_fee: pkg.prof_fee,
          total_case_rate: pkg.total_case_rate,
          inclusive_items: pkg.inclusive_items,
        })
        .select("id")
        .single();

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
