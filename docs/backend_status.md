# BillLens PH — Backend, Database Security & Compliance Audit Report

**Audit Scope:** `src/app/api/**`, `src/app/auth/callback/**`, `src/lib/**`, `src/types/**`, `src/middleware.ts`, and `supabase/migrations/001`–`007`  
**Audit Date:** 2026-11-23

---

## 1. API Routes & Server Actions (`src/app/api/**` & `auth/callback`)

### Findings

1. **Missing Authentication Gate (`401`) on AI Endpoints — `High`**
   - **[`src/app/api/audit/ocr/route.ts`](../src/app/api/audit/ocr/route.ts#L57-L60) ([L173–L192](../src/app/api/audit/ocr/route.ts#L173-L192)):** Calls `supabase.auth.getUser()`, but never rejects unauthenticated requests (`!user`). Any anonymous caller can `POST` inline `pages[]` or `imageBase64` to execute `extractMultiPageBillWithGemini` and `ensureBillPackagesInCatalog`, exhausting `GEMINI_API_KEY` quota.
   - **[`src/app/api/audit/chat/route.ts`](../src/app/api/audit/chat/route.ts#L100-L133):** Performs no `supabase.auth.getUser()` check before streaming Gemini responses or accepting `audit_snapshot`.
   - **[`src/app/api/rates/discover/route.ts`](../src/app/api/rates/discover/route.ts#L11-L56):** Performs no `getUser()` check before calling `discoverPhilHealthPackageWithGemini`, and attempts `upsertCatalogPackages` (which fails RLS for non-admins and silently continues).
   - **Remediation:** Require `const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });` on `/api/audit/ocr`, `/api/audit/chat`, and `/api/rates/discover` (or enforce IP/session rate limiting if guest OCR/chat is intentionally supported).

2. **Swallowed DB Update Errors & Malformed JSON Handling — `Medium`**
   - **[`src/app/api/audit/ocr/route.ts`](../src/app/api/audit/ocr/route.ts#L254-L275):** If `audits` update fails (`updateErr`), the handler logs `console.warn` and still returns HTTP `200` (`{ success: true }`), leaving client state out of sync with Postgres.
   - **[`src/app/api/audit/ocr/route.ts`](../src/app/api/audit/ocr/route.ts#L43), [`chat/route.ts`](../src/app/api/audit/chat/route.ts#L113), [`discover/route.ts`](../src/app/api/rates/discover/route.ts#L13):** `await req.json()` is not isolated in its own `try/catch`, so malformed JSON returns `500` instead of `400`.
   - **Remediation:** Return `400` on JSON parse errors and `500` (or explicit warning flag) if `audits` persistence fails.

3. **Unvalidated `x-forwarded-host` & Orphan Profile Cleanup in OAuth Callback — `High`**
   - **[`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts#L34-L40):** Constructs `redirectBase` from `x-forwarded-host` without validating against an allowed host list (`NEXT_PUBLIC_SITE_URL` / `VERCEL_URL`).
   - **[`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts#L129-L133):** Attempts `supabase.from("profiles").delete().eq("id", user.id)` as a fallback when `SUPABASE_SERVICE_ROLE_KEY` is missing, but `001_initial_schema.sql` defines no `DELETE` RLS policy on `profiles`—so the delete is silently blocked.
   - **Remediation:** Validate `forwardedHost` against an explicit allowlist and ensure `SUPABASE_SERVICE_ROLE_KEY` is configured in production for rejected OAuth sign-ins.

4. **Missing Rate Limiting, Timeouts & Partial-Page OCR Resilience — `High`**
   - Neither `api/audit/ocr`, `api/audit/chat`, nor `api/rates/discover` enforces per-user/IP rate limits (`429`).
   - **[`src/lib/gemini.ts`](../src/lib/gemini.ts#L186-L243)** & **[`src/lib/caseRateDiscovery.ts`](../src/lib/caseRateDiscovery.ts#L116-L197):** `fetch` requests to Gemini lack `AbortController` timeouts and `429` Retry-After / exponential backoff. In `extractMultiPageBillWithGemini` ([`gemini.ts`](../src/lib/gemini.ts#L256-L268)), pages run sequentially and a failure on page N aborts all N pages.
   - **Remediation:** Add `AbortSignal.timeout(25000)` per model call, distinguish `429`/transient `5xx` from `400`/`404`, and enforce a max payload/page count cap on `/api/audit/ocr`.

---

## 2. Supabase Schema, Migrations & Row-Level Security (`001`–`007`)

### Findings

1. **Privilege Escalation via `profiles.role` Self-Update — `Critical`**
   - **[`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql#L27-L32):** `"Users can update their own profile"` allows `UPDATE` on all columns of `public.profiles` where `auth.uid() = id`.
   - **[`005_catalog_admin_rls.sql`](../supabase/migrations/005_catalog_admin_rls.sql#L14-L16)** & **[`006_catalog_admin_and_verification.sql`](../supabase/migrations/006_catalog_admin_and_verification.sql#L9-L11):** Added `role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'staff', 'admin'))` and restricted catalog writes (`philhealth_packages`, `package_item_aliases`, `statutory_rules`) to `profiles.role = 'admin'`, **without** preventing a user from updating their own `role` column to `'admin'`.
   - **Remediation:** Add a `BEFORE UPDATE` trigger on `public.profiles` rejecting `NEW.role IS DISTINCT FROM OLD.role` unless `current_setting('request.jwt.claim.role', true) = 'service_role'` (or revoke `UPDATE (role)` from `authenticated`).

2. **Schema Drift & Overlapping Migrations — `Medium`**
   - **[`src/lib/supabase/database.types.ts`](../src/lib/supabase/database.types.ts#L13-L128):** Marks `role`, `contributor_type`, `accommodation_type`, `has_mdr_or_pin`, `facility_level`, `statutory_discount_type`, `circular_id`, `effective_from`, and `is_verified` as optional (`?:`) even though migrations `004`–`007` define them `NOT NULL DEFAULT ...`.
   - **[`src/types/audit.ts`](../src/types/audit.ts#L32-L44):** `AuditDoc` omits `createdAt` and `flaggedAmount` used in `audits/(list)/page.tsx`.
   - `005` and `006` duplicate `role`, `is_verified`, and admin policies (safe via `IF NOT EXISTS`, but `DELETE` policies on catalog tables are omitted).
   - **Remediation:** Regenerate `database.types.ts` via `supabase gen types typescript` after locking migrations.

3. **Storage Lifecycle & Orphaned Files (`bill-uploads`) — `Medium`**
   - **[`supabase/migrations/002_storage_setup.sql`](../supabase/migrations/002_storage_setup.sql#L35-L76):** RLS on `storage.objects` is properly scoped to private bucket `bill-uploads` and `(storage.foldername(name))[1] = auth.uid()::text`, and served via short-lived signed URLs.
   - However, deleting an audit row in `public.audits` or re-analyzing with new files does **not** remove obsolete objects in `bill-uploads`.
   - **Remediation:** Add storage object deletion (`supabase.storage.from('bill-uploads').remove(paths)`) in audit delete/cleanup flows.

---

## 3. AI Vision OCR & Auto-Discovery Pipeline (`gemini.ts` & `caseRateDiscovery.ts`)

### Findings

1. **Cross-Page Line-Item Deduplication Gap — `Medium`**
   - **[`src/lib/gemini.ts`](../src/lib/gemini.ts#L277-L353):** `mergeExtractedBills` prefixes page 2+ IDs (`page2-item-1`, etc.) to prevent ID collisions, and uses `lastPageHasGrandTotal` (`lastPage.gross_total >= combinedItemsGross * 0.9`) to pick summary totals. However, it does not deduplicate overlapping line items if consecutive photos capture overlapping rows of the same ISA page.
2. **Negative Line-Item Amounts — `Low`**
   - **[`src/lib/gemini.ts`](../src/lib/gemini.ts#L449-L479):** Credit rows matched by `detectSoaCreditRow` are stripped and summed into `creditRowStatutoryTotal` / `creditRowPhilhealthTotal` / `creditRowPaymentTotal`, but `totalAmount = Number(item.total_amount) || 0` on remaining items does not clamp negative values if an unrecognized credit row slips past `detectSoaCreditRow`.
3. **Auto-Discovery Guardrails — `Low` (Well-Guarded)**
   - **[`src/lib/caseRateDiscovery.ts`](../src/lib/caseRateDiscovery.ts#L171-L188)** & **[L250–L254](../src/lib/caseRateDiscovery.ts#L250-L254):** Forces `is_verified: false` and `source_url: "ai_grounded:philhealth-acr"` on all AI-discovered rates and validates via `normalizeSeedPackage`. Note that `normalizeSeedPackage` ([`packageCatalog.ts`](../src/lib/packageCatalog.ts#L564-L568)) trusts `total_case_rate` if `> 0` without verifying `hci_fee + prof_fee === total_case_rate`.

---

## 4. Rule-Based Audit Engine & Statutory Math (`auditEngine.ts` & `itemMatcher.ts`)

### Findings

1. **Line-Level Sequence & VAT Math — `Strong` (with One Summary Fallback Caveat — `Medium`)**
   - **[`src/lib/auditEngine.ts`](../src/lib/auditEngine.ts#L407-L529)** & **[`billingClassification.ts`](../src/lib/billingClassification.ts#L32-L63):** Correctly implements two-tier RA 9994 / RA 10754 / NIRC Sec. 109(G) relief: `(Billed ÷ 1.12 × 0.80)` subtraction for VAT-inclusive goods (`Drugs/Medicines`, `Medical Supplies` unless `is_vat_exempt`) and straight `20%` for VAT-exempt hospital/diagnostic/PF services, and flags reversed "PhilHealth First" deduction sequences.
   - **Caveat (`auditEngine.ts:610-618`):** In the statement-summary fallback check (`2b`), `summaryVatExempt = extracted.gross_total / statutoryRule.vat_divisor` divides the **entire** `gross_total` by `1.12` even if part of `gross_total` consists of VAT-exempt hospital/PF services.
2. **HCI vs. PF Shortfall & Dual Case Rates — `Low`**
   - **[`src/lib/auditEngine.ts`](../src/lib/auditEngine.ts#L709-L773):** Separately checks `totalHciCap` and `totalPfCap` when line-level `philhealth_deducted` is present, and falls back to `totalPhilHealthRate` otherwise. For dual procedures (`matchedPackages.length > 1`), `totalPhilHealthRate` sums 100% of each package rather than applying PhilHealth's 2nd case rate rule (50% of the second package's case rate).
3. **NBB & Date-Versioned Catalog Lookup — `Strong`**
   - **[`src/lib/auditEngine.ts`](../src/lib/auditEngine.ts#L808-L865):** Accurately evaluates `indirect_nbb` / `lifetime` / Senior / PWD + `basic_ward` vs. `non_basic_private` (waiving NBB on private room upgrades) and triggers MDR/PIN reminders when `!has_mdr_or_pin`.
   - **[`src/lib/packageCatalog.ts`](../src/lib/packageCatalog.ts#L341-L436):** `selectStatutoryRuleForDate` and `selectActivePackagesForDate` cleanly pick date-windowed rows and fall back to the latest `effective_from` when `serviceDate` is missing.
4. **Emojis in Plain-Text Brief Summary — `Low`**
   - **[`src/lib/auditEngine.ts`](../src/lib/auditEngine.ts#L898-L928):** `negotiation_brief_summary` includes `⚠️` and `📋` characters in plain-text output.

---

## 5. AI Copilot Context & Prompt Grounding (`api/audit/chat/route.ts` & `chatbotPrompt.ts`)

### Findings

1. **Client-Supplied `audit_snapshot` Trust — `Medium`**
   - **[`src/app/api/audit/chat/route.ts`](../src/app/api/audit/chat/route.ts#L136-L157):** When `audit_id` is omitted (or when `row` is not found), `resolvedAudit` falls back to `clientSnapshot` (`body.audit_snapshot`) without verifying authentication. When `audit_id` *is* present, Supabase RLS enforces ownership on `audits` (`SELECT`), preventing cross-user leaks from the DB.
2. **Prompt Grounding — `Strong`**
   - **[`src/lib/chatbotPrompt.ts`](../src/lib/chatbotPrompt.ts#L30-L120):** Injects `hospital_name`, `statutory_discount_type`, `eligibility_snapshot` (`contributor_type`, `accommodation_type`, `has_mdr_or_pin`, `facility_level`), matched packages, flagged items, and financial totals, and enforces strict hospital/Philippine-billing domain boundaries and prompt-injection resistance.

---

## 6. Frontend-to-Backend Data Contracts & State Sync

- **Manual Overrides & Re-Analysis:** `audits/[id]/page.tsx` persists `raw_extracted_data.overrides` cleanly via `applyOverridesToBill` (`auditOverrides.ts`) and recalculates `runAuditEngine` identically on the client, `api/audit/chat`, and `audits/[id]/brief/page.tsx`.
- **Resilient Migration Fallbacks:** `audits/[id]/page.tsx`, `ScanBackgroundProvider.tsx`, and `api/audit/ocr/route.ts` strip `eligibility_snapshot` on `400`/column-missing errors so pre-`007` databases continue working seamlessly.

---

## 7. Security, Privacy (RA 10173) & Next.js 16 Compatibility

1. **API Key & Secret Handling — `Strong`**
   - `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are strictly server-only (`api/*`, `gemini.ts`, `caseRateDiscovery.ts`, `auth/callback/route.ts`). Keys are passed via `x-goog-api-key` headers rather than URL query parameters.
2. **Error Message Sanitization — `Medium`**
   - `api/audit/ocr/route.ts:288`, `api/audit/chat/route.ts:247`, `api/rates/route.ts:103`, and `api/rates/discover/route.ts:87` return raw `err.message` strings to clients, which can expose upstream Gemini error payloads or Postgres constraint messages.
3. **Middleware (`src/middleware.ts`) — `Low`**
   - [`src/middleware.ts`](../src/middleware.ts) delegates cleanly to `updateSession` ([`src/lib/supabase/middleware.ts`](../src/lib/supabase/middleware.ts)) and skips `/auth/callback` to protect PKCE `code_verifier` cookies. Note that Next.js 16 introduces the `proxy.ts` convention, though `middleware.ts` remains functional.

---

## 8. Test Coverage & Pre-Deployment Readiness

- **Current Tests (`20` passing):** `auditEngine.test.ts` (18 tests) and `chatbotGuardrails.test.ts` (2 tests) cover statutory VAT/discount math, NBB, CSV parsing, date-versioned rules, and Billy guardrails.
- **Untested Critical Paths:**
  - Zero integration tests for API route handlers (`/api/audit/ocr`, `/api/audit/chat`, `/api/rates`, `/api/rates/discover`, `/auth/callback`).
  - Zero automated RLS policy tests (especially `profiles.role` update protection and `bill-uploads` folder isolation).
  - Zero tests for `applyOverridesToBill` (`auditOverrides.ts`) or Gemini timeout/429 fallback behavior.

---

## Prioritized Fix & Hardening Checklist

### P0 — Must Fix Before Production
- [ ] **Block `profiles.role` self-escalation:** Add a `BEFORE UPDATE` trigger (or column-level `REVOKE UPDATE (role)`) on `public.profiles` so users cannot promote themselves to `'admin'`.
- [ ] **Enforce Auth (`401`) on AI API Routes:** Require `supabase.auth.getUser()` in `POST /api/audit/ocr`, `POST /api/audit/chat`, and `POST /api/rates/discover` (or add strict rate-limiting if guest access is intended).
- [ ] **Validate `x-forwarded-host` in `/auth/callback`:** Restrict `redirectBase` to an explicit host allowlist.

### P1 — High-Priority Hardening
- [ ] **Add Gemini `AbortController` timeouts & `429` backoff** in `gemini.ts` and `caseRateDiscovery.ts`, plus max page/size guards in `/api/audit/ocr`.
- [ ] **Fail loudly on `/api/audit/ocr` DB write errors** instead of returning `200`, and return `400` on malformed JSON across all POST routes.
- [ ] **Sanitize 500 error responses** so raw Gemini/Postgres error strings are logged server-side and replaced with safe messages client-side.
- [ ] **Delete orphaned `bill-uploads` storage objects** when audits are deleted or re-analyzed.

### P2 — Polish & Coverage
- [ ] **Enforce `hci_fee + prof_fee === total_case_rate`** sanity validation in `normalizeSeedPackage` and add cross-page duplicate-row checks in `mergeExtractedBills`.
- [ ] **Refine `2b` summary-level VAT check** to distinguish VAT-exempt hospital services vs. VAT-inclusive goods, and support 2nd case-rate (50%) calculation for dual procedures.
- [ ] **Add API route & override unit tests** (`auditOverrides.test.ts`, mocked route handler auth/validation tests) and regenerate `database.types.ts` to match `001`–`007`.
