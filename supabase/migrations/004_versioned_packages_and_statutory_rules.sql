-- ============================================================================
-- BillLens PH — Migration 004: Versioned PhilHealth Packages & Statutory Rules
--
-- 1. Adds versioning columns (`circular_id`, `effective_from`, `effective_to`,
--    `source_url`) to `public.philhealth_packages` and updates the uniqueness
--    constraint to `(case_code, effective_from)` so historical and current
--    PhilHealth circulars for the same `case_code` can coexist.
-- 2. Creates `public.statutory_rules` so Senior Citizen (RA 9994) and PWD
--    (RA 10754) VAT divisor, discount percentage, threshold, and eligible
--    categories live in data rather than hardcoded TypeScript constants.
-- ============================================================================

-- 1. Add versioning columns to `philhealth_packages`
ALTER TABLE public.philhealth_packages
  ADD COLUMN IF NOT EXISTS circular_id TEXT NOT NULL DEFAULT '2024-0037',
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT '2024-10-01',
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Replace single-column unique constraint with (case_code, effective_from)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'philhealth_packages_case_code_key'
  ) THEN
    ALTER TABLE public.philhealth_packages
      DROP CONSTRAINT philhealth_packages_case_code_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'philhealth_packages_case_code_effective_from_key'
  ) THEN
    ALTER TABLE public.philhealth_packages
      ADD CONSTRAINT philhealth_packages_case_code_effective_from_key
      UNIQUE (case_code, effective_from);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS philhealth_packages_case_code_effective_idx
  ON public.philhealth_packages (case_code, effective_from DESC);

-- 2. Create `statutory_rules` table
CREATE TABLE IF NOT EXISTS public.statutory_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  vat_divisor NUMERIC NOT NULL DEFAULT 1.12,
  discount_rate NUMERIC NOT NULL DEFAULT 0.20,
  incomplete_threshold NUMERIC NOT NULL DEFAULT 0.80,
  eligible_categories TEXT[] NOT NULL DEFAULT ARRAY[
    'Drugs/Medicines',
    'Medical Supplies',
    'Laboratory/Diagnostics',
    'Professional Fees',
    'Room & Board'
  ],
  citation TEXT NOT NULL DEFAULT 'RA 9994 / RA 10754',
  effective_from DATE NOT NULL DEFAULT '2016-03-23',
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.statutory_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read statutory rules" ON public.statutory_rules;
CREATE POLICY "Anyone can read statutory rules"
  ON public.statutory_rules FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed default Senior Citizen & PWD rule row
INSERT INTO public.statutory_rules (
  rule_code,
  label,
  vat_divisor,
  discount_rate,
  incomplete_threshold,
  eligible_categories,
  citation,
  effective_from
)
VALUES (
  'SENIOR_PWD',
  'Senior Citizen (60+) & PWD Statutory Relief',
  1.12,
  0.20,
  0.80,
  ARRAY[
    'Drugs/Medicines',
    'Medical Supplies',
    'Laboratory/Diagnostics',
    'Professional Fees',
    'Room & Board'
  ],
  'RA 9994 / RA 10754',
  '2016-03-23'
)
ON CONFLICT (rule_code) DO UPDATE SET
  label = EXCLUDED.label,
  vat_divisor = EXCLUDED.vat_divisor,
  discount_rate = EXCLUDED.discount_rate,
  incomplete_threshold = EXCLUDED.incomplete_threshold,
  eligible_categories = EXCLUDED.eligible_categories,
  citation = EXCLUDED.citation,
  effective_from = EXCLUDED.effective_from;
