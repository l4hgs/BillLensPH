# Project Analysis: BillLens PH

## Project Purpose

BillLens PH is a mobile-first healthcare advocacy app for Philippine patients and families. It turns hospital Itemized Statements of Account into structured audits, checks PhilHealth All-Case-Rates and Senior/PWD deductions, and is meant to produce negotiation briefs for billing disputes.

## Tech Stack Summary

| Layer            | Technologies                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Languages        | TypeScript 5, SQL                                                                            |
| Frontend         | Next.js 16.4.3 App Router, React 19, Tailwind CSS v4, custom Shadcn-style primitives, Lucide |
| Backend          | Next.js Route Handlers, Vercel AI SDK, Google Gemini Flash (vision + chat)                   |
| Database / infra | Supabase (PostgreSQL, Auth, Storage, RLS); planned host is Vercel                            |

## Frontend Status

- **Entry points**: `src/app/layout.tsx` (mobile shell: Header, `MobileContainer`, `BottomNav`); pages at `/`, `/auth`, `/scanner`, `/audits`, `/audits/[id]`, `/rates`, `/copilot`.
- **UI / framework**: Productive-minimalism layout (electric blue `#2563EB`, rounded cards). Primitives: Button, Card, Badge. Feature UI: scanner viewfinder/staging, Audit Studio (traffic-light tiers, line items, override modal, copilot drawer).
- **State / routing**: App Router; most feature pages are `"use client"`. Auth session is refreshed in `src/middleware.ts` via `@supabase/ssr`. Browser Supabase client plus a clock-skew cookie repair path.
- **Key features**:
  - Google OAuth + email auth (`/auth`, `/auth/callback`)
  - Camera/dropzone ingest with client-side WebP/JPEG compression
  - Live audit archive and per-audit studio with manual OCR/status overrides
  - PhilHealth ACR directory (`/rates`)
  - Copilot chat on `/copilot` and in Audit Studio

## Backend Status

- **Entry points**: `POST /api/audit/ocr`, `POST /api/audit/chat`, `GET /auth/callback`. Logic lives in `src/lib/` (`gemini.ts`, `auditEngine.ts`, `auditOverrides.ts`, `imageCompression.ts`).
- **API / services**: OCR downloads staged files from private `bill-uploads`, runs Gemini structured extraction, then `runAuditEngine` (PhilHealth matching, unbundling flags, Senior/PWD math, traffic-light tiers). Chat streams with Vercel AI SDK and injects the active audit as context.
- **Data layer**: Tables `profiles`, `audits`, `philhealth_packages` (`supabase/migrations/001_initial_schema.sql`); storage RLS (`002_storage_setup.sql`); ACR seed (`supabase/seeds/seed_philhealth_packages.sql`). Typed via `src/lib/supabase/database.types.ts`.
- **Key endpoints / modules**:
  - OCR: auth → storage download → Gemini → audit engine → write `raw_extracted_data` / `audit_results`
  - Chat: optional audit context + Malasakit / PhilHealth / RA 9994–10754 guidance
  - Engine fallback: builtin case-rate packages if DB lookup is empty

## Notable Observations

- **Sprint reality vs README**: Weeks 1–5 are implemented in code and checked off in `docs/Implementation_Roadmap.md`. `README.md` still lists Week 3 as “Next Up” — docs are stale.
- **Week 6 is the remaining product gap**: no `window.print()` negotiation-brief view, no Vercel deploy polish, no documented E2E sample-bill testing.
- **No automated tests**: no `*.test` / `*.spec` files; verification is manual (`npm run lint`, `npx tsc --noEmit`).
- **Shadcn surface is thin**: Button/Card/Badge only; drawer/modal are custom, not full Dialog/Sheet/Tabs as the roadmap listed.
- **OCR currently uses the first staged file**, not a full multi-page merge pipeline.
