-- 2026-08-14 (b) — Policy de UPDATE em assinaturas (equipe do tenant)
-- O cancelamento manual (cancelEnvelope) e o processamento de webhook de
-- provedor externo atualizam diretamente public.assinaturas com o JWT do
-- usuário autenticado. Sem esta policy o UPDATE é bloqueado pelo RLS.

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'p_update_assinaturas') THEN
    CREATE POLICY p_update_assinaturas ON public.assinaturas FOR UPDATE TO authenticated
    USING (
      empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
      AND public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO', 'REPRESENTANTE')
    );
  END IF;
END $$;
