-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 014: MÓDULO PEDIDO DE INSERÇÃO (PI) (FASE 7.5-A)
-- ======================================================================

-- 1. Tabela Principal de Pedidos de Inserção (PI)
CREATE TABLE IF NOT EXISTS public.pedidos_insercao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  proposta_id UUID REFERENCES public.propostas(id) ON DELETE SET NULL,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  numero_pi VARCHAR(40) NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'EM_ELABORACAO' CHECK (
    status IN (
      'EM_ELABORACAO',
      'AGUARDANDO_MATERIAL',
      'MATERIAL_RECEBIDO',
      'EM_PRODUCAO',
      'AGUARDANDO_APROVACAO',
      'APROVADO',
      'AGENDADO',
      'EM_EXIBICAO',
      'FINALIZADO',
      'CANCELADO'
    )
  ),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  responsavel_id UUID REFERENCES public.usuarios(id),
  inicio_veiculacao DATE NOT NULL,
  fim_veiculacao DATE NOT NULL,
  quantidade_pecas INT DEFAULT 1 CHECK (quantidade_pecas > 0),
  observacoes TEXT,
  pdf_object_key TEXT,
  versao_atual INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  UNIQUE(empresa_operadora_id, numero_pi)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_insercao_tenant ON public.pedidos_insercao(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_insercao_cliente ON public.pedidos_insercao(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_insercao_contrato ON public.pedidos_insercao(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_insercao_status ON public.pedidos_insercao(status);

-- 2. Tabela de Mapeamento de Locais de Exibição (PI -> Unidade -> Tela -> Player -> Playlist)
CREATE TABLE IF NOT EXISTS public.pi_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES public.unidades(id) ON DELETE CASCADE,
  tela_id UUID REFERENCES public.telas(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_locais_pi ON public.pi_locais(pi_id);

-- 3. Tabela de Histórico de Transição de Status
CREATE TABLE IF NOT EXISTS public.pi_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30) NOT NULL,
  descricao TEXT NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_historico_pi ON public.pi_historico(pi_id);

-- 4. Tabela de Observações Operacionais
CREATE TABLE IF NOT EXISTS public.pi_observacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id),
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_observacoes_pi ON public.pi_observacoes(pi_id);

-- 5. Tabela de Log de Auditoria Exclusiva do PI
CREATE TABLE IF NOT EXISTS public.pi_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (
    evento IN (
      'PI_CRIADO',
      'STATUS_ALTERADO',
      'LOCAL_ALTERADO',
      'RESPONSAVEL_ALTERADO',
      'PI_CANCELADO',
      'PDF_GERADO',
      'OBSERVACAO_ADICIONADA'
    )
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  ip_address VARCHAR(45),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pi_auditoria_pi ON public.pi_auditoria(pi_id);

-- 6. Função para Geração Atômica Sequencial de numero_pi com Advisory Lock por Tenant
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_pi(
  p_empresa_operadora_id UUID
)
RETURNS VARCHAR(40)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_key BIGINT;
  v_last_num INT;
  v_next_num INT;
  v_year VARCHAR(4);
  v_numero_pi VARCHAR(40);
BEGIN
  -- Garante trava de concorrência exclusiva do tenant (Transaction Advisory Lock)
  v_lock_key := hashtext('pi_code_' || p_empresa_operadora_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_year := TO_CHAR(NOW(), 'YYYY');

  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(numero_pi, '\D', '', 'g') AS INT)), 0)
  INTO v_last_num
  FROM public.pedidos_insercao
  WHERE empresa_operadora_id = p_empresa_operadora_id;

  v_next_num := v_last_num + 1;
  v_numero_pi := 'PI-' || v_year || '-' || LPAD(v_next_num::text, 4, '0');

  RETURN v_numero_pi;
END;
$$;

-- 7. Habilitação de Row Level Security (RLS) Multi-Tenant
ALTER TABLE public.pedidos_insercao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$
BEGIN
  -- pedidos_insercao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_insercao' AND policyname = 'p_read_pedidos_insercao') THEN
    CREATE POLICY p_read_pedidos_insercao ON public.pedidos_insercao FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_insercao' AND policyname = 'p_insert_pedidos_insercao') THEN
    CREATE POLICY p_insert_pedidos_insercao ON public.pedidos_insercao FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pedidos_insercao' AND policyname = 'p_update_pedidos_insercao') THEN
    CREATE POLICY p_update_pedidos_insercao ON public.pedidos_insercao FOR UPDATE TO authenticated USING (TRUE);
  END IF;

  -- pi_locais
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_locais' AND policyname = 'p_read_pi_locais') THEN
    CREATE POLICY p_read_pi_locais ON public.pi_locais FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_locais' AND policyname = 'p_insert_pi_locais') THEN
    CREATE POLICY p_insert_pi_locais ON public.pi_locais FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- pi_historico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_historico' AND policyname = 'p_read_pi_historico') THEN
    CREATE POLICY p_read_pi_historico ON public.pi_historico FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_historico' AND policyname = 'p_insert_pi_historico') THEN
    CREATE POLICY p_insert_pi_historico ON public.pi_historico FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- pi_observacoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_observacoes' AND policyname = 'p_read_pi_observacoes') THEN
    CREATE POLICY p_read_pi_observacoes ON public.pi_observacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_observacoes' AND policyname = 'p_insert_pi_observacoes') THEN
    CREATE POLICY p_insert_pi_observacoes ON public.pi_observacoes FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- pi_auditoria
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_auditoria' AND policyname = 'p_read_pi_auditoria') THEN
    CREATE POLICY p_read_pi_auditoria ON public.pi_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pi_auditoria' AND policyname = 'p_insert_pi_auditoria') THEN
    CREATE POLICY p_insert_pi_auditoria ON public.pi_auditoria FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
END $$;
