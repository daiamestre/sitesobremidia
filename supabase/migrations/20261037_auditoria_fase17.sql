-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261036
-- Estende auditoria_logs_acao_check com os eventos da FASE 17
-- (publicação/despublicação de playlists no Player) — aditivo.
-- ======================================================================

ALTER TABLE public.auditoria_logs
DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;

ALTER TABLE public.auditoria_logs
ADD CONSTRAINT auditoria_logs_acao_check CHECK (
    ((acao)::text = ANY ((
        ARRAY[
            -- Vocabulário constitucional e de fases anteriores (preservado)
            'INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN',
            'USER_CREATED','USER_UPDATED','USER_ACTIVATED','USER_DEACTIVATED',
            'USER_ROLE_CHANGED','USER_PERMISSIONS_CHANGED',
            'USER_INVITE_SENT','USER_INVITE_RESENT','USER_ACCESS_REVOKED',
            'AUTONOMY_GRANTED','AUTONOMY_REVOKED',
            'REPRESENTANTE_UPDATED','REPRESENTANTE_ACTIVATED','REPRESENTANTE_DEACTIVATED',
            'CLIENTE_REPRESENTANTE_CHANGED',
            'USER_PROVISIONED',
            'PASSWORD_CHANGED',
            'PASSWORD_RESET_REQUESTED','PASSWORD_RESET_AUTHORIZED',
            'PASSWORD_RESET_REJECTED','PASSWORD_RESET_CREDENTIAL_ISSUED',
            'PLAYLIST_CRIADA','ITEM_ADICIONADO','COBRANCA_VIDEO_GERADA',
            'NOVO_PONTO_SOLICITADO',
            -- FASE 17 — distribuição ao Player
            'PLAYLIST_PUBLICADA_PLAYER','PLAYLIST_PUBLICADA_PONTO','PLAYLIST_DESPUBLICADA_PONTO'
        ])::text[]))
);

DO $$
DECLARE def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conname='auditoria_logs_acao_check';
    IF NOT (def LIKE '%PLAYLIST_PUBLICADA_PONTO%' AND def LIKE '%PLAYLIST_DESPUBLICADA_PONTO%') THEN
        RAISE EXCEPTION 'GATE: eventos da Fase 17 ausentes na constraint.';
    END IF;
END $$;
