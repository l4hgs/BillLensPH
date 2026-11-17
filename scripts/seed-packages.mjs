#!/usr/bin/env node
/**
 * BillLens PH — Idempotent PhilHealth Package & Statutory Rules Seed/Sync CLI
 *
 * Usage:
 *   npm run seed:packages
 *   npm run seed:packages -- --file supabase/seeds/philhealth_catalog.json
 *   npm run seed:packages -- --file custom_circular.csv
 *   npm run seed:packages -- --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let val = (match[2] ?? "").trim();
    val = val.replace(/^['"](.*)['"]$/, "$1");
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function parseCsvLine(line) {
  const cells = [];
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

function splitList(raw) {
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

function normalizePackage(raw) {
  const case_code = String(raw.case_code ?? raw.code ?? "").trim();
  const procedure_keyword = String(
    raw.procedure_keyword ?? raw.keyword ?? ""
  ).trim();
  if (!case_code || !procedure_keyword) {
    throw new Error(
      `Invalid package entry: requires both case_code and procedure_keyword.`
    );
  }

  const hci_fee = Number(raw.hci_fee ?? raw.hciFee ?? 0) || 0;
  const prof_fee = Number(raw.prof_fee ?? raw.profFee ?? 0) || 0;
  const rawTotal = Number(
    raw.total_case_rate ?? raw.total_rate ?? raw.totalRate
  );
  const total_case_rate =
    Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : hci_fee + prof_fee;

  const aliases = splitList(raw.aliases).map((a) => ({
    alias: a.toLowerCase(),
    kind: "token",
  }));

  return {
    case_code,
    procedure_keyword,
    circular_id: String(raw.circular_id ?? "2024-0037").trim() || "2024-0037",
    effective_from:
      String(raw.effective_from ?? "2024-10-01")
        .trim()
        .slice(0, 10) || "2024-10-01",
    effective_to:
      typeof raw.effective_to === "string" && raw.effective_to.trim()
        ? raw.effective_to.trim().slice(0, 10)
        : null,
    source_url:
      typeof raw.source_url === "string" && raw.source_url.trim()
        ? raw.source_url.trim()
        : null,
    hci_fee,
    prof_fee,
    total_case_rate,
    inclusive_items: splitList(raw.inclusive_items ?? raw.inclusiveItems),
    aliases,
  };
}

function loadInputCatalog(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Catalog file not found: ${resolved}`);
  }

  const rawText = fs.readFileSync(resolved, "utf8");
  if (resolved.endsWith(".csv")) {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    if (lines.length < 2) {
      throw new Error("CSV file must have a header row and at least 1 data row.");
    }
    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, "_")
    );
    const packages = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]);
      const rec = {};
      headers.forEach((h, idx) => {
        rec[h] = vals[idx] ?? "";
      });
      packages.push(normalizePackage(rec));
    }
    return { statutory_rules: [], packages };
  }

  const parsed = JSON.parse(rawText);
  const rawPackages = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.packages)
      ? parsed.packages
      : [];
  const statutory_rules = Array.isArray(parsed.statutory_rules)
    ? parsed.statutory_rules
    : [];

  return {
    statutory_rules,
    packages: rawPackages.map(normalizePackage),
  };
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileIdx = args.indexOf("--file");
  const filePath =
    fileIdx !== -1 && args[fileIdx + 1]
      ? args[fileIdx + 1]
      : "supabase/seeds/philhealth_catalog.json";

  const catalog = loadInputCatalog(filePath);
  const totalAliases = catalog.packages.reduce(
    (sum, p) => sum + p.aliases.length,
    0
  );

  console.log(
    `[seed:packages] Loaded ${catalog.packages.length} package(s), ${totalAliases} matcher alias(es), and ${catalog.statutory_rules.length} statutory rule(s) from ${filePath}`
  );

  if (dryRun) {
    console.log("[seed:packages] --dry-run passed. Schema validation succeeded.");
    for (const pkg of catalog.packages) {
      console.log(
        `  • [${pkg.case_code}] ${pkg.procedure_keyword} (${pkg.circular_id}, eff. ${pkg.effective_from}) — Total: ₱${pkg.total_case_rate.toLocaleString()} (HCI: ₱${pkg.hci_fee.toLocaleString()}, PF: ₱${pkg.prof_fee.toLocaleString()}) | ${pkg.aliases.length} aliases`
      );
    }
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[seed:packages] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in environment."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // 1. Upsert statutory rules if present
  for (const rule of catalog.statutory_rules) {
    const { error } = await supabase.from("statutory_rules").upsert(
      {
        rule_code: rule.rule_code,
        label: rule.label,
        vat_divisor: rule.vat_divisor,
        discount_rate: rule.discount_rate,
        incomplete_threshold: rule.incomplete_threshold,
        eligible_categories: rule.eligible_categories,
        citation: rule.citation,
        effective_from: rule.effective_from,
        effective_to: rule.effective_to ?? null,
      },
      { onConflict: "rule_code" }
    );
    if (error) {
      console.warn(
        `[seed:packages] Warning upserting statutory rule ${rule.rule_code}: ${error.message}`
      );
    } else {
      console.log(`[seed:packages] Synced statutory rule: ${rule.rule_code}`);
    }
  }

  // 2. Upsert packages & aliases
  let syncedPackages = 0;
  let syncedAliases = 0;

  for (const pkg of catalog.packages) {
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
          effective_to: pkg.effective_to,
          source_url: pkg.source_url,
          hci_fee: pkg.hci_fee,
          prof_fee: pkg.prof_fee,
          total_case_rate: pkg.total_case_rate,
          inclusive_items: pkg.inclusive_items,
        })
        .eq("id", packageId);

      if (updateErr) {
        console.error(
          `[seed:packages] Error updating ${pkg.case_code}: ${updateErr.message}`
        );
        continue;
      }
      syncedPackages++;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("philhealth_packages")
        .insert({
          case_code: pkg.case_code,
          procedure_keyword: pkg.procedure_keyword,
          circular_id: pkg.circular_id,
          effective_from: pkg.effective_from,
          effective_to: pkg.effective_to,
          source_url: pkg.source_url,
          hci_fee: pkg.hci_fee,
          prof_fee: pkg.prof_fee,
          total_case_rate: pkg.total_case_rate,
          inclusive_items: pkg.inclusive_items,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        console.error(
          `[seed:packages] Error inserting ${pkg.case_code}: ${insertErr?.message}`
        );
        continue;
      }
      packageId = inserted.id;
      syncedPackages++;
    }

    if (packageId && pkg.aliases.length > 0) {
      for (const aliasObj of pkg.aliases) {
        const { error: aliasErr } = await supabase
          .from("package_item_aliases")
          .upsert(
            {
              package_id: packageId,
              alias: aliasObj.alias,
              kind: aliasObj.kind,
            },
            { onConflict: "package_id,alias" }
          );
        if (!aliasErr) {
          syncedAliases++;
        }
      }
    }
  }

  console.log(
    `[seed:packages] Complete: ${syncedPackages}/${catalog.packages.length} package(s) and ${syncedAliases} alias(es) synced.`
  );
}

main().catch((err) => {
  console.error("[seed:packages] Fatal error:", err.message || err);
  process.exit(1);
});
