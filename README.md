# BillLens PH 🇵🇭

**BillLens PH** is a mobile-first healthcare advocacy web application that translates opaque Philippine hospital Itemized Statements of Account (ISAs) and Statements of Account (SOAs) into transparent financial audits, cross-references mandatory **PhilHealth All-Case-Rates (ACR)** & **Senior/PWD (RA 9994 / RA 10754)** deductions, and generates formal hospital billing negotiation briefs.

---

## ✨ Key Features & Sprint Status

| Sprint | Milestone | Status |
| :--- | :--- | :--- |
| **Week 1** | Foundation, Supabase Auth (Google OAuth + Email) & Mobile UI Shell | ✅ **100% Complete** |
| **Week 2** | Document Ingestion, Client-Side WebP Compression & `bill-uploads` Storage RLS | ✅ **100% Complete** |
| **Week 3** | Gemini Flash Multimodal Vision OCR & Rule-Based PhilHealth Matching Engine | 🚧 **Next Up** |
| **Week 4** | Interactive Audit Studio & Three-Tier Traffic-Light Categorization UI | ⏳ Planned |
| **Week 5** | AI Health & Malasakit Subsidy Copilot Chatbot | ⏳ Planned |
| **Week 6** | Printable Negotiation Brief Export (`window.print()`) & Vercel Deployment | ⏳ Planned |

---

## 🛠️ Tech Stack

* **Framework:** [Next.js 16.4.3](https://nextjs.org/) (App Router, Turbopack, TypeScript 5)
* **Styling & UI:** Tailwind CSS v4, Shadcn UI Primitives, Lucide React (`Productive Minimalism` design system)
* **Backend & Storage:** [Supabase](https://supabase.com/) (PostgreSQL, SSR Cookie Auth, Row-Level Security, Encrypted Storage)
* **AI & Multimodal OCR:** Google Gemini Flash Vision & Chat API

---

## 📂 Project Structure

```text
BillLensPH/
├── docs/                                   # 📚 Sprint roadmaps, objectives & collaborator guides
│   ├── SETUP.md                            # Step-by-step developer onboarding & environment setup
│   ├── Implementation_Roadmap.md           # 6-week architecture & database specification
│   ├── Week2_Objectives.md                 # Completed Week 2 checklist
│   └── Week3_Objectives.md                 # Upcoming Week 3 AI OCR & Matching Engine plan
│
├── supabase/                               # 🗄️ Reproducible SQL migrations & seed data
│   ├── migrations/
│   │   ├── 001_initial_schema.sql          # Core tables (`profiles`, `audits`, `philhealth_packages`) & RLS
│   │   └── 002_storage_setup.sql           # Private `bill-uploads` bucket & user-scoped RLS policies
│   └── seeds/                              # PhilHealth ACR case rate seed scripts (Week 3)
│
├── src/
│   ├── app/                                # ⚡ Next.js App Router pages & route handlers
│   │   ├── (auth)/auth/page.tsx            # Sign In, Create Account & Verified Profile view
│   │   ├── auth/callback/route.ts          # OAuth PKCE code exchange endpoint
│   │   ├── scanner/page.tsx                # Scan Hub controller (Camera capture, dropzone & staging)
│   │   ├── audits/page.tsx                 # Document Archive (live Supabase audits + sample records)
│   │   ├── rates/page.tsx                  # PhilHealth All-Case-Rates (ACR v3) directory
│   │   ├── copilot/page.tsx                # AI Health & Subsidy Copilot interface
│   │   ├── layout.tsx                      # Root responsive shell (Header + MobileContainer + BottomNav)
│   │   └── page.tsx                        # Landing & advocacy onboarding view
│   │
│   ├── components/                         # 🧩 Modular UI & Feature Components
│   │   ├── ui/                             # Reusable primitives (`button.tsx`, `card.tsx`, `badge.tsx`)
│   │   ├── layout/                         # Navigation & shell (`Header.tsx`, `BottomNav.tsx`, `ModeSelector.tsx`)
│   │   └── scanner/                        # Scanner feature views (`ScannerViewfinder.tsx`, `StatementStagingCard.tsx`)
│   │
│   ├── lib/                                # 🛠️ Core Engines & Supabase Clients
│   │   ├── supabase/                       # Browser, Server, Middleware clients & clock-skew normalizer
│   │   ├── imageCompression.ts             # Client-side canvas downscaler (max 1600px, WebP/JPEG ~300KB)
│   │   └── utils.ts                        # PHP currency formatter (`formatPHP`) & class utilities
│   │
│   ├── types/                              # 📐 Shared TypeScript Interfaces
│   │   └── audit.ts                        # `ScannedPage`, `PipelineStage`, `StagedFileMeta`, `AuditDoc`
│   │
│   └── middleware.ts                       # Next.js SSR auth session updater
│
├── .env.local.example                      # 📋 Template for required environment variables
└── package.json
```

---

## 🚀 Quick Start

New collaborators can get up and running in under 5 minutes. For full instructions (including Supabase SQL setup and OAuth configuration), read **[docs/SETUP.md](./docs/SETUP.md)**.

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in your Supabase & Gemini keys
cp .env.local.example .env.local

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 Documentation Links

* **[Collaborator Setup Guide (`docs/SETUP.md`)](./docs/SETUP.md)** — Environment variables, Supabase SQL migrations, and troubleshooting.
* **[Implementation Roadmap (`docs/Implementation_Roadmap.md`)](./docs/Implementation_Roadmap.md)** — Full 6-week sprint architecture and schema design.
* **[Week 2 Objectives (`docs/Week2_Objectives.md`)](./docs/Week2_Objectives.md)** — Document ingestion, client-side compression, and storage RLS.
* **[Week 3 Objectives (`docs/Week3_Objectives.md`)](./docs/Week3_Objectives.md)** — Upcoming Gemini Vision OCR & PhilHealth matching engine tasks.

---

## 🔒 Data Privacy & Compliance

Designed in alignment with the **Philippine Data Privacy Act of 2012 (RA 10173)**. Uploaded statements of account are compressed locally in the browser and stored in a private, non-public Supabase bucket (`bill-uploads`) protected by strict user-isolated Row-Level Security (`auth.uid()`).
