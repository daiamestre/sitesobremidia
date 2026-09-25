-- Fase 2 do plano de Dashboards (aprovado em 2026-09-25): "Central do Dia" do OWNER/ADMIN.
--
-- Um único resumo por chamada com o que exige atenção hoje: telas offline, cobranças vencidas e a vencer, financeiro do
-- mês, funil comercial, contratos a vencer, aprovações pendentes, agenda do dia e atividade recente.
--
-- Só perfis de gestão central (is_central_privileged: OWNER, ADMIN, GESTOR, GERENTE, FINANCEIRO, SUPERVISOR); os demais
-- recebem {status: SEM_PERMISSAO} (Representante e Anunciante têm os próprios painéis).
-- SECURITY INVOKER: roda com as permissões de quem chama — as políticas de RLS de cada tabela (tenant, papel interno)
-- continuam valendo; ninguém vê nada além do que já veria nas telas completas. anon negado.
-- 100% aditivo (só cria a função). Reversível:
--   DROP FUNCTION public.fn_dashboard_resumo_owner(integer, integer, text);

CREATE OR REPLACE FUNCTION public.fn_dashboard_resumo_owner(
    p_offline_min integer DEFAULT 10,
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
hoje AS (
    SELECT (now() AT TIME ZONE p_tz)::date AS d
),
cr AS (
    SELECT c.*,
           upper(coalesce(c.status, '')) AS st,
           coalesce(c.data_recebimento, (c.payment_date AT TIME ZONE p_tz)::date) AS recebido_em,
           (SELECT coalesce(nullif(e.nome_fantasia, ''), e.razao_social)
              FROM public.empresas e
             WHERE e.cliente_id = c.cliente_id AND e.deleted_at IS NULL
             ORDER BY e.created_at
             LIMIT 1) AS cliente_nome
      FROM public.contas_receber c
),
cr_aberta AS (
    SELECT * FROM cr
     WHERE st NOT IN ('PAGA', 'PAGO', 'RECEBIDA', 'RECEBIDO', 'LIQUIDADA', 'LIQUIDADO',
                      'CANCELADA', 'CANCELADO', 'ESTORNADA', 'ESTORNADO')
),
cr_paga AS (
    SELECT * FROM cr WHERE st IN ('PAGA', 'PAGO', 'RECEBIDA', 'RECEBIDO', 'LIQUIDADA', 'LIQUIDADO')
),
vencidas AS (
    SELECT a.*, ((SELECT d FROM hoje) - a.data_vencimento) AS dias
      FROM cr_aberta a
     WHERE a.data_vencimento < (SELECT d FROM hoje)
),
vencendo AS (
    SELECT a.*, (a.data_vencimento - (SELECT d FROM hoje)) AS dias
      FROM cr_aberta a
     WHERE a.data_vencimento BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + p_dias_vencer
),
telas AS (
    SELECT s.*,
           (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - make_interval(mins => p_offline_min)) AS online
      FROM public.screens s
     WHERE s.is_active IS DISTINCT FROM false
)
SELECT CASE WHEN NOT public.is_central_privileged() THEN jsonb_build_object('status', 'SEM_PERMISSAO') ELSE jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'parametros', jsonb_build_object('offline_min', p_offline_min, 'dias_vencer', p_dias_vencer),

    'telas', jsonb_build_object(
        'total', (SELECT count(*) FROM telas),
        'online', (SELECT count(*) FROM telas WHERE online),
        'offline', (SELECT count(*) FROM telas WHERE NOT online),
        'sem_playlist', (SELECT count(*) FROM telas WHERE playlist_id IS NULL),
        'offline_itens', coalesce((
            SELECT jsonb_agg(x ORDER BY x.ultimo_sinal DESC NULLS LAST)
              FROM (SELECT t.id, t.name AS nome, t.cidade, t.last_ping_at AS ultimo_sinal
                      FROM telas t WHERE NOT t.online
                     ORDER BY t.last_ping_at DESC NULLS LAST LIMIT 8) x), '[]'::jsonb)
    ),

    'cobrancas', jsonb_build_object(
        'vencidas', jsonb_build_object(
            'qtd', (SELECT count(*) FROM vencidas),
            'total', (SELECT coalesce(sum(valor), 0) FROM vencidas),
            'itens', coalesce((
                SELECT jsonb_agg(x ORDER BY x.data_vencimento)
                  FROM (SELECT v.id, v.cliente_nome AS cliente, v.valor, v.data_vencimento, v.dias, v.codigo_operacional AS codigo
                          FROM vencidas v ORDER BY v.data_vencimento LIMIT 8) x), '[]'::jsonb)
        ),
        'vencendo', jsonb_build_object(
            'qtd', (SELECT count(*) FROM vencendo),
            'total', (SELECT coalesce(sum(valor), 0) FROM vencendo),
            'itens', coalesce((
                SELECT jsonb_agg(x ORDER BY x.data_vencimento)
                  FROM (SELECT v.id, v.cliente_nome AS cliente, v.valor, v.data_vencimento, v.dias, v.codigo_operacional AS codigo
                          FROM vencendo v ORDER BY v.data_vencimento LIMIT 8) x), '[]'::jsonb)
        )
    ),

    'financeiro', jsonb_build_object(
        'recebido_mes', (SELECT coalesce(sum(coalesce(valor_pago, valor)), 0) FROM cr_paga
                          WHERE date_trunc('month', recebido_em) = date_trunc('month', (SELECT d FROM hoje))),
        'previsto_mes', (SELECT coalesce(sum(valor), 0) FROM cr
                          WHERE st NOT IN ('CANCELADA', 'CANCELADO', 'ESTORNADA', 'ESTORNADO')
                            AND date_trunc('month', data_vencimento) = date_trunc('month', (SELECT d FROM hoje))),
        'a_receber', (SELECT coalesce(sum(valor), 0) FROM cr_aberta),
        'vencido_total', (SELECT coalesce(sum(valor), 0) FROM vencidas),
        'serie_30d', coalesce((
            SELECT jsonb_agg(jsonb_build_object('dia', g.dia, 'recebido', coalesce(r.total, 0)) ORDER BY g.dia)
              FROM generate_series((SELECT d FROM hoje) - 29, (SELECT d FROM hoje), interval '1 day') AS g(dia)
              LEFT JOIN (SELECT recebido_em AS dia, sum(coalesce(valor_pago, valor)) AS total
                           FROM cr_paga WHERE recebido_em >= (SELECT d FROM hoje) - 29
                          GROUP BY 1) r ON r.dia = g.dia::date), '[]'::jsonb)
    ),

    'comercial', jsonb_build_object(
        'propostas_rascunho', (SELECT count(*) FROM public.propostas WHERE deleted_at IS NULL AND upper(status) IN ('DRAFT', 'RASCUNHO')),
        'propostas_enviadas', (SELECT count(*) FROM public.propostas WHERE deleted_at IS NULL AND upper(status) IN ('SENT', 'ENVIADA', 'PENDING', 'PENDENTE')),
        'propostas_aprovadas', (SELECT count(*) FROM public.propostas WHERE deleted_at IS NULL AND upper(status) IN ('APPROVED', 'APROVADA', 'ACEITA')),
        'propostas_mes', (SELECT count(*) FROM public.propostas WHERE deleted_at IS NULL
                           AND date_trunc('month', (created_at AT TIME ZONE p_tz)) = date_trunc('month', (SELECT d FROM hoje))),
        'contratos_aguardando_assinatura', (SELECT count(*) FROM public.contratos WHERE deleted_at IS NULL AND status_workflow = 'AGUARDANDO_ASSINATURA'),
        'contratos_aguardando_pagamento', (SELECT count(*) FROM public.contratos WHERE deleted_at IS NULL AND status_workflow = 'AGUARDANDO_PAGAMENTO'),
        'contratos_ativos', (SELECT count(*) FROM public.contratos WHERE deleted_at IS NULL AND status_workflow = 'CAMPANHA_ATIVA'),
        'contratos_a_vencer', coalesce((
            SELECT jsonb_agg(x ORDER BY x.data_fim)
              FROM (SELECT c.id, coalesce(c.numero_contrato_legivel, c.numero_contrato) AS numero, c.data_fim,
                           (SELECT coalesce(nullif(e.nome_fantasia, ''), e.razao_social) FROM public.empresas e
                             WHERE e.cliente_id = c.cliente_id AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1) AS cliente
                      FROM public.contratos c
                     WHERE c.deleted_at IS NULL AND c.status_workflow = 'CAMPANHA_ATIVA'
                       AND c.data_fim BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + 30
                     ORDER BY c.data_fim LIMIT 8) x), '[]'::jsonb)
    ),

    'aprovacoes', jsonb_build_object(
        'pendentes', (SELECT count(*) FROM public.solicitacoes WHERE upper(status) = 'PENDENTE'),
        'itens', coalesce((
            SELECT jsonb_agg(x ORDER BY x.criada_em)
              FROM (SELECT s.id, s.titulo, s.tipo_solicitacao AS tipo, s.created_at AS criada_em
                      FROM public.solicitacoes s WHERE upper(s.status) = 'PENDENTE'
                     ORDER BY s.created_at LIMIT 5) x), '[]'::jsonb)
    ),

    'agenda_hoje', coalesce((
        SELECT jsonb_agg(x ORDER BY x.inicio)
          FROM (SELECT a.id, a.titulo, a.status, a.inicio, a.fim,
                       CASE WHEN (a.inicio AT TIME ZONE p_tz)::date = (SELECT d FROM hoje) THEN 'COMECA' ELSE 'TERMINA' END AS evento
                  FROM public.agendamentos a
                 WHERE a.deleted_at IS NULL
                   AND ((a.inicio AT TIME ZONE p_tz)::date = (SELECT d FROM hoje)
                        OR (a.fim AT TIME ZONE p_tz)::date = (SELECT d FROM hoje))
                 ORDER BY a.inicio LIMIT 10) x), '[]'::jsonb),

    'atividade', coalesce((
        SELECT jsonb_agg(x ORDER BY x.quando DESC)
          FROM (
              (SELECT 'CONTRATO' AS tipo, c.id, coalesce(c.numero_contrato_legivel, c.numero_contrato) AS titulo,
                      c.status_workflow AS detalhe, c.created_at AS quando
                 FROM public.contratos c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 5)
              UNION ALL
              (SELECT 'PROPOSTA', p.id, coalesce(p.titulo_campanha, p.numero_proposta::text), p.status, p.created_at
                 FROM public.propostas p WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 5)
              UNION ALL
              (SELECT 'PAGAMENTO', pg.id, coalesce(pg.cliente_nome, pg.codigo_operacional), coalesce(pg.valor_pago, pg.valor)::text,
                      coalesce(pg.payment_date, pg.recebido_em::timestamptz, pg.updated_at)
                 FROM cr_paga pg ORDER BY coalesce(pg.payment_date, pg.recebido_em::timestamptz, pg.updated_at) DESC LIMIT 5)
          ) x
         LIMIT 12), '[]'::jsonb)
) END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_resumo_owner(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_resumo_owner(integer, integer, text) TO authenticated;
