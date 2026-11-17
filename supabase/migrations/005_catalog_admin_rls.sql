-- ============================================================================
-- BillLens PH — Migration 005: Catalog Admin Write Policies
--
-- Keeps public read (`SELECT` for `anon, authenticated`) on all catalog tables
-- (`philhealth_packages`, `package_item_aliases`, `statutory_rules`), while
-- granting authenticated staff/users permission to insert and update versioned
-- PhilHealth case rates and aliases without requiring code deployments.
-- ============================================================================

-- 1. `philhealth_packages` write policies for authenticated staff
DROP POLICY IF EXISTS "Authenticated staff can insert philhealth packages" ON public.philhealth_packages;
CREATE POLICY "Authenticated staff can insert philhealth packages"
  ON public.philhealth_packages FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can update philhealth packages" ON public.philhealth_packages;
CREATE POLICY "Authenticated staff can update philhealth packages"
  ON public.philhealth_packages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. `package_item_aliases` write policies for authenticated staff
DROP POLICY IF EXISTS "Authenticated staff can insert package item aliases" ON public.package_item_aliases;
CREATE POLICY "Authenticated staff can insert package item aliases"
  ON public.package_item_aliases FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can update package item aliases" ON public.package_item_aliases;
CREATE POLICY "Authenticated staff can update package item aliases"
  ON public.package_item_aliases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can delete package item aliases" ON public.package_item_aliases;
CREATE POLICY "Authenticated staff can delete package item aliases"
  ON public.package_item_aliases FOR DELETE
  TO authenticated
  USING (true);

-- 3. `statutory_rules` write policies for authenticated staff
DROP POLICY IF EXISTS "Authenticated staff can insert statutory rules" ON public.statutory_rules;
CREATE POLICY "Authenticated staff can insert statutory rules"
  ON public.statutory_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can update statutory rules" ON public.statutory_rules;
CREATE POLICY "Authenticated staff can update statutory rules"
  ON public.statutory_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
