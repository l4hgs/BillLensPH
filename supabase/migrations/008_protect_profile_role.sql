-- ============================================================================
-- BillLens PH — Migration 008: Protect `profiles.role` & Complete Catalog RLS
--
-- 1. Prevents privilege escalation on `public.profiles.role`:
--    - Adds a BEFORE UPDATE trigger (`prevent_profile_role_escalation`) that
--      blocks changes to `profiles.role` unless executed by `service_role` or
--      a database superuser (`postgres`, `supabase_admin`).
--    - Tightens the `INSERT` RLS policy on `public.profiles` so client-side
--      inserts cannot specify a non-'member' role.
-- 2. Adds admin-only `DELETE` RLS policies on `philhealth_packages`,
--    `package_item_aliases`, and `statutory_rules` to complete catalog CRUD.
-- ============================================================================

-- 1. Trigger function to block non-service-role modifications to `profiles.role`
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    jwt_role := COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    );

    IF jwt_role <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
      RAISE EXCEPTION 'Forbidden: profiles.role cannot be modified by non-admin sessions.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Ensure client-side INSERT on `public.profiles` can only insert `role = 'member'`
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'member'
  );

-- 2. Admin-only DELETE RLS policies for catalog tables
DROP POLICY IF EXISTS "Admins can delete philhealth packages" ON public.philhealth_packages;
CREATE POLICY "Admins can delete philhealth packages"
  ON public.philhealth_packages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

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

DROP POLICY IF EXISTS "Admins can delete statutory rules" ON public.statutory_rules;
CREATE POLICY "Admins can delete statutory rules"
  ON public.statutory_rules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
