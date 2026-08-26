-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261027
-- Pontos CONTRATADOS do anunciante (para playlists, Meus Pontos e KPIs)
-- Fonte: contratos ativos → contrato_estabelecimentos → pontos(unidade_id)
-- ======================================================================

CREATE OR REPLACE FUNCTION public.listar_pontos_contratados()
RETURNS TABLE(
    ponto_id UUID, nome TEXT, categoria TEXT,
    cidade TEXT, estado TEXT, bairro TEXT, logradouro TEXT,
    foto_url TEXT, quantidade_telas INT,
    valor_unitario NUMERIC, contrato_id UUID,
    contrato_status TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT po.id, po.nome, po.categoria,
           po.cidade, po.estado, po.bairro, po.logradouro,
           po.foto_url, po.quantidade_telas,
           ce.valor_unitario, k.id, k.status_workflow
    FROM public.pontos po
    JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
    JOIN public.contratos k ON k.id = ce.contrato_id
    WHERE po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
      AND po.ativo
      AND po.deleted_at IS NULL
      AND k.cliente_id = public.get_user_cliente_id()
      AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
    ORDER BY po.nome;
$$;

REVOKE ALL ON FUNCTION public.listar_pontos_contratados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_pontos_contratados() TO authenticated;

-- Contagens agregadas para o dashboard do anunciante (KPIs da missão §18)
CREATE OR REPLACE FUNCTION public.get_kpis_portal_anunciante()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_cliente UUID := public.get_user_cliente_id();
    v_tenant UUID;
    result JSON;
BEGIN
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;

    SELECT json_build_object(
        'meus_pontos', (
            SELECT COUNT(*)
            FROM public.pontos po
            JOIN public.contrato_estabelecimentos ce ON ce.unidade_id = po.unidade_id
            JOIN public.contratos k ON k.id = ce.contrato_id
            WHERE k.cliente_id = v_cliente
              AND po.ativo
              AND k.status_workflow IN ('EM_PRODUCAO','AGUARDANDO_APROVACAO','CAMPANHA_APROVADA','CAMPANHA_ATIVA')
        ),
        'campanhas_ativas', (
            SELECT COUNT(*) FROM public.campanhas
            WHERE cliente_id = v_cliente
              AND status IN ('APPROVED','ACTIVE','REVIEW')
        ),
        'midias_ativas', (
            SELECT COUNT(*) FROM public.cliente_assets
            WHERE cliente_id = v_cliente
        ),
        'playlists', (
            SELECT COUNT(*) FROM public.playlists_cliente
            WHERE cliente_id = v_cliente AND status = 'ATIVA'
        ),
        'pontos_para_anunciar', (
            SELECT COUNT(*) FROM public.pontos
            WHERE empresa_operadora_id = v_tenant
              AND ativo AND disponibilidade = 'DISPONIVEL' AND deleted_at IS NULL
        )
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_kpis_portal_anunciante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpis_portal_anunciante() TO authenticated;
