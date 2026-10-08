-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261313 — F-167
-- Avisos: respeitar o que o usuário já viu, e dispensar sem apagar.
--
-- Achados (dados reais):
--   * 205 avisos de cobrança (lembrete, vence hoje, atraso) estavam NÃO LIDOS e nada os baixava quando a fatura era paga.
--   * Dono/ADM enxergam (RLS) os avisos dos clientes; "marcar todas como lidas" do painel atualizava os avisos de TODOS.
--   * Os alertas da faixa do topo ("14 faturas vencidas", "2 mensagens não lidas") não tinham como ser dispensados.
--
-- Agora:
--   * notificacoes_central.dispensada_em: o usuário "exclui" o aviso — ele continua gravado (e quem administra continua
--     vendo quando foi lido), mas some da tela dele. Só o dono do aviso dispensa/lê (RPC confere auth.uid()).
--   * Fatura paga/cancelada baixa sozinha os avisos de cobrança dela (gatilho em contas_receber).
--   * aviso_visto: o alerta calculado da faixa (faturas vencidas, mensagens etc.) fica visto por usuário + assinatura
--     (texto do alerta). Volta sozinho se a situação mudar (nova fatura vencida, outro número).
--
-- Player: nada muda.
-- ROLLBACK: DROP TRIGGER tg_fatura_quitada_resolve_avisos ON contas_receber; DROP FUNCTION das funções novas;
--   DROP TABLE aviso_visto; ALTER TABLE notificacoes_central DROP COLUMN dispensada_em.
-- ======================================================================

ALTER TABLE public.notificacoes_central ADD COLUMN IF NOT EXISTS dispensada_em timestamptz;
CREATE INDEX IF NOT EXISTS ix_nc_usuario_ativas ON public.notificacoes_central (usuario_id, created_at DESC) WHERE dispensada_em IS NULL;

-- ---------------------------------------------------------------- avisos guardados: ler / dispensar (só os do próprio usuário)
CREATE OR REPLACE FUNCTION public.central_notificacoes_marcar_lidas(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    IF auth.uid() IS NULL THEN RETURN 0; END IF;
    UPDATE public.notificacoes_central
       SET lida = true, status_notificacao = 'LIDA', lida_em = coalesce(lida_em, now())
     WHERE usuario_id = auth.uid() AND canal = 'IN_APP' AND status_notificacao = 'NAO_LIDA'
       AND (p_ids IS NULL OR id = ANY (p_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.central_notificacoes_marcar_lidas(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_notificacoes_marcar_lidas(uuid[]) TO authenticated;

-- "Excluir" = dar o aviso por lido e tirá-lo da tela do usuário. Nada é apagado.
CREATE OR REPLACE FUNCTION public.central_notificacoes_dispensar(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    IF auth.uid() IS NULL THEN RETURN 0; END IF;
    UPDATE public.notificacoes_central
       SET lida = true,
           status_notificacao = CASE WHEN status_notificacao = 'NAO_LIDA' THEN 'LIDA' ELSE status_notificacao END,
           lida_em = coalesce(lida_em, now()),
           dispensada_em = now()
     WHERE usuario_id = auth.uid() AND canal = 'IN_APP' AND dispensada_em IS NULL
       AND (p_ids IS NULL OR id = ANY (p_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.central_notificacoes_dispensar(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_notificacoes_dispensar(uuid[]) TO authenticated;

-- ---------------------------------------------------------------- fatura paga/cancelada baixa os avisos de cobrança dela
CREATE OR REPLACE FUNCTION public.tg_fatura_quitada_resolve_avisos()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.status IN ('PAGA', 'PAGO', 'CANCELADA', 'CANCELADO') AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE public.notificacoes_central
           SET lida = true, status_notificacao = 'RESOLVIDA', resolvida_em = now(),
               lida_em = coalesce(lida_em, now()), dispensada_em = now()
         WHERE entidade_relacionada_tipo = 'CONTA_RECEBER' AND entidade_relacionada_id = NEW.id
           AND tipo_evento LIKE 'FATURA_COLECTION_%' AND tipo_evento <> 'FATURA_COLECTION_PAID'
           AND dispensada_em IS NULL;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_fatura_quitada_resolve_avisos ON public.contas_receber;
CREATE TRIGGER tg_fatura_quitada_resolve_avisos AFTER UPDATE OF status ON public.contas_receber
    FOR EACH ROW EXECUTE FUNCTION public.tg_fatura_quitada_resolve_avisos();

-- o que já ficou para trás: fatura quitada com aviso de cobrança ainda aberto
UPDATE public.notificacoes_central n
   SET lida = true, status_notificacao = 'RESOLVIDA', resolvida_em = now(), lida_em = coalesce(n.lida_em, now()), dispensada_em = now()
  FROM public.contas_receber cr
 WHERE n.entidade_relacionada_tipo = 'CONTA_RECEBER' AND n.entidade_relacionada_id = cr.id
   AND n.tipo_evento LIKE 'FATURA_COLECTION_%' AND n.tipo_evento <> 'FATURA_COLECTION_PAID'
   AND cr.status IN ('PAGA', 'PAGO', 'CANCELADA', 'CANCELADO') AND n.dispensada_em IS NULL;

-- ---------------------------------------------------------------- alertas calculados da faixa do topo: visto por usuário
CREATE TABLE IF NOT EXISTS public.aviso_visto (
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    chave text NOT NULL CHECK (char_length(chave) BETWEEN 1 AND 80),
    assinatura text NOT NULL CHECK (char_length(assinatura) <= 300),
    visto_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, chave)
);
ALTER TABLE public.aviso_visto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aviso_visto FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aviso_registrar_visto(p_chave text, p_assinatura text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL OR nullif(btrim(coalesce(p_chave, '')), '') IS NULL THEN RETURN false; END IF;
    INSERT INTO public.aviso_visto (usuario_id, chave, assinatura, visto_em)
    SELECT u.id, left(btrim(p_chave), 80), left(coalesce(p_assinatura, ''), 300), now()
      FROM public.usuarios u WHERE u.id = auth.uid()
    ON CONFLICT (usuario_id, chave) DO UPDATE SET assinatura = EXCLUDED.assinatura, visto_em = now();
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.aviso_registrar_visto(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aviso_registrar_visto(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.aviso_listar_vistos()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object('chave', v.chave, 'assinatura', v.assinatura)), '[]'::jsonb)
      FROM public.aviso_visto v WHERE v.usuario_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.aviso_listar_vistos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aviso_listar_vistos() TO authenticated;
