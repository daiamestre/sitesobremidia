-- F-136 — Tudo que se cria pode ser excluído: função única de exclusão, com regra por tipo de registro.
-- Antes: propostas, pedidos de inserção, produções, agendamentos, campanhas, representantes, pontos parceiros,
-- cobranças e contatos podiam ser criados e não tinham como ser excluídos pelo painel.
-- A função confere quem chama (dono/administrador da empresa; autor ou cliente dono onde faz sentido), recusa com
-- mensagem clara quando excluir quebraria algo (pagamento recebido, anúncio no ar, aparelho pareado) e apaga o
-- registro com o que depende dele. Onde há histórico que não pode sumir (representante com clientes/contratos,
-- ponto parceiro), a exclusão é lógica: o registro sai de todas as listas e o histórico fica guardado.

CREATE OR REPLACE FUNCTION public.fn_excluir_registro(p_tipo text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_gestao boolean;
  v_externo boolean;
  v_cliente uuid;
  v_reg_tenant uuid;
  v_reg_cliente uuid;
  v_autor uuid;
  v_status text;
  v_n int;
  v_modo text := 'APAGADO';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'É preciso estar logado para excluir.' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Registro não informado.' USING ERRCODE = '22023'; END IF;
  v_tenant := public.get_user_empresa_operadora_id(v_uid);
  v_gestao := public.fn_eh_owner_ou_admin();
  v_externo := public.fn_perfil_cliente_externo();
  v_cliente := public.get_user_cliente_id();

  CASE upper(coalesce(p_tipo, ''))

  WHEN 'PROPOSTA' THEN
    SELECT empresa_operadora_id, created_by, status INTO v_reg_tenant, v_autor, v_status FROM public.propostas WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR v_externo OR NOT (v_gestao OR v_autor = v_uid) THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir esta proposta.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pedidos_insercao WHERE proposta_id = p_id) THEN
      RAISE EXCEPTION 'Esta proposta já gerou um pedido de inserção. Exclua o pedido primeiro.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.contratos WHERE proposta_id = p_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Esta proposta já virou contrato. Exclua o contrato primeiro.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.propostas WHERE id = p_id;

  WHEN 'PEDIDO_INSERCAO' THEN
    SELECT empresa_operadora_id, status INTO v_reg_tenant, v_status FROM public.pedidos_insercao WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de inserção não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui pedido de inserção.' USING ERRCODE = '42501';
    END IF;
    IF upper(coalesce(v_status, '')) IN ('EM_EXIBICAO', 'EM_VEICULACAO') THEN
      RAISE EXCEPTION 'Este pedido está em veiculação. Encerre a veiculação antes de excluir.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.ordens_producao WHERE pedido_insercao_id = p_id;
    DELETE FROM public.pedidos_insercao WHERE id = p_id;

  WHEN 'PRODUCAO' THEN
    SELECT empresa_operadora_id INTO v_reg_tenant FROM public.producoes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produção não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui produção.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.producoes WHERE id = p_id;

  WHEN 'AGENDAMENTO' THEN
    SELECT empresa_operadora_id INTO v_reg_tenant FROM public.agendamentos WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui agendamento.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.agendamentos WHERE id = p_id;

  WHEN 'CAMPANHA' THEN
    SELECT empresa_operadora_id, cliente_id, created_by INTO v_reg_tenant, v_reg_cliente, v_autor FROM public.campanhas WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant
       OR NOT (v_gestao OR (v_externo AND v_reg_cliente IS NOT NULL AND v_reg_cliente = v_cliente) OR (NOT v_externo AND v_autor = v_uid)) THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir esta campanha.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.campanhas WHERE id = p_id;

  WHEN 'REPRESENTANTE' THEN
    SELECT empresa_operadora_id INTO v_reg_tenant FROM public.representantes WHERE id = p_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Representante não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui representante.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.clientes WHERE representante_id = p_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Este representante ainda tem clientes na carteira. Transfira os clientes para outro representante antes de excluir.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.clientes WHERE representante_id = p_id)
       OR EXISTS (SELECT 1 FROM public.contratos WHERE representante_id = p_id)
       OR EXISTS (SELECT 1 FROM public.propostas WHERE representante_id = p_id)
       OR EXISTS (SELECT 1 FROM public.comissoes_representantes WHERE representante_id = p_id)
       OR EXISTS (SELECT 1 FROM public.metas_representantes WHERE representante_id = p_id) THEN
      -- tem histórico comercial: sai das listas, o histórico (contratos, comissões) fica guardado
      UPDATE public.representantes SET deleted_at = now(), deleted_by = v_uid, ativo = false, delete_reason = 'Excluído pelo painel' WHERE id = p_id;
      v_modo := 'ARQUIVADO';
    ELSE
      DELETE FROM public.representantes WHERE id = p_id;
    END IF;

  WHEN 'PONTO_PARCEIRO' THEN
    SELECT empresa_operadora_id INTO v_reg_tenant FROM public.pontos WHERE id = p_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ponto parceiro não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui ponto parceiro.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ponto_anuncios WHERE ponto_id = p_id AND upper(status) IN ('ATIVO', 'EM_ANALISE', 'AGUARDANDO_PAGAMENTO')) THEN
      RAISE EXCEPTION 'Este ponto tem anúncio no ar ou em andamento. Encerre os anúncios antes de excluir o ponto.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.screens WHERE ponto_id = p_id AND bound_device_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Há tela deste ponto com aparelho pareado. Desvincule o aparelho antes de excluir o ponto.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.screens WHERE ponto_id = p_id;
    DELETE FROM public.ponto_anuncios WHERE ponto_id = p_id;
    UPDATE public.pontos SET deleted_at = now(), ativo = false WHERE id = p_id;
    v_modo := 'ARQUIVADO';

  WHEN 'COBRANCA' THEN
    SELECT empresa_operadora_id, status INTO v_reg_tenant, v_status FROM public.contas_receber WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança não encontrada.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR NOT v_gestao THEN
      RAISE EXCEPTION 'Só o dono ou o administrador exclui cobrança.' USING ERRCODE = '42501';
    END IF;
    IF upper(coalesce(v_status, '')) IN ('PAGA', 'PAGO', 'CONCILIADA')
       OR EXISTS (SELECT 1 FROM public.pagamentos WHERE conta_receber_id = p_id)
       OR EXISTS (SELECT 1 FROM public.contas_receber WHERE id = p_id AND coalesce(valor_pago, 0) > 0) THEN
      RAISE EXCEPTION 'Esta cobrança já tem pagamento registrado e não pode ser excluída (o histórico financeiro precisa ficar).' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.contas_receber WHERE id = p_id AND (inter_codigo_solicitacao IS NOT NULL OR inter_pix_txid IS NOT NULL))
       OR EXISTS (SELECT 1 FROM public.contas_receber_emissoes_antigas WHERE conta_receber_id = p_id) THEN
      RAISE EXCEPTION 'Esta cobrança já tem boleto ou PIX emitido no banco. Use "Cancelar" (o cliente ainda poderia pagar o documento emitido).' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.repasses_parceiros WHERE conta_receber_id = p_id) THEN
      RAISE EXCEPTION 'Esta cobrança tem repasse a parceiro vinculado e não pode ser excluída.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.screens SET cobranca_id = NULL WHERE cobranca_id = p_id;
    DELETE FROM public.contas_receber WHERE id = p_id;

  WHEN 'CONTATO' THEN
    SELECT cl.empresa_operadora_id INTO v_reg_tenant
      FROM public.contatos ct JOIN public.empresas e ON e.id = ct.empresa_id JOIN public.clientes cl ON cl.id = e.cliente_id
     WHERE ct.id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contato não encontrado.' USING ERRCODE = 'P0002'; END IF;
    IF v_reg_tenant IS DISTINCT FROM v_tenant OR v_externo OR public.fn_perfil_sem_gestao_de_telas() AND NOT v_gestao THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir este contato.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.contatos WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'Tipo de registro não suportado para exclusão: %', p_tipo USING ERRCODE = '22023';
  END CASE;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.financeiro_auditoria (empresa_operadora_id, evento, usuario_id, detalhes)
  VALUES (v_tenant, 'REGISTRO_EXCLUIDO', v_uid, jsonb_build_object('tipo', upper(p_tipo), 'id', p_id, 'modo', v_modo));
  RETURN jsonb_build_object('status', 'OK', 'modo', v_modo);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_excluir_registro(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_registro(text, uuid) TO authenticated, service_role;
