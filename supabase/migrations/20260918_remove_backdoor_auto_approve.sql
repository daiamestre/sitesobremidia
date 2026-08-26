-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20260918
-- REMOÇÃO DO BACKDOOR DE APROVAÇÃO AUTOMÁTICA (P0.1)
-- ----------------------------------------------------------------------
-- PROBLEMA: Trigger 'auto_approve_jairaniran' na tabela public.profiles
-- executava a função auto_approve_specific_user(), que aprovava
-- automaticamente qualquer conta criada com o e-mail
-- 'jairaniran2@gmail.com', bypassing o fluxo oficial de aprovação.
--
-- IMPACTO: Violação crítica de segurança. Qualquer pessoa com acesso
-- ao e-mail poderia criar uma conta aprovada sem autorização do admin.
--
-- AÇÃO: Remover trigger e função. O fluxo oficial de aprovação é:
--   1. Cadastro → solicitacoes_acesso (status PENDING)
--   2. Admin recebe e-mail via send-approval-notification
--   3. Admin aprova via link seguro → handle-approval Edge Function
--   4. handle-approval valida token SHA-256, single-use, com expiração
--   5. Status atualizado para APPROVED
--   6. Registro criado em public.usuarios (M2)
--
-- Idempotente: DROP ... IF EXISTS garante segurança de re-execução.
-- ======================================================================

-- 1. Remover o trigger que ativava o backdoor na tabela profiles
DROP TRIGGER IF EXISTS auto_approve_jairaniran ON public.profiles;

-- 2. Remover a função backdoor
DROP FUNCTION IF EXISTS public.auto_approve_specific_user();

-- 3. Registrar remoção no auditoria_logs via SQL direto (sem usuário autenticado)
-- Nota: inserção técnica de auditoria do sistema — responsavel_id = NULL é intencional
-- pois a migration executa fora do contexto de um usuário autenticado.
INSERT INTO public.auditoria_logs (
  empresa_operadora_id,
  usuario_id,
  usuario_email,
  usuario_role,
  entidade_tipo,
  entidade_id,
  acao,
  status_novo,
  observacoes,
  created_at
)
SELECT
  eo.id,
  NULL,
  'system@sobremidia.com.br',
  'SYSTEM',
  'SECURITY',
  gen_random_uuid(),
  'BACKDOOR_REMOVED',
  'RESOLVED',
  'Backdoor auto_approve_specific_user e trigger auto_approve_jairaniran removidos via migration 20260918. Fluxo de aprovação oficial preservado via handle-approval Edge Function.',
  NOW()
FROM public.empresa_operadora eo
LIMIT 1;

-- ======================================================================
-- VERIFICAÇÃO: após aplicar esta migration, confirmar no banco que:
--   SELECT COUNT(*) FROM pg_trigger
--   WHERE tgname = 'auto_approve_jairaniran'; → deve retornar 0
--
--   SELECT COUNT(*) FROM pg_proc
--   WHERE proname = 'auto_approve_specific_user'; → deve retornar 0
-- ======================================================================
