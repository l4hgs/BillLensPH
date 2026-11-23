# BillLens PH — Circular-Aware Policy & Legal Accuracy Upgrade Specification

## 1. Executive Summary & Objective

This specification defines the complete engineering deliverables, domain requirements, acceptance criteria, and automated test suite required to upgrade **BillLens PH** (`[https://billlens-ph-rccocantos.vercel.app](https://billlens-ph-rccocantos.vercel.app)`) into a **circular-aware, facility-sensitive Philippine healthcare billing audit system**.

Specifically, this upgrade resolves four high-impact statutory and policy gaps so that every generated **Negotiation & Advocacy Brief** is legally defensible at both public and private Philippine hospital billing desks:

1. **PhilHealth Circular No. 2024-0037 (50% ACR Increase & Official Splits):** Aligns verified All Case Rates (ACR) to the January 1, 2025 50% adjustment, preserves historical pre-2025 rates via admission-date time travel, and separates surgical RVS (`60/40`) from medical ICD-10 (`70/30`) splits.
2. **Facility- & Room-Aware Anti-Unbundling (PhilHealth Circular No. 2017-0017 / NBB):** Separates full `₱0.00` co-pay NBB write-offs (government basic/ward & qualified private-room no-ward-bed exceptions) from non-NBB/private hospital bills (where lump-sum supply/lab/pharmacy charges are flagged for itemized charge-slip verification with `₱0.00` automatic write-off).
3. **Facility-Aware Financial Assistance Routing (RA 11463) & Dynamic Summary Labels:** Routes government hospital patients to **Malasakit Centers** while routing private hospital patients to **DSWD AICS, PCSO MAP, and DOH MAIP**, and dynamically labels reconciled balances based on whether PhilHealth was already deducted.
4. **Admin Circular Policy Compiler (Human-in-the-Loop Ingestion):** Enables administrators to upload or paste new PhilHealth circulars in `/rates`, review a side-by-side rate diff, and publish versioned circular updates (`effective_from`, `effective_to`, `superseded_by`) without code changes or model retraining.

---

## 2. Deliverables Overview

| Deliverable ID | Artifact / File Path                                                                 | Type                   | Description                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **D1**         | `supabase/migrations/009_circular_versioning_and_facility_ownership.sql`             | Database Migration     | Adds `circular_number` & `superseded_by` to `philhealth_packages` and `statutory_rules`; adds `facility_ownership` & `no_ward_bed_available` support to profiles/snapshots.     |
| **D2**         | `supabase/seed_circular_2024_0037.sql` & `src/data/philhealth_catalog.json`          | Policy Dataset         | Versions pre-2025 rates (`effective_to: 2024-12-31`) and seeds verified Circular No. 2024-0037 (+50% ACR) rates (`effective_from: 2025-01-01`).                                 |
| **D3**         | `src/lib/packageCatalog.ts`                                                          | Core Engine Module     | Updates `reconcilePackageSplit()` (`60/40` RVS vs. `70/30` ICD-10), `is_estimated_split` gating, and circular metadata mapping.                                                 |
| **D4**         | `src/lib/auditEngine.ts`                                                             | Core Engine Module     | Enforces `admission_date`-first circular resolution, strict `is_nbb_eligible` branching, private-hospital `"Itemized Verification Requested"` tier, and dynamic balance labels. |
| **D5**         | `src/lib/gemini.ts`                                                                  | OCR / AI Extraction    | Extracts/infers `facility_ownership` (`"government"`                                                                                                                            | `"private"`) from hospital headers and prioritizes `admission_date` extraction. |
| **D6**         | `src/components/NegotiationBriefDocument.tsx` & Audit Studio / Scan Hub UI           | Frontend & Print Brief | Renders conditional Malasakit Center vs. DSWD/PCSO/MAIP routing, dynamic balance headers, and `Facility Type` / `No Ward Bed Available` user toggles.                           |
| **D7**         | `src/app/api/rates/compile/route.ts` & `/rates` Admin Compiler Modal                 | Admin Feature (HITL)   | Parses uploaded circular PDFs/text via Gemini Flash into a side-by-side diff preview; publishes approved rules atomically with `superseded_by` chaining.                        |
| **D8**         | `src/lib/__tests__/auditEngine.test.ts` & `src/lib/__tests__/packageCatalog.test.ts` | Automated Test Suite   | Comprehensive Vitest unit and integration tests covering all statutory rules, dates, facility branches, and compiler diffs.                                                     |

---

## 3. Functional & Domain Requirements

### 3.1 PhilHealth Circular No. 2024-0037 & Split Ratio Rules (`D1`, `D2`, `D3`)

- **R1.1 — 50% ACR Rate Alignment:** All verified ACR entries effective on or after `2025-01-01` must reflect the 50% adjustment under **PhilHealth Circular No. 2024-0037** (e.g., RVS `44950` Appendectomy = `₱46,800.00` total; `₱28,080.00` HCI + `₱18,720.00` PF).
- **R1.2 — Historical Version Preservation:** Existing 2013–2024 entries must remain in `philhealth_packages` with `effective_to = '2024-12-31'` and `superseded_by = 'PC-2024-0037'` so bills with `admission_date < 2025-01-01` audit against the historical circular.
- **R1.3 — Explicit vs. Derived HCI/PF Splits:**

1. If explicit `hci_fee` and `prof_fee` exist in the database (`hci_fee + prof_fee > 0`), use those exact values (`is_estimated_split = false`).
2. If a **verified** package (`is_verified === true`) omits the split (`hci_fee === 0 && prof_fee === 0 && total_case_rate > 0`):

- **Surgical Procedures (RVS numeric codes):** Apply **60% HCI / 40% PF** (`is_estimated_split = false`).
- **Medical Cases (ICD-10 alphanumeric codes):** Apply **70% HCI / 30% PF** (`is_estimated_split = false`).

3. If an **unverified / AI-discovered** package (`is_verified === false`) omits the split, apply **70% HCI / 30% PF** and flag `is_estimated_split = true`.

### 3.2 Admission-Date Time Travel (`D4`, `D5`)

- **R2.1 — Date Resolution Priority:** `selectActivePackagesForDate()` and `selectStatutoryRuleForDate()` must resolve `serviceDate` in strict order:

$$\text{serviceDate} = \text{admission\_date} \;\Vert{}\; \text{discharge\_date} \;\Vert{}\; \text{statement\_date} \;\Vert{}\; \text{today}$$

- **R2.2 — Circular Provenance:** Every matched package in `AuditEngineResult` must expose `circular_number` (e.g., `"PhilHealth Circular No. 2024-0037"`) so the UI and Negotiation Brief cite the exact legal authority active on admission.

### 3.3 Facility- & Room-Aware Anti-Unbundling (`D4`, `D5`, `D6`)

- **R3.1 — Facility Ownership Detection & Override:**
- Gemini OCR infers `facility_ownership: "government" | "private"` from hospital header keywords (e.g., _"Medical Center"_, _"Provincial/District Hospital"_, _"DOH"_, _"City/Municipal Hospital"_ → `"government"`; _"Inc."_, _"Corporation"_, _"Doctors Hospital"_, _"Medical City"_ → `"private"`), defaulting safely to `"private"` when ambiguous.
- Users can explicitly toggle **Government Hospital** vs. **Private Hospital** (and **No Ward Bed Available at Admission** when applicable) in Scan Hub and Audit Studio.

- **R3.2 — Strict `is_nbb_eligible` Boolean Formula:**
- `true` **ONLY IF**:

1. `facility_ownership === "government"` **AND** `accommodation_type === "basic_ward"` **AND** member is NBB-qualified (`contributor_type` in `["indirect_nbb", "lifetime"]` **OR** `isSeniorOrPwd === true`), **OR**
2. `facility_ownership === "government"` **AND** `accommodation_type === "non_basic_private"` **AND** (`contributor_type === "lifetime"` **OR** `is_senior === true`) **AND** `no_ward_bed_available === true`.

- `false` in **all** private hospitals, paying direct contributors, or voluntary private-room admissions.

- **R3.3 — Two-Path Line-Item Audit Branching:**
- **Path A (`is_nbb_eligible === true` — Public NBB):**
- Covered package items (routine drugs, labs, supplies) receive full NBB anti-unbundling write-offs (`requested_adjustment = -billed_amount`), and any remaining patient balance after ACR + Senior/PWD discounts is waived (`nbbSavings = balanceBeforeNbb`, `fairOutOfPocket = ₱0.00`).

- **Path B (`is_nbb_eligible === false` — Private Hospital / Non-NBB):**
- Do **NOT** apply automatic `100%` write-offs (`requested_adjustment = ₱0.00`) to lump-sum Central Supply, Laboratory, or Pharmacy items.
- Classify them under a dedicated status tier (`"itemized_verification"`) with label **`"Itemized Verification Requested"`**, instructing the billing desk to provide itemized charge slips to audit for duplicate or unadministered items without inflating `total_potential_savings`.

### 3.4 Brief Template & Financial Assistance Routing (`D6`)

- **R4.1 — Dynamic Balance Summary Label:**
- When `philhealth_total > 0`: Render **`"Reconciled Balance Due (After PhilHealth Case Rate)"`**.
- When `philhealth_total === 0`: Render **`"Reconciled Balance Due (Before PhilHealth Case Rate)"`**.

- **R4.2 — Conditional Assistance Routing:**
- **`facility_ownership === "government"`:**
- Header: Include `Copy Furnished: Medical Social Service / Malasakit Center Desk`.
- Assistance Section: Cite **RA 11463 (Malasakit Centers Act)** for unified DOH, DSWD, PCSO, and PhilHealth zero-balance / medical assistance processing.

- **`facility_ownership === "private"`:**
- Header: Omit `Malasakit Center Desk` (as Malasakit Centers operate exclusively inside DOH/LGU public hospitals).
- Assistance Section: Route remaining out-of-pocket balance to **DSWD Assistance to Individuals in Crisis Situation (AICS)**, **PCSO Medical Access Program (MAP)**, and **DOH Medical Assistance to Indigent and Financially Incapacitated Patients (MAIP)** _(noting MAIP applies to DOH-accredited private hospitals)_.

### 3.5 Admin Circular Policy Compiler — HITL (`D7`)

- **R5.1 — Admin-Only Access:** `POST /api/rates/compile` and `POST /api/rates/publish` must verify `profiles.role === "admin"` (`403 Forbidden` for regular users).
- **R5.2 — Structured Extraction & Diff Generation:**
- Accepts circular PDF upload or raw circular/annex text.
- Uses Gemini Flash structured JSON output to extract `circular_number`, `effective_from`, `supersedes_circular`, and candidate package rows (`case_code`, `procedure_keyword`, `hci_fee`, `prof_fee`, `total_case_rate`, `inclusive_items`, `aliases`).
- Computes a deterministic diff against active DB records (`NEW`, `RATE_UPDATED` with old vs. new peso deltas, `UNCHANGED`).

- **R5.3 — Atomic Publish:** Approving the diff updates existing active rows (`effective_to = new.effective_from - 1 day`, `superseded_by = new.circular_number`) and inserts new rows with `is_verified = true`.

---

## 4. Technical Expectations & Non-Functional Standards

- **No Regression on Existing Math:** Mandatory statutory deduction sequence (`12% VAT Exemption` → `20% Senior/PWD Discount` → `PhilHealth Case Rate Deduction` → `Payments/HMO`) and Two-Tier VAT rules (`NIRC Sec. 109(G)`) must remain intact.
- **UI / HCI Restraint:** New controls (`Private Hospital` / `Government Hospital` segmented selector, `No Ward Bed Available` checkbox, and `"Itemized Verification Requested"` badges) must follow the calm, full-width Editorial UI system (44px touch targets, tabular numbers, no backdrop blur on modals, auto-dismissing minimal toasts).
- **Type & Lint Hygiene:** Zero TypeScript errors (`npx tsc --noEmit`), zero ESLint errors (`npm run lint`), and 100% passing Vitest suite (`npm test`).

---

## 5. Verification & Testing Matrix

### 5.1 Automated Unit & Integration Tests (`D8`)

| Test ID | Scenario                                       | Input Conditions                                                                                                                     | Expected Assertion                                                                                                                                                                       |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1**  | **PC 2024-0037 Rate & RVS 60/40 Split**        | RVS `44950` (Appendectomy), `admission_date: "2025-03-15"`, `is_verified: true`, no explicit split                                   | `total_case_rate === 46800`, `hci_fee === 28080`, `prof_fee === 18720`, `is_estimated_split === false`, `circular_number === "PC-2024-0037"`                                             |
| **T2**  | **ICD-10 70/30 Split vs. AI Unverified Split** | (a) Verified `J18.9` (`₱22,500`) without split; (b) Unverified AI code (`₱20,000`) without split                                     | (a) `15750 / 6750`, `is_estimated_split === false`; (b) `14000 / 6000`, `is_estimated_split === true`                                                                                    |
| **T3**  | **Admission-Date Time Travel**                 | RVS `44950` bill with `admission_date: "2024-11-10"` vs. `"2025-01-02"`                                                              | `2024-11-10` resolves to `₱31,200`; `2025-01-02` resolves to `₱46,800`                                                                                                                   |
| **T4**  | **Public Ward NBB Anti-Unbundling**            | `facility_ownership: "government"`, `accommodation_type: "basic_ward"`, `contributor_type: "indirect_nbb"`, Central Supply `₱11,280` | `is_nbb_eligible === true`, Central Supply `requested_adjustment === -11280`, `fairOutOfPocket === 0`                                                                                    |
| **T5**  | **Public Private-Room Senior Exception**       | `facility_ownership: "government"`, `accommodation_type: "non_basic_private"`, `is_senior: true`, `no_ward_bed_available: true`      | `is_nbb_eligible === true`, `fairOutOfPocket === 0` (whereas `no_ward_bed_available: false` yields `is_nbb_eligible === false`)                                                          |
| **T6**  | **Private Hospital Lump-Sum Audit**            | `facility_ownership: "private"`, `accommodation_type: "basic_ward"`, `is_senior: true`, Central Supply `₱11,280`, Lab `₱4,850`       | `is_nbb_eligible === false`; items flagged as `"itemized_verification"` with `requested_adjustment === 0`; `total_potential_savings` excludes `₱16,130`                                  |
| **T7**  | **Brief Routing & Dynamic Label**              | Render `NegotiationBriefDocument` for `government` vs. `private`, and `philhealth_total > 0` vs. `0`                                 | `government` includes `"Malasakit Center"` & `"RA 11463"`; `private` omits Malasakit and renders `"DSWD AICS"`, `"PCSO MAP"`, `"DOH MAIP"`; label toggles `(After PhilHealth Case Rate)` |
| **T8**  | **Circular Compiler Diff & Auth Guard**        | Non-admin calls `POST /api/rates/compile`; Admin compiles PC `2024-0037` over `2013` seed                                            | Non-admin returns `403`; Admin diff shows `RATE_UPDATED` (`₱31,200` → `₱46,800`, `+₱15,600`) and chains `effective_to` / `superseded_by` on publish                                      |

### 5.2 Live Production Smoke Test Checklist (Vercel)

1. **Database Migration:** Apply `009_circular_versioning_and_facility_ownership.sql` and `seed_circular_2024_0037.sql` in Supabase SQL Editor; verify existing `audits` and `philhealth_packages` rows remain intact.
2. **Private Hospital SOA Scan:** Upload a private hospital SOA (e.g., _Ormoc Doctors Hospital, Inc._), confirm `Facility Type` auto-detects as **Private Hospital**, verify lump-sum supplies show **"Itemized Verification Requested"** (`₱0.00` write-off), and export the PDF brief to verify **DSWD AICS / PCSO MAP / DOH MAIP** replaces Malasakit Center.
3. **Government Hospital NBB Simulation:** Toggle **Government Hospital** + **Basic / Ward** + **Senior Citizen / Indigent**, confirm `₱0.00` NBB co-pay calculation and **Malasakit Center (RA 11463)** routing in the PDF brief.
4. **Admin Circular Compiler:** Open `/rates` as admin, test compiling a sample circular snippet, verify the diff preview, and confirm non-admin accounts cannot access the compiler controls.
