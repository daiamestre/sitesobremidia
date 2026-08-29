-- Migration de preparação do Banco Inter para a tabela contas_receber
-- Incrementa o schema atual preservando o fluxo financeiro.
-- Fase 1: Adição das colunas de rastreamento, concorrência e webhook.

-- 1. Adicionando as colunas no contas_receber
ALTER TABLE public.contas_receber 
    ADD COLUMN IF NOT EXISTS inter_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS inter_codigo_solicitacao VARCHAR(255),
    ADD COLUMN IF NOT EXISTS inter_seu_numero VARCHAR(255),
    ADD COLUMN IF NOT EXISTS inter_nosso_numero VARCHAR(255),
    ADD COLUMN IF NOT EXISTS inter_txid VARCHAR(255),
    ADD COLUMN IF NOT EXISTS inter_lock_timestamp TIMESTAMPTZ;

-- 2. Constraints exclusivas
-- O codigoSolicitacao é o UUID devolvido pela V3. Ele é a chave primária remota.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_contas_receber_inter_codigo_solicitacao') THEN
        ALTER TABLE public.contas_receber ADD CONSTRAINT uk_contas_receber_inter_codigo_solicitacao UNIQUE (inter_codigo_solicitacao);
    END IF;
END $$;

-- 3. Tabela de eventos para controle de Idempotência de Webhook
-- CORREÇÃO (Fase 2.3): O webhook V3 do Inter pode não fornecer um `event_id` global.
-- A deduplicação determinística usará a combinação única de (codigo_solicitacao, situacao, data_hora_situacao).
CREATE TABLE IF NOT EXISTS public.inter_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID interno nosso
    codigo_solicitacao VARCHAR(255) NOT NULL, -- Chave de lookup V3 principal
    nosso_numero VARCHAR(255), -- Fallback bancário
    txid VARCHAR(255), -- Pix locator
    situacao VARCHAR(50) NOT NULL, -- Status reportado (PAGO, VENCIDO, etc.)
    data_hora_situacao TIMESTAMPTZ NOT NULL, -- Timestamp reportado pelo Inter
    valor_total_recebido NUMERIC(10, 2),
    payload JSONB NOT NULL, -- Payload completo bruto
    processed BOOLEAN DEFAULT false NOT NULL, -- Marcador de conciliação
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uk_inter_webhook_dedup UNIQUE (codigo_solicitacao, situacao, data_hora_situacao)
);

-- 4. Isolamento Webhook
ALTER TABLE public.inter_webhook_events ENABLE ROW LEVEL SECURITY;

-- As Policies permitirão acesso APENAS pelo Service Role (que executa na Edge Function).
-- A UI do Frontend nunca consultará essa tabela diretamente.
DROP POLICY IF EXISTS "Deny ALL frontend access to inter webhooks" ON public.inter_webhook_events;
CREATE POLICY "Deny ALL frontend access to inter webhooks" ON public.inter_webhook_events
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- 5. Índices de pesquisa (A Edge Function e o Webhook farão lookup frequente)
CREATE INDEX IF NOT EXISTS idx_contas_receber_codigo_solicitacao ON public.contas_receber(inter_codigo_solicitacao);
CREATE INDEX IF NOT EXISTS idx_inter_webhook_codigo_solicitacao ON public.inter_webhook_events(codigo_solicitacao);
