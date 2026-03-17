-- ==========================================================
-- PROTOCOLO DE HEARTBEAT E REALTIME (STAGE 2 & 3)
-- Escala: 10.000+ telas com payload de 1KB por pulso
-- ==========================================================

-- 1. Tabela de Heartbeat (Ultra-leve, UPSERT por device_id)
-- Cada tela tem UMA linha que e sobrescrita a cada pulso.
-- 10.000 telas = apenas 10.000 linhas (nunca cresce).
CREATE TABLE IF NOT EXISTS device_health (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    app_version TEXT,
    battery_level INT,
    storage_usage_percent INT,
    current_media_id UUID
);

-- 2. Habilitar RLS
ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;

-- 3. Politicas de Seguranca
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'device_health' AND policyname = 'Allow authenticated to upsert health') THEN
        CREATE POLICY "Allow authenticated to upsert health" ON device_health
            FOR ALL TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 4. Habilitar Realtime para device_health (Dashboard ve telas "acendendo")
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE device_health;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5. Habilitar Realtime para playlist_items (CDC para o Player)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE playlist_items;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 6. Indice para performance em consultas de status "Offline"
CREATE INDEX IF NOT EXISTS idx_device_health_last_seen ON device_health (last_seen);
