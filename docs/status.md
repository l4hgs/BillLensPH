Ran project file structure scan
Ran read config and roadmap

# Project Analysis: BillLens PH

## Project Purpose

BillLens PH is a mobile-first web app for Filipino patients and their families. It reads hospital Itemized Statements of Account (ISAs) with AI OCR, audits them against PhilHealth case rates and Senior/PWD discount law, and produces a printable negotiation brief. It also has an AI chat assistant that helps with PhilHealth rules and Malasakit, DSWD and PCSO assistance.

## Tech Stack Summary

| Layer            | Technologies                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Languages        | TypeScript, SQL (PostgreSQL), plain JS (seed script)                                                       |
| Frontend         | Next.js 16.4.6 (App Router, Turbopack), React 19.3, Tailwind CSS v4, Shadcn-style primitives, Lucide React |
| Backend          | Next.js Route Handlers, Vercel AI SDK v7 (`ai`, `@ai-sdk/react`, `@ai-sdk/google`), Gemini REST API        |
| Database / infra | Supabase (Postgres, Auth, Storage, RLS) via `@supabase/ssr`; Vitest for tests; planned hosting on Vercel   |

## Frontend Status

- **Entry points**: [layout.tsx](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/app/layout.tsx), [page.tsx](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/app/page.tsx), and [middleware.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/middleware.ts), which refreshes the Supabase session.
- **UI / framework**: Custom `ui/` primitives (button, card, badge) and layout pieces (Header, BottomNav, MobileContainer). Styling is mobile-first with pill buttons and `#2563EB` accents.
- **State / routing**: Local React state per page, with Supabase reads from the browser client. Chat uses `useChat` with `DefaultChatTransport`. Audit Studio edits are stored inside `raw_extracted_data.overrides`. There is no global store.
- **Key features**:
  - `/scanner`: capture or upload, client-side compression, staging to Storage, AI OCR trigger, and a 3-way Regular / Senior / PWD selector.
  - `/audits` and `/audits/[id]`: archive and Audit Studio, with traffic-light tiers, an Override modal and the Copilot drawer.
  - `/audits/[id]/brief`: printable negotiation brief.
  - `/copilot`: standalone chat with an audit picker.
  - `/rates`: case-rate directory read from the database, a staff tool for adding or importing circulars, and AI auto-discovery.
  - `/auth`: email and Google OAuth.

## Backend Status

- **Entry points**: Route handlers under [src/app/api](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/app/api) plus the auth callback.
- **API / services**:
  - `POST /api/audit/ocr`: multi-page Gemini Vision OCR → AI discovery of missing case rates → `runAuditEngine` → saves to `audits`.
  - `POST /api/audit/chat`: streaming Gemini chat with the audit context added to the system prompt.
  - `GET/POST /api/rates`: reads the catalog and imports single, JSON or CSV packages (sign-in required).
  - `POST /api/rates/discover`: Gemini lookup of a case rate, saved to the database on a best-effort basis.
- **Data layer**:
  - Five migrations: initial schema, storage, item aliases, versioned packages with `statutory_rules`, and catalog admin RLS.
  - Seeds: SQL plus `philhealth_catalog.json` (18 packages, 185 aliases), loaded by `npm run seed:packages`.
- **Key modules**:
  - [auditEngine.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/lib/auditEngine.ts): the audit itself. Checks unbundled supplies, separate HCI and PF caps, the Senior/PWD discount order (VAT → 20% → PhilHealth), and flags `wrong_deduction_sequence`.
  - [packageCatalog.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/lib/packageCatalog.ts): loads the catalog, picks the rate valid on the bill's date, and handles CSV/JSON upserts.
  - [caseRateDiscovery.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/lib/caseRateDiscovery.ts): AI fallback for case rates not yet in the catalog.
  - Also: [itemMatcher.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/lib/itemMatcher.ts), [gemini.ts](file:///C:/Users/alodi/OneDrive/Desktop/BillLensPH/src/lib/gemini.ts) and `clockSkewFetch.ts`.

## Notable Observations

- **The Senior/PWD choice is only half connected.** The new selector in `StatementStagingCard` keeps Senior vs PWD in local state and sends only `isSeniorOrPwd` up. Neither the OCR route nor the Audit Studio passes `statutoryDiscountType`, so the engine treats every privileged patient as Senior. PWD citations (PDAO, RA 10754) never reach saved audits.
- **`is_vat_exempt` is never filled in.** The Gemini OCR prompt doesn't extract it, so the engine only notices VAT-exempt items when the description happens to say "VAT-exempt".
- **AI-generated rates go into the official catalog.** OCR auto-discovery and `/api/rates/discover` write Gemini output into `philhealth_packages`. These rows are marked only by `source_url = ai_grounded:*`. There is no review step, and `/rates` badges them, but the engine trusts them the same as official circulars.
- **Catalog write permissions are too broad.** Under `005_catalog_admin_rls.sql`, any signed-in user can change rates. Staff-only access (`profiles.role`) is still pending, per `backend_followup.md`.
- **Open follow-ups** from `backend_followup.md`:
  - Fair out-of-pocket doesn't yet subtract the HCI/PF shortfall.
  - `statutory_rules` isn't picked by date.
  - OCR doesn't run automatically after upload.
  - The member eligibility snapshot (migration 006) hasn't been built.
- **Tests are narrow.** There are 13 Vitest tests, all on the engine, matcher, catalog and discovery helpers. No API route, UI or end-to-end tests exist.
- **Repo state:** about 31 uncommitted changes on `master`, covering the backend fix, discovery, the audit-engine changes and the Next.js 16.4.6 upgrade. They should be committed on a feature branch.
- **Small debt:**
  - `DEFAULT_CODE_ALIASES` is still a production fallback in `packageCatalog.ts`.
  - The Gemini API key goes in the request URL query string; a header would be safer.
  - The model fallback lists are duplicated across `gemini.ts`, `caseRateDiscovery.ts` and the chat route.
  - Check whether `middleware.ts` is deprecated in this Next.js version (see `node_modules/next/dist/docs/`).
  - `docs/Implementation_Roadmap.md`'s schema section is out of date: it lacks the versioning columns, aliases and `statutory_rules`.
