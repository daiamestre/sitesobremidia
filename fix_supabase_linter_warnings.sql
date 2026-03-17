-- Script para corrigir avisos do Linter de Segurança do Postgres no Supabase
-- Copie e cole este script no SQL Editor do seu projeto Supabase e execute-o.

DO $$ 
DECLARE
    rec RECORD;
BEGIN
    ---------- 1. Corrigir: Visão do Definidor de Segurança (Security Definer Views) ----------
    -- O Linter recomenda que as views utilizem "security_invoker = true"
    -- para que respeitem as políticas de RLS e as permissões de quem faz a consulta.
    FOR rec IN 
        SELECT table_schema, table_name 
        FROM information_schema.views 
        WHERE table_name IN ('estatisticas_diarias_publicas', 'vw_popularidade_da_midia', 'vw_monitoramento_industrial')
    LOOP
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true);', rec.table_schema, rec.table_name);
        RAISE NOTICE 'View alterada com sucesso: %', rec.table_name;
    END LOOP;

    ---------- 2. Corrigir: Caminho de busca de função mutável (Mutable Function Search Path) ----------
    -- Funções com SECURITY DEFINER devem ter o "search_path" definido explicitamente 
    -- para evitar injeção e comportamento inesperado. A recomendação é usar search_path = ''
    FOR rec IN 
        SELECT n.nspname AS schema_name, p.proname AS func_name, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname IN ('excluir_logs_antigos', 'handle_device_timeout', 'handle_screen_activation')
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = '''';', rec.schema_name, rec.func_name, rec.args);
        RAISE NOTICE 'Função alterada com sucesso: %', rec.func_name;
    END LOOP;

    ---------- 3. Corrigir (Opcional): Extensão em public ----------
    -- O linter também aponta a extensão "pg_net" no schema "public". O ideal é movê-la para o schema "extensions"
    -- Se o schema "extensions" for o padrão do seu Supabase, descomente o bloco abaixo para corrigir.
    
    -- CREATE SCHEMA IF NOT EXISTS extensions;
    -- ALTER EXTENSION pg_net SET SCHEMA extensions;
    
END $$;
