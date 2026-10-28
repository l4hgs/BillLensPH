-- ============================================================================
-- BillLens PH — Week 2: Supabase Storage & RLS Setup (`bill-uploads`)
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Create the private `bill-uploads` bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bill-uploads',
  'bill-uploads',
  false, -- Private bucket: denies public anonymous access
  15728640, -- 15 MB max file size safety limit
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Drop existing policies if re-running this script
DROP POLICY IF EXISTS "Users can upload bills to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own uploaded bills" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own uploaded bills" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own uploaded bills" ON storage.objects;

-- 3. RLS Policy: Allow authenticated users to UPLOAD files only to `bill-uploads/{user_id}/*`
CREATE POLICY "Users can upload bills to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bill-uploads'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- 4. RLS Policy: Allow authenticated users to VIEW / DOWNLOAD their own files
CREATE POLICY "Users can view their own uploaded bills"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'bill-uploads'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- 5. RLS Policy: Allow authenticated users to UPDATE their own files
CREATE POLICY "Users can update their own uploaded bills"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'bill-uploads'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'bill-uploads'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- 6. RLS Policy: Allow authenticated users to DELETE their own files (e.g., on retake/remove)
CREATE POLICY "Users can delete their own uploaded bills"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'bill-uploads'
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);

