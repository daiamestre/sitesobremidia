-- ======================================================================
-- SOBRE MÍDIA — MIGRATION CORRETIVA 20261103
-- RECRIA OBJETOS FANTASMA — PARTE 2 (financeiro/BI/AI/DW/produção/agenda)
--
-- Complementa a 20261102: restaura as demais relações criadas pelas
-- migrations históricas 006/015/016/0196/020/021/022/023/027 que NÃO
-- existem mais no banco vivo, porém são consumidas ativamente pelos
-- serviços da aplicação (produção, agendamento, conciliação, financeiro
-- plus, analytics, exportações e auditoria de IA).
--
-- Garantias: idempotente, aditiva, RLS multi-tenant no padrão da casa,
-- sem backdoors. Seed do plano de contas com ON CONFLICT DO NOTHING.
-- ======================================================================

-- ---------------------------------------------------------------------
-- 1) PRODUÇÃO — versionamento imutável de mídias (origem: 006/015)
--    Variante biblioteca_midias é a consumida por producao.service.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.midia_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biblioteca_midia_id UUID NOT NULL REFERENCES public.biblioteca_midias(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(biblioteca_midia_id, numero_versao)
);
CREATE INDEX IF NOT EXISTS idx_midia_versoes_midia ON public.midia_versoes(biblioteca_midia_id);
ALTER TABLE public.midia_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_midia_versoes_select ON public.midia_versoes;
CREATE POLICY p_tenant_midia_versoes_select ON public.midia_versoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.biblioteca_midias bm
    WHERE bm.id = midia_versoes.biblioteca_midia_id
      AND (bm.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);
DROP POLICY IF EXISTS p_tenant_midia_versoes_insert ON public.midia_versoes;
CREATE POLICY p_tenant_midia_versoes_insert ON public.midia_versoes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.biblioteca_midias bm
    WHERE bm.id = midia_versoes.biblioteca_midia_id
      AND (bm.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);

-- ---------------------------------------------------------------------
-- 2) AGENDAMENTO — grade de exibição (origem: 016)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_exibicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES public.unidades(id) ON DELETE SET NULL,
  tela_id UUID REFERENCES public.telas(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  playlist_id UUID REFERENCES public.playlists(id) ON DELETE SET NULL,
  dias_semana INT[] DEFAULT '{0,1,2,3,4,5,6}',
  hora_inicio TIME NOT NULL DEFAULT '06:00:00',
  hora_fim TIME NOT NULL DEFAULT '22:00:00',
  intervalo_segundos INT NOT NULL DEFAULT 60 CHECK (intervalo_segundos >= 0),
  tempo_exibicao_segundos INT NOT NULL DEFAULT 15 CHECK (tempo_exibicao_segundos > 0),
  quantidade_insercoes INT NOT NULL DEFAULT 100 CHECK (quantidade_insercoes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grade_exibicao_agendamento ON public.grade_exibicao(agendamento_id);
ALTER TABLE public.grade_exibicao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_grade_exibicao_select ON public.grade_exibicao;
CREATE POLICY p_tenant_grade_exibicao_select ON public.grade_exibicao FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = grade_exibicao.agendamento_id
      AND (a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);
DROP POLICY IF EXISTS p_tenant_grade_exibicao_insert ON public.grade_exibicao;
CREATE POLICY p_tenant_grade_exibicao_insert ON public.grade_exibicao FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = grade_exibicao.agendamento_id
      AND (a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);
DROP POLICY IF EXISTS p_tenant_grade_exibicao_delete ON public.grade_exibicao;
CREATE POLICY p_tenant_grade_exibicao_delete ON public.grade_exibicao FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = grade_exibicao.agendamento_id
      AND (a.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);

-- ---------------------------------------------------------------------
-- 3) CONCILIAÇÃO — recebimentos bancários (origem: 019/0196)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recebimentos_conciliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id UUID NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL DEFAULT 'INTERNO',
  nsu VARCHAR(100),
  txid VARCHAR(100),
  autenticacao TEXT,
  data_conciliacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recebimentos_conciliacao_pagamento ON public.recebimentos_conciliacao(pagamento_id);
ALTER TABLE public.recebimentos_conciliacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_recebimentos_conciliacao_select ON public.recebimentos_conciliacao;
CREATE POLICY p_tenant_recebimentos_conciliacao_select ON public.recebimentos_conciliacao FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pagamentos pg
    WHERE pg.id = recebimentos_conciliacao.pagamento_id
      AND (pg.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);
DROP POLICY IF EXISTS p_tenant_recebimentos_conciliacao_insert ON public.recebimentos_conciliacao;
CREATE POLICY p_tenant_recebimentos_conciliacao_insert ON public.recebimentos_conciliacao FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pagamentos pg
    WHERE pg.id = recebimentos_conciliacao.pagamento_id
      AND (pg.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
           OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL)
  )
);

-- ---------------------------------------------------------------------
-- 4) BILLING — cobranças PIX (origem: 021)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pix_cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  conta_receber_id UUID NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  txid VARCHAR(100) NOT NULL,
  payload TEXT,
  qrcode TEXT,
  imagem_qrcode TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CONCLUIDA', 'EXPIRADA', 'REMOVIDA')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  expiracao INT NOT NULL DEFAULT 3600,
  gateway VARCHAR(50) NOT NULL DEFAULT 'GERENCISNET',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pix_tenant ON public.pix_cobrancas(empresa_operadora_id);
ALTER TABLE public.pix_cobrancas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_pix_cobrancas_select ON public.pix_cobrancas;
CREATE POLICY p_tenant_pix_cobrancas_select ON public.pix_cobrancas FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);
DROP POLICY IF EXISTS p_tenant_pix_cobrancas_insert ON public.pix_cobrancas;
CREATE POLICY p_tenant_pix_cobrancas_insert ON public.pix_cobrancas FOR INSERT TO authenticated
WITH CHECK (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
);
DROP POLICY IF EXISTS p_tenant_pix_cobrancas_update ON public.pix_cobrancas;
CREATE POLICY p_tenant_pix_cobrancas_update ON public.pix_cobrancas FOR UPDATE TO authenticated
USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()))
WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 5) FINANCEIRO PLUS — plano de contas + notas fiscais (origem: 020)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ATIVO', 'PASSIVO', 'RECEITA', 'DESPESA')),
  nivel INT NOT NULL DEFAULT 1 CHECK (nivel >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plano_contas_codigo ON public.plano_contas(codigo);
INSERT INTO public.plano_contas (codigo, nome, tipo, nivel) VALUES
  ('1.1.01', 'Caixa Geral', 'ATIVO', 3),
  ('1.1.02', 'Bancos Conta Movimento', 'ATIVO', 3),
  ('1.2.01', 'Clientes a Receber', 'ATIVO', 3),
  ('2.1.01', 'Fornecedores a Pagar', 'PASSIVO', 3),
  ('3.1.01', 'Receita de Midia Signage', 'RECEITA', 3),
  ('4.1.01', 'Despesas Operacionais NOC', 'DESPESA', 3)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE,
  numero_rps INT,
  numero_nfse VARCHAR(50),
  valor_servicos NUMERIC(12,2) NOT NULL CHECK (valor_servicos >= 0),
  aliquota_iss NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  valor_iss NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pis NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cofins NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'EMITIDA' CHECK (status IN ('RASCUNHO', 'EMITIDA', 'CANCELADA')),
  xml_object_key TEXT,
  pdf_object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tenant ON public.notas_fiscais(empresa_operadora_id);

ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_read_plano_contas ON public.plano_contas;
CREATE POLICY p_read_plano_contas ON public.plano_contas FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS p_tenant_notas_fiscais_select ON public.notas_fiscais;
CREATE POLICY p_tenant_notas_fiscais_select ON public.notas_fiscais FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);
DROP POLICY IF EXISTS p_tenant_notas_fiscais_insert ON public.notas_fiscais;
CREATE POLICY p_tenant_notas_fiscais_insert ON public.notas_fiscais FOR INSERT TO authenticated
WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 6) DATA WAREHOUSE — auditoria analítica (origem: 022)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  evento VARCHAR(40) NOT NULL CHECK (evento IN ('VIEW_REFRESH', 'EXPORT', 'CONSULTA', 'ERRO')),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_auditoria_tenant ON public.analytics_auditoria(empresa_operadora_id);
ALTER TABLE public.analytics_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_analytics_auditoria_select ON public.analytics_auditoria;
CREATE POLICY p_tenant_analytics_auditoria_select ON public.analytics_auditoria FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR empresa_operadora_id IS NULL
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);
DROP POLICY IF EXISTS p_tenant_analytics_auditoria_insert ON public.analytics_auditoria;
CREATE POLICY p_tenant_analytics_auditoria_insert ON public.analytics_auditoria FOR INSERT TO authenticated
WITH CHECK (
  empresa_operadora_id IS NULL
  OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
);

-- ---------------------------------------------------------------------
-- 7) BI — log de exportações (origem: 023)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bi_exportacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  formato VARCHAR(20) NOT NULL CHECK (formato IN ('PDF', 'EXCEL', 'CSV', 'POWER_BI')),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bi_exportacoes_tenant ON public.bi_exportacoes(empresa_operadora_id);
ALTER TABLE public.bi_exportacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_bi_exportacoes_select ON public.bi_exportacoes;
CREATE POLICY p_tenant_bi_exportacoes_select ON public.bi_exportacoes FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);
DROP POLICY IF EXISTS p_tenant_bi_exportacoes_insert ON public.bi_exportacoes;
CREATE POLICY p_tenant_bi_exportacoes_insert ON public.bi_exportacoes FOR INSERT TO authenticated
WITH CHECK (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));

-- ---------------------------------------------------------------------
-- 8) CORPORATE AI — log imutável de auditoria IA (origem: 027)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id),
  prompt TEXT NOT NULL,
  resposta TEXT NOT NULL,
  tempo_ms INT NOT NULL DEFAULT 0,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_auditoria_tenant ON public.ai_auditoria(empresa_operadora_id);
ALTER TABLE public.ai_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant_ai_auditoria_select ON public.ai_auditoria;
CREATE POLICY p_tenant_ai_auditoria_select ON public.ai_auditoria FOR SELECT TO authenticated
USING (
  empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
  OR empresa_operadora_id IS NULL
  OR public.get_user_empresa_operadora_id(auth.uid()) IS NULL
);
DROP POLICY IF EXISTS p_tenant_ai_auditoria_insert ON public.ai_auditoria;
CREATE POLICY p_tenant_ai_auditoria_insert ON public.ai_auditoria FOR INSERT TO authenticated
WITH CHECK (
  empresa_operadora_id IS NULL
  OR empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
);

-- ---------------------------------------------------------------------
-- GRANTs mínimos
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT ON public.midia_versoes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.grade_exibicao TO authenticated;
GRANT SELECT, INSERT ON public.recebimentos_conciliacao TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pix_cobrancas TO authenticated;
GRANT SELECT ON public.plano_contas TO authenticated;
GRANT SELECT, INSERT ON public.notas_fiscais TO authenticated;
GRANT SELECT, INSERT ON public.analytics_auditoria TO authenticated;
GRANT SELECT, INSERT ON public.bi_exportacoes TO authenticated;
GRANT SELECT, INSERT ON public.ai_auditoria TO authenticated;

NOTIFY pgrst, 'reload schema';
