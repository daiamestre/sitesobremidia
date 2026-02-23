-- ==========================================
-- SETUP SCREENSHOTS STORAGE BUCKET (V2)
-- Execute no SQL Editor do Supabase
-- IMPORTANTE: Não traduza este código para português! 
-- O banco de dados só aceita comandos em inglês.
-- ==========================================

-- 1. Create the 'screenshots' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. View Policy (Allows everyone to see the screenshots)
-- We use 'DO' to avoid error if policy exists or permission is tight on DROP
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public Screenshot Access" ON storage.objects;
    CREATE POLICY "Public Screenshot Access" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'screenshots');
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Skipping Select Policy: Permission issue or already exists';
END $$;

-- 3. Upload Policy (Allows anyone/public to upload for now to fix the player)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Player Upload Screenshots" ON storage.objects;
    CREATE POLICY "Player Upload Screenshots" ON storage.objects
    FOR INSERT TO public
    WITH CHECK (bucket_id = 'screenshots');
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Skipping Insert Policy: Permission issue or already exists';
END $$;

-- 4. Update Policy (Allows overwriting the screenshot)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Player Update Screenshots" ON storage.objects;
    CREATE POLICY "Player Update Screenshots" ON storage.objects
    FOR UPDATE TO public
    USING (bucket_id = 'screenshots');
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Skipping Update Policy: Permission issue or already exists';
END $$;

-- 5. Ensure columns in 'screens' table (This uses public schema, usually allowed)
ALTER TABLE public.screens 
ADD COLUMN IF NOT EXISTS "last_screenshot_url" TEXT,
ADD COLUMN IF NOT EXISTS "last_screenshot_at" TIMESTAMP WITH TIME ZONE;
