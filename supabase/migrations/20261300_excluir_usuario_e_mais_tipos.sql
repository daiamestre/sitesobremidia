-- F-140 — Exclusão de usuário (inclui gestor de mídias e membro da equipe do anunciante), nota fiscal, comissão e chamado.
--
-- Usuário não é apagado fisicamente: contratos, cobranças, propostas e auditoria apontam para ele. A exclusão arquiva o
-- cadastro (some de todas as listas), desativa, tira as permissões, pausa as telas dele e troca o e-mail por um
-- marcador — a função de borda "excluir-usuario" encerra a conta de login em seguida, liberando o e-mail para um novo
-- cadastro. Quem pode:
--   * dono/administrador: usuários da própria empresa (administrador não exclui outro administrador; ninguém exclui o dono
--     nem a si mesmo);
--   * anunciante titular (o primeiro usuário do cliente) ou quem convidou: membros da própria equipe.

CREATE OR REPLACE FUNCTION public.fn_excluir_usuario(p_usuario uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  eu record;
  alvo record;
  v_perfil_alvo text;
  v_titular uuid;
  v_telas int := 0;
  v_claims text;
  v_sub text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'É preciso estar logado.' USING ERRCODE = '42501'; END IF;
  IF p_usuario IS NULL THEN RAISE EXCEPTION 'Usuário não informado.' USING ERRCODE = '22023'; END IF;
  IF p_usuario = v_uid THEN RAISE EXCEPTION 'Você não pode excluir a própria conta.' USING ERRCODE = 'P0001'; END IF;

  SELECT u.id, u.empresa_operadora_id, u.cliente_id, coalesce(u.is_owner, false) AS dono INTO eu FROM public.usuarios u WHERE u.id = v_uid;
  SELECT u.* INTO alvo FROM public.usuarios u WHERE u.id = p_usuario AND u.deleted_at IS NULL;
  IF alvo.id IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF alvo.empresa_operadora_id IS DISTINCT FROM eu.empresa_operadora_id THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(alvo.is_owner, false) THEN RAISE EXCEPTION 'O dono da conta não pode ser excluído.' USING ERRCODE = 'P0001'; END IF;
  SELECT upper(coalesce(p.nome, '')) INTO v_perfil_alvo FROM public.perfis p WHERE p.id = alvo.perfil_id;

  IF public.fn_eh_owner_ou_admin() THEN
    IF v_perfil_alvo = 'ADMIN' AND NOT eu.dono THEN
      RAISE EXCEPTION 'Só o dono exclui um administrador.' USING ERRCODE = '42501';
    END IF;
  ELSIF public.fn_perfil_cliente_externo() AND eu.cliente_id IS NOT NULL AND alvo.cliente_id = eu.cliente_id THEN
    -- equipe do anunciante: o titular (primeiro usuário do cliente) ou quem convidou
    SELECT u.id INTO v_titular FROM public.usuarios u WHERE u.cliente_id = eu.cliente_id AND u.deleted_at IS NULL ORDER BY u.created_at ASC LIMIT 1;
    IF alvo.id = v_titular THEN RAISE EXCEPTION 'O titular da conta do cliente só pode ser excluído pela Sobre Mídia.' USING ERRCODE = '42501'; END IF;
    IF v_uid IS DISTINCT FROM v_titular AND alvo.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Só o titular da conta exclui membros da equipe.' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Você não tem permissão para excluir este usuário.' USING ERRCODE = '42501';
  END IF;

  -- representante com clientes ativos: transferir a carteira antes
  IF EXISTS (SELECT 1 FROM public.representantes r JOIN public.clientes c ON c.representante_id = r.id AND c.deleted_at IS NULL
              WHERE r.usuario_id = p_usuario AND r.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Este usuário é representante e ainda tem clientes na carteira. Transfira os clientes antes de excluir.' USING ERRCODE = 'P0001';
  END IF;
  -- tela com aparelho pareado: desvincular antes (para o aparelho não ficar tocando conteúdo de uma conta excluída)
  IF EXISTS (SELECT 1 FROM public.screens s WHERE s.user_id = p_usuario AND s.bound_device_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Este usuário tem tela com aparelho pareado. Desvincule o aparelho antes de excluir.' USING ERRCODE = 'P0001';
  END IF;

  -- As autorizações já foram conferidas acima. Os gatilhos de proteção da tabela de usuários confiam em operações
  -- sem sessão de usuário (rotinas do sistema); a sessão é suspensa só durante a gravação e devolvida em seguida.
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('sobremidia.sistema', 'on', true);
  UPDATE public.screens SET is_active = false, updated_at = now() WHERE user_id = p_usuario AND is_active IS TRUE;
  GET DIAGNOSTICS v_telas = ROW_COUNT;
  UPDATE public.representantes SET deleted_at = now(), deleted_by = v_uid, ativo = false, delete_reason = 'Usuário excluído pelo painel'
   WHERE usuario_id = p_usuario AND deleted_at IS NULL;
  DELETE FROM public.permissoes_usuarios WHERE usuario_id = p_usuario;
  DELETE FROM public.profiles WHERE user_id = p_usuario;  -- lista antiga de contas do painel
  UPDATE public.usuarios
     SET deleted_at = now(), deleted_by = v_uid, ativo = false, status = 'INACTIVE',
         delete_reason = 'Excluído pelo painel (e-mail original: ' || coalesce(alvo.email, '-') || ')',
         email = 'excluido-' || replace(p_usuario::text, '-', '') || '@removido.invalid'
   WHERE id = p_usuario;
  PERFORM set_config('sobremidia.sistema', '', true);
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
  VALUES (eu.empresa_operadora_id, 'REGISTRO_EXCLUIDO', v_uid,
          jsonb_build_object('tipo', 'USUARIO', 'id', p_usuario, 'modo', 'ARQUIVADO', 'perfil', v_perfil_alvo, 'telas_pausadas', v_telas));
  RETURN jsonb_build_object('status', 'OK', 'modo', 'ARQUIVADO', 'perfil', v_perfil_alvo, 'telas_pausadas', v_telas);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_excluir_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_usuario(uuid) TO authenticated, service_role;

-- Novos tipos na exclusão central: nota fiscal, comissão e chamado do portal.
-- Os ramos são inseridos antes do "ELSE" final de fn_excluir_registro; o restante da função fica como estava.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_excluir_registro';
  IF v_def IS NULL THEN RAISE EXCEPTION 'fn_excluir_registro não encontrada'; END IF;
  IF position('WHEN ''NOTA_FISCAL'' THEN' IN v_def) = 0 THEN
    v_def := replace(v_def, E'  ELSE\n    RAISE EXCEPTION ''Tipo de registro não suportado', $novos$  WHEN 'NOTA_FISCAL' THEN
    SELECT empresa_operadora_id, status INTO v_reg_tenant, v_status FROM public.notas_fiscais WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nota fiscal não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui nota fiscal.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.notas_fiscais WHERE id = p_id AND numero_nfse IS NOT NULL) THEN
      RAISE EXCEPTION 'Esta nota já foi emitida na prefeitura (tem número de NFS-e) e não pode ser excluída aqui. Cancele a nota na prefeitura.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.notas_fiscais WHERE id = p_id;

  WHEN 'COMISSAO' THEN
    SELECT empresa_operadora_id, status INTO v_reg_tenant, v_status FROM public.comissoes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comissão não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui comissão.' USING ERRCODE = '42501';
    END IF;
    IF upper(coalesce(v_status, '')) IN ('PAGA', 'PAGO') THEN
      RAISE EXCEPTION 'Esta comissão já foi paga e não pode ser excluída (o histórico financeiro precisa ficar).' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.comissoes WHERE id = p_id;

  WHEN 'CHAMADO' THEN
    SELECT empresa_operadora_id, created_by INTO v_reg_tenant, v_autor FROM public.portal_chamados WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Chamado não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT (v_gestao OR v_autor = v_uid) THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir este chamado.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.portal_chamados WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'Tipo de registro não suportado$novos$);
    IF position('WHEN ''NOTA_FISCAL'' THEN' IN v_def) = 0 THEN RAISE EXCEPTION 'não foi possível acrescentar os novos tipos'; END IF;
    EXECUTE v_def;
  END IF;
END $$;
