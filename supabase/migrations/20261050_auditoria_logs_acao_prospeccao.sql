-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261050
-- CORRETIVA: auditoria_logs.acao comporta ações da Central de Prospecção
--
-- Causa raiz auditada (RPC selecionar_pontos_prospeccao → HTTP 400
-- 22001 "value too long for type character varying(30)"):
--   a ação 'PROSPECCAO_PONTOS_SINCRONIZADOS' tem 31 caracteres e a coluna
--   auditoria_logs.acao é VARCHAR(30). Além disso o CHECK
--   auditoria_logs_acao_check (20261037) não conhece o vocabulário da
--   prospecção — bloqueando o fechamento comercial ANUNCIANTE↔PONTOS.
--
-- Correção aditiva e idempotente:
--   * acao → VARCHAR(60) (comporta vocabulário constitucional atual);
--   * CHECK estendido com as ações da prospecção (histórico preservado).
-- ======================================================================

ALTER TABLE public.auditoria_logs ALTER COLUMN acao TYPE VARCHAR(60);

ALTER TABLE public.auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;

ALTER TABLE public.auditoria_logs ADD CONSTRAINT auditoria_logs_acao_check CHECK (
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
            'PLAYLIST_PUBLICADA_PLAYER','PLAYLIST_PUBLICADA_PONTO','PLAYLIST_DESPUBLICADA_PONTO',
            -- CENTRAL DE PROSPECÇÃO do Representante
            'PROSPECCAO_PONTOS_SINCRONIZADOS','PROSPECCAO_GESTOR_PROVISIONADO',
            'PONTO_PARCEIRO_CADASTRADO'
        ])::text[]))
);

-- GATE: coluna alargada + ação da prospecção aceita
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM information_schema.columns
    WHERE table_schema='public' AND table_name='auditoria_logs'
      AND column_name='acao' AND character_maximum_length >= 60;
    IF n <> 1 THEN RAISE EXCEPTION 'GATE: acao segue VARCHAR(30).'; END IF;

    BEGIN
        INSERT INTO public.auditoria_logs
            (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id,
             acao, status_novo, observacoes)
        VALUES (NULL, NULL, 'MIGRATION', NULL,
                'PROSPECCAO_PONTOS_SINCRONIZADOS', 'ATIVO', 'gate 20261050');
        DELETE FROM public.auditoria_logs WHERE observacoes = 'gate 20261050';
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'GATE: insert de prova falhou: %', SQLERRM;
    END;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261050','auditoria_logs_acao_prospeccao','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';
