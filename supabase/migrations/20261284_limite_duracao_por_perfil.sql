-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261284 — F-114
-- Limite de duração no envio de mídias do painel (tabela media), por perfil:
--   ANUNCIANTE/CLIENTE até 20 s · GESTOR até 30 s · OWNER/ADMIN e demais sem limite.
-- (Portal do anunciante já limitava 20 s em cliente_assets — 20261282.)
-- ROLLBACK: reaplicar trg_fn_media_limite_gestor de 20261282.
-- ======================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_media_limite_gestor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_perfil text; v_owner boolean;
BEGIN
  IF auth.uid() IS NULL OR coalesce(NEW.duration_ms, 0) <= 20500 THEN RETURN NEW; END IF;
  SELECT upper(coalesce(p.nome, '')), coalesce(u.is_owner, false) INTO v_perfil, v_owner
    FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = auth.uid();
  IF v_owner THEN RETURN NEW; END IF;
  IF v_perfil IN ('ANUNCIANTE', 'CLIENTE') THEN
    RAISE EXCEPTION 'Anunciante pode enviar vídeos de até 20 segundos.' USING ERRCODE = '22023';
  ELSIF v_perfil = 'GESTOR' AND NEW.duration_ms > 30500 THEN
    RAISE EXCEPTION 'Gestor de mídia pode enviar vídeos de até 30 segundos.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
