-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 015: MÓDULO DE PRODUÇÃO DE CAMPANHAS (FASE 7.5-B)
-- ======================================================================

-- 1. Tabela Principal de Produções
CREATE TABLE IF NOT EXISTS public.producoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE RESTRICT,
  pedido_insercao_id UUID NOT NULL REFERENCES public.pedidos_insercao(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  titulo VARCHAR(150) NOT NULL,
  descricao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'CRIADA' CHECK (
    status IN (
      'CRIADA',
      'AGUARDANDO_MATERIAL',
      'MATERIAL_RECEBIDO',
      'EM_DESENVOLVIMENTO',
      'AGUARDANDO_APROVACAO',
      'REPROVADA',
      'APROVADA',
      'LIBERADA',
      'PUBLICADA',
      'FINALIZADA',
      'CANCELADA',
      'SUSPENSA'
    )
  ),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  designer_responsavel_id UUID REFERENCES public.usuarios(id),
  operador_responsavel_id UUID REFERENCES public.usuarios(id),
  prazo DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.usuarios(id),
  updated_by UUID REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_producoes_tenant ON public.producoes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_producoes_pi ON public.producoes(pedido_insercao_id);
CREATE INDEX IF NOT EXISTS idx_producoes_status ON public.producoes(status);

-- 2. Tabela de Mídias / Arquivos da Produção
CREATE TABLE IF NOT EXISTS public.midias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Imagem', 'Vídeo', 'HTML5', 'ZIP', 'PDF')),
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  mime_type VARCHAR(100) NOT NULL,
  tamanho BIGINT NOT NULL CHECK (tamanho >= 0),
  duracao INT DEFAULT 15 CHECK (duracao >= 0),
  largura INT DEFAULT 1920,
  altura INT DEFAULT 1080,
  object_key TEXT NOT NULL,
  checksum VARCHAR(64),
  versao_atual INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'EM_REVISAO' CHECK (status IN ('EM_REVISAO', 'APROVADO', 'REPROVADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_midias_producao ON public.midias(producao_id);

-- 3. Tabela de Versionamento Imutável de Mídias
CREATE TABLE IF NOT EXISTS public.midia_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  midia_id UUID NOT NULL REFERENCES public.midias(id) ON DELETE CASCADE,
  numero_versao INT NOT NULL,
  object_key TEXT NOT NULL,
  checksum VARCHAR(64),
  tamanho BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  duracao INT DEFAULT 15,
  largura INT DEFAULT 1920,
  altura INT DEFAULT 1080,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(midia_id, numero_versao)
);

CREATE INDEX IF NOT EXISTS idx_midia_versoes_midia ON public.midia_versoes(midia_id);

-- 4. Tabela de Aprovações Formais de Mídia
CREATE TABLE IF NOT EXISTS public.midia_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  midia_id UUID NOT NULL REFERENCES public.midias(id) ON DELETE CASCADE,
  versao_id UUID REFERENCES public.midia_versoes(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL CHECK (status IN ('APROVADO', 'REPROVADO')),
  motivo TEXT,
  observacao TEXT,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_midia_aprovacoes_midia ON public.midia_aprovacoes(midia_id);

-- 5. Tabela de Histórico da Produção
CREATE TABLE IF NOT EXISTS public.producao_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30) NOT NULL,
  descricao TEXT NOT NULL,
  usuario_id UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_producao_historico_producao ON public.producao_historico(producao_id);

-- 6. Tabela de Log de Auditoria Exclusiva da Produção
CREATE TABLE IF NOT EXISTS public.producao_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id UUID NOT NULL REFERENCES public.producoes(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (
    evento IN (
      'PRODUCAO_CRIADA',
      'MIDIA_ENVIADA',
      'MIDIA_SUBSTITUIDA',
      'MIDIA_APROVADA',
      'MIDIA_REPROVADA',
      'MIDIA_PUBLICADA',
      'PRODUCAO_CANCELADA'
    )
  ),
  usuario_id UUID REFERENCES public.usuarios(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_producao_auditoria_producao ON public.producao_auditoria(producao_id);

-- 7. Habilitação de RLS Multi-Tenant
ALTER TABLE public.producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midia_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midia_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_auditoria ENABLE ROW LEVEL SECURITY;

-- Policies RLS para tabelas de Produção
DO $$
BEGIN
  -- producoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producoes' AND policyname = 'p_read_producoes') THEN
    CREATE POLICY p_read_producoes ON public.producoes FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producoes' AND policyname = 'p_insert_producoes') THEN
    CREATE POLICY p_insert_producoes ON public.producoes FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producoes' AND policyname = 'p_update_producoes') THEN
    CREATE POLICY p_update_producoes ON public.producoes FOR UPDATE TO authenticated USING (TRUE);
  END IF;

  -- midias
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midias' AND policyname = 'p_read_midias') THEN
    CREATE POLICY p_read_midias ON public.midias FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midias' AND policyname = 'p_insert_midias') THEN
    CREATE POLICY p_insert_midias ON public.midias FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midias' AND policyname = 'p_update_midias') THEN
    CREATE POLICY p_update_midias ON public.midias FOR UPDATE TO authenticated USING (TRUE);
  END IF;

  -- midia_versoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midia_versoes' AND policyname = 'p_read_midia_versoes') THEN
    CREATE POLICY p_read_midia_versoes ON public.midia_versoes FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midia_versoes' AND policyname = 'p_insert_midia_versoes') THEN
    CREATE POLICY p_insert_midia_versoes ON public.midia_versoes FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- midia_aprovacoes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midia_aprovacoes' AND policyname = 'p_read_midia_aprovacoes') THEN
    CREATE POLICY p_read_midia_aprovacoes ON public.midia_aprovacoes FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'midia_aprovacoes' AND policyname = 'p_insert_midia_aprovacoes') THEN
    CREATE POLICY p_insert_midia_aprovacoes ON public.midia_aprovacoes FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- producao_historico
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producao_historico' AND policyname = 'p_read_producao_historico') THEN
    CREATE POLICY p_read_producao_historico ON public.producao_historico FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producao_historico' AND policyname = 'p_insert_producao_historico') THEN
    CREATE POLICY p_insert_producao_historico ON public.producao_historico FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;

  -- producao_auditoria
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producao_auditoria' AND policyname = 'p_read_producao_auditoria') THEN
    CREATE POLICY p_read_producao_auditoria ON public.producao_auditoria FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'producao_auditoria' AND policyname = 'p_insert_producao_auditoria') THEN
    CREATE POLICY p_insert_producao_auditoria ON public.producao_auditoria FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
END $$;
