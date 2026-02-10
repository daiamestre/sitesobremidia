-- Add resolution column to playlists table
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT '16x9';

-- Update existing rows to have default value
UPDATE playlists SET resolution = '16x9' WHERE resolution IS NULL;

COMMENT ON COLUMN playlists.resolution IS 'Target resolution/aspect ratio for the playlist';
