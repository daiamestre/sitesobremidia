-- Script COMPLETO para corrigir TODOS os avisos do Linter de Segurança do Postgres no Supabase
-- Copie e cole este script no SQL Editor e execute-o.

DO $$ 
DECLARE
    rec RECORD;
BEGIN
    ---------- 1. Corrigir: Visão do Definidor de Segurança (Security Definer Views) ----------
    -- O Linter recomenda que as views utilizem "security_invoker = true"
    FOR rec IN 
        SELECT table_schema, table_name 
        FROM information_schema.views 
        -- Pega TODAS as views listadas no painel
        WHERE table_name IN (
            'estatisticas_diarias_publicas', 
            'vw_monitoramento_industrial',
            'vw_popularidade_da_midia'
        )
    LOOP
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true);', rec.table_schema, rec.table_name);
        RAISE NOTICE 'View alterada com sucesso: %', rec.table_name;
    END LOOP;

    ---------- 2. Corrigir: Caminho de busca de função mutável (Mutable Function Search Path) ----------
    -- Funções com SECURITY DEFINER devem ter o "search_path" definido 
    -- Agora varrendo TODAS as funções customizadas no schema public que são SECURITY DEFINER
    FOR rec IN 
        SELECT n.nspname AS schema_name, p.proname AS func_name, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        -- Pega funções no schema public que usam SECURITY DEFINER (prosecdef = true)
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        -- Define o search_path de forma segura para empty string ('')
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = '''';', rec.schema_name, rec.func_name, rec.args);
        RAISE NOTICE 'Função mutável corrigida com sucesso: %', rec.func_name;
    END LOOP;

END $$;
