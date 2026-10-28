-- ============================================================================
-- BillLens PH — Migration 001: Core Database Schema & RLS Policies
-- Run this first in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Create `profiles` table (linked to `auth.users`)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to automatically create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Create `audits` table
CREATE TABLE IF NOT EXISTS public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hospital_name TEXT NOT NULL,
  total_billed NUMERIC NOT NULL DEFAULT 0,
  estimated_out_of_pocket NUMERIC NOT NULL DEFAULT 0,
  raw_extracted_data JSONB,
  audit_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own audits" ON public.audits;
CREATE POLICY "Users can view their own audits"
  ON public.audits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own audits" ON public.audits;
CREATE POLICY "Users can insert their own audits"
  ON public.audits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own audits" ON public.audits;
CREATE POLICY "Users can update their own audits"
  ON public.audits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own audits" ON public.audits;
CREATE POLICY "Users can delete their own audits"
  ON public.audits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Create `philhealth_packages` table
CREATE TABLE IF NOT EXISTS public.philhealth_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_keyword TEXT NOT NULL,
  case_code TEXT NOT NULL UNIQUE,
  hci_fee NUMERIC NOT NULL DEFAULT 0,
  prof_fee NUMERIC NOT NULL DEFAULT 0,
  total_case_rate NUMERIC NOT NULL DEFAULT 0,
  inclusive_items TEXT[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.philhealth_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read PhilHealth packages" ON public.philhealth_packages;
CREATE POLICY "Anyone can read PhilHealth packages"
  ON public.philhealth_packages FOR SELECT
  TO anon, authenticated
  USING (true);

