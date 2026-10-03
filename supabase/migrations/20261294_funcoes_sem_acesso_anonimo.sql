-- F-129 — Funções do banco que qualquer visitante anônimo podia executar sem nenhuma conferência de quem chama.
-- Achado (consultor de segurança do Supabase + revisão do corpo de cada função): com a chave pública do site dava para,
-- sem login, criar cobrança e tela para qualquer empresa, enfileirar tarefas, disparar a régua de cobrança de todas as
-- empresas, gerar cobranças recorrentes, apagar registros de exibição e ler uma cobrança ou uma tela pelo código.
-- Ficam abertas a anônimo só as que precisam (pareamento da tela, página pública da cobrança, Player).

-- A) Uso pelo painel (usuário logado): sai o acesso anônimo.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
              'content_seed_news_categories', 'content_seed_sports_competitions', 'criar_cobranca_tela', 'criar_tela_gestor',
              'enfileirar_job', 'processar_regua_cobranca', 'biblioteca_definir_capa', 'fn_gerar_numero_contrato_atomo',
              'fn_gerar_numero_pi', 'fn_gerar_numero_op', 'fn_obter_template_padrao', 'buscar_tela_por_codigo', 'get_screen_stats',
              'has_admin_permission', 'gerar_codigo_conta', 'gerar_codigo_tela', 'gerar_codigo_tela_novo', 'gerar_identificador_publico'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

-- B) Uso só do servidor (rotinas agendadas, funções internas e funções de borda): nem anônimo nem usuário logado.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS assinatura FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
              'fn_apurar_repasse_parceiro', 'gerar_cobrancas_recorrentes', 'gerar_numero_documento', 'purge_old_logs',
              'rpc_generate_monthly_billing', 'refresh_daily_stats', 'registrar_tentativa_job', 'fn_content_news_expirar',
              'buscar_conta_por_documento', 'fn_cliente_inadimplente_desde'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
  END LOOP;
END $$;

-- C) Conferência de quem chama dentro das funções que criam cobrança/tela e rodam a régua (antes: nenhuma).
--    A conferência é inserida logo após o primeiro BEGIN; o restante do corpo fica exatamente como estava.
--    Rotina agendada e servidor (sem usuário / service_role) continuam passando.
DO $$
DECLARE
  alvo record;
  v_def text;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('processar_regua_cobranca', $g$
  -- F-129: pelo painel, só a equipe e só da própria empresa
  IF auth.uid() IS NOT NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    IF public.fn_perfil_sem_gestao_de_telas() OR p_empresa_operadora_id IS NULL
       OR p_empresa_operadora_id IS DISTINCT FROM public.get_user_empresa_operadora_id(auth.uid()) THEN
      RAISE EXCEPTION 'Acesso negado: a régua de cobrança só pode ser executada pela equipe da própria empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;$g$),
      ('criar_cobranca_tela', $g$
  -- F-129: só logado, só para a própria empresa e para si mesmo (dono/administrador pode criar para outro usuário)
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado: é preciso estar logado.' USING ERRCODE = '42501'; END IF;
    IF p_empresa_operadora_id IS DISTINCT FROM public.get_user_empresa_operadora_id(auth.uid()) THEN
      RAISE EXCEPTION 'Acesso negado: cobrança de outra empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_gestor_user_id IS NOT NULL AND p_gestor_user_id <> auth.uid() AND NOT public.fn_eh_owner_ou_admin() THEN
      RAISE EXCEPTION 'Acesso negado: cobrança em nome de outro usuário.' USING ERRCODE = '42501';
    END IF;
  END IF;$g$),
      ('criar_tela_gestor', $g$
  -- F-129: só logado, só na própria empresa e para si mesmo (dono/administrador pode criar para outro usuário)
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado: é preciso estar logado.' USING ERRCODE = '42501'; END IF;
    IF p_empresa_operadora_id IS DISTINCT FROM public.get_user_empresa_operadora_id(auth.uid()) THEN
      RAISE EXCEPTION 'Acesso negado: tela de outra empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_usuario_id IS NOT NULL AND p_usuario_id <> auth.uid() AND NOT public.fn_eh_owner_ou_admin() THEN
      RAISE EXCEPTION 'Acesso negado: tela em nome de outro usuário.' USING ERRCODE = '42501';
    END IF;
  END IF;$g$)
    ) AS t(nome, guarda)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = alvo.nome;
    IF v_def IS NULL THEN RAISE EXCEPTION 'função % não encontrada', alvo.nome; END IF;
    IF position('F-129' IN v_def) = 0 THEN
      EXECUTE regexp_replace(v_def, '\mBEGIN\M', 'BEGIN' || alvo.guarda);
    END IF;
  END LOOP;
END $$;
