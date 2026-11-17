Inferred from the backend study (OCR → static ACR table → substring rules). Nothing here is a production outage; the core gap is that **coverage logic is frozen in SQL/code**, so the engine cannot stay current without a deploy.

### 1. Priority Matrix

| Task                                                                    | Category | Severity | Complexity |
| :---------------------------------------------------------------------- | :------- | :------- | :--------- |
| Engine unit tests (fixture bills vs expected flags)                     | Debt     | High     | 2          |
| Single package catalog (drop `BUILTIN_PACKAGES` drift)                  | Debt     | High     | 2          |
| Tokenize `inclusive_items` (stop long-phrase / `len>4` false positives) | Bug      | High     | 3          |
| Multi-page OCR (all staged files, not `files[0]`)                       | Bug      | High     | 3          |
| Versioned packages: `effective_from` / `circular_id`                    | Feat     | High     | 3          |
| Use HCI vs PF in totals, not only `total_case_rate`                     | Bug      | Medium   | 3          |
| Statutory rules table (SC/PWD rates, eligible categories)               | Feat     | Medium   | 3          |
| Synonym / alias map for codes and supply names                          | Feat     | Medium   | 3          |
| Package admin or seed-sync path (no code change to add rates)           | Feat     | Medium   | 4          |
| Recompute fair OOP from rules, not `due − flagged lines`                | Debt     | Medium   | 4          |
| Member eligibility / remaining benefits (optional later)                | Feat     | Low      | 5          |

**Quick wins:** tests + kill builtin fallback duplication.

---

### 2. Execution Roadmap

#### Phase 1 — Make the current engine trustworthy

Stabilize matching before adding “dynamic” sources, or you will version garbage.

- [x] **Lock `runAuditEngine` with fixtures**  
      Golden bills: one unbundled supply, one under-deducted case rate, one Senior/PWD miss, one already-covered line, one unmatched diagnosis. Done when a CI script fails if flags/totals change.

- [x] **One catalog: database only**  
      Require `philhealth_packages` at OCR time; if empty, return a clear error instead of silently using `BUILTIN_PACKAGES`. Done when `auditEngine.ts` has no peso amounts.

- [x] **Replace substring matching with normalized tokens**  
      Store short aliases (`trocar`, `pacu`, `cefazolin`) plus optional regex; drop “any word longer than 4 characters.” Done when a line named “standard surgical consult” is not flagged as a trocar pack.

- [x] **OCR every staged page**  
      Concatenate Gemini line items / codes from all `raw_extracted_data.files[]`. Done when a 3-page SOA does not drop pages 2–3.

#### Phase 2 — Make rates and rules data, not code

This is the dynamic layer. Still **your** data, versioned — not a fake PhilHealth API.

- [x] **Add versioning columns**  
      `circular_id`, `effective_from`, `effective_to`, `source_url` on `philhealth_packages`. Engine picks the row valid on admission/discharge date (fallback: latest). Done when two rates for `47562` can coexist.

- [x] **Seed aliases separately**  
      Table `package_item_aliases(package_id, alias, kind)` so SQL inclusive phrases stay human-readable and matching uses aliases. Done when seed phrases and matcher tokens are different columns.

- [x] **Move Senior/PWD math into a `statutory_rules` table**  
      VAT divisor, 20% rate, eligible categories, 80% “incomplete discount” threshold. Done when changing 20% → a new circular is a SQL row, not a TypeScript edit.

- [x] **Apply HCI and PF as separate caps**  
      Compare hospital PhilHealth HCI vs `hci_fee` and PF vs `prof_fee`; flag which bucket is short. Done when `excess_hci_charge` is not only `philhealth_total < 0.9 * total_rate`.

- [x] **Recompute `fair_out_of_pocket` from those caps + statutory relief**  
      Stop subtracting every unbundled line at 100% of charge if the case rate is already partly deducted. Done when totals are explainable line-by-line.

#### Phase 3 — Operate the catalog without deploys

- [x] **Idempotent seed/sync command**  
      `npm run seed:packages` (or Supabase migration pipeline) from a JSON/CSV of circulars. Done when adding cataract vs PCI is data-only.

- [x] **Internal admin read/write (authenticated staff) or CSV upload**  
      RLS: public read stays; write is service-role or staff role. Done when a non-dev can add `case_code` without touching `auditEngine.ts`.

- [x] **Do not scrape PhilHealth as step 1**  
      There is no stable public ACR API in this app’s design. Treat official PDFs/circulars as the source; humans (or a later parser) update the versioned tables. Live eligibility/eClaims is Phase 4+ and needs legal/auth scope.

- [x] **Negotiation brief reads the same engine output**  
      Print/chat already re-run `runAuditEngine`; keep them on the versioned catalog so Studio, OCR, and brief never disagree.

---

### 3. Critical Dependencies

1. Tests **before** matcher rewrite (or you cannot tell false positives from real savings).
2. Single catalog **before** versioning (do not version `BUILTIN_PACKAGES` and SQL in parallel).
3. Token aliases **before** more packages (18 noisy phrases × more rows = more junk flags).
4. Versioned rates **before** HCI/PF math (wrong circular + fancy math = confident wrong OOP).
5. Admin/sync **after** schema (`effective_from`, aliases, statutory_rules).

---

### 4. Regression Risks

| Change                  | What can break                             | How to test                                                               |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Remove builtin fallback | OCR 500s if seed not applied               | Empty-table error path + seeded happy path                                |
| Token matcher           | Existing yellow flags disappear or explode | Same 5 fixtures; snapshot `flags[].item_id`                               |
| Multi-page OCR          | Duplicate line ids (`item-1` twice)        | Prefix ids `page2-item-1`; Studio overrides still keyed                   |
| Dated packages          | “Wrong” rate if date missing               | Null date → latest active; explicit 2024 vs 2026 fixtures                 |
| Fair OOP formula        | Archive totals jump for old audits         | Keep stored `audit_results`; recompute only on re-analyze / override save |

**Suggested order this week:** checkboxes in Phase 1, then `effective_from` + aliases. That is enough to call the backend “dynamic” without pretending it is live PhilHealth.
