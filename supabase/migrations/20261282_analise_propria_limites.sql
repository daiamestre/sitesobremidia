-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261282 — F-111
-- Análise própria de mídia (sem IA externa) e limites de duração:
--   * anunciante: vídeo até 20 s (antes 30 s);
--   * gestor de mídia: vídeo/áudio até 30 s nas telas dele (OWNER/ADMIN sem limite);
--   * cliente_assets.moderacao_detalhes: relatório do analisador (quadros, fala, textos);
--   * fn_midias_em_analise devolve o relatório para a fila da equipe.
-- ROLLBACK: reaplicar trg_fn_cliente_assets_moderacao e fn_midias_em_analise de 20261280;
--   DROP TRIGGER trg_media_limite_gestor ON public.media; DROP FUNCTION trg_fn_media_limite_gestor();
--   ALTER TABLE public.cliente_assets DROP COLUMN moderacao_detalhes.
-- ======================================================================

ALTER TABLE public.cliente_assets ADD COLUMN IF NOT EXISTS moderacao_detalhes jsonb;

CREATE OR REPLACE FUNCTION public.trg_fn_cliente_assets_moderacao()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo NOT IN ('imagem', 'video') THEN
      NEW.moderacao_status := 'NAO_SE_APLICA';
    ELSIF NEW.tipo = 'video' AND coalesce(NEW.duracao, 0) > 20.5 THEN
      NEW.moderacao_status := 'RECUSADA';
      NEW.moderacao_motivo := 'Vídeo com mais de 20 segundos.';
      NEW.moderacao_por := 'SISTEMA';
      NEW.moderacao_em := now();
    ELSE
      NEW.moderacao_status := 'PENDENTE';  -- quem envia nunca escolhe o resultado
      NEW.moderacao_motivo := NULL; NEW.moderacao_por := NULL; NEW.moderacao_em := NULL;
    END IF;
    NEW.moderacao_detalhes := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE: resultado da análise só pelo analisador (service_role, sem auth.uid) ou OWNER/ADMIN
  IF (NEW.moderacao_status IS DISTINCT FROM OLD.moderacao_status OR NEW.moderacao_motivo IS DISTINCT FROM OLD.moderacao_motivo
      OR NEW.moderacao_por IS DISTINCT FROM OLD.moderacao_por OR NEW.object_url IS DISTINCT FROM OLD.object_url
      OR NEW.duracao IS DISTINCT FROM OLD.duracao OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.moderacao_detalhes IS DISTINCT FROM OLD.moderacao_detalhes)
     AND auth.uid() IS NOT NULL AND NOT public.fn_eh_owner_ou_admin() THEN
    RAISE EXCEPTION 'A análise da mídia só é feita pelo sistema.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Gestor de mídia: vídeo/áudio de até 30 s (só no envio; mídias antigas não mudam)
CREATE OR REPLACE FUNCTION public.trg_fn_media_limite_gestor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(NEW.duration_ms, 0) > 30500
     AND EXISTS (SELECT 1 FROM public.usuarios u JOIN public.perfis p ON p.id = u.perfil_id
                  WHERE u.id = auth.uid() AND upper(p.nome) = 'GESTOR' AND NOT coalesce(u.is_owner, false)) THEN
    RAISE EXCEPTION 'Gestor de mídia pode enviar vídeos de até 30 segundos.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_media_limite_gestor ON public.media;
CREATE TRIGGER trg_media_limite_gestor BEFORE INSERT ON public.media
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_media_limite_gestor();

CREATE OR REPLACE FUNCTION public.fn_midias_em_analise()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN NOT public.fn_eh_owner_ou_admin() THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'url', a.object_url, 'quadros', a.quadros,
             'duracao', a.duracao, 'status', a.moderacao_status, 'motivo', a.moderacao_motivo, 'enviada_em', a.created_at,
             'detalhes', a.moderacao_detalhes,
             'cliente', (SELECT coalesce(e.nome_fantasia, e.razao_social) FROM public.empresas e WHERE e.cliente_id = a.cliente_id LIMIT 1))
           ORDER BY a.created_at)
      FROM public.cliente_assets a
     WHERE a.empresa_operadora_id = public.get_user_tenant_id() AND a.moderacao_status IN ('PENDENTE', 'EM_ANALISE_MANUAL')), '[]'::jsonb) END;
$$;
REVOKE ALL ON FUNCTION public.fn_midias_em_analise() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_midias_em_analise() TO authenticated;
