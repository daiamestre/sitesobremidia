-- ======================================================================
-- SOBRE MÃDIA â€” MIGRATION 20261026
-- PORTAL DO ANUNCIANTE â€” FOUNDATION (aditiva e idempotente)
--
-- Reconcilia o drift do Cloud (20261001/02/03 nunca aplicadas) e adiciona:
--   1. public.pontos            â€” entidade central PONTO PARCEIRO
--   2. campanha_midias/telas    â€” campaign engine core (idem 20261001)
--   3. brand_* em clientes      â€” brand kit core (idem 20261002)
--   4. cliente_assets/encartes  â€” asset library + encarte (idem 20261003)
--   5. usuarios.must_change_password â€” forÃ§a troca no primeiro acesso
--   6. solicitacoes.credencial_emitida_em â€” emissÃ£o Ãºnica de credencial
--   7. RPCs: provisionamento com aprovaÃ§Ã£o direta, reset autorizado,
--      troca obrigatÃ³ria, equipe do cliente
--   8. playlists_cliente + itens + cobranÃ§a R$19,99 por vÃ­deo adicional
-- Nenhuma estrutura existente Ã© removida ou alterada destrutivamente.
-- ======================================================================

-- ----------------------------------------------------------------------
-- 1. PONTO PARCEIRO â€” entidade central (Â§30/Â§31 da missÃ£o)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pontos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    unidade_id UUID UNIQUE REFERENCES public.unidades(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    categoria TEXT,
    descricao TEXT,
    foto_url TEXT,
    galeria JSONB NOT NULL DEFAULT '[]'::jsonb,
    cep TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    estado TEXT,
    quantidade_telas INT NOT NULL DEFAULT 1 CHECK (quantidade_telas >= 0),
    valor_anuncio NUMERIC(12,2),
    periodicidade TEXT NOT NULL DEFAULT 'MENSAL'
        CHECK (periodicidade IN ('MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL','UNICO')),
    disponibilidade TEXT NOT NULL DEFAULT 'DISPONIVEL'
        CHECK (disponibilidade IN ('DISPONIVEL','RESERVADO','INDISPONIVEL')),
    status_operacional TEXT NOT NULL DEFAULT 'ATIVO'
        CHECK (status_operacional IN ('ATIVO','INATIVO','MANUTENCAO')),
    regras_comerciais TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pontos_tenant ON public.pontos(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_pontos_dispon ON public.pontos(empresa_operadora_id, disponibilidade) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_pontos_unidade ON public.pontos(unidade_id);

DO $$ BEGIN
    CREATE TRIGGER trg_pontos_updated_at
    BEFORE UPDATE ON public.pontos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pontos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pontos' AND policyname='pontos_tenant_select') THEN
        CREATE POLICY pontos_tenant_select ON public.pontos FOR SELECT TO authenticated
        USING (empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid()));
    END IF;
    -- Escrita apenas para perfis internos autorizados (Owner/Admin/Representante/operaÃ§Ã£o)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pontos' AND policyname='pontos_interno_insert') THEN
        CREATE POLICY pontos_interno_insert ON public.pontos FOR INSERT TO authenticated
        WITH CHECK (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND public.is_internal_role()
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pontos' AND policyname='pontos_interno_update') THEN
        CREATE POLICY pontos_interno_update ON public.pontos FOR UPDATE TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND public.is_internal_role()
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pontos' AND policyname='pontos_interno_delete') THEN
        CREATE POLICY pontos_interno_delete ON public.pontos FOR DELETE TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND public.get_user_role() IN ('OWNER','ADMIN')
        );
    END IF;
END $$;

-- Backfill idempotente: unidades existentes viram pontos parceiros
INSERT INTO public.pontos (empresa_operadora_id, unidade_id, nome, cidade, estado)
SELECT r.empresa_operadora_id, u.id, COALESCE(u.nome, 'Ponto sem nome'), u.cidade, u.estado
FROM public.unidades u
JOIN public.redes r ON r.id = u.rede_id
WHERE NOT EXISTS (SELECT 1 FROM public.pontos p WHERE p.unidade_id = u.id);

-- ----------------------------------------------------------------------
-- 2. CAMPAIGN ENGINE CORE (reconciliaÃ§Ã£o da 20261001)
-- ----------------------------------------------------------------------
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

ALTER TABLE public.campanha_midias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_telas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campanha_midias' AND policyname='cmidias_select') THEN
        CREATE POLICY cmidias_select ON public.campanha_midias FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.campanhas c
                WHERE c.id = campanha_midias.campanha_id
                  AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campanha_midias' AND policyname='cmidias_insert') THEN
        CREATE POLICY cmidias_insert ON public.campanha_midias FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.campanhas c
                WHERE c.id = campanha_midias.campanha_id
                  AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND c.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campanha_telas' AND policyname='ctelas_select') THEN
        CREATE POLICY ctelas_select ON public.campanha_telas FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.campanhas c
                WHERE c.id = campanha_telas.campanha_id
                  AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='campanha_telas' AND policyname='ctelas_insert') THEN
        CREATE POLICY ctelas_insert ON public.campanha_telas FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.campanhas c
                WHERE c.id = campanha_telas.campanha_id
                  AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND c.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;
END $$;

-- Bucket de criativos de campanha (leitura pÃºblica = conteÃºdo publicitÃ¡rio
-- destinado Ã  exibiÃ§Ã£o; escrita escopada Ã  pasta da campanha do prÃ³prio cliente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('campanhas_midia', 'campanhas_midia', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Public Access to Campanhas Midia') THEN
        CREATE POLICY "Public Access to Campanhas Midia" ON storage.objects FOR SELECT
        USING (bucket_id = 'campanhas_midia');
    END IF;
    -- Upload escopado: 1Âº nÃ­vel da pasta deve ser a campanha pertencente ao
    -- cliente do usuÃ¡rio autenticado (endurecido em relaÃ§Ã£o ao original amplo).
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Authed Upload to Campanhas Midia') THEN
        DROP POLICY "Authed Upload to Campanhas Midia" ON storage.objects;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Authed Upload to Campanhas Midia') THEN
        CREATE POLICY "Authed Upload to Campanhas Midia" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'campanhas_midia'
            AND EXISTS (
                SELECT 1 FROM public.campanhas c
                WHERE c.id::text = (storage.foldername(name))[1]
                  AND c.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND c.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;
END $$;

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
    SELECT status, titulo INTO v_campanha_status, v_campanha_titulo
    FROM public.campanhas
    WHERE id = p_campanha_id AND empresa_operadora_id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campanha nÃ£o encontrada ou nÃ£o pertence a esta operaÃ§Ã£o.';
    END IF;

    IF v_campanha_status != 'DRAFT' THEN
        RAISE EXCEPTION 'Apenas campanhas em DRAFT podem ser submetidas para revisÃ£o.';
    END IF;

    SELECT COALESCE(nome_fantasia, razao_social) INTO v_cliente_nome
    FROM public.clientes
    WHERE id = (SELECT cliente_id FROM public.campanhas WHERE id = p_campanha_id);

    UPDATE public.campanhas
    SET status = 'REVIEW',
        updated_at = NOW()
    WHERE id = p_campanha_id;

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

-- ----------------------------------------------------------------------
-- 3. BRAND KIT CORE (reconciliaÃ§Ã£o da 20261002)
-- ----------------------------------------------------------------------
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
ADD COLUMN IF NOT EXISTS brand_cor_primaria VARCHAR(7) DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS brand_cor_secundaria VARCHAR(7) DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS brand_fonte_primaria VARCHAR(100) DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS brand_fonte_secundaria VARCHAR(100) DEFAULT 'Inter';

-- ----------------------------------------------------------------------
-- 4. ASSET LIBRARY + ENCARTE DIGITAL (reconciliaÃ§Ã£o da 20261003)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('imagem', 'video', 'documento', 'outro')),
    mime_type VARCHAR(100),
    object_url TEXT NOT NULL,
    tamanho BIGINT,
    largura INT,
    altura INT,
    duracao INT,
    tags TEXT[],
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_assets_empresa ON public.cliente_assets(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_cliente_assets_cliente ON public.cliente_assets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_assets_tipo ON public.cliente_assets(tipo);

DO $$ BEGIN
    CREATE TRIGGER trg_cliente_assets_updated_at
    BEFORE UPDATE ON public.cliente_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.cliente_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_assets' AND policyname='policy_select_cliente_assets') THEN
        CREATE POLICY "policy_select_cliente_assets" ON public.cliente_assets
            FOR SELECT USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_assets' AND policyname='policy_insert_cliente_assets') THEN
        CREATE POLICY "policy_insert_cliente_assets" ON public.cliente_assets
            FOR INSERT WITH CHECK (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_assets' AND policyname='policy_update_cliente_assets') THEN
        CREATE POLICY "policy_update_cliente_assets" ON public.cliente_assets
            FOR UPDATE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_assets' AND policyname='policy_delete_cliente_assets') THEN
        CREATE POLICY "policy_delete_cliente_assets" ON public.cliente_assets
            FOR DELETE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.encartes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'PUBLICADO', 'INATIVO')),
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    cor_primaria VARCHAR(7),
    cor_secundaria VARCHAR(7),
    logo_url TEXT,
    capa_url TEXT,
    visitas INT DEFAULT 0,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encartes_empresa ON public.encartes(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_encartes_cliente ON public.encartes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_encartes_status ON public.encartes(status);

DO $$ BEGIN
    CREATE TRIGGER trg_encartes_updated_at
    BEFORE UPDATE ON public.encartes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.encarte_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encarte_id UUID NOT NULL REFERENCES public.encartes(id) ON DELETE CASCADE,
    oferta_id UUID NOT NULL REFERENCES public.ofertas(id) ON DELETE CASCADE,
    ordem INT NOT NULL DEFAULT 0,
    destaque BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encarte_itens_encarte ON public.encarte_itens(encarte_id);
CREATE INDEX IF NOT EXISTS idx_encarte_itens_oferta ON public.encarte_itens(oferta_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uk_encarte_oferta') THEN
        ALTER TABLE public.encarte_itens ADD CONSTRAINT uk_encarte_oferta UNIQUE (encarte_id, oferta_id);
    END IF;
END $$;

ALTER TABLE public.encartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encarte_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encartes' AND policyname='policy_select_encartes') THEN
        CREATE POLICY "policy_select_encartes" ON public.encartes
            FOR SELECT USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encartes' AND policyname='policy_insert_encartes') THEN
        CREATE POLICY "policy_insert_encartes" ON public.encartes
            FOR INSERT WITH CHECK (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encartes' AND policyname='policy_update_encartes') THEN
        CREATE POLICY "policy_update_encartes" ON public.encartes
            FOR UPDATE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encartes' AND policyname='policy_delete_encartes') THEN
        CREATE POLICY "policy_delete_encartes" ON public.encartes
            FOR DELETE USING (
                empresa_operadora_id = public.get_user_tenant_id()
                AND (
                    public.is_central_privileged()
                    OR cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encarte_itens' AND policyname='policy_select_encarte_itens') THEN
        CREATE POLICY "policy_select_encarte_itens" ON public.encarte_itens
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.encartes e
                    WHERE e.id = encarte_id
                    AND e.empresa_operadora_id = public.get_user_tenant_id()
                    AND (public.is_central_privileged()
                         OR e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()))
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encarte_itens' AND policyname='policy_insert_encarte_itens') THEN
        CREATE POLICY "policy_insert_encarte_itens" ON public.encarte_itens
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.encartes e
                    WHERE e.id = encarte_id
                    AND e.empresa_operadora_id = public.get_user_tenant_id()
                    AND (public.is_central_privileged()
                         OR e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()))
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encarte_itens' AND policyname='policy_update_encarte_itens') THEN
        CREATE POLICY "policy_update_encarte_itens" ON public.encarte_itens
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM public.encartes e
                    WHERE e.id = encarte_id
                    AND e.empresa_operadora_id = public.get_user_tenant_id()
                    AND (public.is_central_privileged()
                         OR e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()))
                )
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='encarte_itens' AND policyname='policy_delete_encarte_itens') THEN
        CREATE POLICY "policy_delete_encarte_itens" ON public.encarte_itens
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM public.encartes e
                    WHERE e.id = encarte_id
                    AND e.empresa_operadora_id = public.get_user_tenant_id()
                    AND (public.is_central_privileged()
                         OR e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid()))
                )
            );
    END IF;
END $$;

CREATE OR REPLACE VIEW public.vw_encartes_publicos AS
SELECT
    e.id AS encarte_id,
    e.empresa_operadora_id,
    e.cliente_id,
    emp.razao_social AS cliente_nome,
    emp.nome_fantasia AS cliente_fantasia,
    e.titulo,
    e.descricao,
    e.cor_primaria,
    e.cor_secundaria,
    e.logo_url,
    e.capa_url,
    e.data_inicio,
    e.data_fim,
    (
        SELECT json_agg(
            json_build_object(
                'id', o.id,
                'titulo', o.titulo,
                'descricao', o.descricao,
                'preco_promocional', oi.preco_oferta,
                'desconto_percentual', oi.desconto_porcentagem,
                'preco_original', oi.preco_original,
                'produto_nome', p.nome,
                'produto_codigo', p.codigo,
                'imagem_url', p.imagem_url,
                'unidade_medida', p.unidade_medida,
                'ordem', ei.ordem,
                'destaque', ei.destaque
            ) ORDER BY ei.ordem ASC
        )
        FROM public.encarte_itens ei
        JOIN public.oferta_itens oi ON oi.oferta_id = ei.oferta_id
        JOIN public.ofertas o ON o.id = ei.oferta_id
        JOIN public.produtos p ON p.id = oi.produto_id
        WHERE ei.encarte_id = e.id AND o.status = 'ATIVA'
    ) AS ofertas
FROM public.encartes e
LEFT JOIN public.empresas emp ON emp.cliente_id = e.cliente_id
WHERE e.status = 'PUBLICADO'
  AND (e.data_inicio IS NULL OR e.data_inicio <= NOW())
  AND (e.data_fim IS NULL OR e.data_fim >= NOW());

GRANT SELECT ON public.vw_encartes_publicos TO anon, authenticated;

-- ----------------------------------------------------------------------
-- 5. CICLO DE SENHA â€” forÃ§a troca no primeiro acesso
-- ----------------------------------------------------------------------
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.solicitacoes
ADD COLUMN IF NOT EXISTS credencial_emitida_em TIMESTAMPTZ;

-- ----------------------------------------------------------------------
-- 6. PLAYLISTS DO ANUNCIANTE + REGRA COMERCIAL (1Âª mÃ­dia vÃ­deo grÃ¡tis;
--    cada vÃ­deo adicional R$19,99 â€” cobranÃ§a server-side via contas_receber)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playlists_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA','INATIVA')),
    created_by UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cliente_playlist_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists_cliente(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.cliente_assets(id) ON DELETE CASCADE,
    ordem INT NOT NULL DEFAULT 0,
    duracao_segundos INT,
    cobranca_id UUID UNIQUE REFERENCES public.contas_receber(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cliente_playlist_pontos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists_cliente(id) ON DELETE CASCADE,
    ponto_id UUID NOT NULL REFERENCES public.pontos(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_playlist_ponto UNIQUE (playlist_id, ponto_id)
);

CREATE INDEX IF NOT EXISTS idx_playlists_cliente_cliente ON public.playlists_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cpi_playlist ON public.cliente_playlist_itens(playlist_id);
CREATE INDEX IF NOT EXISTS idx_cpp_playlist ON public.cliente_playlist_pontos(playlist_id);

DO $$ BEGIN
    CREATE TRIGGER trg_playlists_cliente_updated_at
    BEFORE UPDATE ON public.playlists_cliente
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.playlists_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_playlist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_playlist_pontos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playlists_cliente' AND policyname='plcli_tenant_dono_select') THEN
        CREATE POLICY plcli_tenant_dono_select ON public.playlists_cliente FOR SELECT TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (public.is_central_privileged() OR cliente_id = public.get_user_cliente_id())
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playlists_cliente' AND policyname='plcli_dono_insert') THEN
        CREATE POLICY plcli_dono_insert ON public.playlists_cliente FOR INSERT TO authenticated
        WITH CHECK (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND cliente_id = public.get_user_cliente_id()
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playlists_cliente' AND policyname='plcli_dono_update') THEN
        CREATE POLICY plcli_dono_update ON public.playlists_cliente FOR UPDATE TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (public.is_central_privileged() OR cliente_id = public.get_user_cliente_id())
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='playlists_cliente' AND policyname='plcli_dono_delete') THEN
        CREATE POLICY plcli_dono_delete ON public.playlists_cliente FOR DELETE TO authenticated
        USING (
            empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
            AND (public.is_central_privileged() OR cliente_id = public.get_user_cliente_id())
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_select') THEN
        CREATE POLICY cpi_select ON public.cliente_playlist_itens FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_itens' AND policyname='cpi_write') THEN
        CREATE POLICY cpi_write ON public.cliente_playlist_itens FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND p.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_pontos' AND policyname='cpp_select') THEN
        CREATE POLICY cpp_select ON public.cliente_playlist_pontos FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cliente_playlist_pontos' AND policyname='cpp_write') THEN
        CREATE POLICY cpp_write ON public.cliente_playlist_pontos FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND (public.is_central_privileged() OR p.cliente_id = public.get_user_cliente_id())
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.playlists_cliente p
                WHERE p.id = playlist_id
                  AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
                  AND p.cliente_id = public.get_user_cliente_id()
            )
        );
    END IF;
END $$;

-- ======================================================================
-- RPCs â€” PLAYLIST DO ANUNCIANTE (regras comerciais server-side)
-- ======================================================================

-- Criar playlist (dono)
CREATE OR REPLACE FUNCTION public.criar_playlist_cliente(
    p_nome TEXT,
    p_descricao TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_id UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;
    IF NULLIF(btrim(p_nome), '') IS NULL THEN
        RAISE EXCEPTION 'Nome da playlist Ã© obrigatÃ³rio.';
    END IF;

    INSERT INTO public.playlists_cliente (empresa_operadora_id, cliente_id, nome, descricao, created_by)
    VALUES (v_tenant, v_cliente, btrim(p_nome), NULLIF(btrim(coalesce(p_descricao,'')), ''), auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', v_id, 'PLAYLIST_CRIADA', 'ATIVA',
         'Playlist "' || btrim(p_nome) || '" criada pelo anunciante.');

    RETURN v_id;
END;
$$;

-- Adicionar mÃ­dia Ã  playlist.
-- Regra comercial: o PRIMEIRO item de vÃ­deo Ã© gratuito; cada vÃ­deo adicional
-- gera cobranÃ§a de R$ 19,99 (PIX avulso). O item sÃ³ entra APÃ“S pagamento
-- confirmado (confirmar_video_playlist_pago), espelhando criar_tela_gestor.
CREATE OR REPLACE FUNCTION public.adicionar_midia_playlist(
    p_playlist_id UUID,
    p_asset_id UUID,
    p_duracao_segundos INT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_videos INT;
    v_asset RECORD;
    v_conta UUID;
    v_codigo VARCHAR(24);
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id, cliente_id INTO v_tenant, v_cliente
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_asset FROM public.cliente_assets
    WHERE id = p_asset_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MÃ­dia inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id AND asset_id = p_asset_id) THEN
        RAISE EXCEPTION 'MÃ­dia jÃ¡ presente nesta playlist.';
    END IF;

    SELECT COUNT(*) INTO v_videos
    FROM public.cliente_playlist_itens i
    JOIN public.cliente_assets a ON a.id = i.asset_id
    WHERE i.playlist_id = p_playlist_id AND a.tipo = 'video';

    IF v_asset.tipo <> 'video' OR v_videos = 0 THEN
        -- Primeiro vÃ­deo (ou imagem): liberaÃ§Ã£o gratuita imediata
        INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, duracao_segundos, ordem)
        VALUES (p_playlist_id, p_asset_id, p_duracao_segundos,
                COALESCE((SELECT MAX(ordem)+1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1));

        INSERT INTO public.auditoria_logs
            (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        VALUES
            (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'ITEM_ADICIONADO', 'ATIVO',
             CASE WHEN v_asset.tipo = 'video' THEN 'Primeiro vÃ­deo gratuito.' ELSE 'Imagem adicionada (sem cobranÃ§a).' END);

        RETURN json_build_object('cobrado', false, 'valor', 0, 'item_liberado', true);
    END IF;

    -- VÃ­deo adicional: gera cobranÃ§a R$ 19,99 (item ainda NÃƒO inserido)
    INSERT INTO public.contas_receber (
        empresa_operadora_id, cliente_id, contrato_id, valor,
        data_vencimento, status, metodo_cobranca, recorrencia, notes
    ) VALUES (
        v_tenant, v_cliente, NULL, 19.99,
        CURRENT_DATE, 'PENDENTE', 'PIX', 'AVULSA',
        'Video adicional de playlist (playlist ' || p_playlist_id::text ||
        ' / midia ' || p_asset_id::text || ')'
    ) RETURNING id INTO v_conta;

    SELECT codigo_operacional INTO v_codigo FROM public.contas_receber WHERE id = v_conta;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'COBRANCA_VIDEO_GERADA', 'PENDENTE',
         'Cobranca ' || coalesce(v_codigo,'') || ' (R$ 19,99) gerada para video adicional.');

    RETURN json_build_object('cobrado', true, 'valor', 19.99, 'cobranca_id', v_conta, 'codigo', v_codigo);
END;
$$;

-- ConfirmaÃ§Ã£o pÃ³s-pagamento: insere o vÃ­deo adicional somente se a conta
-- estiver PAGA/PAGO (conciliaÃ§Ã£o real) â€” idempotente pela UNIQUE(cobranca_id)
CREATE OR REPLACE FUNCTION public.confirmar_video_playlist_pago(
    p_cobranca_id UUID,
    p_playlist_id UUID,
    p_asset_id UUID,
    p_duracao_segundos INT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_valor NUMERIC;
    v_item UUID;
    v_cliente UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();

    SELECT status, valor INTO v_status, v_valor
    FROM public.contas_receber WHERE id = p_cobranca_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobranca nao encontrada.'; END IF;
    IF v_status NOT IN ('PAGA','PAGO') THEN
        RAISE EXCEPTION 'Pagamento pendente (status %) â€” video bloqueado.', v_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.playlists_cliente
        WHERE id = p_playlist_id AND cliente_id = v_cliente
    ) THEN
        RAISE EXCEPTION 'Playlist fora do seu escopo.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.cliente_assets WHERE id = p_asset_id AND cliente_id = v_cliente
    ) THEN
        RAISE EXCEPTION 'Midia fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, ordem, duracao_segundos, cobranca_id)
    VALUES (p_playlist_id, p_asset_id,
            COALESCE((SELECT MAX(ordem)+1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1),
            p_duracao_segundos, p_cobranca_id)
    RETURNING id INTO v_item;

    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    SELECT empresa_operadora_id, 'VIDEO_PLAYLIST_LIBERADO_POS_PAGAMENTO', auth.uid(),
           jsonb_build_object('item_id', v_item, 'playlist_id', p_playlist_id,
                              'asset_id', p_asset_id, 'cobranca_id', p_cobranca_id, 'valor', v_valor)
    FROM public.contas_receber WHERE id = p_cobranca_id;

    RETURN json_build_object('ok', true, 'item_id', v_item);
END;
$$;

-- Vincular playlist a pontos CONTRATADOS e ativos do prÃ³prio anunciante
CREATE OR REPLACE FUNCTION public.vincular_pontos_playlist(
    p_playlist_id UUID,
    p_ponto_ids UUID[]
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_vinculados INT := 0;
    v_ponto RECORD;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF NOT EXISTS (
        SELECT 1 FROM public.playlists_cliente WHERE id = p_playlist_id AND cliente_id = v_cliente
    ) THEN
        RAISE EXCEPTION 'Playlist fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    FOREACH v_ponto IN ARRAY p_ponto_ids LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
            JOIN public.contratos k ON k.id = ce.contrato_id
            WHERE po.id = v_ponto
              AND po.ativo
              AND k.cliente_id = v_cliente
              AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        ) THEN
            RAISE EXCEPTION 'Ponto % nÃ£o estÃ¡ contratado/ativo para o seu cliente.', v_ponto;
        END IF;

        INSERT INTO public.cliente_playlist_pontos (playlist_id, ponto_id)
        VALUES (p_playlist_id, v_ponto)
        ON CONFLICT (playlist_id, ponto_id) DO NOTHING;
        v_vinculados := v_vinculados + 1;
    END LOOP;

    RETURN v_vinculados;
END;
$$;

-- Marketplace: pontos disponÃ­veis para anunciar (mesmo tenant, nÃ£o contratados pelo caller)
CREATE OR REPLACE FUNCTION public.listar_pontos_para_anunciar()
RETURNS TABLE(
    ponto_id UUID, nome TEXT, categoria TEXT, descricao TEXT,
    cidade TEXT, estado TEXT, bairro TEXT, logradouro TEXT,
    foto_url TEXT, valor_anuncio NUMERIC, periodicidade TEXT,
    quantidade_telas INT, disponibilidade TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT po.id, po.nome, po.categoria, po.descricao,
           po.cidade, po.estado, po.bairro, po.logradouro,
           po.foto_url, po.valor_anuncio, po.periodicidade,
           po.quantidade_telas, po.disponibilidade
    FROM public.pontos po
    WHERE po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND po.ativo
      AND po.disponibilidade = 'DISPONIVEL'
      AND po.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.contrato_estabelecimentos ce
          JOIN public.contratos k ON k.id = ce.contrato_id
          WHERE ce.unidade_id = po.unidade_id
            AND k.cliente_id = public.get_user_cliente_id()
            AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
      )
    ORDER BY po.nome;
$$;

REVOKE ALL ON FUNCTION public.listar_pontos_para_anunciar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_pontos_para_anunciar() TO authenticated;

-- SolicitaÃ§Ã£o de novo ponto (expansÃ£o pontual) â†’ Central de ComunicaÃ§Ã£o
CREATE OR REPLACE FUNCTION public.solicitar_novo_ponto(
    p_ponto_id UUID,
    p_justificativa TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_ponto RECORD;
    v_sol UUID;
    v_contrato UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'UsuÃ¡rio sem vÃ­nculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;

    SELECT * INTO v_ponto FROM public.pontos
    WHERE id = p_ponto_id AND empresa_operadora_id = v_tenant AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ponto inexistente ou indisponÃ­vel neste tenant.' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.solicitacoes
        WHERE tipo_solicitacao = 'NOVO_PONTO'
          AND entidade_id = p_ponto_id
          AND solicitante_id = auth.uid()
          AND status = 'PENDENTE'
    ) THEN
        RAISE EXCEPTION 'JÃ¡ existe uma solicitaÃ§Ã£o pendente para este ponto.';
    END IF;

    SELECT k.id INTO v_contrato
    FROM public.contratos k
    WHERE k.cliente_id = v_cliente
      AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
    LIMIT 1;

    INSERT INTO public.solicitacoes
        (empresa_operadora_id, tipo_solicitacao, titulo, descricao, entidade_tipo, entidade_id,
         status, solicitante_id)
    VALUES
        (v_tenant, 'NOVO_PONTO',
         'SolicitaÃ§Ã£o de novo ponto: ' || v_ponto.nome,
         concat_ws(' | ',
             'Cliente: ' || v_cliente::text,
             'Contrato: ' || coalesce(v_contrato::text,'â€”'),
             'Valor: ' || coalesce(v_ponto.valor_anuncio::text,'sob consulta'),
             'Local: ' || concat_ws(' - ', v_ponto.cidade, v_ponto.estado),
             NULLIF(btrim(coalesce(p_justificativa,'')), '')
         ),
         'PONTO_PARCEIRO', p_ponto_id, 'PENDENTE', auth.uid())
    RETURNING id INTO v_sol;

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
         titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao,
         rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_tenant, u.id, 'NOVO_PONTO_SOLICITADO', 'IN_APP', u.id,
         'ðŸ“ SolicitaÃ§Ã£o de novo ponto',
         'Anunciante solicitou contratar o ponto "' || v_ponto.nome || '".' || E'\n' ||
             'Local: ' || concat_ws(' - ', v_ponto.cidade, v_ponto.estado) || E'\n' ||
             'Valor: ' || coalesce(v_ponto.valor_anuncio::text,'sob consulta') || E'\n' ||
             '[ APROVAR ] [ RECUSAR ] na aba SolicitaÃ§Ãµes.',
         'ALTA', 'INFO', 'SENT', false, 'NAO_LIDA',
         '/workspace/central', 'solicitacao_novo_ponto', v_sol
    FROM public.usuarios u
    LEFT JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_tenant
      AND (u.is_owner = true OR UPPER(COALESCE(pf.nome,'')) = 'ADMIN');

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'SOLICITACAO', v_sol, 'NOVO_PONTO_SOLICITADO', 'PENDENTE',
         'Ponto: ' || v_ponto.nome);

    RETURN v_sol;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_novo_ponto(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_novo_ponto(UUID, TEXT) TO authenticated;

-- Equipe do cliente (Minha Equipe do portal)
CREATE OR REPLACE FUNCTION public.listar_equipe_cliente()
RETURNS TABLE(
    usuario_id UUID, nome TEXT, email TEXT, telefone VARCHAR,
    ativo BOOLEAN, perfil TEXT, status TEXT,
    must_change_password BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT u.id, u.nome, u.email, u.telefone, u.ativo,
           UPPER(COALESCE(p.nome,'')), u.status, u.must_change_password, u.created_at
    FROM public.usuarios u
    LEFT JOIN public.perfis p ON p.id = u.perfil_id
    WHERE u.cliente_id = public.get_user_cliente_id()
      AND u.deleted_at IS NULL
    ORDER BY u.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.listar_equipe_cliente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_equipe_cliente() TO authenticated;

-- ======================================================================
-- RPCs â€” SEGURANÃ‡A DE SENHA
-- ======================================================================

-- ConclusÃ£o da troca obrigatÃ³ria (o prÃ³prio usuÃ¡rio, autenticado)
CREATE OR REPLACE FUNCTION public.concluir_troca_senha_obrigatoria()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios
    SET must_change_password = FALSE, updated_at = NOW()
    WHERE id = auth.uid() AND must_change_password = TRUE;

    IF FOUND THEN
        INSERT INTO public.auditoria_logs
            (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        SELECT empresa_operadora_id, id, 'USUARIO', id, 'PASSWORD_CHANGED', 'ACTIVE',
               'Troca obrigatÃ³ria de senha concluÃ­da.'
        FROM public.usuarios WHERE id = auth.uid();
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_troca_senha_obrigatoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concluir_troca_senha_obrigatoria() TO authenticated;

-- SolicitaÃ§Ã£o de redefiniÃ§Ã£o de senha (fluxo com autorizaÃ§Ã£o â€” Â§8/Â§9 da missÃ£o)
-- ChamÃ¡vel por anon (tela de login); resposta anti-enumeraÃ§Ã£o Ã© tratada no frontend.
CREATE OR REPLACE FUNCTION public.solicitar_reset_senha(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_u RECORD;
    v_sol UUID;
BEGIN
    SELECT id, nome, email, empresa_operadora_id INTO v_u
    FROM public.usuarios
    WHERE lower(email) = lower(btrim(p_email)) AND deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN TRUE; -- anti-enumeraÃ§Ã£o: comportamento idÃªntico
    END IF;

    -- JÃ¡ existe pedido pendente para este usuÃ¡rio? NÃ£o duplicar.
    IF EXISTS (
        SELECT 1 FROM public.solicitacoes
        WHERE tipo_solicitacao = 'PASSWORD_RESET_REQUEST'
          AND entidade_id = v_u.id
          AND status = 'PENDENTE'
    ) THEN
        RETURN TRUE;
    END IF;

    INSERT INTO public.solicitacoes
        (empresa_operadora_id, tipo_solicitacao, titulo, descricao, entidade_tipo, entidade_id,
         status, solicitante_id)
    VALUES
        (v_u.empresa_operadora_id, 'PASSWORD_RESET_REQUEST',
         'ðŸ” SolicitaÃ§Ã£o de redefiniÃ§Ã£o de senha',
         'UsuÃ¡rio: ' || v_u.nome || E'\nLogin: ' || v_u.email ||
         '\nSolicitou uma redefiniÃ§Ã£o de senha.',
         'USUARIO', v_u.id, 'PENDENTE', v_u.id)
    RETURNING id INTO v_sol;

    -- NotificaÃ§Ã£o IN_APP aos autorizadores (OWNER/ADMIN do tenant)
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato,
         titulo, mensagem, prioridade, severidade, status_envio, lida, status_notificacao,
         rota_destino, entidade_relacionada_tipo, entidade_relacionada_id)
    SELECT v_u.empresa_operadora_id, u.id, 'PASSWORD_RESET_REQUEST', 'IN_APP', u.id,
         'ðŸ” SolicitaÃ§Ã£o de redefiniÃ§Ã£o de senha',
         'UsuÃ¡rio: ' || v_u.nome || E'\nEmpresa: ver cadastro' || E'\nLogin: ' || v_u.email ||
         E'\nSolicitou uma redefiniÃ§Ã£o de senha.\n[ AUTORIZAR ] [ RECUSAR ] na aba SolicitaÃ§Ãµes.',
         'ALTA', 'WARNING', 'SENT', false, 'NAO_LIDA',
         '/workspace/central', 'solicitacao_reset', v_sol
    FROM public.usuarios u
    LEFT JOIN public.perfis pf ON pf.id = u.perfil_id
    WHERE u.empresa_operadora_id = v_u.empresa_operadora_id
      AND (u.is_owner = true OR UPPER(COALESCE(pf.nome,'')) = 'ADMIN');

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, usuario_email, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_u.empresa_operadora_id, v_u.id, v_u.email, 'SOLICITACAO', v_sol,
         'PASSWORD_RESET_REQUESTED', 'PENDENTE',
         'UsuÃ¡rio solicitou redefiniÃ§Ã£o de senha via tela de login.');

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_reset_senha(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_reset_senha(TEXT) TO anon, authenticated;

-- DecisÃ£o do OWNER/Admin autorizado sobre a solicitaÃ§Ã£o de reset (Â§11/Â§12)
-- A emissÃ£o da nova credencial ocorre na edge authorize-password-reset
-- (GoTrue Admin), que exige esta solicitaÃ§Ã£o APROVADA com credencial nÃ£o emitida.
CREATE OR REPLACE FUNCTION public.decidir_reset_senha(
    p_solicitacao_id UUID,
    p_aprovar BOOLEAN,
    p_motivo TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_sol RECORD;
    v_alvo RECORD;
BEGIN
    IF NOT (public.is_central_privileged() OR public.get_user_role() = 'OWNER') THEN
        RAISE EXCEPTION 'Acesso Negado: apenas OWNER ou Admin autorizado podem decidir.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_sol FROM public.solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SolicitaÃ§Ã£o inexistente.'; END IF;
    IF v_sol.tipo_solicitacao <> 'PASSWORD_RESET_REQUEST' THEN
        RAISE EXCEPTION 'SolicitaÃ§Ã£o nÃ£o Ã© de redefiniÃ§Ã£o de senha.';
    END IF;
    IF v_sol.status <> 'PENDENTE' THEN
        RAISE EXCEPTION 'Dupla decisÃ£o bloqueada: solicitaÃ§Ã£o jÃ¡ estÃ¡ %.', v_sol.status;
    END IF;

    UPDATE public.solicitacoes
    SET status = CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'REJEITADA' END,
        responsavel_id = auth.uid(),
        decisao_motivo = NULLIF(btrim(coalesce(p_motivo,'')), ''),
        decisao_data = NOW(),
        updated_at = NOW()
    WHERE id = p_solicitacao_id;

    UPDATE public.notificacoes_central
    SET status_notificacao = 'RESOLVIDA', resolvida_em = NOW()
    WHERE entidade_relacionada_tipo = 'solicitacao_reset'
      AND entidade_relacionada_id = p_solicitacao_id;

    SELECT email INTO v_alvo FROM public.usuarios WHERE id = v_sol.entidade_id;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_sol.empresa_operadora_id, auth.uid(), 'SOLICITACAO', p_solicitacao_id,
         CASE WHEN p_aprovar THEN 'PASSWORD_RESET_AUTHORIZED' ELSE 'PASSWORD_RESET_REJECTED' END,
         CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'REJEITADA' END,
         'Alvo: ' || coalesce(v_alvo.email,'?') ||
         CASE WHEN NULLIF(btrim(coalesce(p_motivo,'')),'') IS NOT NULL THEN ' | Motivo: ' || p_motivo ELSE '' END);

    RETURN json_build_object('aprovada', p_aprovar, 'solicitacao_id', p_solicitacao_id);
END;
$$;

REVOKE ALL ON FUNCTION public.decidir_reset_senha(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decidir_reset_senha(UUID, BOOLEAN, TEXT) TO authenticated;

-- ======================================================================
-- RPC â€” PROVISIONAMENTO COM ACESSO IMEDIATO (Â§4/Â§15 da missÃ£o)
-- Criado por Owner/Admin autorizado (ou ANUNCIANTE p/ prÃ³pria equipe):
-- nasce ACTIVE/APPROVED com must_change_password=TRUE e solicitaÃ§Ã£o
-- APPROVADA (mantÃ©m o modelo de login existente intacto).
-- ======================================================================
CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo(
    p_uid UUID,
    p_email TEXT,
    p_nome TEXT,
    p_telefone TEXT DEFAULT NULL,
    p_perfil_id UUID DEFAULT NULL,
    p_cliente_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_tenant uuid;
    v_caller_owner boolean;
    v_caller_admin boolean;
    v_caller_perfil text;
    v_caller_cliente uuid;
    v_perfil_nome text;
    v_perfil_ativo boolean;
    v_cliente_final uuid := NULL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Acesso Negado: sessÃ£o invÃ¡lida.' USING ERRCODE = '42501';
    END IF;

    SELECT u.empresa_operadora_id, COALESCE(u.is_owner, false),
           (UPPER(COALESCE(p.nome, '')) = 'ADMIN'),
           UPPER(COALESCE(p.nome, '')), u.cliente_id
      INTO v_caller_tenant, v_caller_owner, v_caller_admin, v_caller_perfil, v_caller_cliente
      FROM public.usuarios u
      LEFT JOIN public.perfis p ON p.id = u.perfil_id
     WHERE u.id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acesso Negado: usuÃ¡rio nÃ£o registrado.' USING ERRCODE = '42501';
    END IF;

    -- Perfil alvo
    SELECT p.nome, p.ativo INTO v_perfil_nome, v_perfil_ativo
      FROM public.perfis p WHERE p.id = p_perfil_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil alvo inexistente.' USING ERRCODE = '22023'; END IF;
    IF NOT v_perfil_ativo THEN RAISE EXCEPTION 'Perfil alvo inativo.' USING ERRCODE = '22023'; END IF;
    IF v_perfil_nome = 'OWNER' THEN
        RAISE EXCEPTION 'Acesso Negado: nÃ£o Ã© possÃ­vel criar contas OWNER.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_owner OR v_caller_admin THEN
        -- Fluxo corporativo: ADMIN precisa users.create (+ create_admin p/ ADMIN alvo)
        IF NOT v_caller_owner THEN
            IF NOT public.has_admin_permission('users.create') THEN
                RAISE EXCEPTION 'Acesso Negado: permissÃ£o users.create nÃ£o concedida.' USING ERRCODE = '42501';
            END IF;
            IF v_perfil_nome = 'ADMIN' AND NOT public.has_admin_permission('users.create_admin') THEN
                RAISE EXCEPTION 'Acesso Negado: criar ADMIN requer users.create_admin.' USING ERRCODE = '42501';
            END IF;
        END IF;
        -- VÃ­nculo opcional de cliente (mesmo tenant)
        IF p_cliente_id IS NOT NULL THEN
            SELECT c.id INTO v_cliente_final
              FROM public.clientes c
             WHERE c.id = p_cliente_id AND c.empresa_operadora_id = v_caller_tenant;
            IF v_cliente_final IS NULL THEN
                RAISE EXCEPTION 'Cliente informado nÃ£o pertence Ã  empresa operadora.' USING ERRCODE = '22023';
            END IF;
        END IF;
    ELSIF v_caller_perfil = 'ANUNCIANTE' THEN
        -- Minha Equipe: anunciante provisiona somente membros da prÃ³pria empresa
        IF v_caller_cliente IS NULL THEN
            RAISE EXCEPTION 'Acesso Negado: anunciante sem vÃ­nculo comercial.' USING ERRCODE = '42501';
        END IF;
        IF v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE') THEN
            RAISE EXCEPTION 'Acesso Negado: equipe do anunciante aceita apenas perfis CLIENTE ou ANUNCIANTE.' USING ERRCODE = '42501';
        END IF;
        v_cliente_final := v_caller_cliente;
    ELSE
        RAISE EXCEPTION 'Acesso Negado: provisionamento restrito a OWNER, ADMIN ou ANUNCIANTE.' USING ERRCODE = '42501';
    END IF;

    -- Registro corporativo ATIVO (criador Ã© a autorizaÃ§Ã£o) + troca obrigatÃ³ria
    INSERT INTO public.usuarios
        (id, empresa_operadora_id, perfil_id, nome, email, telefone, ativo, status,
         status_ciclo_vida, cliente_id, created_by, approved_by, must_change_password, version)
    VALUES
        (p_uid, v_caller_tenant, p_perfil_id, p_nome, p_email, p_telefone,
         true, 'ACTIVE', 'APPROVED', v_cliente_final, v_caller, v_caller, TRUE, 1);

    -- Estrutura comercial real: REPRESENTANTE ganha registro em representantes
    IF v_perfil_nome = 'REPRESENTANTE' THEN
        INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj, ativo)
        VALUES (v_caller_tenant, p_uid, '', true);
    END IF;

    -- Registro em solicitacoes_acesso JÃ APROVADO (fonte de verdade do login)
    INSERT INTO public.solicitacoes_acesso
        (id, empresa_operadora_id, auth_user_id, usuario_id, tipo_acesso,
         nome_usuario, email_usuario, telefone, dados_cadastro,
         status, approved_by, approved_at, origem, perfil_solicitado_id, criado_por)
    VALUES
        (gen_random_uuid(), v_caller_tenant, p_uid, p_uid,
         CASE v_perfil_nome
           WHEN 'REPRESENTANTE' THEN 'REPRESENTANTE'
           WHEN 'GESTOR'        THEN 'GESTOR_TELAS'
           WHEN 'ANUNCIANTE'    THEN 'ANUNCIANTE'
           WHEN 'PARCEIRO'      THEN 'PARCEIRO'
           ELSE 'FUNCIONARIO'
         END,
         p_nome, p_email, p_telefone,
         jsonb_build_object('criado_via', 'PROVISIONAMENTO_DIRETO', 'perfil_nome', v_perfil_nome,
                            'cliente_id', v_cliente_final),
         'APPROVED', v_caller, NOW(), 'CRIACAO_CORPORATIVA_PROVISIONADA', p_perfil_id, v_caller);

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_caller_tenant, v_caller, 'USUARIO', p_uid, 'USER_PROVISIONED', 'ACTIVE',
         'UsuÃ¡rio provisionado com acesso imediato e troca obrigatÃ³ria de senha. Perfil: '
         || v_perfil_nome || '. Cliente: ' || coalesce(v_cliente_final::text,'â€”'));

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, destinatario_contato, titulo, mensagem,
         prioridade, severidade, status_envio, lida, status_notificacao)
    VALUES
        (v_caller_tenant, p_uid, 'USER_PROVISIONED', 'IN_APP', p_uid,
         'Bem-vindo(a) Ã  SOBRE MÃDIA',
         'Seu acesso foi criado. Utilize a senha inicial fornecida pelo administrador e defina uma nova senha no primeiro login.',
         'SUCESSO', 'INFO', 'SENT', false, 'NAO_LIDA');

    RETURN p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provisionar_usuario_corporativo(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------
-- GATES FINAIS â€” falhar se algo essencial ficou faltando
-- ----------------------------------------------------------------------
DO $$
DECLARE
    faltando TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO faltando
    FROM unnest(ARRAY[
        'pontos','campanha_midias','campanha_telas','cliente_assets',
        'encartes','encarte_itens','playlists_cliente','cliente_playlist_itens','cliente_playlist_pontos'
    ]) t
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name=t
    );
    IF faltando IS NOT NULL THEN
        RAISE EXCEPTION 'GATE: tabelas ausentes apÃ³s migration: %', faltando;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname IN ('submit_campanha_to_review','solicitar_reset_senha','decidir_reset_senha','provisionar_usuario_corporativo','concluir_troca_senha_obrigatoria','adicionar_midia_playlist','confirmar_video_playlist_pago','listar_pontos_para_anunciar','listar_equipe_cliente','criar_playlist_cliente','vincular_pontos_playlist','solicitar_novo_ponto')) THEN
        RAISE EXCEPTION 'GATE: RPCs ausentes apÃ³s migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='usuarios' AND column_name='must_change_password'
    ) THEN
        RAISE EXCEPTION 'GATE: usuarios.must_change_password ausente.';
    END IF;
END $$;
