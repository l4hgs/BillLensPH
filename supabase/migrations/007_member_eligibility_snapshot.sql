-- ============================================================================
-- BillLens PH — Migration 007: Member Eligibility Snapshot & NBB Rules
--
-- 1. Adds `eligibility_snapshot` (JSONB) to `public.audits` to store the
--    per-confinement PhilHealth eligibility & ward accommodation context:
--      - contributor_type: 'direct' | 'indirect_nbb' | 'lifetime' | 'unknown'
--      - accommodation_type: 'basic_ward' | 'non_basic_private' | 'unknown'
--      - has_mdr_or_pin: boolean
--      - facility_level: 'level_1' | 'level_2' | 'level_3' | 'asc' | 'unknown'
-- 2. Adds optional default eligibility preference columns on `public.profiles`
--    so returning patients do not have to re-enter their membership status.
-- ============================================================================

-- 1. Add `eligibility_snapshot` JSONB column to `public.audits`
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS eligibility_snapshot JSONB DEFAULT jsonb_build_object(
    'contributor_type', 'unknown',
    'accommodation_type', 'unknown',
    'has_mdr_or_pin', true,
    'facility_level', 'unknown'
  );

-- 2. Add default eligibility fields to `public.profiles`
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contributor_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (contributor_type IN ('direct', 'indirect_nbb', 'lifetime', 'unknown')),
  ADD COLUMN IF NOT EXISTS accommodation_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (accommodation_type IN ('basic_ward', 'non_basic_private', 'unknown')),
  ADD COLUMN IF NOT EXISTS has_mdr_or_pin BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS facility_level TEXT NOT NULL DEFAULT 'unknown'
    CHECK (facility_level IN ('level_1', 'level_2', 'level_3', 'asc', 'unknown'));
