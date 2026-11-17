-- ============================================================================
-- BillLens PH — Migration 006: Catalog Admin Role Enforcement & AI Verification
--
-- Incremental migration for environments that already applied the initial 005
-- migration. Ensures `profiles.role = 'admin'` is required for catalog writes,
-- adds `philhealth_packages.is_verified`, and adds `audits.statutory_discount_type`.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'staff', 'admin'));

ALTER TABLE public.philhealth_packages
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT true;

UPDATE public.philhealth_packages
SET is_verified = false
WHERE source_url LIKE 'ai_grounded%';

ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS statutory_discount_type TEXT NOT NULL DEFAULT 'regular'
  CHECK (statutory_discount_type IN ('regular', 'senior', 'pwd'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'statutory_rules_rule_code_key'
  ) THEN
    ALTER TABLE public.statutory_rules
      DROP CONSTRAINT statutory_rules_rule_code_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'statutory_rules_rule_code_effective_from_key'
  ) THEN
    ALTER TABLE public.statutory_rules
      ADD CONSTRAINT statutory_rules_rule_code_effective_from_key
      UNIQUE (rule_code, effective_from);
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated staff can insert philhealth packages" ON public.philhealth_packages;
DROP POLICY IF EXISTS "Admins can insert philhealth packages" ON public.philhealth_packages;
CREATE POLICY "Admins can insert philhealth packages"
  ON public.philhealth_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can update philhealth packages" ON public.philhealth_packages;
DROP POLICY IF EXISTS "Admins can update philhealth packages" ON public.philhealth_packages;
CREATE POLICY "Admins can update philhealth packages"
  ON public.philhealth_packages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can insert package item aliases" ON public.package_item_aliases;
DROP POLICY IF EXISTS "Admins can insert package item aliases" ON public.package_item_aliases;
CREATE POLICY "Admins can insert package item aliases"
  ON public.package_item_aliases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can update package item aliases" ON public.package_item_aliases;
DROP POLICY IF EXISTS "Admins can update package item aliases" ON public.package_item_aliases;
CREATE POLICY "Admins can update package item aliases"
  ON public.package_item_aliases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can delete package item aliases" ON public.package_item_aliases;
DROP POLICY IF EXISTS "Admins can delete package item aliases" ON public.package_item_aliases;
CREATE POLICY "Admins can delete package item aliases"
  ON public.package_item_aliases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can insert statutory rules" ON public.statutory_rules;
DROP POLICY IF EXISTS "Admins can insert statutory rules" ON public.statutory_rules;
CREATE POLICY "Admins can insert statutory rules"
  ON public.statutory_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated staff can update statutory rules" ON public.statutory_rules;
DROP POLICY IF EXISTS "Admins can update statutory rules" ON public.statutory_rules;
CREATE POLICY "Admins can update statutory rules"
  ON public.statutory_rules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
