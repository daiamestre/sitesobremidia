-- ============================================================
-- MIGRATION: FASE 8.4-C.2 — PRODUÇÃO DE MÍDIA MASTER
-- Sobre Mídia ERP — Domínio Operacional (Esteira de Mídia)
-- Criado em: 2026-08-07
-- Regras:
-- 1. Ordem de Produção (OP) vinculada OBRIGATORIAMENTE a Pedido de Inserção (PI) / Contrato
-- 2. Versionamento imutável de Mídias (V1, V2, V3...) sem sobrescrever arquivos
-- 3. RLS Ativo e isolado por empresa_operadora_id
-- ============================================================

-- ── 1. Evoluir public.ordens_producao ───────────────────────
ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS pedido_insercao_id uuid REFERENCES public.pedidos_insercao(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cliente_id          uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS titulo              text NOT NULL DEFAULT 'OP Sem Título',
  ADD COLUMN IF NOT EXISTS descricao           text,
  ADD COLUMN IF NOT EXISTS prioridade          text NOT NULL DEFAULT 'MEDIA',
  ADD COLUMN IF NOT EXISTS operador_id         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS versao_atual        int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by          uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS updated_by          uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS deleted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by          uuid REFERENCES public.usuarios(id);

-- Check constraints em ordens_producao
ALTER TABLE public.ordens_producao
  DROP CONSTRAINT IF EXISTS op_status_check,
  DROP CONSTRAINT IF EXISTS op_prioridade_check;

ALTER TABLE public.ordens_producao
  ADD CONSTRAINT op_status_check CHECK (status IN (
    'CRIADA','AGUARDANDO_MATERIAL','MATERIAL_RECEBIDO','EM_DESENVOLVIMENTO',
    'AGUARDANDO_APROVACAO','REPROVADA','APROVADA','LIBERADA','PUBLICADA',
    'FINALIZADA','CANCELADA','SUSPENSA'
  )),
  ADD CONSTRAINT op_prioridade_check CHECK (prioridade IN ('BAIXA','MEDIA','ALTA','URGENTE'));

-- Ativar RLS em ordens_producao
ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_tenant_isolation" ON public.ordens_producao;
CREATE POLICY "op_tenant_isolation" ON public.ordens_producao
  USING (empresa_operadora_id = (
    SELECT empresa_operadora_id FROM public.usuarios
    WHERE id = auth.uid() LIMIT 1
  ));

-- ── 2. Evoluir public.producao_midia ─────────────────────────
ALTER TABLE public.producao_midia
  ADD COLUMN IF NOT EXISTS empresa_operadora_id uuid REFERENCES public.empresa_operadora(id),
  ADD COLUMN IF NOT EXISTS pedido_insercao_id   uuid REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS titulo               text NOT NULL DEFAULT 'Mídia Sem Título',
  ADD COLUMN IF NOT EXISTS tipo_midia           text NOT NULL DEFAULT 'Imagem',
  ADD COLUMN IF NOT EXISTS object_key           text,
  ADD COLUMN IF NOT EXISTS mime_type            text,
  ADD COLUMN IF NOT EXISTS tamanho_bytes        bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duracao_segundos     int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS largura_px           int DEFAULT 1920,
  ADD COLUMN IF NOT EXISTS altura_px            int DEFAULT 1080,
  ADD COLUMN IF NOT EXISTS checksum             text,
  ADD COLUMN IF NOT EXISTS versao               int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_aprovacao     text NOT NULL DEFAULT 'EM_REVISAO',
  ADD COLUMN IF NOT EXISTS motivo_rejeicao      text,
  ADD COLUMN IF NOT EXISTS aprovado_por         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS aprovado_em          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by           uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS deleted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by           uuid REFERENCES public.usuarios(id);

-- Check constraints em producao_midia
ALTER TABLE public.producao_midia
  DROP CONSTRAINT IF EXISTS pm_status_aprovacao_check,
  DROP CONSTRAINT IF EXISTS pm_tipo_midia_check;

ALTER TABLE public.producao_midia
  ADD CONSTRAINT pm_status_aprovacao_check CHECK (status_aprovacao IN (
    'EM_REVISAO','AGUARDANDO_CLIENTE','APROVADO_CLIENTE','REJEITADO_CLIENTE','APROVADO','REPROVADO'
  )),
  ADD CONSTRAINT pm_tipo_midia_check CHECK (tipo_midia IN ('Imagem','Vídeo','HTML5','ZIP','PDF'));

-- RLS em producao_midia
ALTER TABLE public.producao_midia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_tenant_isolation" ON public.producao_midia;
CREATE POLICY "pm_tenant_isolation" ON public.producao_midia
  USING (
    producao_id IN (
      SELECT id FROM public.ordens_producao
      WHERE empresa_operadora_id = (
        SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
      )
    )
    OR empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  );

-- ── 3. Tabela producao_versoes (Versionamento Imutável) ─────
CREATE TABLE IF NOT EXISTS public.producao_versoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_midia_id   uuid NOT NULL REFERENCES public.producao_midia(id) ON DELETE CASCADE,
  versao              int NOT NULL,
  object_key          text NOT NULL,
  file_url            text,
  mime_type           text NOT NULL,
  tamanho_bytes       bigint NOT NULL DEFAULT 0,
  checksum            text,
  observacoes_versao  text,
  status_versao       text NOT NULL DEFAULT 'PENDENTE',
  created_by          uuid REFERENCES public.usuarios(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producao_midia_id, versao)
);

ALTER TABLE public.producao_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pv_tenant_isolation" ON public.producao_versoes;
CREATE POLICY "pv_tenant_isolation" ON public.producao_versoes
  USING (producao_midia_id IN (
    SELECT pm.id FROM public.producao_midia pm
    JOIN public.ordens_producao op ON op.id = pm.producao_id
    WHERE op.empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 4. Tabela producao_historico ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.producao_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id   uuid NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo   text NOT NULL,
  descricao     text NOT NULL,
  usuario_id    uuid REFERENCES public.usuarios(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.producao_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ph_tenant_isolation" ON public.producao_historico;
CREATE POLICY "ph_tenant_isolation" ON public.producao_historico
  USING (producao_id IN (
    SELECT id FROM public.ordens_producao
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 5. Função atômica fn_gerar_numero_op ────────────────────
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_op(
  p_empresa_operadora_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_ano    text;
  v_seq    int;
  v_numero text;
BEGIN
  v_ano := to_char(now(), 'YYYY');

  PERFORM pg_advisory_xact_lock(
    hashtext(p_empresa_operadora_id::text || 'op')
  );

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(numero_op, '[^0-9]', '', 'g'),
        ''
      )::int
    ), 0
  ) + 1
  INTO v_seq
  FROM public.ordens_producao
  WHERE empresa_operadora_id = p_empresa_operadora_id
    AND numero_op LIKE 'OP-' || v_ano || '-%';

  v_numero := 'OP-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
  RETURN v_numero;
END;
$func$;

-- ── 6. Índices de performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_op_empresa   ON public.ordens_producao(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_op_contrato  ON public.ordens_producao(contrato_id);
CREATE INDEX IF NOT EXISTS idx_op_pi        ON public.ordens_producao(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_op_status    ON public.ordens_producao(status);
CREATE INDEX IF NOT EXISTS idx_op_deleted   ON public.ordens_producao(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pm_producao  ON public.producao_midia(producao_id);
CREATE INDEX IF NOT EXISTS idx_pm_pi        ON public.producao_midia(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_pv_pm        ON public.producao_versoes(producao_midia_id);
CREATE INDEX IF NOT EXISTS idx_ph_producao  ON public.producao_historico(producao_id);

-- ── 7. Dado semente de Ordem de Produção e Mídia ─────────────
INSERT INTO public.ordens_producao (
  id, empresa_operadora_id, contrato_id, pedido_insercao_id, cliente_id,
  numero_op, titulo, descricao, status, prioridade, data_prazo, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  pi.empresa_operadora_id,
  pi.contrato_id,
  pi.id AS pedido_insercao_id,
  pi.cliente_id,
  'OP-2026-0001',
  'Produção de Mídia — Alpha Restaurant Q3',
  'Desenvolvimento de vinhetas 1920x1080 60fps para exibição na rede de telas.',
  'EM_DESENVOLVIMENTO',
  'MEDIA',
  CURRENT_DATE + INTERVAL '10 days',
  now(),
  now()
FROM public.pedidos_insercao pi
WHERE pi.numero_pi = 'PI-2026-0001'
  AND pi.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Mídia semente vinculada à OP-2026-0001
INSERT INTO public.producao_midia (
  id, empresa_operadora_id, producao_id, pedido_insercao_id,
  titulo, tipo_midia, object_key, mime_type, tamanho_bytes,
  duracao_segundos, largura_px, altura_px, versao, status_aprovacao, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  op.empresa_operadora_id,
  op.id AS producao_id,
  op.pedido_insercao_id,
  'Vinheta Alpha Restaurant - Promoção Almoço',
  'Vídeo',
  'tenants/alpha/op_2026_0001/v1/vinheta_almoco.mp4',
  'video/mp4',
  15485760,
  15,
  1920,
  1080,
  1,
  'EM_REVISAO',
  now(),
  now()
FROM public.ordens_producao op
WHERE op.numero_op = 'OP-2026-0001'
ON CONFLICT DO NOTHING;

-- Versão V1 da mídia semente
INSERT INTO public.producao_versoes (
  producao_midia_id, versao, object_key, mime_type, tamanho_bytes, observacoes_versao, status_versao, created_at
)
SELECT
  pm.id,
  1,
  pm.object_key,
  pm.mime_type,
  pm.tamanho_bytes,
  'Versão inicial criada pelo designer para revisão interna.',
  'EM_REVISAO',
  now()
FROM public.producao_midia pm
WHERE pm.titulo LIKE 'Vinheta Alpha%'
ON CONFLICT DO NOTHING;

-- Histórico da OP semente
INSERT INTO public.producao_historico (producao_id, status_anterior, status_novo, descricao, created_at)
SELECT
  op.id,
  NULL,
  'EM_DESENVOLVIMENTO',
  'Ordem de Produção OP-2026-0001 criada com sucesso a partir do PI PI-2026-0001.',
  now()
FROM public.ordens_producao op
WHERE op.numero_op = 'OP-2026-0001'
ON CONFLICT DO NOTHING;
