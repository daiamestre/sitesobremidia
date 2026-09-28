CREATE OR REPLACE FUNCTION public.portal_ponto_parceiro(p_ponto uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
      'id', po.id, 'nome', po.nome, 'categoria', po.categoria, 'descricao', po.descricao,
      'foto_url', po.foto_url, 'galeria', po.galeria,
      'onde_ficam_as_telas', po.onde_ficam_as_telas,
      'cep', po.cep, 'logradouro', po.logradouro, 'numero', po.numero, 'complemento', po.complemento,
      'bairro', po.bairro, 'cidade', po.cidade, 'estado', po.estado,
      'latitude', po.latitude, 'longitude', po.longitude,
      'horario_funcionamento', po.horario_funcionamento, 'publico_estimado_dia', po.publico_estimado_dia,
      'valor_anuncio', po.valor_anuncio, 'periodicidade', po.periodicidade,
      'quantidade_telas', po.quantidade_telas, 'regras_comerciais', po.regras_comerciais,
      'telas_conectadas', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id),
      'telas_online', (SELECT count(*) FROM public.screens s WHERE s.ponto_id = po.id AND s.is_active AND s.last_ping_at > now() - interval '5 minutes'),
      'meus_anuncios', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'status', pa.status, 'asset_id', pa.asset_id,
                                            'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'desde', pa.created_at)
                         ORDER BY pa.created_at DESC)
          FROM public.ponto_anuncios pa JOIN public.cliente_assets a ON a.id = pa.asset_id
         WHERE pa.ponto_id = po.id AND pa.cliente_id = public.get_user_cliente_id()), '[]'::jsonb)
    )
  FROM public.pontos po
  WHERE po.id = p_ponto
    AND po.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
    AND po.ativo AND po.deleted_at IS NULL;
$function$;
