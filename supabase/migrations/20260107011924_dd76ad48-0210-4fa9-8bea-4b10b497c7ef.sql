-- Remove the overly permissive public access policy on storage
DROP POLICY IF EXISTS "Public can view media" ON storage.objects;

-- Add policy for admins to view all media files in storage
CREATE POLICY "Admins can view all media files"
ON storage.objects FOR SELECT
USING (bucket_id = 'media' AND has_role(auth.uid(), 'admin'::app_role));