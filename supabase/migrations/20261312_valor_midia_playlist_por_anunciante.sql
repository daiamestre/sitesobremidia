-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261312 — F-166
-- (1) Biblioteca de Mídias some para o anunciante; (2) mídia grátis só na PRIMEIRA playlist; (3) valor da mídia por
-- anunciante e liberação de mídias grátis (com motivo) pelo Owner/ADM.
--
-- Regras de negócio (decisão do proprietário, 08/10/2026):
--   * Biblioteca: só Representante, Gestor de Mídias, ADM e Owner. O anunciante usa as próprias mídias (Minhas Mídias) e o
--     Encarte Digital. Hoje a Biblioteca também deixava o anunciante pôr mídia na playlist SEM cobrança — fechada aqui.
--   * Playlist: o anunciante ganha 1 mídia grátis, UMA vez, na primeira playlist que criar. Depois disso toda mídia
--     adicionada à playlist (vídeo ou imagem) custa o valor do anunciante (padrão R$ 19,99).
--   * O Owner/ADM define o valor por anunciante (ex.: A = 19,99, B = 9,99) e pode liberar N mídias grátis a qualquer
--     anunciante, sempre com motivo (promoção, data comemorativa + qual, cortesia, outro) e explicação que o anunciante lê.
--   * O anunciante vê quantas mídias foram liberadas, por quê e quanto custará a próxima.
--
-- Segurança: tudo no banco (RPC SECURITY DEFINER + trava de linha); o navegador não grava nas tabelas novas.
-- Também fechado: uma cobrança paga só libera UM item (antes a mesma conta paga podia liberar vários) e só a do próprio
-- anunciante; o item não pode mais ter origem/cobrança trocadas pelo navegador.
--
-- Player: nada muda.
-- ROLLBACK: restaurar fn_biblioteca_tenant (20261244), adicionar_midia_playlist/confirmar_video_playlist_pago (20261034),
--   criar_playlist_cliente e publicar_playlist_cliente (versões anteriores); DROP das tabelas/funções novas; DROP TRIGGER
--   tg_cpi_protege_origem; DROP INDEX ux_cpi_cobranca; recriar a policy cpi_insert_com_cobranca sem o filtro de cliente.
-- ======================================================================

-- ---------------------------------------------------------------- 1. Biblioteca fechada para o anunciante
CREATE OR REPLACE FUNCTION public.fn_usuario_eh_anunciante()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM public.usuarios u JOIN public.perfis p ON p.id = u.perfil_id
             WHERE u.id = auth.uid() AND upper(p.nome) IN ('ANUNCIANTE', 'CLIENTE') AND NOT coalesce(u.is_owner, false))
       AND NOT public.has_role(auth.uid(), 'admin'::app_role);
$$;
REVOKE ALL ON FUNCTION public.fn_usuario_eh_anunciante() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuario_eh_anunciante() TO authenticated;

-- Sem empresa => as políticas e RPCs da Biblioteca não enxergam nada para o anunciante (pastas, mídias, adicionar à playlist/tela).
CREATE OR REPLACE FUNCTION public.fn_biblioteca_tenant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT CASE WHEN public.fn_usuario_eh_anunciante() THEN NULL
                ELSE public.get_user_empresa_operadora_id(auth.uid()) END;
$$;

-- ---------------------------------------------------------------- 2. Tabelas
CREATE TABLE IF NOT EXISTS public.playlist_midia_preco_padrao (
    empresa_operadora_id uuid PRIMARY KEY REFERENCES public.empresa_operadora(id) ON DELETE CASCADE,
    valor numeric(10,2) NOT NULL CHECK (valor >= 0 AND valor <= 9999),
    atualizado_por uuid,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cliente_preco_midia (
    cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
    empresa_operadora_id uuid NOT NULL,
    valor numeric(10,2) NOT NULL CHECK (valor >= 0 AND valor <= 9999),
    motivo text,
    atualizado_por uuid,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Mídia grátis da primeira playlist: uma vez por anunciante.
CREATE TABLE IF NOT EXISTS public.cliente_midia_cota (
    cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
    primeira_playlist_id uuid,
    gratis_usada boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now()
);

-- Mídias grátis liberadas pelo Owner/ADM, com o porquê.
CREATE TABLE IF NOT EXISTS public.cliente_midias_liberadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_operadora_id uuid NOT NULL,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    quantidade integer NOT NULL CHECK (quantidade BETWEEN 1 AND 100),
    usadas integer NOT NULL DEFAULT 0,
    motivo text NOT NULL CHECK (motivo IN ('PROMOCAO', 'DATA_COMEMORATIVA', 'CORTESIA', 'OUTRO')),
    data_comemorativa text,
    observacao text,
    mensagem_cliente text NOT NULL,
    valor_proxima numeric(10,2) NOT NULL,
    criado_por uuid,
    criado_em timestamptz NOT NULL DEFAULT now(),
    cancelado_em timestamptz,
    cancelado_por uuid,
    CONSTRAINT cml_usadas_ok CHECK (usadas >= 0 AND usadas <= quantidade),
    CONSTRAINT cml_data_obrigatoria CHECK (motivo <> 'DATA_COMEMORATIVA' OR nullif(btrim(data_comemorativa), '') IS NOT NULL),
    CONSTRAINT cml_explicacao_outro CHECK (motivo <> 'OUTRO' OR nullif(btrim(observacao), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_cml_cliente ON public.cliente_midias_liberadas (cliente_id, criado_em);

ALTER TABLE public.playlist_midia_preco_padrao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_preco_midia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_midia_cota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_midias_liberadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.playlist_midia_preco_padrao, public.cliente_preco_midia, public.cliente_midia_cota, public.cliente_midias_liberadas
    FROM PUBLIC, anon, authenticated;

ALTER TABLE public.cliente_playlist_itens
    ADD COLUMN IF NOT EXISTS origem text CHECK (origem IN ('GRATIS_PRIMEIRA', 'CORTESIA', 'VALOR_ZERO', 'PAGA')),
    ADD COLUMN IF NOT EXISTS liberacao_id uuid;

-- Uma cobrança paga libera UM item.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cpi_cobranca ON public.cliente_playlist_itens (cobranca_id) WHERE cobranca_id IS NOT NULL;

-- Inserção direta pelo navegador só com cobrança PAGA DO PRÓPRIO anunciante.
DROP POLICY IF EXISTS cpi_insert_com_cobranca ON public.cliente_playlist_itens;
CREATE POLICY cpi_insert_com_cobranca ON public.cliente_playlist_itens FOR INSERT TO authenticated
    WITH CHECK (
        cobranca_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.playlists_cliente p
              JOIN public.contas_receber cr ON cr.id = cliente_playlist_itens.cobranca_id
             WHERE p.id = cliente_playlist_itens.playlist_id
               AND p.empresa_operadora_id = public.get_user_empresa_operadora_id(auth.uid())
               AND p.cliente_id = public.get_user_cliente_id()
               AND cr.cliente_id = p.cliente_id
               AND cr.status = ANY (ARRAY['PAGA', 'PAGO'])));

-- O navegador não escolhe a origem do item nem troca a cobrança/mídia depois (só ordem e duração).
CREATE OR REPLACE FUNCTION public.tg_cpi_protege_origem()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.origem := 'PAGA';
            NEW.liberacao_id := NULL;
        ELSIF NEW.asset_id IS DISTINCT FROM OLD.asset_id
           OR NEW.biblioteca_media_id IS DISTINCT FROM OLD.biblioteca_media_id
           OR NEW.cobranca_id IS DISTINCT FROM OLD.cobranca_id
           OR NEW.origem IS DISTINCT FROM OLD.origem
           OR NEW.liberacao_id IS DISTINCT FROM OLD.liberacao_id
           OR NEW.playlist_id IS DISTINCT FROM OLD.playlist_id THEN
            RAISE EXCEPTION 'Este item não pode ser alterado: remova e adicione de novo.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_cpi_protege_origem ON public.cliente_playlist_itens;
CREATE TRIGGER tg_cpi_protege_origem BEFORE INSERT OR UPDATE ON public.cliente_playlist_itens
    FOR EACH ROW EXECUTE FUNCTION public.tg_cpi_protege_origem();

-- ---------------------------------------------------------------- 2b. Ações novas na auditoria
ALTER TABLE public.auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;
ALTER TABLE public.auditoria_logs ADD CONSTRAINT auditoria_logs_acao_check CHECK (acao::text = ANY (ARRAY[
    'INSERT',
    'UPDATE',
    'DELETE',
    'STATUS_CHANGE',
    'LOGIN',
    'USER_CREATED',
    'USER_UPDATED',
    'USER_ACTIVATED',
    'USER_DEACTIVATED',
    'USER_ROLE_CHANGED',
    'USER_PERMISSIONS_CHANGED',
    'USER_INVITE_SENT',
    'USER_INVITE_RESENT',
    'USER_ACCESS_REVOKED',
    'AUTONOMY_GRANTED',
    'AUTONOMY_REVOKED',
    'REPRESENTANTE_UPDATED',
    'REPRESENTANTE_ACTIVATED',
    'REPRESENTANTE_DEACTIVATED',
    'CLIENTE_REPRESENTANTE_CHANGED',
    'USER_PROVISIONED',
    'PASSWORD_CHANGED',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_AUTHORIZED',
    'PASSWORD_RESET_REJECTED',
    'PASSWORD_RESET_CREDENTIAL_ISSUED',
    'PLAYLIST_CRIADA',
    'ITEM_ADICIONADO',
    'COBRANCA_VIDEO_GERADA',
    'NOVO_PONTO_SOLICITADO',
    'PLAYLIST_PUBLICADA_PLAYER',
    'PLAYLIST_PUBLICADA_PONTO',
    'PLAYLIST_DESPUBLICADA_PONTO',
    'PROSPECCAO_PONTOS_SINCRONIZADOS',
    'PROSPECCAO_GESTOR_PROVISIONADO',
    'PONTO_PARCEIRO_CADASTRADO',
    'VALOR_MIDIA_ALTERADO',
    'VALOR_PADRAO_MIDIA_ALTERADO',
    'MIDIAS_GRATIS_LIBERADAS',
    'MIDIAS_GRATIS_CANCELADAS']));

-- ---------------------------------------------------------------- 3. Valor da mídia por anunciante
CREATE OR REPLACE FUNCTION public.fn_valor_midia_cliente(p_cliente uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT coalesce(
        (SELECT c.valor FROM public.cliente_preco_midia c WHERE c.cliente_id = p_cliente),
        (SELECT d.valor FROM public.playlist_midia_preco_padrao d
           JOIN public.clientes cl ON cl.empresa_operadora_id = d.empresa_operadora_id WHERE cl.id = p_cliente),
        19.99);
$$;
REVOKE ALL ON FUNCTION public.fn_valor_midia_cliente(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_brl(p_valor numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT 'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999990.00'), '.', ',');
$$;

-- ---------------------------------------------------------------- 4. Criar playlist: registra a PRIMEIRA
CREATE OR REPLACE FUNCTION public.criar_playlist_cliente(p_nome text, p_descricao text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_id UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;
    SELECT empresa_operadora_id INTO v_tenant FROM public.clientes WHERE id = v_cliente;
    IF NULLIF(btrim(p_nome), '') IS NULL THEN
        RAISE EXCEPTION 'Nome da playlist é obrigatório.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_cliente::text, 0));

    INSERT INTO public.playlists_cliente (empresa_operadora_id, cliente_id, nome, descricao, created_by)
    VALUES (v_tenant, v_cliente, btrim(p_nome), NULLIF(btrim(coalesce(p_descricao,'')), ''), auth.uid())
    RETURNING id INTO v_id;

    -- a mídia grátis vale só na PRIMEIRA playlist que o anunciante criou
    INSERT INTO public.cliente_midia_cota (cliente_id, primeira_playlist_id) VALUES (v_cliente, v_id)
    ON CONFLICT (cliente_id) DO NOTHING;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', v_id, 'PLAYLIST_CRIADA', 'ATIVA',
         'Playlist "' || btrim(p_nome) || '" criada pelo anunciante.');

    RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------- 5. Adicionar mídia: grátis (1ª playlist) > cortesia > pago
CREATE OR REPLACE FUNCTION public.adicionar_midia_playlist(p_playlist_id uuid, p_asset_id uuid, p_duracao_segundos integer DEFAULT NULL::integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_cota public.cliente_midia_cota%ROWTYPE;
    v_lib public.cliente_midias_liberadas%ROWTYPE;
    v_valor NUMERIC;
    v_restantes INT;
    v_conta UUID;
    v_codigo VARCHAR(24);
    v_ordem INT;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT empresa_operadora_id INTO v_tenant
      FROM public.playlists_cliente WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cliente_assets WHERE id = p_asset_id AND cliente_id = v_cliente) THEN
        RAISE EXCEPTION 'Mídia inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    -- uma pessoa por vez por anunciante: duas abas não gastam a mesma mídia grátis
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cliente::text, 0));

    IF EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id AND asset_id = p_asset_id) THEN
        RAISE EXCEPTION 'Mídia já presente nesta playlist.';
    END IF;

    INSERT INTO public.cliente_midia_cota (cliente_id, primeira_playlist_id)
    SELECT v_cliente, (SELECT id FROM public.playlists_cliente WHERE cliente_id = v_cliente ORDER BY created_at, id LIMIT 1)
    ON CONFLICT (cliente_id) DO NOTHING;
    SELECT * INTO v_cota FROM public.cliente_midia_cota WHERE cliente_id = v_cliente FOR UPDATE;

    v_valor := public.fn_valor_midia_cliente(v_cliente);
    v_ordem := COALESCE((SELECT MAX(ordem) + 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1);

    -- (a) mídia grátis da PRIMEIRA playlist (uma vez)
    IF NOT v_cota.gratis_usada AND v_cota.primeira_playlist_id = p_playlist_id THEN
        INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, duracao_segundos, ordem, origem)
        VALUES (p_playlist_id, p_asset_id, p_duracao_segundos, v_ordem, 'GRATIS_PRIMEIRA');
        UPDATE public.cliente_midia_cota SET gratis_usada = true WHERE cliente_id = v_cliente;
        INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        VALUES (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'ITEM_ADICIONADO', 'ATIVO', 'Mídia grátis da primeira playlist.');
        RETURN json_build_object('cobrado', false, 'valor', 0, 'item_liberado', true, 'origem', 'GRATIS_PRIMEIRA',
            'valor_proxima', v_valor,
            'mensagem', 'Mídia grátis da sua primeira playlist usada. A próxima mídia custa ' || public.fn_brl(v_valor) || '.');
    END IF;

    -- (b) mídias grátis liberadas pelo Owner/ADM (a mais antiga primeiro)
    SELECT * INTO v_lib FROM public.cliente_midias_liberadas
     WHERE cliente_id = v_cliente AND cancelado_em IS NULL AND usadas < quantidade
     ORDER BY criado_em, id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, duracao_segundos, ordem, origem, liberacao_id)
        VALUES (p_playlist_id, p_asset_id, p_duracao_segundos, v_ordem, 'CORTESIA', v_lib.id);
        UPDATE public.cliente_midias_liberadas SET usadas = usadas + 1 WHERE id = v_lib.id;
        SELECT COALESCE(SUM(quantidade - usadas), 0) INTO v_restantes
          FROM public.cliente_midias_liberadas WHERE cliente_id = v_cliente AND cancelado_em IS NULL;
        INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
        VALUES (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'ITEM_ADICIONADO', 'ATIVO',
                'Mídia grátis liberada (' || v_lib.motivo || '), liberação ' || v_lib.id::text || '.');
        RETURN json_build_object('cobrado', false, 'valor', 0, 'item_liberado', true, 'origem', 'CORTESIA',
            'restantes_gratis', v_restantes, 'valor_proxima', v_valor,
            'mensagem', CASE WHEN v_restantes > 0
                THEN 'Mídia grátis usada. Ainda restam ' || v_restantes || ' mídia(s) grátis. Depois delas, cada mídia custa ' || public.fn_brl(v_valor) || '.'
                ELSE 'Mídia grátis usada. Suas mídias grátis acabaram: a próxima custa ' || public.fn_brl(v_valor) || '.' END);
    END IF;

    -- (c) valor definido como zero para este anunciante
    IF v_valor <= 0 THEN
        INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, duracao_segundos, ordem, origem)
        VALUES (p_playlist_id, p_asset_id, p_duracao_segundos, v_ordem, 'VALOR_ZERO');
        RETURN json_build_object('cobrado', false, 'valor', 0, 'item_liberado', true, 'origem', 'VALOR_ZERO',
            'valor_proxima', 0, 'mensagem', 'Mídia adicionada (sem custo para a sua conta).');
    END IF;

    -- (d) mídia paga: o item só entra depois do PIX confirmado
    INSERT INTO public.contas_receber (
        empresa_operadora_id, cliente_id, contrato_id, valor,
        data_vencimento, status, metodo_cobranca, recorrencia, notes
    ) VALUES (
        v_tenant, v_cliente, NULL, v_valor,
        CURRENT_DATE, 'ABERTA', 'PIX', 'AVULSA',
        'Midia adicional de playlist (playlist ' || p_playlist_id::text || ' / midia ' || p_asset_id::text || ')'
    ) RETURNING id INTO v_conta;

    SELECT codigo_operacional INTO v_codigo FROM public.contas_receber WHERE id = v_conta;

    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'COBRANCA_VIDEO_GERADA', 'ABERTA',
            'Cobranca ' || coalesce(v_codigo, '') || ' (' || public.fn_brl(v_valor) || ') gerada para midia adicional.');

    RETURN json_build_object('cobrado', true, 'valor', v_valor, 'cobranca_id', v_conta, 'codigo', v_codigo, 'origem', 'PAGA',
        'mensagem', 'Esta mídia custa ' || public.fn_brl(v_valor) || ' (PIX). Ela entra na playlist assim que o pagamento for confirmado.');
END;
$function$;

-- ---------------------------------------------------------------- 6. Liberar o item pago: 1 cobrança = 1 item, do próprio anunciante
CREATE OR REPLACE FUNCTION public.confirmar_video_playlist_pago(p_cobranca_id uuid, p_playlist_id uuid, p_asset_id uuid, p_duracao_segundos integer DEFAULT NULL::integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_conta public.contas_receber%ROWTYPE;
    v_item UUID;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_cobranca_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobranca nao encontrada.'; END IF;
    IF v_conta.status NOT IN ('PAGA', 'PAGO') THEN
        RAISE EXCEPTION 'Pagamento pendente (status %): mídia bloqueada.', v_conta.status;
    END IF;
    -- a cobrança foi gerada para ESTA playlist e ESTA mídia
    IF position(p_playlist_id::text IN coalesce(v_conta.notes, '')) = 0 OR position(p_asset_id::text IN coalesce(v_conta.notes, '')) = 0 THEN
        RAISE EXCEPTION 'Esta cobrança não pertence a esta playlist/mídia.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.playlists_cliente WHERE id = p_playlist_id AND cliente_id = v_cliente) THEN
        RAISE EXCEPTION 'Playlist fora do seu escopo.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cliente_assets WHERE id = p_asset_id AND cliente_id = v_cliente) THEN
        RAISE EXCEPTION 'Midia fora do seu escopo.' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_cliente::text, 0));

    -- já liberado (a tela confere a cada 8 s): devolve o item existente, sem duplicar
    SELECT id INTO v_item FROM public.cliente_playlist_itens WHERE cobranca_id = p_cobranca_id;
    IF FOUND THEN
        RETURN json_build_object('ok', true, 'item_id', v_item, 'ja_liberado', true);
    END IF;

    INSERT INTO public.cliente_playlist_itens (playlist_id, asset_id, ordem, duracao_segundos, cobranca_id, origem)
    VALUES (p_playlist_id, p_asset_id,
            COALESCE((SELECT MAX(ordem) + 1 FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id), 1),
            p_duracao_segundos, p_cobranca_id, 'PAGA')
    RETURNING id INTO v_item;

    INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
    VALUES (v_conta.empresa_operadora_id, 'VIDEO_PLAYLIST_LIBERADO_POS_PAGAMENTO', auth.uid(),
            jsonb_build_object('item_id', v_item, 'playlist_id', p_playlist_id, 'asset_id', p_asset_id,
                               'cobranca_id', p_cobranca_id, 'valor', v_conta.valor));

    RETURN json_build_object('ok', true, 'item_id', v_item);
END;
$function$;

-- ---------------------------------------------------------------- 7. O que o anunciante vê (cota, liberações, valor)
CREATE OR REPLACE FUNCTION public.portal_minha_cota_midias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_cliente uuid := public.get_user_cliente_id();
    v_valor numeric;
    v_cota public.cliente_midia_cota%ROWTYPE;
    v_lib jsonb;
    v_restantes integer;
BEGIN
    IF v_cliente IS NULL THEN RETURN jsonb_build_object('status', 'SEM_PERMISSAO'); END IF;
    v_valor := public.fn_valor_midia_cliente(v_cliente);
    SELECT * INTO v_cota FROM public.cliente_midia_cota WHERE cliente_id = v_cliente;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', l.id, 'quantidade', l.quantidade, 'usadas', l.usadas, 'restantes', l.quantidade - l.usadas,
               'motivo', l.motivo, 'data_comemorativa', l.data_comemorativa, 'explicacao', l.observacao,
               'mensagem', l.mensagem_cliente, 'criado_em', l.criado_em) ORDER BY l.criado_em), '[]'::jsonb),
           coalesce(sum(l.quantidade - l.usadas), 0)
      INTO v_lib, v_restantes
      FROM public.cliente_midias_liberadas l
     WHERE l.cliente_id = v_cliente AND l.cancelado_em IS NULL AND l.usadas < l.quantidade;

    RETURN jsonb_build_object(
        'status', 'OK',
        'valor_midia', v_valor,
        'valor_midia_texto', public.fn_brl(v_valor),
        'gratis_primeira_playlist', CASE WHEN v_cota.cliente_id IS NULL OR NOT v_cota.gratis_usada THEN 'DISPONIVEL' ELSE 'USADA' END,
        'primeira_playlist_id', v_cota.primeira_playlist_id,
        'liberacoes', v_lib,
        'restantes_liberadas', v_restantes);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_minha_cota_midias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_minha_cota_midias() TO authenticated;

-- ---------------------------------------------------------------- 8. Owner/ADM: valor e liberações por anunciante
CREATE OR REPLACE FUNCTION public.fn_midias_exigir_admin(p_cliente uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_biblioteca_tenant();
BEGIN
    IF v_tenant IS NULL OR NOT public.fn_biblioteca_admin() THEN
        RAISE EXCEPTION 'Somente Owner ou ADM.' USING ERRCODE = '42501';
    END IF;
    IF p_cliente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente AND empresa_operadora_id = v_tenant) THEN
        RAISE EXCEPTION 'Anunciante não encontrado.' USING ERRCODE = '42501';
    END IF;
    RETURN v_tenant;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_midias_exigir_admin(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.admin_midias_listar_clientes(p_busca text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_midias_exigir_admin();
BEGIN
    RETURN jsonb_build_object(
        'valor_padrao', coalesce((SELECT valor FROM public.playlist_midia_preco_padrao WHERE empresa_operadora_id = v_tenant), 19.99),
        'clientes', coalesce((
            SELECT jsonb_agg(x ORDER BY x->>'nome') FROM (
                SELECT jsonb_build_object(
                    'cliente_id', c.id,
                    'nome', coalesce(nullif(btrim(e.nome_fantasia), ''), nullif(btrim(e.razao_social), ''), 'Anunciante sem nome'),
                    'valor', public.fn_valor_midia_cliente(c.id),
                    'valor_personalizado', EXISTS (SELECT 1 FROM public.cliente_preco_midia p WHERE p.cliente_id = c.id),
                    'gratis_restantes', coalesce((SELECT sum(l.quantidade - l.usadas) FROM public.cliente_midias_liberadas l
                                                   WHERE l.cliente_id = c.id AND l.cancelado_em IS NULL), 0),
                    'playlists', (SELECT count(*) FROM public.playlists_cliente pl WHERE pl.cliente_id = c.id)) AS x
                  FROM public.clientes c
                  LEFT JOIN LATERAL (SELECT em.nome_fantasia, em.razao_social FROM public.empresas em WHERE em.cliente_id = c.id LIMIT 1) e ON true
                 WHERE c.empresa_operadora_id = v_tenant
                   AND (p_busca IS NULL OR btrim(p_busca) = ''
                        OR coalesce(e.nome_fantasia, '') ILIKE '%' || btrim(p_busca) || '%'
                        OR coalesce(e.razao_social, '') ILIKE '%' || btrim(p_busca) || '%')
                 LIMIT 300) q), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_listar_clientes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_listar_clientes(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_midias_cliente(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_midias_exigir_admin(p_cliente);
BEGIN
    RETURN jsonb_build_object(
        'valor', public.fn_valor_midia_cliente(p_cliente),
        'valor_padrao', coalesce((SELECT valor FROM public.playlist_midia_preco_padrao WHERE empresa_operadora_id = v_tenant), 19.99),
        'valor_personalizado', (SELECT jsonb_build_object('valor', p.valor, 'motivo', p.motivo, 'atualizado_em', p.atualizado_em)
                                  FROM public.cliente_preco_midia p WHERE p.cliente_id = p_cliente),
        'gratis_primeira_playlist', CASE WHEN EXISTS (SELECT 1 FROM public.cliente_midia_cota q WHERE q.cliente_id = p_cliente AND q.gratis_usada)
                                         THEN 'USADA' ELSE 'DISPONIVEL' END,
        'playlists', (SELECT count(*) FROM public.playlists_cliente pl WHERE pl.cliente_id = p_cliente),
        'midias_pagas', (SELECT count(*) FROM public.cliente_playlist_itens i JOIN public.playlists_cliente pl ON pl.id = i.playlist_id
                          WHERE pl.cliente_id = p_cliente AND i.origem = 'PAGA'),
        'liberacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', l.id, 'quantidade', l.quantidade, 'usadas', l.usadas, 'motivo', l.motivo,
                'data_comemorativa', l.data_comemorativa, 'explicacao', l.observacao, 'mensagem', l.mensagem_cliente,
                'valor_proxima', l.valor_proxima, 'criado_em', l.criado_em, 'cancelado_em', l.cancelado_em) ORDER BY l.criado_em DESC)
              FROM public.cliente_midias_liberadas l WHERE l.cliente_id = p_cliente), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_cliente(uuid) TO authenticated;

-- valor null => volta ao valor padrão
CREATE OR REPLACE FUNCTION public.admin_midias_definir_valor(p_cliente uuid, p_valor numeric, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_midias_exigir_admin(p_cliente);
BEGIN
    IF p_valor IS NOT NULL AND (p_valor < 0 OR p_valor > 9999) THEN
        RAISE EXCEPTION 'Valor inválido (use de 0 a 9999).';
    END IF;
    IF p_valor IS NULL THEN
        DELETE FROM public.cliente_preco_midia WHERE cliente_id = p_cliente;
    ELSE
        INSERT INTO public.cliente_preco_midia (cliente_id, empresa_operadora_id, valor, motivo, atualizado_por, atualizado_em)
        VALUES (p_cliente, v_tenant, round(p_valor, 2), nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid(), now())
        ON CONFLICT (cliente_id) DO UPDATE SET valor = EXCLUDED.valor, motivo = EXCLUDED.motivo,
            atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
    END IF;
    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'CLIENTE', p_cliente, 'VALOR_MIDIA_ALTERADO', 'OK',
            CASE WHEN p_valor IS NULL THEN 'Voltou ao valor padrão da mídia.' ELSE 'Valor da mídia: ' || public.fn_brl(p_valor) END
            || coalesce(' — ' || nullif(btrim(coalesce(p_motivo, '')), ''), ''));
    RETURN jsonb_build_object('ok', true, 'valor', public.fn_valor_midia_cliente(p_cliente));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_definir_valor(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_definir_valor(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_midias_definir_padrao(p_valor numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid := public.fn_midias_exigir_admin();
BEGIN
    IF p_valor IS NULL OR p_valor < 0 OR p_valor > 9999 THEN RAISE EXCEPTION 'Valor inválido (use de 0 a 9999).'; END IF;
    INSERT INTO public.playlist_midia_preco_padrao (empresa_operadora_id, valor, atualizado_por, atualizado_em)
    VALUES (v_tenant, round(p_valor, 2), auth.uid(), now())
    ON CONFLICT (empresa_operadora_id) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'EMPRESA_OPERADORA', v_tenant, 'VALOR_PADRAO_MIDIA_ALTERADO', 'OK', 'Valor padrão da mídia: ' || public.fn_brl(p_valor));
    RETURN jsonb_build_object('ok', true, 'valor_padrao', round(p_valor, 2));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_definir_padrao(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_definir_padrao(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_midias_liberar(p_cliente uuid, p_quantidade integer, p_motivo text,
                                                       p_data_comemorativa text DEFAULT NULL, p_explicacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant uuid := public.fn_midias_exigir_admin(p_cliente);
    v_valor numeric := public.fn_valor_midia_cliente(p_cliente);
    v_motivo text := upper(btrim(coalesce(p_motivo, '')));
    v_data text := nullif(btrim(coalesce(p_data_comemorativa, '')), '');
    v_exp text := nullif(btrim(coalesce(p_explicacao, '')), '');
    v_msg text;
    v_id uuid;
BEGIN
    IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 100 THEN RAISE EXCEPTION 'Informe de 1 a 100 mídias.'; END IF;
    IF v_motivo NOT IN ('PROMOCAO', 'DATA_COMEMORATIVA', 'CORTESIA', 'OUTRO') THEN RAISE EXCEPTION 'Informe o motivo da liberação.'; END IF;
    IF v_motivo = 'DATA_COMEMORATIVA' AND v_data IS NULL THEN RAISE EXCEPTION 'Informe qual é a data comemorativa.'; END IF;
    IF v_motivo = 'OUTRO' AND v_exp IS NULL THEN RAISE EXCEPTION 'Explique o motivo da liberação.'; END IF;
    IF v_motivo <> 'DATA_COMEMORATIVA' THEN v_data := NULL; END IF;

    v_msg := 'Liberamos ' || p_quantidade || CASE WHEN p_quantidade = 1 THEN ' mídia grátis' ELSE ' mídias grátis' END || ' para você'
          || CASE v_motivo WHEN 'PROMOCAO' THEN ' em uma promoção'
                           WHEN 'DATA_COMEMORATIVA' THEN ' em comemoração a ' || v_data
                           WHEN 'CORTESIA' THEN ' como cortesia da SOBRE MÍDIA'
                           ELSE '' END || '.'
          || coalesce(' ' || v_exp || CASE WHEN right(v_exp, 1) IN ('.', '!', '?') THEN '' ELSE '.' END, '');

    INSERT INTO public.cliente_midias_liberadas
        (empresa_operadora_id, cliente_id, quantidade, motivo, data_comemorativa, observacao, mensagem_cliente, valor_proxima, criado_por)
    VALUES (v_tenant, p_cliente, p_quantidade, v_motivo, v_data, v_exp, v_msg, v_valor, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'CLIENTE', p_cliente, 'MIDIAS_GRATIS_LIBERADAS', 'OK',
            p_quantidade || ' mídia(s) grátis — ' || v_motivo || coalesce(' (' || v_data || ')', '') || coalesce(' — ' || v_exp, ''));

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'mensagem', v_msg, 'valor_proxima', v_valor);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_liberar(uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_liberar(uuid, integer, text, text, text) TO authenticated;

-- cancela o que ainda não foi usado
CREATE OR REPLACE FUNCTION public.admin_midias_cancelar_liberacao(p_liberacao uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cliente uuid; v_tenant uuid;
BEGIN
    SELECT cliente_id INTO v_cliente FROM public.cliente_midias_liberadas WHERE id = p_liberacao;
    IF v_cliente IS NULL THEN RAISE EXCEPTION 'Liberação não encontrada.'; END IF;
    v_tenant := public.fn_midias_exigir_admin(v_cliente);
    UPDATE public.cliente_midias_liberadas SET cancelado_em = now(), cancelado_por = auth.uid()
     WHERE id = p_liberacao AND cancelado_em IS NULL;
    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'CLIENTE', v_cliente, 'MIDIAS_GRATIS_CANCELADAS', 'OK', 'Liberação ' || p_liberacao::text || ' cancelada.');
    RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_midias_cancelar_liberacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_midias_cancelar_liberacao(uuid) TO authenticated;

-- ---------------------------------------------------------------- 9. Publicação: item só vai ao ar se for grátis legítimo ou pago
CREATE OR REPLACE FUNCTION public.publicar_playlist_cliente(p_playlist_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cliente UUID;
    v_tenant UUID;
    v_pl RECORD;
    v_total INT;
    v_nao_liberados INT;
    v_canal UUID;
    v_media_id UUID;
    v_pos INT := 0;
    v_item RECORD;
BEGIN
    v_cliente := public.get_user_cliente_id();
    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Usuário sem vínculo comercial (cliente).' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_pl
    FROM public.playlists_cliente
    WHERE id = p_playlist_id AND cliente_id = v_cliente;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Playlist inexistente ou fora do seu escopo.' USING ERRCODE = '42501';
    END IF;
    v_tenant := v_pl.empresa_operadora_id;

    SELECT COUNT(*) INTO v_total
    FROM public.cliente_playlist_itens WHERE playlist_id = p_playlist_id;
    IF v_total = 0 THEN
        RAISE EXCEPTION 'Playlist sem mídias — adicione ao menos uma mídia antes de publicar.';
    END IF;

    -- Defesa em profundidade (F-166): todo item precisa ser grátis legítimo (1ª playlist, cortesia liberada pelo
    -- Owner/ADM, valor zero definido por eles) ou ter cobrança PAGA do próprio anunciante. Mídia da Biblioteca (legado) fica de fora.
    SELECT COUNT(*) INTO v_nao_liberados
    FROM public.cliente_playlist_itens i
    WHERE i.playlist_id = p_playlist_id
      AND i.biblioteca_media_id IS NULL
      AND COALESCE(i.origem, 'PAGA') = 'PAGA'
      AND NOT EXISTS (
            SELECT 1 FROM public.contas_receber cr
             WHERE cr.id = i.cobranca_id AND cr.cliente_id = v_cliente AND cr.status IN ('PAGA', 'PAGO'));
    IF v_nao_liberados > 0 THEN
        RAISE EXCEPTION 'Existem mídias adicionais sem pagamento confirmado — publicação bloqueada.';
    END IF;

    -- Playlist canônica do player (1:1 por usuário+nome, idempotente)
    SELECT id INTO v_canal
    FROM public.playlists
    WHERE user_id = auth.uid() AND name = v_pl.nome
    ORDER BY created_at
    LIMIT 1;

    IF v_canal IS NULL THEN
        INSERT INTO public.playlists (user_id, name, description, is_active, audio_enabled)
        VALUES (auth.uid(), v_pl.nome, v_pl.descricao, true, false)
        RETURNING id INTO v_canal;
    ELSE
        UPDATE public.playlists
        SET description = COALESCE(v_pl.descricao, description),
            is_active   = true,
            updated_at  = now()
        WHERE id = v_canal;

        DELETE FROM public.playlist_items WHERE playlist_id = v_canal;
    END IF;

    FOR v_item IN
        SELECT i.duracao_segundos,
               COALESCE(a.duracao, i.duracao_segundos) AS duracao_final,
               a.nome, a.object_url, a.tipo, a.mime_type,
               COALESCE(a.tamanho, 0) AS tamanho, a.id AS asset_id,
               i.biblioteca_media_id
        FROM public.cliente_playlist_itens i
        LEFT JOIN public.cliente_assets a ON a.id = i.asset_id
        WHERE i.playlist_id = p_playlist_id
          AND (a.id IS NOT NULL OR i.biblioteca_media_id IS NOT NULL)
        ORDER BY i.ordem
    LOOP
        -- Biblioteca: a MESMA linha de media (sem espelho, sem cópia do arquivo)
        IF v_item.biblioteca_media_id IS NOT NULL THEN
            v_pos := v_pos + 1;
            INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
            VALUES (v_canal, v_item.biblioteca_media_id, v_pos,
                    GREATEST(COALESCE(v_item.duracao_segundos, public.fn_media_duracao_item(v_item.biblioteca_media_id)), 1)::int);
            CONTINUE;
        END IF;

        -- Espelho do asset na tabela `media` do player (idempotente)
        SELECT id INTO v_media_id
        FROM public.media
        WHERE user_id = auth.uid() AND file_path = 'portal/' || v_item.asset_id::text
        LIMIT 1;

        IF v_media_id IS NULL THEN
            INSERT INTO public.media
                (user_id, name, file_path, file_url, file_type, file_size, mime_type)
            VALUES
                (auth.uid(),
                 v_item.nome,
                 'portal/' || v_item.asset_id::text,
                 v_item.object_url,
                 CASE WHEN v_item.tipo = 'video' THEN 'video' ELSE 'image' END,
                 v_item.tamanho,
                 COALESCE(v_item.mime_type, 'application/octet-stream'))
            RETURNING id INTO v_media_id;
        END IF;

        v_pos := v_pos + 1;
        INSERT INTO public.playlist_items (playlist_id, media_id, position, duration)
        VALUES (
            v_canal,
            v_media_id,
            v_pos,
            GREATEST(COALESCE(v_item.duracao_final, CASE WHEN v_item.tipo = 'video' THEN 15 ELSE 10 END), 1)::int
        );
    END LOOP;

    INSERT INTO public.auditoria_logs
        (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES
        (v_tenant, auth.uid(), 'PLAYLIST_CLIENTE', p_playlist_id, 'PLAYLIST_PUBLICADA_PLAYER',
         'ATIVA', 'Playlist espelhada no Player (' || v_pos || ' itens, canal ' || v_canal::text || ').');

    RETURN json_build_object(
        'playlist_player_id', v_canal,
        'nome', v_pl.nome,
        'itens', v_pos
    );
END;
$function$
;
