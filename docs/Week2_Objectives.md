# BillLens PH — Week 2: Document Ingestion & Camera/Upload Flow

## 📋 Executive Summary & State of the Project
* **Current App Version:** Next.js `16.4.3` (Turbopack, TypeScript 5, Tailwind CSS v4)
* **Backend Status:** Live Supabase project connected with Google OAuth and Email/Password authentication verified and active.
* **Database Schema:** `profiles`, `audits`, and `philhealth_packages` tables and triggers are created.
* **API Keys:** Both Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and Google Gemini (`GEMINI_API_KEY`) are configured in `.env.local`.

---

## 🎯 Week 2 Objectives
The goal of Week 2 is to transform the static scanner viewfinder mockup into a production-ready **document ingestion pipeline** that accepts hospital bills (Itemized Statements of Account / ISAs), compresses them on the client side, and uploads them securely to Supabase Storage before passing them to the AI OCR engine in Week 3.

---

## 📝 Actionable To-Do List

### 1. Supabase Storage Infrastructure
- [x] Create a private Supabase Storage bucket named `bill-uploads` (`supabase/migrations/002_storage_setup.sql`).
- [x] Configure Row-Level Security (RLS) policies for storage:
  - Users can upload files to their own user-scoped directory (`bill-uploads/{user_id}/*`).
  - Users can view and download their own uploaded files.
  - Deny public anonymous access.

### 2. Client-Side Image Compression Engine
- [x] Create `src/lib/imageCompression.ts` utility:
  - Support mobile camera photo uploads (JPEG, PNG, HEIC/WebP).
  - Automatically downscale excessive smartphone resolutions (e.g., 4000x3000px → max 1600px width/height maintaining aspect ratio).
  - Compress output to WebP/JPEG targeting ~250KB - 500KB to reduce upload time and speed up Gemini Vision latency.
  - Return clean `File` or `Blob` with metadata (original size, compressed size, compression ratio).

### 3. Scanner & Dropzone UI Implementation
- [x] Refactor `src/app/scanner/page.tsx` and modular scanner components (`src/components/scanner/*`):
  - Implement drag-and-drop file upload zone.
  - Add native file picker button supporting both photo capture (`capture="environment"`) and PDF/image browsing.
  - Add real-time image preview state inside the viewfinder reticle brackets once a file is selected.
  - Add progress/loading states during compression and Supabase storage upload.
  - Allow multi-page statement uploads or re-capture/retake actions.

### 4. Database Staging
- [x] Wire up upload completion handler:
  - Create a new draft audit record in the `audits` table (`user_id`, `hospital_name`, `created_at`).
  - Store the storage path/file URL in the audit record for Week 3 OCR ingestion.

