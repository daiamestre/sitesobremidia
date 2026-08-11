-- ============================================================
-- MIGRATION: FASE 8.4-C.1 — PEDIDO DE INSERÇÃO (PI) MASTER
-- Sobre Mídia ERP — Domínio Operacional
-- Criado em: 2026-08-07
-- Regra: contrato_id NOT NULL (PI nasce de contrato aprovado)
-- ============================================================

-- ── 1. Evoluir public.pedidos_insercao ─────────────────────
-- Adicionar colunas operacionais necessárias (sem breaking change)
ALTER TABLE public.pedidos_insercao
  ADD COLUMN IF NOT EXISTS cliente_id         uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS proposta_id        uuid REFERENCES public.propostas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS titulo             text NOT NULL DEFAULT 'PI Sem Título',
  ADD COLUMN IF NOT EXISTS descricao          text,
  ADD COLUMN IF NOT EXISTS status             text NOT NULL DEFAULT 'EM_ELABORACAO',
  ADD COLUMN IF NOT EXISTS prioridade         text NOT NULL DEFAULT 'MEDIA',
  ADD COLUMN IF NOT EXISTS responsavel_id     uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS inicio_veiculacao  date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS fim_veiculacao     date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS quantidade_pecas   int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS observacoes        text,
  ADD COLUMN IF NOT EXISTS pdf_object_key     text,
  ADD COLUMN IF NOT EXISTS versao_atual       int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS created_by         uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS deleted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by         uuid REFERENCES public.usuarios(id);

-- ── 2. Remover DEFAULT temporário em titulo (opcional após dados) ─
-- (mantemos o default para compatibilidade enquanto não há dados)

-- ── 3. Check Constraints de status e prioridade ────────────
ALTER TABLE public.pedidos_insercao
  DROP CONSTRAINT IF EXISTS pi_status_check,
  DROP CONSTRAINT IF EXISTS pi_prioridade_check;

ALTER TABLE public.pedidos_insercao
  ADD CONSTRAINT pi_status_check CHECK (status IN (
    'EM_ELABORACAO','AGUARDANDO_MATERIAL','MATERIAL_RECEBIDO',
    'EM_PRODUCAO','AGUARDANDO_APROVACAO','APROVADO',
    'AGENDADO','EM_EXIBICAO','FINALIZADO','CANCELADO'
  )),
  ADD CONSTRAINT pi_prioridade_check CHECK (prioridade IN ('BAIXA','MEDIA','ALTA','URGENTE')),
  ADD CONSTRAINT pi_datas_check CHECK (fim_veiculacao >= inicio_veiculacao),
  ADD CONSTRAINT pi_quantidade_check CHECK (quantidade_pecas > 0);

-- ── 4. Ativar RLS ──────────────────────────────────────────
ALTER TABLE public.pedidos_insercao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pi_tenant_isolation" ON public.pedidos_insercao;
CREATE POLICY "pi_tenant_isolation" ON public.pedidos_insercao
  USING (empresa_operadora_id = (
    SELECT empresa_operadora_id FROM public.usuarios
    WHERE id = auth.uid() LIMIT 1
  ));

-- ── 5. Tabela pi_historico ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pi_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id         uuid NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo   text NOT NULL,
  descricao     text NOT NULL,
  usuario_id    uuid REFERENCES public.usuarios(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pi_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_historico_tenant" ON public.pi_historico;
CREATE POLICY "pi_historico_tenant" ON public.pi_historico
  USING (pi_id IN (
    SELECT id FROM public.pedidos_insercao
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 6. Tabela pi_auditoria ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pi_auditoria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id       uuid NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  evento      text NOT NULL,
  usuario_id  uuid REFERENCES public.usuarios(id),
  detalhes    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pi_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_auditoria_tenant" ON public.pi_auditoria;
CREATE POLICY "pi_auditoria_tenant" ON public.pi_auditoria
  USING (pi_id IN (
    SELECT id FROM public.pedidos_insercao
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 7. Tabela pi_observacoes ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pi_observacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id       uuid NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  conteudo    text NOT NULL,
  usuario_id  uuid REFERENCES public.usuarios(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pi_observacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_observacoes_tenant" ON public.pi_observacoes;
CREATE POLICY "pi_observacoes_tenant" ON public.pi_observacoes
  USING (pi_id IN (
    SELECT id FROM public.pedidos_insercao
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 8. Tabela pi_locais ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pi_locais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id         uuid NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  empresa_id    uuid,
  unidade_id    uuid,
  tela_id       uuid REFERENCES public.screens(id),
  player_id     uuid REFERENCES public.players(id),
  playlist_id   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pi_locais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pi_locais_tenant" ON public.pi_locais;
CREATE POLICY "pi_locais_tenant" ON public.pi_locais
  USING (pi_id IN (
    SELECT id FROM public.pedidos_insercao
    WHERE empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
  ));

-- ── 9. Função atômica fn_gerar_numero_pi ───────────────────
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_pi(
  p_empresa_operadora_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano    text;
  v_seq    int;
  v_numero text;
BEGIN
  v_ano := to_char(now(), 'YYYY');

  -- Advisory lock por empresa para evitar duplicidade
  PERFORM pg_advisory_xact_lock(
    hashtext(p_empresa_operadora_id::text || 'pi')
  );

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(numero_pi, '[^0-9]', '', 'g'),
        ''
      )::int
    ), 0
  ) + 1
  INTO v_seq
  FROM public.pedidos_insercao
  WHERE empresa_operadora_id = p_empresa_operadora_id
    AND numero_pi LIKE 'PI-' || v_ano || '-%';

  v_numero := 'PI-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
  RETURN v_numero;
END;
$$;

-- ── 10. Índices de performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pi_empresa ON public.pedidos_insercao(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_pi_contrato ON public.pedidos_insercao(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pi_cliente ON public.pedidos_insercao(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pi_status ON public.pedidos_insercao(status);
CREATE INDEX IF NOT EXISTS idx_pi_deleted ON public.pedidos_insercao(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pi_hist_pi ON public.pi_historico(pi_id);
CREATE INDEX IF NOT EXISTS idx_pi_audit_pi ON public.pi_auditoria(pi_id);
CREATE INDEX IF NOT EXISTS idx_pi_obs_pi ON public.pi_observacoes(pi_id);
CREATE INDEX IF NOT EXISTS idx_pi_locais_pi ON public.pi_locais(pi_id);

-- ── 11. Dado semente para teste ─────────────────────────────
-- PI semente vinculado ao contrato CTR-8001 (criado na FASE 8.4-B.3)
INSERT INTO public.pedidos_insercao (
  id, empresa_operadora_id, contrato_id, cliente_id, proposta_id,
  numero_pi, data_emissao, titulo, descricao, status, prioridade,
  inicio_veiculacao, fim_veiculacao, quantidade_pecas, observacoes,
  versao_atual, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  ct.empresa_operadora_id,
  ct.id AS contrato_id,
  ct.cliente_id,
  ct.proposta_id,
  'PI-2026-0001',
  CURRENT_DATE,
  'Campanha Alpha Restaurant — Lançamento Q3',
  'Veiculação de vinhetas publicitárias na rede de telas da Sobre Mídia.',
  'EM_ELABORACAO',
  'MEDIA',
  ct.data_inicio,
  ct.data_fim,
  3,
  'Material a ser enviado pela agência parceira até 10/08/2026.',
  1,
  now(),
  now()
FROM public.contratos ct
WHERE ct.numero_contrato = 'CTR-8001'
  AND ct.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ── 12. Histórico inicial do PI semente ────────────────────
INSERT INTO public.pi_historico (pi_id, status_anterior, status_novo, descricao, created_at)
SELECT
  pi.id,
  NULL,
  'EM_ELABORACAO',
  'PI PI-2026-0001 emitido — vinculado ao Contrato CTR-8001 (Alpha Restaurant).',
  now()
FROM public.pedidos_insercao pi
WHERE pi.numero_pi = 'PI-2026-0001'
ON CONFLICT DO NOTHING;
