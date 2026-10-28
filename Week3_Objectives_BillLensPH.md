# BillLens PH — Week 3: AI Vision OCR & Rule-Based Matching Engine

## 📋 Executive Summary & State of the Project
* **Current App Version:** Next.js `16.4.3` (Turbopack, TypeScript 5, Tailwind CSS v4)
* **Completed Sprints:**
  * **Week 1 (100% Complete):** Live Supabase Auth (Google OAuth & Email/Password with clock-skew tolerant session persistence), database schema (`profiles`, `audits`, `philhealth_packages`), and mobile-first UI shell.
  * **Week 2 (100% Complete):** Private `bill-uploads` Supabase Storage bucket with 4 RLS policies, client-side WebP/JPEG image compression engine (`src/lib/imageCompression.ts`), interactive viewfinder dropzone (`src/app/scanner/page.tsx`), and live database staging in `public.audits`.
* **API Keys:** Both Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and Google Gemini (`GEMINI_API_KEY`) are configured in `.env.local`.

---

## 🎯 Week 3 Objectives
The goal of Week 3 is to build the **AI Vision OCR & Rule-Based Matching Engine** that reads staged hospital bills (Itemized Statements of Account / ISAs and SOA forms) from `bill-uploads`, extracts messy tabular charges into structured JSON using **Google Gemini Flash Multimodal Vision**, and cross-references every charge against **PhilHealth All-Case-Rates (ACR) / Z-Benefit packages** and statutory **Senior Citizen / PWD (RA 9994 / RA 10754)** discount rules.

---

## 📝 Actionable To-Do List

### 1. Seed PhilHealth Case Rates & Z-Benefit Database
- [ ] Create `supabase/seed_philhealth_packages.sql` to populate `public.philhealth_packages` (and configure public read RLS policy):
  - Core surgical & medical procedures (e.g., Laparoscopic Cholecystectomy `47562`, Appendectomy `44970`, Coronary Angiography `93458`, Normal Spontaneous Delivery `59400`, Cesarean Section `59510`, Hemodialysis `90935`, Community-Acquired Pneumonia `J18.9`, Dengue Fever `A97.1`).
  - Populate `hci_fee`, `prof_fee`, `total_case_rate`, and `inclusive_items` (standard OR supplies, routine medications, contrast media, room & board inclusions) to detect unbundled overcharges.
- [ ] Connect `src/app/rates/page.tsx` to query live `philhealth_packages` rows from Supabase with fallback to local defaults.

### 2. AI Vision OCR Backend Route (Gemini Flash)
- [ ] Install required AI / Gemini SDK dependencies (`@google/generative-ai` or Vercel AI SDK `@ai-sdk/google` + `ai` + `zod`).
- [ ] Create `src/app/api/audit/ocr/route.ts` (POST handler):
  - Authenticate the requesting user and fetch the staged `audits` record and signed storage URLs from `bill-uploads`.
  - Pass the compressed bill image(s) / PDF to **Gemini Flash** with a strict structured-output schema.
  - Extract:
    - `hospital_name`, `patient_name`, `admission_date`, `discharge_date`, `account_number`
    - `detected_procedures` / ICD-10 or RVS codes
    - `line_items`: `{ description, category, quantity, unit_price, total_amount, philhealth_deducted, discount_applied, balance }`
    - `summary`: `{ gross_total, philhealth_total, discount_total, net_balance }`

### 3. Automated PhilHealth & Statutory Matching Engine
- [ ] Create `src/lib/auditEngine.ts`:
  - Cross-reference extracted procedures and line items against `philhealth_packages` (`procedure_keyword`, `case_code`, and `inclusive_items`).
  - Flag **duplicate or unbundled charges** (items billed separately as out-of-pocket that should be covered inside the PhilHealth HCI/case rate bundle).
  - Verify statutory **Senior Citizen / PWD (20% discount + 12% VAT exemption)** calculations when applicable.
  - Categorize each line item into the **Three-Tier Traffic-Light System** for Week 4:
    - 🟢 `covered` (Fully Covered / Mandatory Case Rate Inclusion)
    - 🟡 `review_worthy` (Potential Overcharge, Unbundled Supply, or Unapplied PhilHealth/Statutory Deduction)
    - 🔴 `out_of_pocket` (Valid Non-Covered / Upgrade / Personal Expense)

### 4. End-to-End Pipeline Wiring & Database Update
- [ ] Trigger `/api/audit/ocr` automatically after upload in `src/app/scanner/page.tsx` (or via an **"Analyze with AI OCR"** action in `/scanner` and `/audits`).
- [ ] Update the `public.audits` record with the real `hospital_name`, `total_billed`, `estimated_out_of_pocket`, `raw_extracted_data`, and structured `audit_results`.

---

## 🚀 Quick-Start Prompt for New Chat Session
When you start the next chat session for Week 3, you can paste the prompt below:

```markdown
I am continuing the BillLens PH project.
Weeks 1 and 2 are 100% complete (Supabase Auth, `bill-uploads` Storage bucket with RLS, client-side WebP image compression, and `audits` table staging are all live and tested).
Please read "Week3_Objectives_BillLensPH.md" and let's begin Step 1 (creating `supabase/seed_philhealth_packages.sql` and connecting `/rates`) and Step 2 (setting up the Gemini Vision OCR route in `src/app/api/audit/ocr/route.ts`).
```
