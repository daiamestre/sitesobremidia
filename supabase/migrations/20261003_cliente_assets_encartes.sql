-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261003: ASSET LIBRARY & ENCARTE DIGITAL (FASE 6 E 8)
-- ======================================================================

-- ======================================================================
-- 1. TABELA DE ASSETS DO CLIENTE (Asset Library)
-- ======================================================================

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
    duracao INT, -- para vídeos, em segundos
    
    tags TEXT[],
    
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cliente_assets_empresa ON public.cliente_assets(empresa_operadora_id);
CREATE INDEX IF NOT EXISTS idx_cliente_assets_cliente ON public.cliente_assets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_assets_tipo ON public.cliente_assets(tipo);

-- Trigger de updated_at
DO $$ BEGIN
    CREATE TRIGGER trg_cliente_assets_updated_at
    BEFORE UPDATE ON public.cliente_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ======================================================================
-- RLS: CLIENTE ASSETS
-- ======================================================================
ALTER TABLE public.cliente_assets ENABLE ROW LEVEL SECURITY;

-- Select: Usuário pode ver assets do seu tenant e apenas se for associado àquele cliente (se não for admin)
CREATE POLICY "policy_select_cliente_assets" ON public.cliente_assets
    FOR SELECT USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- Insert: Usuário pode inserir assets para seu cliente/tenant
CREATE POLICY "policy_insert_cliente_assets" ON public.cliente_assets
    FOR INSERT WITH CHECK (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- Update: Usuário pode atualizar assets do seu cliente/tenant
CREATE POLICY "policy_update_cliente_assets" ON public.cliente_assets
    FOR UPDATE USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- Delete: Usuário pode deletar assets do seu cliente/tenant
CREATE POLICY "policy_delete_cliente_assets" ON public.cliente_assets
    FOR DELETE USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );


-- ======================================================================
-- 2. TABELA DE ENCARTES (Encarte Digital)
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.encartes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id UUID NOT NULL REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    
    status VARCHAR(50) NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'PUBLICADO', 'INATIVO')),
    data_inicio TIMESTAMPTZ,
    data_fim TIMESTAMPTZ,
    
    -- Configurações visuais que podem sobrepor o Brand Kit padrão se preenchidas
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
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ======================================================================
-- 3. TABELA DE ITENS DO ENCARTE
-- ======================================================================

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

-- Restrição para não repetir a mesma oferta no encarte
ALTER TABLE public.encarte_itens ADD CONSTRAINT uk_encarte_oferta UNIQUE (encarte_id, oferta_id);

-- ======================================================================
-- RLS: ENCARTES E ITENS
-- ======================================================================
ALTER TABLE public.encartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encarte_itens ENABLE ROW LEVEL SECURITY;

-- ENCARTES: Select
CREATE POLICY "policy_select_encartes" ON public.encartes
    FOR SELECT USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- ENCARTES: Insert
CREATE POLICY "policy_insert_encartes" ON public.encartes
    FOR INSERT WITH CHECK (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- ENCARTES: Update
CREATE POLICY "policy_update_encartes" ON public.encartes
    FOR UPDATE USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- ENCARTES: Delete
CREATE POLICY "policy_delete_encartes" ON public.encartes
    FOR DELETE USING (
        empresa_operadora_id = public.get_user_tenant_id()
        AND (
            public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
            OR
            cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
        )
    );

-- ENCARTE ITENS: Herda do encarte (via join ou subquery simplificada)
CREATE POLICY "policy_select_encarte_itens" ON public.encarte_itens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.encartes e
            WHERE e.id = encarte_id
            AND e.empresa_operadora_id = public.get_user_tenant_id()
            AND (
                public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
                OR
                e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
            )
        )
    );

CREATE POLICY "policy_insert_encarte_itens" ON public.encarte_itens
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.encartes e
            WHERE e.id = encarte_id
            AND e.empresa_operadora_id = public.get_user_tenant_id()
            AND (
                public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
                OR
                e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
            )
        )
    );

CREATE POLICY "policy_update_encarte_itens" ON public.encarte_itens
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.encartes e
            WHERE e.id = encarte_id
            AND e.empresa_operadora_id = public.get_user_tenant_id()
            AND (
                public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
                OR
                e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
            )
        )
    );

CREATE POLICY "policy_delete_encarte_itens" ON public.encarte_itens
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.encartes e
            WHERE e.id = encarte_id
            AND e.empresa_operadora_id = public.get_user_tenant_id()
            AND (
                public.get_user_role() IN ('SUPER_ADMIN', 'ADMIN_TENANT')
                OR
                e.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid())
            )
        )
    );

-- ======================================================================
-- 4. VIEW PARA LEITURA PÚBLICA DE ENCARTES
-- ======================================================================
-- Acesso público aos encartes sem precisar de RLS complexa de bypass.
-- O frontend consome essa view de forma anon.

CREATE OR REPLACE VIEW public.vw_encartes_publicos AS
SELECT 
    e.id AS encarte_id,
    e.empresa_operadora_id,
    e.cliente_id,
    c.razao_social AS cliente_nome,
    c.nome_fantasia AS cliente_fantasia,
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
                'preco_promocional', o.preco_promocional,
                'desconto_percentual', o.desconto_percentual,
                'preco_original', p.preco_venda,
                'produto_nome', p.nome,
                'produto_codigo', p.codigo,
                'imagem_url', p.imagem_url,
                'unidade_medida', p.unidade_medida,
                'ordem', ei.ordem,
                'destaque', ei.destaque
            ) ORDER BY ei.ordem ASC
        )
        FROM public.encarte_itens ei
        JOIN public.ofertas o ON o.id = ei.oferta_id
        JOIN public.produtos p ON p.id = o.produto_id
        WHERE ei.encarte_id = e.id AND o.status = 'ATIVA'
    ) AS ofertas
FROM public.encartes e
JOIN public.clientes c ON c.id = e.cliente_id
WHERE e.status = 'PUBLICADO' 
  AND (e.data_inicio IS NULL OR e.data_inicio <= NOW())
  AND (e.data_fim IS NULL OR e.data_fim >= NOW());

GRANT SELECT ON public.vw_encartes_publicos TO anon, authenticated;
