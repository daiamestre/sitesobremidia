-- Add audio_enabled column to screens table
ALTER TABLE screens ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN DEFAULT FALSE;

-- Update existing rows to have default value (optional if DEFAULT handles it, but good for clarity)
UPDATE screens SET audio_enabled = FALSE WHERE audio_enabled IS NULL;

-- Update existing rows to have default value (optional if DEFAULT handles it, but good for clarity)
UPDATE screens SET audio_enabled = FALSE WHERE audio_enabled IS NULL;

COMMENT ON COLUMN screens.audio_enabled IS 'Indicates if audio is enabled for the screen - Cache Bust';

g