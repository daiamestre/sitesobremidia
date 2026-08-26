-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261001
-- CAMPAIGN ENGINE CORE: Tabelas, RLS e RPC de Submissão
-- ======================================================================

-- 1. TABELAS DE INTERSECÇÃO

CREATE TABLE IF NOT EXISTS public.campanha_midias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campanha_telas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.campanha_midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_telas ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS DE RLS (Tenant Isolation + Modalidade)

DO $$
BEGIN
  -- Select: Donos (ANUNCIANTE/HIBRIDO) ou HOST (se a tela for do HOST - lógica simplificada: tenant ou admins)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campanha_midias' AND policyname = 'cmidias_select') THEN
    CREATE POLICY cmidias_select ON public.campanha_midias FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.campanhas c
        WHERE c.id = campanha_midias.campanha_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campanha_midias' AND policyname = 'cmidias_insert') THEN
    CREATE POLICY cmidias_insert ON public.campanha_midias FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.campanhas c
        WHERE c.id = campanha_midias.campanha_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND c.cliente_id = public.get_user_cliente_id(auth.uid())
      )
    );
  END IF;

  -- Mesma lógica para campanha_telas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campanha_telas' AND policyname = 'ctelas_select') THEN
    CREATE POLICY ctelas_select ON public.campanha_telas FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.campanhas c
        WHERE c.id = campanha_telas.campanha_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campanha_telas' AND policyname = 'ctelas_insert') THEN
    CREATE POLICY ctelas_insert ON public.campanha_telas FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.campanhas c
        WHERE c.id = campanha_telas.campanha_id
          AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
          AND c.cliente_id = public.get_user_cliente_id(auth.uid())
      )
    );
  END IF;
END $$;


-- 3. BUCKET DE STORAGE (Public Read)
-- Inserir bucket se não existir
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campanhas_midia', 'campanhas_midia', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage
DO $$
BEGIN
  -- Qualquer um pode ler mídias públicas
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Campanhas Midia') THEN
    CREATE POLICY "Public Access to Campanhas Midia" ON storage.objects FOR SELECT USING (bucket_id = 'campanhas_midia');
  END IF;

  -- Apenas autenticados podem enviar
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authed Upload to Campanhas Midia') THEN
    CREATE POLICY "Authed Upload to Campanhas Midia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campanhas_midia');
  END IF;
END $$;


-- 4. RPC DE SUBMISSÃO E INTEGRAÇÃO COMMUNICATION CORE

CREATE OR REPLACE FUNCTION public.submit_campanha_to_review(
    p_campanha_id UUID,
    p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campanha_status TEXT;
    v_cliente_nome TEXT;
    v_campanha_titulo TEXT;
BEGIN
    -- Validação: Verificar se campanha pertence ao tenant e se está em DRAFT
    SELECT status, titulo INTO v_campanha_status, v_campanha_titulo
    FROM public.campanhas
    WHERE id = p_campanha_id AND empresa_operadora_id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campanha não encontrada ou não pertence a esta operação.';
    END IF;

    IF v_campanha_status != 'DRAFT' THEN
        RAISE EXCEPTION 'Apenas campanhas em DRAFT podem ser submetidas para revisão.';
    END IF;

    -- Obter nome do anunciante
    SELECT COALESCE(nome_fantasia, razao_social) INTO v_cliente_nome
    FROM public.clientes
    WHERE id = (SELECT cliente_id FROM public.campanhas WHERE id = p_campanha_id);

    -- 1. Alterar o status para REVIEW
    UPDATE public.campanhas
    SET status = 'REVIEW',
        updated_at = NOW()
    WHERE id = p_campanha_id;

    -- 2. Integrar com o Communication Core (Notificar matriz de nova campanha)
    PERFORM public.enfileirar_job(
        p_tenant_id,
        'campanha_enviada_revisao',
        'EMAIL',
        jsonb_build_object(
            'campanha_id', p_campanha_id,
            'titulo', v_campanha_titulo,
            'anunciante', v_cliente_nome,
            'action_url', 'https://plataforma.sobremidia.com.br/workspace/campanhas/revisao/' || p_campanha_id
        )
    );

    RETURN TRUE;
END;
$$;
