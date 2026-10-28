# BillLens PH - Implementation Roadmap & Architecture

## 1. Project Overview & Objective
BillLens PH is a mobile-first web application that translates opaque Philippine hospital itemized statements of account (ISAs) into structured financial audits, checks PhilHealth case rates, and generates formal negotiation briefs.

---

## 2. Tech Stack & Tools
* **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Shadcn UI, Lucide React
* **Backend / Database:** Supabase (PostgreSQL, Auth, RLS)
* **AI & OCR Engine:** Vercel AI SDK, Google Gemini Flash (Multimodal Vision & Chat)
* **Styling Aesthetic:** Productive Minimalism (pill buttons, rounded cards, soft drop shadows, electric blue `#2563EB` accents)
* **Hosting:** Vercel

---

## 3. Sprint Breakdown (6-Week Timeline)

### Week 1: Foundation, Auth & Mobile UI Shell
* [x] Initialize Next.js repository with TypeScript and Tailwind CSS.
* [x] Install and configure Shadcn UI primitives (Card, Button, Dialog, Sheet, Tabs).
* [x] Set up Supabase project and connect environment variables.
* [x] Implement Supabase Auth (Email/Password & Google OAuth).
* [x] Build mobile layout shell (Bottom navigation bar, responsive header, mobile container frames matching scanner UI).

### Week 2: Document Ingestion & Camera/Upload Flow
* [x] Build the Upload / Camera Capture screen (featuring quick mode selectors and dropzone upload card).
* [x] Implement client-side image compression (resizing mobile photos to reduce payload size and speed up OCR).
* [x] Create Supabase storage bucket for temporary bill uploads with strict Row-Level Security (RLS).

### Week 3: AI Vision OCR & Rule-Based Matching Engine
* [ ] Seed Supabase database with core PhilHealth case rates and Z-benefit rules (e.g., Angioplasty, Appendectomy, Maternity).
* [ ] Set up Vercel AI SDK backend route using Gemini Flash to parse messy hospital tables into structured JSON.
* [ ] Build the automated matching script to cross-reference extracted items against PhilHealth case rate limits.

### Week 4: Audit Dashboard & Traffic-Light UI
* [ ] Build the interactive Audit Studio interface.
* [ ] Implement the **three-tier traffic-light categorization component** (🟢 Fully Covered, 🟡 Review-Worthy, 🔴 Out-of-Pocket).
* [ ] Add the Manual Override modal for editing OCR misreads or adjusting line-item values.

### Week 5: AI Health & Subsidy Copilot Chatbot
* [ ] Create the floating chat drawer component in the Audit Studio.
* [ ] Configure context injection so the AI chatbot understands the active bill metadata and PhilHealth rules.
* [ ] Test conversational prompts regarding Malasakit desk requirements and case rate eligibility.

### Week 6: Negotiation Brief Export, Testing & Polish
* [ ] Build the formal letter export view optimized for browser printing (`window.print()`).
* [ ] Conduct end-to-end testing with sample Philippine hospital bills (such as cardiac catheterization statements).
* [ ] Polish micro-interactions, responsive padding, and accessibility.
* [ ] Prepare deployment on Vercel and final presentation assets.

---

## 4. Supabase Database Schema (Core Tables)

### `profiles` Table
* `id` (uuid, primary key, references auth.users)
* `full_name` (text)
* `created_at` (timestamptz)

### `audits` Table
* `id` (uuid, primary key, default gen_random_uuid())
* `user_id` (uuid, references profiles.id)
* `hospital_name` (text)
* `total_billed` (numeric)
* `estimated_out_of_pocket` (numeric)
* `raw_extracted_data` (jsonb)
* `audit_results` (jsonb)
* `created_at` (timestamptz)

### `philhealth_packages` Table
* `id` (uuid, primary key, default gen_random_uuid())
* `procedure_keyword` (text)
* `case_code` (text)
* `hci_fee` (numeric)
* `prof_fee` (numeric)
* `total_case_rate` (numeric)
* `inclusive_items` (text[])

