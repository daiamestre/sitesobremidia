-- F-168 — "Valor da mídia para anunciantes": a lista de anunciantes mostra CNPJ e cidade (há nomes repetidos, como
-- "Andreza Ameida") e a busca também acha pelo CNPJ. Só leitura; nada muda no Player.
-- ROLLBACK: recriar admin_midias_listar_clientes com a definição de 20261312.
CREATE OR REPLACE FUNCTION public.admin_midias_listar_clientes(p_busca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant uuid := public.fn_midias_exigir_admin();
    v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
    v_digitos text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
BEGIN
    RETURN jsonb_build_object(
        'valor_padrao', coalesce((SELECT valor FROM public.playlist_midia_preco_padrao WHERE empresa_operadora_id = v_tenant), 19.99),
        'clientes', coalesce((
            SELECT jsonb_agg(x ORDER BY x->>'nome') FROM (
                SELECT jsonb_build_object(
                    'cliente_id', c.id,
                    'nome', coalesce(nullif(btrim(e.nome_fantasia), ''), nullif(btrim(e.razao_social), ''), 'Anunciante sem nome'),
                    'documento', nullif(btrim(coalesce(e.cnpj, '')), ''),
                    'cidade', nullif(btrim(coalesce(e.cidade, '')), ''),
                    'valor', public.fn_valor_midia_cliente(c.id),
                    'valor_personalizado', EXISTS (SELECT 1 FROM public.cliente_preco_midia p WHERE p.cliente_id = c.id),
                    'gratis_restantes', coalesce((SELECT sum(l.quantidade - l.usadas) FROM public.cliente_midias_liberadas l
                                                   WHERE l.cliente_id = c.id AND l.cancelado_em IS NULL), 0),
                    'playlists', (SELECT count(*) FROM public.playlists_cliente pl WHERE pl.cliente_id = c.id)) AS x
                  FROM public.clientes c
                  LEFT JOIN LATERAL (SELECT em.nome_fantasia, em.razao_social, em.cnpj, em.cidade FROM public.empresas em WHERE em.cliente_id = c.id LIMIT 1) e ON true
                 WHERE c.empresa_operadora_id = v_tenant
                   AND (v_busca IS NULL
                        OR coalesce(e.nome_fantasia, '') ILIKE '%' || v_busca || '%'
                        OR coalesce(e.razao_social, '') ILIKE '%' || v_busca || '%'
                        OR (length(v_digitos) >= 3 AND regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') LIKE '%' || v_digitos || '%'))
                 LIMIT 500) q), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_listar_clientes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_listar_clientes(text) TO authenticated;
