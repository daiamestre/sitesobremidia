-- ======================================================================
-- SOBRE MÍDIA — MIGRATION 20261049
-- CORRETIVA: empresas.cnpj volta a ser NULLABLE (drift vs 20260818)
--
-- O ledger registra 20260818_cnpj_cpf_optional como aplicada, porém a
-- coluna empresas.cnpj está novamente NOT NULL no banco vivo (restaurada
-- fora do sistema de migrations). Consequência auditada em produção:
--   fn_cadastrar_cliente_atomo → INSERT em empresas com p_cnpj NULL
--   → "null value in column cnpj violates not-null constraint"
--   → cadastro de ANUNCIANTE sem documento falha no fechamento comercial.
--
-- Repete o DROP NOT NULL de 20260818 de forma idempotente. O UNIQUE
-- empresas_cnpj_key é mantido (PostgreSQL trata NULLs como distintos).
-- ======================================================================

ALTER TABLE public.empresas ALTER COLUMN cnpj DROP NOT NULL;

-- GATE: coluna precisa aceitar NULL
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM information_schema.columns
    WHERE table_schema='public' AND table_name='empresas' AND column_name='cnpj' AND is_nullable='YES';
    IF n <> 1 THEN RAISE EXCEPTION 'GATE: empresas.cnpj segue NOT NULL.'; END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261049','empresas_cnpj_nullable_corretiva','{}')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;

NOTIFY pgrst, 'reload schema';
