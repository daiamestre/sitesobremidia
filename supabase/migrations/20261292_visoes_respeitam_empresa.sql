-- F-126 — Visões que ignoravam a proteção por empresa (consultor de segurança do Supabase: security_definer_view).
-- Estas visões rodavam com os direitos do dono do banco: qualquer pessoa com a chave pública do site — inclusive
-- visitante anônimo — lia tudo de todas as empresas (1.960 linhas de cobrança, resultado financeiro, monitoramento
-- das telas, exibições). Agora cada visão respeita a regra de acesso das tabelas de origem (quem consulta só vê o
-- que já pode ver) e visitante anônimo não acessa nenhuma delas.

ALTER VIEW public.vw_cobranca_completa      SET (security_invoker = true);
ALTER VIEW public.v_dre_consolidado         SET (security_invoker = true);
ALTER VIEW public.vw_industrial_monitoring  SET (security_invoker = true);
ALTER VIEW public.vw_media_popularity       SET (security_invoker = true);
ALTER VIEW public.vw_daily_stats            SET (security_invoker = true);
ALTER VIEW public.dw_dim_player             SET (security_invoker = true);
ALTER VIEW public.dw_dim_campanha           SET (security_invoker = true);
ALTER VIEW public.dw_fact_exibicao          SET (security_invoker = true);
ALTER VIEW public.vw_encartes_publicos      SET (security_invoker = true);

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['vw_cobranca_completa', 'v_dre_consolidado', 'vw_industrial_monitoring', 'vw_media_popularity', 'vw_daily_stats',
                           'dw_dim_player', 'dw_dim_campanha', 'dw_fact_exibicao', 'dw_dim_cliente', 'dw_dim_contrato', 'dw_dim_tela',
                           'dw_fact_comissao', 'dw_fact_receita']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', v);
  END LOOP;
END $$;

-- visão materializada antiga, sem uso pelo sistema (não tem proteção por linha): só o servidor
REVOKE ALL ON public.mv_daily_stats FROM PUBLIC, anon, authenticated;
