# BillLens PH — Collaborator Environment & Setup Guide

Welcome to **BillLens PH**! This guide walks you through setting up your local development environment, connecting Supabase (Database, Auth, and Storage), and running the application from scratch.

---

## 1. Prerequisites

Ensure the following tools are installed on your machine:
* **Node.js**: `v20.x` or later (`node -v`)
* **npm**: `v10.x` or later (`npm -v`)
* **Git**: `v2.x` or later (`git --version`)
* **Supabase Account**: Access to the shared team Supabase project (or your own free-tier project at [supabase.com](https://supabase.com))
* **Google AI Studio Account**: A Gemini API key from [aistudio.google.com](https://aistudio.google.com)

---

## 2. Clone & Install Dependencies

```bash
# 1. Clone the repository
git clone https://github.com/l4hgs/BillLensPH.git
cd BillLensPH

# 2. Install Node packages
npm install
```

---

## 3. Configure Environment Variables (`.env.local`)

Copy the example environment file to create your local `.env.local`:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the three required variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-jwt-key>

# Google Gemini API Key (For Week 3 AI Vision OCR & Copilot)
GEMINI_API_KEY=<your-gemini-api-key>
```

### Where to Find Your Supabase Keys
1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the **BillLens PH** project.
2. In the left sidebar, click **Project Settings (Gear Icon) → API** (or **API Keys**).
3. Copy your **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
4. Under **Legacy anon, service_role API keys**, click **Copy** on the **`anon` `public`** row and paste it into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

> **Important:** Never commit `.env.local` to Git. It is already listed in `.gitignore`.

---

## 4. Database & Storage Setup (For Fresh Supabase Projects)

If you are connecting to the shared team Supabase project, the database tables and storage bucket are already live.

If you are setting up a **brand-new Supabase instance**, open **Supabase Dashboard → SQL Editor** and run the SQL scripts inside `supabase/migrations/` in order:

1. **`supabase/migrations/001_initial_schema.sql`**
   * Creates the `profiles`, `audits`, and `philhealth_packages` tables.
   * Enables Row-Level Security (RLS) and sets up the `on_auth_user_created` trigger.
2. **`supabase/migrations/002_storage_setup.sql`**
   * Creates the private `bill-uploads` storage bucket (15 MB limit, accepts JPEG, PNG, WebP, HEIC, PDF).
   * Configures 4 RLS policies scoping uploads, reads, updates, and deletes strictly to `bill-uploads/{user_id}/*`.

---

## 5. Authentication Configuration (Google OAuth & Email)

If configuring your own Supabase project:
1. Go to **Supabase Dashboard → Authentication → URL Configuration**:
   * Set **Site URL** to `http://localhost:3000`
   * Add `http://localhost:3000/auth/callback` under **Redirect URLs**.
2. **(Optional) Email Confirmation**:
   * Under **Authentication → Providers → Email**, you can toggle off **"Confirm email"** during local development for instant email/password sign-ups.
3. **(Optional) Google OAuth**:
   * Under **Authentication → Providers → Google**, enable Google and provide your Google Cloud OAuth Client ID and Secret, with `https://<your-project-ref>.supabase.co/auth/v1/callback` added as an Authorized Redirect URI in Google Cloud Console.

---

## 6. Running the Application Locally

Start the Next.js development server (powered by Turbopack):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts
| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the local Next.js 16 Turbopack dev server on port `3000` |
| `npm run build` | Builds the production application bundle |
| `npm run start` | Runs the compiled production server |
| `npm run lint` | Runs ESLint across the codebase |
| `npx tsc --noEmit` | Runs a full TypeScript typecheck without emitting files |

---

## 7. Git Branching & Contribution Workflow

We follow a clean feature-branch workflow and **Conventional Commits**:

1. Create a feature or bugfix branch off `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Use Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`):
   ```bash
   git commit -m "feat: add gemini vision ocr endpoint"
   ```
3. Verify TypeScript types pass before merging:
   ```bash
   npx tsc --noEmit
   ```
4. Merge back into `master` and push:
   ```bash
   git checkout master
   git merge feature/your-feature-name
   git push origin master
   ```

---

## 8. Troubleshooting Common Issues

* **`http://localhost:3000/auth?error=auth_exchange_failed` after Google Sign-In:**
  * Double-check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` was copied directly from the `anon` `public` key in Supabase Settings → API Keys, and restart `npm run dev`.
  * Ensure `http://localhost:3000/auth/callback` is listed in **Supabase → Authentication → URL Configuration → Redirect URLs**.
* **"You must be signed in to upload hospital bills" on `/scanner`:**
  * Visit `/auth` and sign in. Our custom clock-skew handler (`src/lib/supabase/clockSkewFetch.ts`) automatically normalizes token expiry timestamps even if your local OS clock is offset from UTC.

