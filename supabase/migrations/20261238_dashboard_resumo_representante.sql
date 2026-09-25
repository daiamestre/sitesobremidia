-- Fase 3 do plano de Dashboards: "Central do Dia" do REPRESENTANTE.
--
-- Só a carteira do próprio representante (representantes.usuario_id = auth.uid()): propostas paradas, contratos que
-- dependem de assinatura/pagamento, cobranças vencidas e a vencer dos SEUS clientes, clientes novos e agenda de hoje.
-- SECURITY INVOKER (RLS vale) + filtro explícito pelo representante do usuário: mesmo que a RLS do tenant permita ver
-- mais, a função devolve apenas o que é dele. Sem registro de representante -> {status: SEM_PERMISSAO}. anon negado.
-- 100% aditivo. Reversível: DROP FUNCTION public.fn_dashboard_resumo_representante(integer, text);

CREATE OR REPLACE FUNCTION public.fn_dashboard_resumo_representante(
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
    SELECT r.id FROM public.representantes r WHERE r.usuario_id = auth.uid() LIMIT 1
),
hoje AS (
    SELECT (now() AT TIME ZONE p_tz)::date AS d
),
meus_clientes AS (
    SELECT c.id,
           (SELECT coalesce(nullif(e.nome_fantasia, ''), e.razao_social) FROM public.empresas e
             WHERE e.cliente_id = c.id AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1) AS nome,
           c.created_at
      FROM public.clientes c
     WHERE c.deleted_at IS NULL AND c.representante_id = (SELECT id FROM eu)
),
cr_aberta AS (
    SELECT c.*, mc.nome AS cliente_nome
      FROM public.contas_receber c
      JOIN meus_clientes mc ON mc.id = c.cliente_id
     WHERE upper(coalesce(c.status, '')) NOT IN ('PAGA', 'PAGO', 'RECEBIDA', 'RECEBIDO', 'LIQUIDADA', 'LIQUIDADO',
                                                'CANCELADA', 'CANCELADO', 'ESTORNADA', 'ESTORNADO')
),
minhas_propostas AS (
    SELECT p.*,
           (SELECT mc.nome FROM meus_clientes mc WHERE mc.id = p.cliente_id) AS cliente_nome
      FROM public.propostas p
     WHERE p.deleted_at IS NULL AND p.representante_id = (SELECT id FROM eu)
),
meus_contratos AS (
    SELECT k.*,
           (SELECT mc.nome FROM meus_clientes mc WHERE mc.id = k.cliente_id) AS cliente_nome
      FROM public.contratos k
     WHERE k.deleted_at IS NULL AND k.representante_id = (SELECT id FROM eu)
)
SELECT CASE WHEN (SELECT id FROM eu) IS NULL THEN jsonb_build_object('status', 'SEM_PERMISSAO') ELSE jsonb_build_object(
    'status', 'OK',
    'gerado_em', now(),
    'parametros', jsonb_build_object('dias_vencer', p_dias_vencer),

    'propostas', jsonb_build_object(
        'rascunho', (SELECT count(*) FROM minhas_propostas WHERE upper(status) IN ('DRAFT', 'RASCUNHO')),
        'aprovadas', (SELECT count(*) FROM minhas_propostas WHERE upper(status) IN ('APPROVED', 'APROVADA', 'ACEITA')),
        'mes', (SELECT count(*) FROM minhas_propostas
                 WHERE date_trunc('month', (created_at AT TIME ZONE p_tz)) = date_trunc('month', (SELECT d FROM hoje))),
        'paradas', coalesce((
            SELECT jsonb_agg(x ORDER BY x.criada_em)
              FROM (SELECT p.id, coalesce(p.titulo_campanha, p.numero_proposta::text) AS titulo, p.cliente_nome AS cliente,
                           p.valor_final AS valor, p.created_at AS criada_em
                      FROM minhas_propostas p
                     WHERE upper(p.status) IN ('DRAFT', 'RASCUNHO')
                     ORDER BY p.created_at LIMIT 8) x), '[]'::jsonb)
    ),

    'contratos', jsonb_build_object(
        'aguardando_assinatura', (SELECT count(*) FROM meus_contratos WHERE status_workflow = 'AGUARDANDO_ASSINATURA'),
        'aguardando_pagamento', (SELECT count(*) FROM meus_contratos WHERE status_workflow = 'AGUARDANDO_PAGAMENTO'),
        'ativos', (SELECT count(*) FROM meus_contratos WHERE status_workflow = 'CAMPANHA_ATIVA'),
        'pendentes', coalesce((
            SELECT jsonb_agg(x ORDER BY x.criado_em)
              FROM (SELECT k.id, coalesce(k.numero_contrato_legivel, k.numero_contrato) AS numero, k.cliente_nome AS cliente,
                           k.status_workflow AS status, k.created_at AS criado_em
                      FROM meus_contratos k
                     WHERE k.status_workflow IN ('AGUARDANDO_ASSINATURA', 'AGUARDANDO_PAGAMENTO')
                     ORDER BY k.created_at LIMIT 8) x), '[]'::jsonb),
        'terminam_30d', coalesce((
            SELECT jsonb_agg(x ORDER BY x.data_fim)
              FROM (SELECT k.id, coalesce(k.numero_contrato_legivel, k.numero_contrato) AS numero, k.cliente_nome AS cliente, k.data_fim
                      FROM meus_contratos k
                     WHERE k.status_workflow = 'CAMPANHA_ATIVA'
                       AND k.data_fim BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + 30
                     ORDER BY k.data_fim LIMIT 8) x), '[]'::jsonb)
    ),

    'cobrancas', jsonb_build_object(
        'vencidas_qtd', (SELECT count(*) FROM cr_aberta WHERE data_vencimento < (SELECT d FROM hoje)),
        'vencidas_total', (SELECT coalesce(sum(valor), 0) FROM cr_aberta WHERE data_vencimento < (SELECT d FROM hoje)),
        'vencendo_qtd', (SELECT count(*) FROM cr_aberta
                          WHERE data_vencimento BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + p_dias_vencer),
        'vencendo_total', (SELECT coalesce(sum(valor), 0) FROM cr_aberta
                            WHERE data_vencimento BETWEEN (SELECT d FROM hoje) AND (SELECT d FROM hoje) + p_dias_vencer),
        'itens', coalesce((
            SELECT jsonb_agg(x ORDER BY x.data_vencimento)
              FROM (SELECT c.id, c.cliente_nome AS cliente, c.valor, c.data_vencimento,
                           ((SELECT d FROM hoje) - c.data_vencimento) AS dias_atraso
                      FROM cr_aberta c
                     WHERE c.data_vencimento <= (SELECT d FROM hoje) + p_dias_vencer
                     ORDER BY c.data_vencimento LIMIT 8) x), '[]'::jsonb)
    ),

    'clientes', jsonb_build_object(
        'total', (SELECT count(*) FROM meus_clientes),
        'novos_mes', (SELECT count(*) FROM meus_clientes
                       WHERE date_trunc('month', (created_at AT TIME ZONE p_tz)) = date_trunc('month', (SELECT d FROM hoje))),
        'recentes', coalesce((
            SELECT jsonb_agg(x ORDER BY x.criado_em DESC)
              FROM (SELECT mc.id, mc.nome, mc.created_at AS criado_em FROM meus_clientes mc
                     ORDER BY mc.created_at DESC LIMIT 5) x), '[]'::jsonb)
    ),

    'agenda_hoje', coalesce((
        SELECT jsonb_agg(x ORDER BY x.inicio)
          FROM (SELECT a.id, a.titulo, a.status, a.inicio, a.fim,
                       CASE WHEN (a.inicio AT TIME ZONE p_tz)::date = (SELECT d FROM hoje) THEN 'COMECA' ELSE 'TERMINA' END AS evento
                  FROM public.agendamentos a
                  JOIN meus_contratos k ON k.id = a.contrato_id
                 WHERE a.deleted_at IS NULL
                   AND ((a.inicio AT TIME ZONE p_tz)::date = (SELECT d FROM hoje)
                        OR (a.fim AT TIME ZONE p_tz)::date = (SELECT d FROM hoje))
                 ORDER BY a.inicio LIMIT 10) x), '[]'::jsonb)
) END;
$$;

REVOKE ALL ON FUNCTION public.fn_dashboard_resumo_representante(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_resumo_representante(integer, text) TO authenticated;
