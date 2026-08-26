-- ======================================================================
-- SOBRE MÍDIA - MIGRATION 20261024: CATÁLOGO DE EVENTOS DE USUÁRIO
-- ----------------------------------------------------------------------
-- A auditoria (Fase 1/G3 + Fase 2) identificou que os templates
-- USER_REGISTERED / USER_INVITED / USER_APPROVED / USER_REJECTED /
-- USER_CONFIRMED / PASSWORD_RESET existem em comunicacao_templates,
-- mas seus eventos NÃO constam no comunicacao_eventos_catalogo.
-- Esta migration é ADITIVA e IDEMPOTENTE: apenas registra os eventos
-- já praticados pela plataforma. Nada é removido ou alterado.
-- ======================================================================

INSERT INTO public.comunicacao_eventos_catalogo
  (event_name, domain, descricao, payload_schema, canais_habilitados, template_key_padrao, prioridade, max_tentativas, backoff_segundos, tenant_scope, ativo)
VALUES
  ('USER_REGISTERED', 'auth',
   'Convite de boas-vindas: usuário criado, deve definir a própria senha',
   '{}'::jsonb, ARRAY['email','in_app'], 'user_registered', 'ALTO', 5, 300, 'TENANT', true),
  ('USER_INVITED', 'auth',
   'Usuário convidado para acessar a plataforma',
   '{}'::jsonb, ARRAY['email','in_app'], 'user_invited', 'NORMAL', 3, 300, 'TENANT', true),
  ('USER_APPROVED', 'auth',
   'Solicitação de acesso aprovada',
   '{}'::jsonb, ARRAY['email','in_app'], 'user_approved', 'NORMAL', 3, 300, 'TENANT', true),
  ('USER_REJECTED', 'auth',
   'Solicitação de acesso recusada',
   '{}'::jsonb, ARRAY['email'], 'user_rejected', 'NORMAL', 3, 300, 'TENANT', true),
  ('USER_CONFIRMED', 'auth',
   'Confirmação de cadastro concluída',
   '{}'::jsonb, ARRAY['email','in_app'], 'user_confirmed', 'BAIXO', 2, 300, 'TENANT', true),
  ('PASSWORD_RESET', 'auth',
   'Recuperação/redefinição de senha solicitada',
   '{}'::jsonb, ARRAY['email'], 'password_reset', 'ALTO', 5, 300, 'TENANT', true)
ON CONFLICT (event_name) DO NOTHING;

-- Verificação interna: os eventos obrigatórios devem existir
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(e, ', ') INTO v_missing
  FROM unnest(ARRAY['USER_REGISTERED','USER_INVITED','USER_APPROVED','USER_REJECTED','USER_CONFIRMED','PASSWORD_RESET']) AS req(e)
  WHERE NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos_catalogo c WHERE c.event_name = req.e);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '[COMMUNICATION] Eventos ausentes no catalogo: %', v_missing;
  END IF;
END $$;
