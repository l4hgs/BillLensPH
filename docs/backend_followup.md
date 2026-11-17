The catalog is already **data-driven**. “Automatic” means the pipeline and eligibility math run without a human re-typing circulars or guessing member status. Do **not** scrape PhilHealth or store a full PIN in plaintext — there is no public member API this app can call.

## Follow-up: automatic + dynamic (close the remaining gaps first)

These should land **before** eligibility, or eligibility will scale a wrong fair-OOP number.

- [ ] **Apply HCI/PF shortfall to `fair_out_of_pocket`**  
      `fairOOP = max(0, hospitalDue − unbundledBalances − seniorRelief − eligiblePhilHealthShortfall)`. Done when fixture 2’s ₱25,000 due drops by the HCI+PF gap, not only by flagged supplies.

- [ ] **Date-select `statutory_rules` the same way as packages**  
      Load all `SENIOR_PWD` rows; pick by discharge date. Done when two VAT/discount versions can coexist.

- [ ] **Staff-only catalog writes**  
      Replace “any authenticated user” RLS with `profiles.role in ('staff','admin')`. `POST /api/rates` checks the same. Done when a normal patient cannot upsert `47562`.

- [ ] **Auto-OCR after staging**  
      Scanner already has an analyze call; make it the default after upload (with retry + `page_count`). Done when a 3-page SOA reaches Studio without a second button, unless OCR 503s.

- [ ] **Catalog ops without deploys (keep this the “dynamic” path)**  
      Staff CSV on `/rates`, `npm run seed:packages` in CI against a review JSON, `circular_id` + `source_url` required. **No PhilHealth portal scrape.**

- [ ] **Drop silent TS fallbacks once DB is required**  
      Fail OCR if `statutory_rules` is missing (same as empty packages). Keep `DEFAULT_CODE_ALIASES` only as a test helper, not production.

---

## Member eligibility / remaining benefits — how to implement

Treat eligibility as a **snapshot attached to the audit**, not a live PhilHealth login.

PhilHealth (ACR world) that matters for this app:

| Rule                                  | Effect on expected benefit                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Not a member / lapsed contributions   | Expected PhilHealth = ₱0                                                                                           |
| Active member or declared dependent   | Full HCI+PF of the **dated** package                                                                               |
| Succeeding case, same confinement     | Reduce by a **catalog factor** (store on package or `statutory_rules`, default 0.5 until you confirm per circular) |
| Inpatient 45-day annual cap exhausted | Medical/surgical confinement packages → ₱0; still allow per-session packages                                       |
| Hemodialysis-style packages           | Cap = `min(1, remaining_sessions)` × session rate (your `90935` row)                                               |
| Unknown                               | Show full package as **potential**, flag as unverified — never silently assume ₱0 or 100%                          |

### Data model (`006_member_eligibility.sql`)

Do **not** put this only on `profiles`. Benefits are as-of a confinement.

```text
profiles.role                  -- 'member' | 'staff' | 'admin'
profiles.membership_type       -- 'member' | 'dependent' | 'none' | 'unknown'

member_benefit_snapshots
  id, user_id
  as_of_date
  source            -- 'user_declared' | 'ocr_cf1' | 'ocr_mdr'
  contribution_status  -- 'active' | 'lapsed' | 'unknown'
  benefit_year
  inpatient_days_used, inpatient_days_remaining   -- remaining default 45
  hd_sessions_remaining
  notes, created_at
  -- optional: philhealth_pin_last4 only (never full PIN)

audit_eligibility  (1:1 with audits, copied at analyze time)
  audit_id
  snapshot_id nullable
  is_eligible
  case_sequence          -- 'first' | 'succeeding' | 'unknown'
  remaining_benefit_factor  -- 0..1, engine input
  inpatient_days_remaining
  hd_sessions_remaining
  source, confidence     -- 0..1
```

RLS: `auth.uid() = user_id` only. Staff do not read other users’ snapshots.

### Engine contract (pure, testable)

Add to `AuditOptions`:

```ts
eligibility?: {
  isEligible: boolean | "unknown";
  caseSequence: "first" | "succeeding" | "unknown";
  succeedingFactor: number;        // from catalog, not hardcoded forever
  inpatientDaysRemaining: number | null;
  hdSessionsRemaining: number | null;
  packageKind: "inpatient_case" | "per_session"; // from philhealth_packages
};
```

New step **before** HCI/PF comparison:

1. `catalogRate = hci_fee + prof_fee` for the date-selected package.
2. `eligibleRate = catalogRate * remaining_benefit_factor`.
   - not eligible → 0
   - succeeding → `catalogRate * succeedingFactor`
   - inpatient days remaining 0 → 0
   - per-session → `sessionRate * min(1, hdSessionsRemaining)` for this bill’s sessions
   - unknown → `catalogRate`, plus `eligibility_unverified` flag
3. Shortfall = `max(0, eligibleRate − hospital philhealth_total)` (split HCI/PF with the same factor).
4. Unbundling **still runs** (hospital billed a bundled supply). Eligibility does not hide unbundled charges.
5. If `eligibleRate === 0`, skip “under-deducted case rate” (there is nothing to deduct) and emit `not_entitled_this_confinement`.

New flag types: `eligibility_unverified` | `ineligible_member` | `succeeding_case_reduced` | `benefit_days_exhausted`.

### Capture UX (automatic enough)

**Scanner / Audit Studio panel (required):**

- [ ] Eligible? Yes / No / I don’t know
- [ ] First case vs succeeding (same admission)
- [ ] Inpatient days left this year (default 45, editable)
- [ ] HD sessions left (only if matched package is per-session)
- [ ] Copy last snapshot for this user as default, freeze a copy on the audit when OCR runs

**Optional later OCR:** if the user uploads CF1/MDR, Gemini fills the snapshot with `source: ocr_cf1` and `confidence < 1` until they confirm. Do not auto-submit PIN anywhere.

**Copilot:** inject the snapshot (“Member declared succeeding case, 12 days left, expected ACR ₱19,375 not ₱38,750”) so it stops claiming full ACR.

### What not to build

- PhilHealth member portal login, cookie replay, or unofficial “PIN lookup”
- Storing full PIN / TIN in `raw_extracted_data`
- Assuming every package uses the 45-day cap — add `package_kind` + `benefit_limit_rule` on `philhealth_packages` (`inpatient_days` | `per_session` | `none`)

---

## Sequence (so you don’t rework)

1. Fair OOP + staff RLS (fixes you already identified).
2. `package_kind` / `succeeding_case_factor` on the catalog (eligibility needs this).
3. `member_benefit_snapshots` + `audit_eligibility` + engine input.
4. Scanner declaration UI + persist on analyze.
5. Tests: ineligible → no ACR shortfall; succeeding → half cap; 0 days → 0; unknown → full cap + warning.
6. Only then CF1 OCR and HD session math.

**Dynamic** = dated catalog + dated statutory rules + dated eligibility snapshot.  
**Automatic** = OCR all pages after upload, freeze eligibility onto the audit, recompute Studio/brief/chat from that freeze.  
**Not automatic** = inventing live membership from PhilHealth’s network.
