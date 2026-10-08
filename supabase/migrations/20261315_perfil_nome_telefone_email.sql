-- ======================================================================
-- SOBRE MÍDIA — MIGRAÇÃO 20261315 — F-169
-- Meu Perfil: todo usuário muda o próprio nome e telefone (telefone opcional); e-mail só com autorização do Owner/ADM.
--
-- Achado: ao salvar o nome, o Owner via "Acesso Negado: Impossível suspender, bloquear ou inativar a conta OWNER". O gatilho
-- prevent_owner_downgrade comparava usuarios.status com 'ACTIVE', mas a conta guarda 'ATIVO' — então QUALQUER edição na linha do
-- Owner era recusada. Agora ele só recusa quando a edição realmente inativa/bloqueia a conta.
--
-- Regras (decisão do proprietário, 09/10/2026):
--   * nome completo e telefone: o próprio usuário muda; telefone NÃO é obrigatório; função (perfil) continua proibida de mudar;
--   * o nome do estabelecimento (anunciante) também é do próprio usuário;
--   * e-mail é obrigatório e só muda com autorização: o usuário faz o pedido, o Owner/ADM recebem aviso na Central e decidem.
--
-- Player: nada muda.
-- ROLLBACK: DROP FUNCTION das funções perfil_*; DROP TRIGGER tg_solicitacao_email_so_pela_decisao ON solicitacoes;
--   restaurar prevent_owner_downgrade (20260823) e auditoria_logs_acao_check (20261312).
-- ======================================================================

-- ---------------------------------------------------------------- 1. Gatilho do Owner: só recusa inativar de verdade
CREATE OR REPLACE FUNCTION public.prevent_owner_downgrade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF OLD.is_owner = true THEN
        IF NEW.is_owner = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível remover o status de OWNER desta conta.';
        END IF;

        IF OLD.owner_locked = true AND NEW.owner_locked = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível desbloquear as proteções da conta OWNER.';
        END IF;

        -- F-169: só recusa quando ESTA edição inativa ou bloqueia a conta (a conta guarda status 'ATIVO' ou 'ACTIVE').
        IF (NEW.ativo = false AND OLD.ativo IS DISTINCT FROM false)
           OR (upper(coalesce(NEW.status, '')) NOT IN ('ACTIVE', 'ATIVO') AND NEW.status IS DISTINCT FROM OLD.status) THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível suspender, bloquear ou inativar a conta OWNER.';
        END IF;

        IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o role_id da conta OWNER.';
        END IF;
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar a organization_id da conta OWNER.';
        END IF;
        IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o department_id da conta OWNER.';
        END IF;

        -- o e-mail do Owner só muda pela troca autorizada (perfil_decidir_troca_email)
        IF NEW.email IS DISTINCT FROM OLD.email AND coalesce(current_setting('app.troca_email', true), '') <> 'on' THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o email da conta OWNER.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------- 2. Ações novas na auditoria
ALTER TABLE public.auditoria_logs DROP CONSTRAINT IF EXISTS auditoria_logs_acao_check;
ALTER TABLE public.auditoria_logs ADD CONSTRAINT auditoria_logs_acao_check CHECK (acao::text = ANY (ARRAY[
    'INSERT','UPDATE','DELETE','STATUS_CHANGE','LOGIN','USER_CREATED','USER_UPDATED','USER_ACTIVATED','USER_DEACTIVATED',
    'USER_ROLE_CHANGED','USER_PERMISSIONS_CHANGED','USER_INVITE_SENT','USER_INVITE_RESENT','USER_ACCESS_REVOKED',
    'AUTONOMY_GRANTED','AUTONOMY_REVOKED','REPRESENTANTE_UPDATED','REPRESENTANTE_ACTIVATED','REPRESENTANTE_DEACTIVATED',
    'CLIENTE_REPRESENTANTE_CHANGED','USER_PROVISIONED','PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED','PASSWORD_RESET_AUTHORIZED',
    'PASSWORD_RESET_REJECTED','PASSWORD_RESET_CREDENTIAL_ISSUED','PLAYLIST_CRIADA','ITEM_ADICIONADO','COBRANCA_VIDEO_GERADA',
    'NOVO_PONTO_SOLICITADO','PLAYLIST_PUBLICADA_PLAYER','PLAYLIST_PUBLICADA_PONTO','PLAYLIST_DESPUBLICADA_PONTO',
    'PROSPECCAO_PONTOS_SINCRONIZADOS','PROSPECCAO_GESTOR_PROVISIONADO','PONTO_PARCEIRO_CADASTRADO',
    'VALOR_MIDIA_ALTERADO','VALOR_PADRAO_MIDIA_ALTERADO','MIDIAS_GRATIS_LIBERADAS','MIDIAS_GRATIS_CANCELADAS',
    'PERFIL_ATUALIZADO','NOME_ESTABELECIMENTO_ALTERADO','EMAIL_ALTERACAO_SOLICITADA','EMAIL_ALTERACAO_AUTORIZADA',
    'EMAIL_ALTERACAO_RECUSADA','EMAIL_ALTERACAO_CANCELADA']));

-- ---------------------------------------------------------------- 3. Nome e telefone (telefone opcional)
CREATE OR REPLACE FUNCTION public.perfil_atualizar_dados(p_nome text, p_telefone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_nome text := btrim(coalesce(p_nome, ''));
    v_tel text := nullif(btrim(coalesce(p_telefone, '')), '');
    v_empresa uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
    IF char_length(v_nome) < 3 THEN RAISE EXCEPTION 'Informe o nome (mínimo 3 letras).'; END IF;
    IF char_length(v_nome) > 120 THEN RAISE EXCEPTION 'Nome muito longo (máximo 120).'; END IF;
    IF v_tel IS NOT NULL AND char_length(regexp_replace(v_tel, '\D', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Telefone incompleto: informe com DDD ou deixe em branco.';
    END IF;

    UPDATE public.usuarios SET nome = v_nome, telefone = v_tel, updated_at = now()
     WHERE id = auth.uid() RETURNING empresa_operadora_id INTO v_empresa;
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;

    UPDATE public.profiles SET full_name = v_nome WHERE user_id = auth.uid();

    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_empresa, auth.uid(), 'USUARIO', auth.uid(), 'PERFIL_ATUALIZADO', 'ACTIVE', 'Perfil atualizado: nome=' || v_nome);

    RETURN jsonb_build_object('ok', true, 'nome', v_nome, 'telefone', v_tel);
END;
$$;
REVOKE ALL ON FUNCTION public.perfil_atualizar_dados(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_atualizar_dados(text, text) TO authenticated;

-- Nome do estabelecimento (aparece nas boas-vindas do anunciante): só da própria empresa do usuário.
CREATE OR REPLACE FUNCTION public.perfil_atualizar_nome_estabelecimento(p_nome text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_nome text := btrim(coalesce(p_nome, ''));
    v_cliente uuid := public.get_user_cliente_id();
    v_tenant uuid;
    v_n integer;
BEGIN
    IF auth.uid() IS NULL OR v_cliente IS NULL THEN RAISE EXCEPTION 'Sem estabelecimento vinculado.' USING ERRCODE = '42501'; END IF;
    IF char_length(v_nome) < 2 THEN RAISE EXCEPTION 'Informe o nome do estabelecimento (mínimo 2 letras).'; END IF;
    IF char_length(v_nome) > 120 THEN RAISE EXCEPTION 'Nome muito longo (máximo 120).'; END IF;

    UPDATE public.empresas SET nome_fantasia = v_nome WHERE cliente_id = v_cliente;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Cadastro do estabelecimento não encontrado.'; END IF;

    SELECT empresa_operadora_id INTO v_tenant FROM public.usuarios WHERE id = auth.uid();
    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'CLIENTE', v_cliente, 'NOME_ESTABELECIMENTO_ALTERADO', 'OK', 'Nome do estabelecimento: ' || v_nome);

    RETURN jsonb_build_object('ok', true, 'nome_fantasia', v_nome);
END;
$$;
REVOKE ALL ON FUNCTION public.perfil_atualizar_nome_estabelecimento(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_atualizar_nome_estabelecimento(text) TO authenticated;

-- ---------------------------------------------------------------- 4. Troca de e-mail com autorização
-- o status do pedido só muda pelas funções abaixo (a Central não aprova "no braço")
CREATE OR REPLACE FUNCTION public.tg_solicitacao_email_so_pela_decisao()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.tipo_solicitacao = 'EMAIL_CHANGE_REQUEST' AND NEW.status IS DISTINCT FROM OLD.status
       AND coalesce(current_setting('app.troca_email', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Use "Autorizar" ou "Recusar" na seção Trocas de e-mail da Central.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_solicitacao_email_so_pela_decisao ON public.solicitacoes;
CREATE TRIGGER tg_solicitacao_email_so_pela_decisao BEFORE UPDATE ON public.solicitacoes
    FOR EACH ROW EXECUTE FUNCTION public.tg_solicitacao_email_so_pela_decisao();

CREATE OR REPLACE FUNCTION public.perfil_solicitar_troca_email(p_novo_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_novo text := lower(btrim(coalesce(p_novo_email, '')));
    v_eu public.usuarios%ROWTYPE;
    v_perfil text;
    v_sol uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
    IF v_novo !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'E-mail inválido.'; END IF;
    SELECT * INTO v_eu FROM public.usuarios WHERE id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
    IF lower(v_eu.email) = v_novo THEN RAISE EXCEPTION 'Este já é o seu e-mail.'; END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_novo) OR EXISTS (SELECT 1 FROM public.usuarios WHERE lower(email) = v_novo) THEN
        RAISE EXCEPTION 'Este e-mail já está em uso por outra conta.';
    END IF;
    SELECT coalesce(p.nome, '') INTO v_perfil FROM public.perfis p WHERE p.id = v_eu.perfil_id;

    -- um pedido aberto por vez
    PERFORM set_config('app.troca_email', 'on', true);
    UPDATE public.solicitacoes SET status = 'CANCELADA', updated_at = now()
     WHERE tipo_solicitacao = 'EMAIL_CHANGE_REQUEST' AND solicitante_id = auth.uid() AND status = 'PENDENTE';

    INSERT INTO public.solicitacoes (empresa_operadora_id, tipo_solicitacao, titulo, descricao, entidade_tipo, entidade_id, solicitante_id, status)
    VALUES (v_eu.empresa_operadora_id, 'EMAIL_CHANGE_REQUEST', 'Troca de e-mail: ' || v_eu.nome,
            v_eu.nome || ' (' || coalesce(nullif(v_perfil, ''), 'usuário') || ') quer trocar o e-mail de ' || v_eu.email || ' para ' || v_novo || '.',
            'usuario', v_eu.id, auth.uid(), 'PENDENTE')
    RETURNING id INTO v_sol;
    PERFORM set_config('app.troca_email', '', true);

    -- aviso na Central de todos os Owner e ADM da empresa (menos quem pediu)
    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem, prioridade, severidade, rota_destino,
         entidade_relacionada_tipo, entidade_relacionada_id, status_notificacao, lida)
    SELECT v_eu.empresa_operadora_id, u.id, 'EMAIL_ALTERACAO_SOLICITADA', 'IN_APP',
           v_eu.nome || ' quer trocar o e-mail',
           v_eu.nome || ' (' || coalesce(nullif(v_perfil, ''), 'usuário') || ') pediu para trocar o e-mail de ' || v_eu.email || ' para ' || v_novo
             || '. Autorize ou recuse em Central > Solicitações > Trocas de e-mail.',
           'IMPORTANTE', 'AVISO', '/workspace/central', 'solicitacao_email', v_sol, 'NAO_LIDA', false
      FROM public.usuarios u LEFT JOIN public.perfis p ON p.id = u.perfil_id
     WHERE u.empresa_operadora_id = v_eu.empresa_operadora_id AND u.id <> auth.uid() AND coalesce(u.ativo, true)
       AND (u.is_owner OR upper(coalesce(p.nome, '')) IN ('OWNER', 'ADMIN'));

    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_eu.empresa_operadora_id, auth.uid(), 'USUARIO', auth.uid(), 'EMAIL_ALTERACAO_SOLICITADA', 'PENDENTE', 'De ' || v_eu.email || ' para ' || v_novo);

    RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_sol, 'novo_email', v_novo);
END;
$$;
REVOKE ALL ON FUNCTION public.perfil_solicitar_troca_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_solicitar_troca_email(text) TO authenticated;

-- pedido aberto do próprio usuário (a tela mostra "aguardando autorização")
CREATE OR REPLACE FUNCTION public.perfil_troca_email_pendente()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT coalesce((SELECT jsonb_build_object('id', s.id, 'descricao', s.descricao, 'criado_em', s.created_at,
                                               'novo_email', substring(s.descricao FROM ' para ([^ ]+)\.$'))
                       FROM public.solicitacoes s
                      WHERE s.tipo_solicitacao = 'EMAIL_CHANGE_REQUEST' AND s.solicitante_id = auth.uid() AND s.status = 'PENDENTE'
                      ORDER BY s.created_at DESC LIMIT 1), 'null'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.perfil_troca_email_pendente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_troca_email_pendente() TO authenticated;

CREATE OR REPLACE FUNCTION public.perfil_cancelar_troca_email()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
    IF auth.uid() IS NULL THEN RETURN 0; END IF;
    PERFORM set_config('app.troca_email', 'on', true);
    UPDATE public.solicitacoes SET status = 'CANCELADA', updated_at = now()
     WHERE tipo_solicitacao = 'EMAIL_CHANGE_REQUEST' AND solicitante_id = auth.uid() AND status = 'PENDENTE';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.troca_email', '', true);
    UPDATE public.notificacoes_central SET status_notificacao = 'RESOLVIDA', resolvida_em = now(), lida = true, dispensada_em = now()
     WHERE tipo_evento = 'EMAIL_ALTERACAO_SOLICITADA' AND status_notificacao <> 'RESOLVIDA'
       AND entidade_relacionada_id IN (SELECT id FROM public.solicitacoes WHERE tipo_solicitacao = 'EMAIL_CHANGE_REQUEST' AND solicitante_id = auth.uid() AND status = 'CANCELADA');
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.perfil_cancelar_troca_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_cancelar_troca_email() TO authenticated;

-- Owner/ADM decidem. Autorizar troca o e-mail de LOGIN e o cadastro; recusar não muda nada. O usuário é avisado.
CREATE OR REPLACE FUNCTION public.perfil_decidir_troca_email(p_solicitacao uuid, p_aprovar boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_tenant uuid := public.fn_biblioteca_tenant();
    v_sol public.solicitacoes%ROWTYPE;
    v_novo text;
    v_antigo text;
    v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
    IF v_tenant IS NULL OR NOT public.fn_biblioteca_admin() THEN
        RAISE EXCEPTION 'Somente Owner ou ADM decidem a troca de e-mail.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_sol FROM public.solicitacoes WHERE id = p_solicitacao FOR UPDATE;
    IF NOT FOUND OR v_sol.tipo_solicitacao <> 'EMAIL_CHANGE_REQUEST' OR v_sol.empresa_operadora_id <> v_tenant THEN
        RAISE EXCEPTION 'Pedido de troca de e-mail não encontrado.';
    END IF;
    IF v_sol.status <> 'PENDENTE' THEN RAISE EXCEPTION 'Este pedido já foi decidido (%).', v_sol.status; END IF;
    IF v_sol.solicitante_id = auth.uid() THEN RAISE EXCEPTION 'Outra pessoa do Owner/ADM precisa autorizar o seu próprio pedido.'; END IF;

    v_novo := lower(substring(v_sol.descricao FROM ' para ([^ ]+)\.$'));
    SELECT email INTO v_antigo FROM public.usuarios WHERE id = v_sol.solicitante_id;
    IF p_aprovar THEN
        IF v_novo IS NULL OR v_novo !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'Pedido sem e-mail válido.'; END IF;
        IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_novo AND id <> v_sol.solicitante_id)
           OR EXISTS (SELECT 1 FROM public.usuarios WHERE lower(email) = v_novo AND id <> v_sol.solicitante_id) THEN
            RAISE EXCEPTION 'Este e-mail já está em uso por outra conta.';
        END IF;
        PERFORM set_config('app.troca_email', 'on', true);
        UPDATE public.usuarios SET email = v_novo, updated_at = now() WHERE id = v_sol.solicitante_id;
        UPDATE auth.users SET email = v_novo, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() WHERE id = v_sol.solicitante_id;
        UPDATE auth.identities SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_novo)), updated_at = now()
         WHERE user_id = v_sol.solicitante_id AND provider = 'email';
    ELSE
        PERFORM set_config('app.troca_email', 'on', true);
    END IF;

    UPDATE public.solicitacoes
       SET status = CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'REJEITADA' END, responsavel_id = auth.uid(),
           decisao_motivo = v_motivo, decisao_data = now(), updated_at = now()
     WHERE id = p_solicitacao;
    PERFORM set_config('app.troca_email', '', true);

    -- baixa os avisos dos Owner/ADM e avisa o usuário
    UPDATE public.notificacoes_central
       SET status_notificacao = 'RESOLVIDA', resolvida_em = now(), lida = true, lida_em = coalesce(lida_em, now())
     WHERE entidade_relacionada_tipo = 'solicitacao_email' AND entidade_relacionada_id = p_solicitacao;

    INSERT INTO public.notificacoes_central
        (empresa_operadora_id, usuario_id, tipo_evento, canal, titulo, mensagem, prioridade, severidade, rota_destino, status_notificacao, lida)
    VALUES (v_tenant, v_sol.solicitante_id, CASE WHEN p_aprovar THEN 'EMAIL_ALTERACAO_AUTORIZADA' ELSE 'EMAIL_ALTERACAO_RECUSADA' END, 'IN_APP',
            CASE WHEN p_aprovar THEN 'Troca de e-mail autorizada' ELSE 'Troca de e-mail recusada' END,
            CASE WHEN p_aprovar THEN 'Seu e-mail de acesso agora é ' || v_novo || '. Use-o na próxima vez que entrar.'
                 ELSE 'Seu pedido para trocar o e-mail não foi autorizado.' || coalesce(' Motivo: ' || v_motivo, '') END,
            'IMPORTANTE', CASE WHEN p_aprovar THEN 'INFO' ELSE 'AVISO' END, NULL, 'NAO_LIDA', false);

    INSERT INTO public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
    VALUES (v_tenant, auth.uid(), 'USUARIO', v_sol.solicitante_id,
            CASE WHEN p_aprovar THEN 'EMAIL_ALTERACAO_AUTORIZADA' ELSE 'EMAIL_ALTERACAO_RECUSADA' END,
            CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'REJEITADA' END,
            'De ' || coalesce(v_antigo, '?') || ' para ' || coalesce(v_novo, '?') || coalesce(' | Motivo: ' || v_motivo, ''));

    RETURN jsonb_build_object('ok', true, 'aprovada', p_aprovar, 'novo_email', CASE WHEN p_aprovar THEN v_novo END);
END;
$$;
REVOKE ALL ON FUNCTION public.perfil_decidir_troca_email(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_decidir_troca_email(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------- 5. Ninguém troca o próprio e-mail "por fora" (só pela troca autorizada)
CREATE OR REPLACE FUNCTION public.tg_usuarios_email_so_autorizado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email AND auth.uid() IS NOT NULL AND auth.uid() = OLD.id
       AND coalesce(current_setting('app.troca_email', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Para trocar o e-mail, faça o pedido em Meu Perfil: o Owner/ADM precisa autorizar.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_usuarios_email_so_autorizado ON public.usuarios;
CREATE TRIGGER tg_usuarios_email_so_autorizado BEFORE UPDATE OF email ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.tg_usuarios_email_so_autorizado();
