-- Add last_screenshot_type to help distinguish between manual and heartbeat checkups
ALTER TABLE public.screens 
ADD COLUMN IF NOT EXISTS "last_screenshot_type" TEXT DEFAULT 'manual';

COMMENT ON COLUMN public.screens.last_screenshot_type IS 'Tipo do último print: manual ou heartbeat';
