-- Fase 3 do plano de Dashboards: "Central do Dia" do ANUNCIANTE (/portal).
--
-- Só os dados do cliente do próprio usuário (usuarios.cliente_id de auth.uid()): faturas vencidas e a vencer e
-- campanhas no ar / próximas. (Contratos NÃO entram: a RLS de contratos não libera leitura ao anunciante — o portal usa
-- get_kpis_portal_anunciante para os contratos vigentes; a política não foi alterada.) SECURITY INVOKER (RLS vale) + filtro explícito pelo cliente.
-- Usuário sem cliente vinculado -> {status: SEM_PERMISSAO}. anon negado.
-- 100% aditivo. Reversível: DROP FUNCTION public.fn_dashboard_resumo_anunciante(integer, text);

CREATE OR REPLACE FUNCTION public.fn_dashboard_resumo_anunciante(
    p_dias_vencer integer DEFAULT 7,
    p_tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
WITH
eu AS (
    SELECT u.cliente_id FROM public.usuarios u WHERE u.id = auth.uid() AND u.cliente_id IS NOT NULL LIMIT 1
),
hoje AS (
    SELECT (now() AT TIME ZONE p_tz)::date AS d
),
faturas AS (
    SELECT c.*
      FROM public.contas_receber c
     WHERE c.cliente_id = (SELECT cliente_id FROM eu)
       AND upper(coalesce(c.status, '')) NOT IN ('PAGA', 'PAGO', 'RECEBIDA', 'RECEBIDO', 'LIQUIDADA', 'LIQUIDADO',
                                                'CANCELADA', 'CANCELADO', 'ESTORNADA', 'ESTORNADO')
),
campanhas AS (
    SELECT a.* FROM public.agendamentos a
     WHERE a.deleted_at IS NULL AND a.cliente_id = (SELECT cliente_id FROM eu)
)
SELECT CASE WHEN (SELECT cliente_id FROM eu) IS NULL THEN jsonb_build_object('status', 'SEM_PERMISSAO') ELSE jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'parametros', jsonb_build_object('dias_vencer', p_dias_vencer),
    'faturas', jsonb_build_object(
        'vencidas_qtd', (SELECT count(*) FROM faturas WHERE data_vencimento < (SELECT d FROM hoje)),
        'vencidas_total', (SELECT coalesce(sum(valor), 0) FROM faturas WHERE data_vencimento < (SELECT d FROM hoje)),
        'abertas_qtd', (SELECT count(*) FROM faturas WHERE data_vencimento >= (SELECT d FROM hoje)),
        'abertas_total', (SELECT coalesce(sum(valor), 0) FROM faturas WHERE data_vencimento >= (SELECT d FROM hoje)),
        'vencendo_qtd', (SELECT count(*) FROM faturas
                          WHERE data_vencimento BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + p_dias_vencer),
        'itens', coalesce((
            SELECT jsonb_agg(x ORDER BY x.data_vencimento)
              FROM (SELECT f.id, f.valor, f.data_vencimento, f.codigo_operacional AS codigo,
                           ((SELECT d FROM hoje) - f.data_vencimento) AS dias_atraso
                      FROM faturas f ORDER BY f.data_vencimento LIMIT 8) x), '[]'::jsonb)
    ),
    'campanhas', jsonb_build_object(
        'no_ar', (SELECT count(*) FROM campanhas WHERE now() BETWEEN inicio AND fim),
        'proximas', coalesce((
            SELECT jsonb_agg(x ORDER BY x.inicio)
              FROM (SELECT c.id, c.titulo, c.inicio, c.fim, c.status, c.total_telas
                      FROM campanhas c WHERE c.fim >= now() ORDER BY c.inicio LIMIT 6) x), '[]'::jsonb)
    )
) END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_resumo_anunciante(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_resumo_anunciante(integer, text) TO authenticated;
