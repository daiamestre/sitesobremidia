-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 012: MÓDULO DE CONTRATOS, TEMPLATES & AUDITORIA (FASE 7.4-B)
-- ======================================================================

-- 1. Tabela de Templates de Contrato (Anunciante & Parceiro)
CREATE TABLE IF NOT EXISTS public.contrato_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_operadora_id UUID REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
  tipo_contrato VARCHAR(30) NOT NULL CHECK (tipo_contrato IN ('ANUNCIANTE', 'PARCEIRO')),
  codigo_template VARCHAR(50) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  versao INT NOT NULL DEFAULT 1,
  conteudo_html TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrato_templates_tipo ON public.contrato_templates(tipo_contrato);

-- 2. Adiciona colunas ao contrato para gerenciar o fluxo da Fase 7.4-B
ALTER TABLE public.contratos 
  ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(30) CHECK (tipo_contrato IN ('ANUNCIANTE', 'PARCEIRO')),
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.contrato_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_nome VARCHAR(150),
  ADD COLUMN IF NOT EXISTS template_versao INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS usuario_responsavel_id UUID REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS data_selecao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_documento VARCHAR(30) DEFAULT 'RASCUNHO' CHECK (status_documento IN ('RASCUNHO', 'GERADO', 'ENVIADO', 'ASSINADO', 'CANCELADO')),
  ADD COLUMN IF NOT EXISTS pdf_object_key TEXT;

-- 3. Tabela de Log de Auditoria do Módulo de Contratos
CREATE TABLE IF NOT EXISTS public.contrato_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  evento VARCHAR(50) NOT NULL CHECK (evento IN ('CONTRATO_SELECIONADO', 'CONTRATO_PDF_GERADO', 'CONTRATO_REENVIADO', 'CONTRATO_CANCELADO')),
  usuario_id UUID REFERENCES public.usuarios(id),
  tipo_contrato VARCHAR(30),
  versao INT DEFAULT 1,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrato_auditoria_contrato ON public.contrato_auditoria(contrato_id);

-- 4. Habilitação de RLS
ALTER TABLE public.contrato_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_auditoria ENABLE ROW LEVEL SECURITY;

-- 5. Policies RLS para contrato_templates (Permite leitura para authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrato_templates' AND policyname = 'p_read_contrato_templates'
  ) THEN
    CREATE POLICY p_read_contrato_templates ON public.contrato_templates
      FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrato_auditoria' AND policyname = 'p_read_contrato_auditoria'
  ) THEN
    CREATE POLICY p_read_contrato_auditoria ON public.contrato_auditoria
      FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrato_auditoria' AND policyname = 'p_insert_contrato_auditoria'
  ) THEN
    CREATE POLICY p_insert_contrato_auditoria ON public.contrato_auditoria
      FOR INSERT TO authenticated WITH CHECK (TRUE);
  END IF;
END $$;

-- 6. Inserção de Templates Padrão (Anunciante & Parceiro)
INSERT INTO public.contrato_templates (tipo_contrato, codigo_template, nome, descricao, versao, conteudo_html)
VALUES 
(
  'ANUNCIANTE',
  'TPL-ANUNCIANTE-V1',
  'Contrato de Prestação de Serviços de Mídia e Publicidade (Anunciante)',
  'Contrato utilizado para clientes que contratam publicidade e veiculação de mídia corporativa junto à SOBRE MÍDIA.',
  1,
  '<h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MÍDIA DIGITAL SIGNAGE</h2><p>Pelo presente instrumento particular, de um lado <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong> e de outro lado <strong>{{RAZAO_SOCIAL}}</strong>, inscrita no CNPJ sob o nº <strong>{{CNPJ}}</strong>, estabelecida em {{CIDADE}}/{{ESTADO}}, representada por {{REPRESENTANTE_LEGAL}}.</p><h3>1. DO OBJETO</h3><p>O presente contrato tem por objeto a prestação de serviços de exibição de mídias publicitárias e informativas na rede de telas da CONTRATADA para a campanha <strong>{{TITULO_CAMPANHA}}</strong>, composta por <strong>{{QUANTIDADE_TELAS}}</strong> telas/painéis.</p><h3>2. DO VALOR E CONDIÇÕES DE PAGAMENTO</h3><p>Pela prestação dos serviços contratados, a CONTRATANTE pagará o valor mensal de <strong>R$ {{VALOR_MENSAL}}</strong> através da forma de pagamento <strong>{{FORMA_PAGAMENTO}}</strong>, com vigência de {{DATA_INICIO}} a {{DATA_FIM}}.</p><h3>3. DAS CLÁUSULAS JURÍDICAS INALTERÁVEIS</h3><p>A veiculação observará a grade de programação estipulada e a conformidade com as normas legais de publicidade vigente.</p>'
),
(
  'PARCEIRO',
  'TPL-PARCEIRO-V1',
  'Contrato de Parceria e Cessão de Espaço para Ponto de Exibição (Parceiro)',
  'Contrato utilizado para estabelecimentos parceiros que cedem espaço físico para instalação das telas e painéis da SOBRE MÍDIA.',
  1,
  '<h2>CONTRATO DE PARCERIA E CESSÃO DE ESPAÇO FÍSICO PARA MÍDIA</h2><p>Pelo presente instrumento, <strong>SOBRE MÍDIA PLATAFORMA DIGITAL</strong> e o ESTABELECIMENTO PARCEIRO <strong>{{RAZAO_SOCIAL}}</strong>, inscrito no CNPJ nº <strong>{{CNPJ}}</strong>, localizado na <strong>{{ENDERECO_UNIDADE}}</strong>, celebram o presente acordo de parceria.</p><h3>1. DO OBJETO</h3><p>Cessão de espaço físico na unidade <strong>{{NOME_UNIDADE}}</strong> para instalação e operação de <strong>{{QUANTIDADE_TELAS}}</strong> telas de mídia indoor corporativa.</p><h3>2. DOS COMPROMISSOS</h3><p>O parceiro compromete-se a manter os equipamentos energizados e conectados, enquanto a SOBRE MÍDIA garante a gestão completa da programação e manutenção de hardware.</p>'
)
ON CONFLICT DO NOTHING;
