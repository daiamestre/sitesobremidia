-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261317 — F-171
-- Financeiro conectado: clientes, cobranças (dívidas/pendências), pagamentos recebidos, comissões (saídas) e Central de Cobranças
-- alimentam UM fluxo de caixa; painel, fluxo de caixa e DRE leem as mesmas contas.
--
-- Achados:
--   * O código gravava o fluxo de caixa com colunas que não existem (valor_previsto, valor_realizado, data_prevista) e lia
--     ordenando por data_prevista: toda gravação falhava em silêncio e a leitura voltava vazia. fluxo_caixa tinha 1 linha de teste
--     para 245 cobranças (31 pagas + 9 pagas por baixa).
--   * v_dre_consolidado somava TODAS as cobranças (inclusive não pagas) e cruzava comissões com cada cobrança (multiplicava).
--   * Cada tela tinha uma regra de "vencido/recebido" própria.
--
-- Agora (no banco, independente da tela que fez a baixa):
--   * fluxo_caixa ganha previsto x realizado, origem (cobrança/comissão/manual), cliente e contrato;
--   * gatilho em contas_receber: cobrança criada/alterada/paga/cancelada => linha ENTRADA (prevista até pagar; realizada ao pagar,
--     limitada ao valor da cobrança); gatilho em comissoes => linha SAÍDA; saídas/entradas avulsas por RPC (Owner/ADM/Financeiro);
--   * fn_financeiro_resumo: entradas, saídas, saldo, a receber, vencido (por data, igual à Central de Cobranças), inadimplência,
--     devedores por cliente, série de 6 meses e últimos recebimentos;
--   * v_dre_consolidado passa a vir do realizado do fluxo de caixa.
--
-- Player: nada muda. Não marca ninguém como atrasado nem bloqueia cliente: "vencido" é calculado pela data.
-- ROLLBACK: DROP TRIGGER tg_fluxo_conta/tg_fluxo_comissao; DROP FUNCTION das funções fn_fluxo_*/fn_financeiro_*/fluxo_caixa_*;
--   recriar v_dre_consolidado (20260* original); colunas novas de fluxo_caixa podem ficar.
-- ======================================================================

-- ---------------------------------------------------------------- 1. Fluxo de caixa: previsto x realizado e origem
ALTER TABLE public.fluxo_caixa
    ADD COLUMN IF NOT EXISTS origem_tipo text,
    ADD COLUMN IF NOT EXISTS origem_id uuid,
    ADD COLUMN IF NOT EXISTS cliente_id uuid,
    ADD COLUMN IF NOT EXISTS contrato_id uuid,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'REALIZADO',
    ADD COLUMN IF NOT EXISTS valor_previsto numeric(14,2),
    ADD COLUMN IF NOT EXISTS valor_realizado numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS data_prevista date,
    ADD COLUMN IF NOT EXISTS data_realizada date,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.fluxo_caixa DROP CONSTRAINT IF EXISTS fluxo_caixa_status_check;
ALTER TABLE public.fluxo_caixa ADD CONSTRAINT fluxo_caixa_status_check CHECK (status IN ('PREVISTO', 'REALIZADO', 'CANCELADO'));

UPDATE public.fluxo_caixa
   SET valor_previsto = valor, valor_realizado = valor, data_prevista = data_movimento, data_realizada = data_movimento,
       origem_tipo = coalesce(origem_tipo, 'MANUAL')
 WHERE origem_tipo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fluxo_origem ON public.fluxo_caixa (origem_tipo, origem_id) WHERE origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fluxo_empresa_data ON public.fluxo_caixa (empresa_operadora_id, data_movimento);
CREATE INDEX IF NOT EXISTS ix_fluxo_cliente ON public.fluxo_caixa (cliente_id) WHERE cliente_id IS NOT NULL;

-- ---------------------------------------------------------------- 2. Cobrança => entrada no fluxo de caixa
CREATE OR REPLACE FUNCTION public.fn_fluxo_sincronizar_conta(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    c public.contas_receber%ROWTYPE;
    v_pago boolean;
    v_cancelada boolean;
    v_real numeric(14,2);
    v_data_real date;
BEGIN
    SELECT * INTO c FROM public.contas_receber WHERE id = p_id;
    IF NOT FOUND OR c.valor IS NULL OR c.valor <= 0 OR c.empresa_operadora_id IS NULL THEN
        DELETE FROM public.fluxo_caixa WHERE origem_tipo = 'CONTA_RECEBER' AND origem_id = p_id;
        RETURN;
    END IF;

    v_pago := c.status IN ('PAGA', 'PAGO');
    v_cancelada := c.status IN ('CANCELADA', 'CANCELADO');
    -- o realizado nunca passa do valor da cobrança (pagamentos repetidos de teste não inflam o caixa)
    v_real := CASE WHEN v_cancelada THEN 0
                   WHEN v_pago THEN least(coalesce(nullif(c.valor_pago, 0), c.valor), c.valor)
                   ELSE least(greatest(coalesce(c.valor_pago, 0), 0), c.valor) END;
    v_data_real := CASE WHEN v_real > 0 THEN coalesce(c.data_recebimento, c.payment_date::date, c.updated_at::date) END;

    INSERT INTO public.fluxo_caixa
        (empresa_operadora_id, tipo, categoria, descricao, valor, data_movimento, origem_tipo, origem_id, cliente_id, contrato_id,
         status, valor_previsto, valor_realizado, data_prevista, data_realizada, updated_at)
    VALUES
        (c.empresa_operadora_id, 'ENTRADA', 'COBRANCA',
         'Cobrança ' || coalesce(c.codigo_operacional, c.numero_documento, left(c.id::text, 8)),
         CASE WHEN v_pago THEN v_real ELSE c.valor END,
         CASE WHEN v_pago THEN v_data_real ELSE c.data_vencimento END,
         'CONTA_RECEBER', c.id, c.cliente_id, c.contrato_id,
         CASE WHEN v_cancelada THEN 'CANCELADO' WHEN v_pago THEN 'REALIZADO' ELSE 'PREVISTO' END,
         c.valor, v_real, c.data_vencimento, v_data_real, now())
    ON CONFLICT (origem_tipo, origem_id) WHERE origem_id IS NOT NULL DO UPDATE SET
        empresa_operadora_id = EXCLUDED.empresa_operadora_id, descricao = EXCLUDED.descricao, valor = EXCLUDED.valor,
        data_movimento = EXCLUDED.data_movimento, cliente_id = EXCLUDED.cliente_id, contrato_id = EXCLUDED.contrato_id,
        status = EXCLUDED.status, valor_previsto = EXCLUDED.valor_previsto, valor_realizado = EXCLUDED.valor_realizado,
        data_prevista = EXCLUDED.data_prevista, data_realizada = EXCLUDED.data_realizada, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.fn_fluxo_sincronizar_conta(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_fluxo_conta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.fluxo_caixa WHERE origem_tipo = 'CONTA_RECEBER' AND origem_id = OLD.id;
        RETURN OLD;
    END IF;
    PERFORM public.fn_fluxo_sincronizar_conta(NEW.id);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_fluxo_conta ON public.contas_receber;
CREATE TRIGGER tg_fluxo_conta AFTER INSERT OR UPDATE OR DELETE ON public.contas_receber
    FOR EACH ROW EXECUTE FUNCTION public.tg_fluxo_conta();

-- ---------------------------------------------------------------- 3. Comissão => saída no fluxo de caixa
CREATE OR REPLACE FUNCTION public.fn_fluxo_sincronizar_comissao(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    m public.comissoes%ROWTYPE;
    v_emp uuid;
    v_paga boolean;
    v_cancelada boolean;
BEGIN
    SELECT * INTO m FROM public.comissoes WHERE id = p_id;
    IF NOT FOUND OR coalesce(m.valor_comissao, 0) <= 0 THEN
        DELETE FROM public.fluxo_caixa WHERE origem_tipo = 'COMISSAO' AND origem_id = p_id;
        RETURN;
    END IF;
    v_emp := coalesce(m.empresa_operadora_id, (SELECT k.empresa_operadora_id FROM public.contratos k WHERE k.id = m.contrato_id));
    IF v_emp IS NULL THEN RETURN; END IF;
    v_paga := upper(coalesce(m.status, '')) IN ('PAGA', 'PAGO');
    v_cancelada := upper(coalesce(m.status, '')) IN ('CANCELADA', 'CANCELADO');

    INSERT INTO public.fluxo_caixa
        (empresa_operadora_id, tipo, categoria, descricao, valor, data_movimento, origem_tipo, origem_id, contrato_id,
         status, valor_previsto, valor_realizado, data_prevista, data_realizada, updated_at)
    VALUES
        (v_emp, 'SAIDA', 'COMISSAO', 'Comissão de venda ' || coalesce(m.codigo_publico, left(m.id::text, 8)),
         m.valor_comissao, coalesce(CASE WHEN v_paga THEN m.data_pagamento END, m.data_liberacao, m.created_at::date),
         'COMISSAO', m.id, m.contrato_id,
         CASE WHEN v_cancelada THEN 'CANCELADO' WHEN v_paga THEN 'REALIZADO' ELSE 'PREVISTO' END,
         m.valor_comissao, CASE WHEN v_paga THEN m.valor_comissao ELSE 0 END,
         coalesce(m.data_liberacao, m.created_at::date), CASE WHEN v_paga THEN coalesce(m.data_pagamento, m.created_at::date) END, now())
    ON CONFLICT (origem_tipo, origem_id) WHERE origem_id IS NOT NULL DO UPDATE SET
        empresa_operadora_id = EXCLUDED.empresa_operadora_id, descricao = EXCLUDED.descricao, valor = EXCLUDED.valor,
        data_movimento = EXCLUDED.data_movimento, status = EXCLUDED.status, valor_previsto = EXCLUDED.valor_previsto,
        valor_realizado = EXCLUDED.valor_realizado, data_prevista = EXCLUDED.data_prevista, data_realizada = EXCLUDED.data_realizada,
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.fn_fluxo_sincronizar_comissao(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_fluxo_comissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.fluxo_caixa WHERE origem_tipo = 'COMISSAO' AND origem_id = OLD.id;
        RETURN OLD;
    END IF;
    PERFORM public.fn_fluxo_sincronizar_comissao(NEW.id);
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_fluxo_comissao ON public.comissoes;
CREATE TRIGGER tg_fluxo_comissao AFTER INSERT OR UPDATE OR DELETE ON public.comissoes
    FOR EACH ROW EXECUTE FUNCTION public.tg_fluxo_comissao();

-- ---------------------------------------------------------------- 4. Quem vê/mexe no financeiro
CREATE OR REPLACE FUNCTION public.fn_financeiro_tenant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.empresa_operadora_id FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
     WHERE u.id = auth.uid() AND coalesce(u.ativo, true)
       AND (u.is_owner OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN', 'FINANCEIRO', 'GERENTE'));
$$;
REVOKE ALL ON FUNCTION public.fn_financeiro_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_tenant() TO authenticated;

-- Entradas e saídas avulsas (aluguel, internet, serviços…): ficam no mesmo fluxo de caixa
CREATE OR REPLACE FUNCTION public.fluxo_caixa_lancar(p_tipo text, p_categoria text, p_descricao text, p_valor numeric, p_data date, p_realizado boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant uuid := public.fn_financeiro_tenant();
    v_tipo text := upper(btrim(coalesce(p_tipo, '')));
    v_id uuid;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'Somente Owner, ADM, Financeiro ou Gerente.' USING ERRCODE = '42501'; END IF;
    IF v_tipo NOT IN ('ENTRADA', 'SAIDA') THEN RAISE EXCEPTION 'Informe se é entrada ou saída.'; END IF;
    IF p_valor IS NULL OR p_valor <= 0 OR p_valor > 99999999 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
    IF p_data IS NULL THEN RAISE EXCEPTION 'Informe a data.'; END IF;
    IF char_length(btrim(coalesce(p_descricao, ''))) < 3 THEN RAISE EXCEPTION 'Descreva o lançamento (mínimo 3 letras).'; END IF;

    INSERT INTO public.fluxo_caixa
        (empresa_operadora_id, tipo, categoria, descricao, valor, data_movimento, origem_tipo, status,
         valor_previsto, valor_realizado, data_prevista, data_realizada)
    VALUES (v_tenant, v_tipo, upper(left(btrim(coalesce(nullif(p_categoria, ''), 'OUTROS')), 40)), left(btrim(p_descricao), 200),
            round(p_valor, 2), p_data, 'MANUAL', CASE WHEN p_realizado THEN 'REALIZADO' ELSE 'PREVISTO' END,
            round(p_valor, 2), CASE WHEN p_realizado THEN round(p_valor, 2) ELSE 0 END, p_data, CASE WHEN p_realizado THEN p_data END)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.fluxo_caixa_lancar(text, text, text, numeric, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fluxo_caixa_lancar(text, text, text, numeric, date, boolean) TO authenticated;

-- Só lançamento avulso sai pela tela; o que veio de cobrança/comissão se corrige na origem
CREATE OR REPLACE FUNCTION public.fluxo_caixa_remover(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_financeiro_tenant(); v_n integer;
BEGIN
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'Somente Owner, ADM, Financeiro ou Gerente.' USING ERRCODE = '42501'; END IF;
    DELETE FROM public.fluxo_caixa WHERE id = p_id AND empresa_operadora_id = v_tenant AND origem_tipo = 'MANUAL';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Só lançamentos avulsos podem ser removidos aqui; o resto se corrige na cobrança ou na comissão.'; END IF;
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.fluxo_caixa_remover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fluxo_caixa_remover(uuid) TO authenticated;

-- ---------------------------------------------------------------- 5. Resumo único do financeiro
CREATE OR REPLACE FUNCTION public.fn_financeiro_resumo(p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant uuid := public.fn_financeiro_tenant();
    v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_ini date;
    v_fim date;
    v_res jsonb;
BEGIN
    IF v_tenant IS NULL THEN RETURN jsonb_build_object('status', 'SEM_PERMISSAO'); END IF;
    v_ini := coalesce(p_inicio, date_trunc('month', v_hoje)::date);
    v_fim := coalesce(p_fim, v_hoje);
    IF v_fim < v_ini THEN RAISE EXCEPTION 'Período inválido.'; END IF;

    WITH
    cr AS (
        SELECT c.id, c.cliente_id, c.valor, c.data_vencimento, c.status, c.codigo_operacional, c.recorrencia,
               least(greatest(coalesce(c.valor_pago, 0), 0), c.valor) AS pago_parcial
          FROM public.contas_receber c WHERE c.empresa_operadora_id = v_tenant AND c.valor > 0
    ),
    aberta AS (
        SELECT cr.*, greatest(cr.valor - cr.pago_parcial, 0) AS saldo
          FROM cr WHERE cr.status NOT IN ('PAGA', 'PAGO', 'CANCELADA', 'CANCELADO')
    ),
    venc AS (SELECT * FROM aberta WHERE data_vencimento < v_hoje),
    avencer AS (SELECT * FROM aberta WHERE data_vencimento >= v_hoje),
    fx AS (SELECT * FROM public.fluxo_caixa WHERE empresa_operadora_id = v_tenant AND status <> 'CANCELADO'),
    meses AS (SELECT (date_trunc('month', v_hoje) - make_interval(months => g))::date AS mes FROM generate_series(0, 5) g),
    devedores AS (
        SELECT v.cliente_id,
               coalesce(nullif(btrim(e.nome_fantasia), ''), nullif(btrim(e.razao_social), ''), 'Cliente sem nome') AS nome,
               count(*) AS qtd, sum(v.saldo) AS valor, max(v_hoje - v.data_vencimento) AS dias_max
          FROM venc v
          LEFT JOIN LATERAL (SELECT em.nome_fantasia, em.razao_social FROM public.empresas em WHERE em.cliente_id = v.cliente_id LIMIT 1) e ON true
         GROUP BY v.cliente_id, 2
         ORDER BY sum(v.saldo) DESC LIMIT 10
    )
    SELECT jsonb_build_object(
        'status', 'OK',
        'periodo', jsonb_build_object('inicio', v_ini, 'fim', v_fim, 'hoje', v_hoje),
        'entradas_realizadas', (SELECT coalesce(sum(valor_realizado), 0) FROM fx WHERE tipo = 'ENTRADA' AND data_realizada BETWEEN v_ini AND v_fim),
        'saidas_realizadas', (SELECT coalesce(sum(valor_realizado), 0) FROM fx WHERE tipo = 'SAIDA' AND data_realizada BETWEEN v_ini AND v_fim),
        'entradas_previstas', (SELECT coalesce(sum(valor_previsto - valor_realizado), 0) FROM fx
                                WHERE tipo = 'ENTRADA' AND status = 'PREVISTO' AND data_prevista BETWEEN v_ini AND v_fim),
        'saidas_previstas', (SELECT coalesce(sum(valor_previsto - valor_realizado), 0) FROM fx
                              WHERE tipo = 'SAIDA' AND status = 'PREVISTO' AND data_prevista BETWEEN v_ini AND v_fim),
        'saldo_acumulado', (SELECT coalesce(sum(CASE WHEN tipo = 'ENTRADA' THEN valor_realizado ELSE -valor_realizado END), 0) FROM fx),
        'a_receber', jsonb_build_object('valor', (SELECT coalesce(sum(saldo), 0) FROM aberta), 'qtd', (SELECT count(*) FROM aberta)),
        'vencido', jsonb_build_object('valor', (SELECT coalesce(sum(saldo), 0) FROM venc), 'qtd', (SELECT count(*) FROM venc),
                                       'clientes', (SELECT count(DISTINCT cliente_id) FROM venc)),
        'a_vencer', jsonb_build_object('valor', (SELECT coalesce(sum(saldo), 0) FROM avencer), 'qtd', (SELECT count(*) FROM avencer),
                                        'em_7_dias', (SELECT coalesce(sum(saldo), 0) FROM avencer WHERE data_vencimento <= v_hoje + 7),
                                        'qtd_7_dias', (SELECT count(*) FROM avencer WHERE data_vencimento <= v_hoje + 7)),
        'inadimplencia_pct', (SELECT CASE WHEN coalesce(sum(valor), 0) = 0 THEN 0
                                          ELSE round(100 * coalesce((SELECT sum(saldo) FROM venc), 0) / sum(valor), 1) END
                                FROM cr WHERE cr.status NOT IN ('CANCELADA', 'CANCELADO') AND cr.data_vencimento <= v_hoje),
        'mrr', (SELECT coalesce(sum(valor), 0) FROM cr
                 WHERE cr.recorrencia = 'MENSAL' AND cr.status NOT IN ('CANCELADA', 'CANCELADO')
                   AND date_trunc('month', cr.data_vencimento) = date_trunc('month', v_hoje)),
        'ticket_medio', (SELECT coalesce(round(avg(valor), 2), 0) FROM cr WHERE cr.status NOT IN ('CANCELADA', 'CANCELADO')),
        'recebido_total', (SELECT coalesce(sum(valor_realizado), 0) FROM fx WHERE tipo = 'ENTRADA'),
        'faturado_total', (SELECT coalesce(sum(valor), 0) FROM cr WHERE cr.status NOT IN ('CANCELADA', 'CANCELADO')),
        'por_mes', (SELECT jsonb_agg(jsonb_build_object(
                'mes', to_char(m.mes, 'YYYY-MM'),
                'entradas', (SELECT coalesce(sum(valor_realizado), 0) FROM fx WHERE tipo = 'ENTRADA' AND date_trunc('month', data_realizada) = m.mes),
                'saidas', (SELECT coalesce(sum(valor_realizado), 0) FROM fx WHERE tipo = 'SAIDA' AND date_trunc('month', data_realizada) = m.mes),
                'previsto', (SELECT coalesce(sum(valor_previsto), 0) FROM fx WHERE tipo = 'ENTRADA' AND date_trunc('month', data_prevista) = m.mes)
            ) ORDER BY m.mes) FROM meses m),
        'devedores', coalesce((SELECT jsonb_agg(jsonb_build_object('cliente_id', d.cliente_id, 'nome', d.nome, 'qtd', d.qtd, 'valor', d.valor, 'dias_max', d.dias_max) ORDER BY d.valor DESC) FROM devedores d), '[]'::jsonb),
        'recebimentos_recentes', coalesce((
            SELECT jsonb_agg(jsonb_build_object('descricao', x.descricao, 'valor', x.valor_realizado, 'data', x.data_realizada, 'cliente_id', x.cliente_id) ORDER BY x.data_realizada DESC, x.updated_at DESC)
              FROM (SELECT * FROM fx WHERE tipo = 'ENTRADA' AND valor_realizado > 0 ORDER BY data_realizada DESC, updated_at DESC LIMIT 10) x), '[]'::jsonb)
    ) INTO v_res;
    RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_financeiro_resumo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_resumo(date, date) TO authenticated;

-- ---------------------------------------------------------------- 6. DRE a partir do realizado
CREATE OR REPLACE VIEW public.v_dre_consolidado WITH (security_invoker = true) AS
SELECT f.empresa_operadora_id,
       coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0) AS receita_bruta,
       round(coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0) * 0.06, 2) AS impostos_estimados,
       coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'SAIDA' AND f.categoria = 'COMISSAO'), 0) AS comissoes_vendas,
       coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'SAIDA' AND f.categoria <> 'COMISSAO'), 0) AS custos_operacionais_rede,
       coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0)
         - round(coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0) * 0.06, 2)
         - coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'SAIDA'), 0) AS ebitda,
       coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0)
         - round(coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'ENTRADA'), 0) * 0.06, 2)
         - coalesce(sum(f.valor_realizado) FILTER (WHERE f.tipo = 'SAIDA'), 0) AS resultado_liquido
  FROM public.fluxo_caixa f
 WHERE f.status <> 'CANCELADO'
 GROUP BY f.empresa_operadora_id;

-- ---------------------------------------------------------------- 7. O que já existia entra no fluxo de caixa
SELECT public.fn_fluxo_sincronizar_conta(id) FROM public.contas_receber;
SELECT public.fn_fluxo_sincronizar_comissao(id) FROM public.comissoes;
