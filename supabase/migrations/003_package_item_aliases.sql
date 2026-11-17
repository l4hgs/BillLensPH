-- ============================================================================
-- BillLens PH — Migration 003: Package item aliases
-- Short matcher terms for each PhilHealth package inclusion.
--
-- `philhealth_packages.inclusive_items` stays as the human-readable list from
-- the circular. The audit engine matches line items against these aliases
-- instead, on whole words, so long seed phrases no longer cause false flags.
--
-- Run after 001_initial_schema.sql, then run
-- supabase/seeds/seed_package_item_aliases.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.package_item_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.philhealth_packages(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (length(trim(alias)) > 0),
  -- 'token': whole-word match, plural allowed. 'regex': raw pattern.
  kind TEXT NOT NULL DEFAULT 'token' CHECK (kind IN ('token', 'regex')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, alias)
);

CREATE INDEX IF NOT EXISTS package_item_aliases_package_id_idx
  ON public.package_item_aliases (package_id);

ALTER TABLE public.package_item_aliases ENABLE ROW LEVEL SECURITY;

-- Same access as the package catalog: public read, writes via service role only.
DROP POLICY IF EXISTS "Anyone can read package item aliases" ON public.package_item_aliases;
CREATE POLICY "Anyone can read package item aliases"
  ON public.package_item_aliases FOR SELECT
  TO anon, authenticated
  USING (true);
