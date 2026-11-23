-- ==============================================================================
-- Migration 009: Circular Versioning & Facility Ownership / Ward Exception
-- ==============================================================================
-- 1. Adds `circular_number` and `superseded_by` to `public.philhealth_packages`
--    and `public.statutory_rules` for legal circular provenance and time travel.
-- 2. Adds `facility_ownership` ('government' | 'private') and
--    `no_ward_bed_available` (boolean) to `public.profiles` for user defaults.
-- 3. Updates `public.audits.eligibility_snapshot` default JSONB to include
--    `facility_ownership` and `no_ward_bed_available` alongside existing fields:
--      {
--        "contributor_type": "unknown",
--        "accommodation_type": "unknown",
--        "has_mdr_or_pin": true,
--        "facility_level": "unknown",
--        "facility_ownership": "private",
--        "no_ward_bed_available": false
--      }
-- ==============================================================================

-- 1. Add circular provenance columns to philhealth_packages
ALTER TABLE public.philhealth_packages
  ADD COLUMN IF NOT EXISTS circular_number TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by TEXT;

UPDATE public.philhealth_packages
SET circular_number = CASE
  WHEN circular_id ILIKE 'PC-%' THEN circular_id
  ELSE 'PC-' || circular_id
END
WHERE circular_number IS NULL AND circular_id IS NOT NULL;

-- 2. Add circular provenance columns to statutory_rules
ALTER TABLE public.statutory_rules
  ADD COLUMN IF NOT EXISTS circular_number TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by TEXT;

-- 3. Add facility ownership & involuntary private-room ward exception defaults to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS facility_ownership TEXT NOT NULL DEFAULT 'private'
    CHECK (facility_ownership IN ('government', 'private')),
  ADD COLUMN IF NOT EXISTS no_ward_bed_available BOOLEAN NOT NULL DEFAULT false;

-- 4. Update default JSONB on audits.eligibility_snapshot
ALTER TABLE public.audits
  ALTER COLUMN eligibility_snapshot SET DEFAULT jsonb_build_object(
    'contributor_type', 'unknown',
    'accommodation_type', 'unknown',
    'has_mdr_or_pin', true,
    'facility_level', 'unknown',
    'facility_ownership', 'private',
    'no_ward_bed_available', false
  );
