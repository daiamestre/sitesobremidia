-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261029
-- Estende auditoria_logs_acao_check com os eventos do Portal do
-- Anunciante e dos fluxos de senha (lista original preservada).
-- ======================================================================

ALTER TABLE public.auditoria_logs
DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;

ALTER TABLE public.auditoria_logs
ADD CONSTRAINT auditoria_logs_acao_check CHECK (
    ((acao)::text = ANY ((
        ARRAY[
            -- Vocabulário original (preservado integralmente)
            'INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN',
            'USER_CREATED','USER_UPDATED','USER_ACTIVATED','USER_DEACTIVATED',
            'USER_ROLE_CHANGED','USER_PERMISSIONS_CHANGED',
            'USER_INVITE_SENT','USER_INVITE_RESENT','USER_ACCESS_REVOKED',
            'AUTONOMY_GRANTED','AUTONOMY_REVOKED',
            'REPRESENTANTE_UPDATED','REPRESENTANTE_ACTIVATED','REPRESENTANTE_DEACTIVATED',
            'CLIENTE_REPRESENTANTE_CHANGED',
            -- Portal do Anunciante / Central de Acessos (missão)
            'USER_PROVISIONED',
            'PASSWORD_CHANGED',
            'PASSWORD_RESET_REQUESTED','PASSWORD_RESET_AUTHORIZED',
            'PASSWORD_RESET_REJECTED','PASSWORD_RESET_CREDENTIAL_ISSUED',
            -- Playlists do anunciante (regra R$19,99)
            'PLAYLIST_CRIADA','ITEM_ADICIONADO','COBRANCA_VIDEO_GERADA',
            -- Expansão pontual
            'NOVO_PONTO_SOLICITADO'
        ])::text[]))
);

-- GATE: os novos eventos precisam estar presentes na constraint final
DO $$
DECLARE def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conname='auditoria_logs_acao_check';
    IF NOT (def LIKE '%USER_PROVISIONED%' AND def LIKE '%PASSWORD_RESET_REQUESTED%' AND def LIKE '%COBRANCA_VIDEO_GERADA%') THEN
        RAISE EXCEPTION 'GATE: constraint de acao não contém os novos eventos.';
    END IF;
END $$;
