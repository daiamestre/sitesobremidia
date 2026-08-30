-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261120: INTER PIX NATIVO (P0 ISOLAMENTO)
-- Cria colunas exclusivas para o PIX Nativo Banco Inter em contas_receber
-- e tabela dedicada para idempotência e auditoria de webhooks PIX.
-- Preserva 100% o schema e tabelas existentes do Boleto.
-- ======================================================================

-- 1. Colunas isoladas de rastreabilidade do PIX em contas_receber
ALTER TABLE public.contas_receber 
    ADD COLUMN IF NOT EXISTS inter_pix_txid VARCHAR(35),
    ADD COLUMN IF NOT EXISTS inter_pix_copia_e_cola TEXT,
    ADD COLUMN IF NOT EXISTS inter_pix_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS inter_pix_e2e_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS inter_pix_lock_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS inter_pix_location TEXT,
    ADD COLUMN IF NOT EXISTS inter_pix_valor_recebido NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS inter_pix_horario TIMESTAMPTZ;

-- 2. Constraint de unicidade para TXID Pix (1:1 determinístico e único)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_contas_receber_inter_pix_txid') THEN
        ALTER TABLE public.contas_receber ADD CONSTRAINT uk_contas_receber_inter_pix_txid UNIQUE (inter_pix_txid);
    END IF;
END $$;

-- 3. Tabela de eventos para controle de Idempotência de Webhook PIX Nativo
CREATE TABLE IF NOT EXISTS public.inter_pix_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    txid VARCHAR(35) NOT NULL,
    e2e_id VARCHAR(100),
    valor NUMERIC(14, 2),
    horario TIMESTAMPTZ,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uk_inter_pix_webhook_dedup UNIQUE (txid, horario, valor)
);

-- 4. RLS na tabela de eventos Pix (Apenas backend / Service Role)
ALTER TABLE public.inter_pix_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny ALL frontend access to inter pix webhooks" ON public.inter_pix_webhook_events;
CREATE POLICY "Deny ALL frontend access to inter pix webhooks" ON public.inter_pix_webhook_events
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- 5. Índices de pesquisa de alta performance para lookup em reconciliação
CREATE INDEX IF NOT EXISTS idx_contas_receber_pix_txid ON public.contas_receber(inter_pix_txid);
CREATE INDEX IF NOT EXISTS idx_inter_pix_webhook_txid ON public.inter_pix_webhook_events(txid);
CREATE INDEX IF NOT EXISTS idx_inter_pix_webhook_e2e ON public.inter_pix_webhook_events(e2e_id);

COMMENT ON COLUMN public.contas_receber.inter_pix_txid IS 'Identificador único TXID da cobrança imediata PIX Banco Inter';
COMMENT ON TABLE public.inter_pix_webhook_events IS 'Idempotência e trilha de auditoria dos eventos de webhook PIX Banco Inter';
