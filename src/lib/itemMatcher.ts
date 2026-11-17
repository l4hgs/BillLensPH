import type { CatalogPackage, PackageAlias } from "@/types/audit";

/**
 * Text matching for the audit engine.
 *
 * Everything is compared after `normalizeText`, and terms only match on whole
 * words. This replaces the old substring rules, which flagged any line that
 * shared a word longer than 4 letters with a package inclusion (so a
 * "Standard Surgical Consult" matched "Standard surgical trocars").
 */

/** Words that say nothing about which package or supply a line belongs to. */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "of",
  "the",
  "with",
  "without",
  "for",
  "in",
  "on",
  "to",
  "per",
]);

/** Lowercases, turns punctuation into spaces, and collapses whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp | null>();

/**
 * Compiles an alias once. Token aliases become a whole-word pattern whose last
 * word may take a plural "s"/"es". An invalid regex alias compiles to null and
 * never matches, so one bad catalog row cannot break an audit.
 */
function compileAlias(alias: PackageAlias): RegExp | null {
  const key = `${alias.kind}:${alias.alias}`;
  if (patternCache.has(key)) return patternCache.get(key) ?? null;

  let pattern: RegExp | null = null;
  if (alias.kind === "regex") {
    try {
      pattern = new RegExp(alias.alias, "i");
    } catch {
      pattern = null;
    }
  } else {
    const words = normalizeText(alias.alias).split(" ").filter(Boolean);
    if (words.length > 0) {
      const body = words.map(escapeRegExp).join(" ");
      pattern = new RegExp(`(?:^| )${body}(?:s|es)?(?= |$)`);
    }
  }

  patternCache.set(key, pattern);
  return pattern;
}

/** Returns the first alias that matches the text, or undefined. */
export function findMatchingAlias(
  text: string,
  aliases: PackageAlias[]
): PackageAlias | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  return aliases.find((alias) => compileAlias(alias)?.test(normalized) ?? false);
}

/** True when `phrase` appears in `text` as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  const words = normalizeText(phrase).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  return (
    compileAlias({ alias: words.join(" "), kind: "token" })?.test(
      normalizeText(text)
    ) ?? false
  );
}

/**
 * Share of a package keyword's significant words found in the text, from 0 to
 * 1. Used to match a diagnosis like "Laparoscopic Appendectomy" to the right
 * package instead of the first one that merely shares "laparoscopic".
 */
export function keywordCoverage(text: string, keyword: string): number {
  const keywordTokens = Array.from(new Set(significantTokens(keyword)));
  if (keywordTokens.length === 0) return 0;
  const textTokens = new Set(significantTokens(text));
  const hits = keywordTokens.filter((token) => textTokens.has(token)).length;
  return hits / keywordTokens.length;
}

/** Minimum keyword coverage for a diagnosis to select a package. */
export const DIAGNOSIS_MATCH_THRESHOLD = 0.6;

/**
 * Picks the single package whose keyword best covers the diagnosis text.
 * Returns undefined when nothing clears the threshold or the best score is a
 * tie, because guessing between two packages is worse than matching none.
 */
export function bestPackageForDiagnosis(
  diagnosis: string,
  packages: CatalogPackage[]
): CatalogPackage | undefined {
  let best: CatalogPackage | undefined;
  let bestScore = 0;
  let tied = false;

  for (const pkg of packages) {
    const score = keywordCoverage(diagnosis, pkg.keyword);
    if (score > bestScore) {
      best = pkg;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }

  if (bestScore < DIAGNOSIS_MATCH_THRESHOLD || tied) return undefined;
  return best;
}
