-- 20260817_contratos_rls_fluxo_real.sql
-- Fluxo REAL do módulo de contratos: habilita o REPRESENTANTE a executar o fluxo
-- completo (seleção de modelo, geração de PDF, envio para assinatura e assinatura)
-- e adiciona as policies ausentes de RLS em contrato_versoes (RLS habilitada em 008
-- sem nenhuma policy → INSERT/SELECT bloqueados para todos via REST).

-- 1. ctr_write_policy: REPRESENTANTE pode INSERT/UPDATE APENAS contratos próprios
DROP POLICY IF EXISTS "ctr_write_policy" ON public.contratos;

CREATE POLICY "ctr_write_policy" ON public.contratos
  FOR ALL
  USING (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
      OR (
        public.get_user_role() = 'REPRESENTANTE'
        AND representante_id = public.get_user_representante_id()
      )
    )
  )
  WITH CHECK (
    empresa_operadora_id = (
      SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    )
    AND (
      public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
      OR (
        public.get_user_role() = 'REPRESENTANTE'
        AND representante_id = public.get_user_representante_id()
      )
    )
  );

-- 2. contrato_versoes: policies de SELECT e INSERT (espelham o acesso a contratos)
ALTER TABLE public.contrato_versoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrato_versoes' AND policyname = 'cv_select_policy'
  ) THEN
    CREATE POLICY cv_select_policy ON public.contrato_versoes
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.contratos c
          WHERE c.id = contrato_id
          AND (
            (
              c.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
              AND (
                public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
                OR c.representante_id = public.get_user_representante_id()
              )
            )
            OR (
              public.get_user_role() = 'CLIENTE'
              AND c.cliente_id = (SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
              AND c.cliente_id IS NOT NULL
            )
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contrato_versoes' AND policyname = 'cv_insert_policy'
  ) THEN
    CREATE POLICY cv_insert_policy ON public.contrato_versoes
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.contratos c
          WHERE c.id = contrato_id
          AND c.empresa_operadora_id = (SELECT empresa_operadora_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1)
          AND (
            public.get_user_role() IN ('OWNER', 'ADMIN', 'GESTOR', 'GERENTE', 'SUPERVISOR', 'FINANCEIRO', 'OPERACIONAL', 'FUNCIONARIO')
            OR (
              public.get_user_role() = 'REPRESENTANTE'
              AND c.representante_id = public.get_user_representante_id()
            )
          )
        )
      );
  END IF;
END $$;
