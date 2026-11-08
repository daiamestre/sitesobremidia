-- Uso: node scripts/ops/sql.mjs @scripts/ops/teste-isolamento.sql  (somente leitura; termina com RESULTADO e desfaz tudo)
-- MG-AUT-01 / TESTE 7: um usuário de cada perfil tenta ler dados de outros clientes e de outras empresas.
-- Os alvos (ids alheios) são calculados ANTES, com acesso total; depois, com o login simulado ("authenticated"),
-- conta-se quantos desses alvos ele enxerga. Tudo é DESFEITO no fim (raise exception devolve o resultado).
do $$
declare r record; v_out text := ''; v_n int; a_midia_emp uuid[]; a_midia_cli uuid[]; a_tela uuid[]; a_prod uuid[]; a_mem uuid[]; a_contr uuid[];
begin
  for r in
    select distinct on (p.nome) u.id, u.cliente_id, u.empresa_operadora_id, p.nome perfil
      from usuarios u join perfis p on p.id = u.perfil_id
     where p.nome in ('ANUNCIANTE','CLIENTE','PARCEIRO','REPRESENTANTE','GESTOR','FINANCEIRO','GERENTE','FUNCIONARIO')
       and u.empresa_operadora_id is not null
     order by p.nome, u.id
  loop
    execute 'reset role';
    select array_agg(m.id) into a_midia_emp from media m join usuarios d on d.id = m.user_id where d.empresa_operadora_id is distinct from r.empresa_operadora_id;
    select array_agg(m.id) into a_midia_cli from media m join usuarios d on d.id = m.user_id where r.cliente_id is not null and d.cliente_id is not null and d.cliente_id <> r.cliente_id;
    select array_agg(id) into a_tela from screens where empresa_operadora_id is distinct from r.empresa_operadora_id;
    select array_agg(id) into a_prod from studio_producoes where user_id <> r.id;
    select array_agg(id) into a_mem from studio_conhecimento where escopo <> 'global';
    select array_agg(id) into a_contr from contratos where empresa_operadora_id is distinct from r.empresa_operadora_id
      or (r.cliente_id is not null and cliente_id <> r.cliente_id);

    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_out := v_out || rpad(r.perfil, 13);
    select count(*) into v_n from media where id = any(coalesce(a_midia_emp, '{}')); v_out := v_out || ' midia_outra_empresa=' || v_n || '/' || coalesce(cardinality(a_midia_emp), 0);
    select count(*) into v_n from media where id = any(coalesce(a_midia_cli, '{}')); v_out := v_out || ' midia_outro_cliente=' || v_n || '/' || coalesce(cardinality(a_midia_cli), 0);
    select count(*) into v_n from screens where id = any(coalesce(a_tela, '{}')); v_out := v_out || ' telas_outra_empresa=' || v_n || '/' || coalesce(cardinality(a_tela), 0);
    select count(*) into v_n from contratos where id = any(coalesce(a_contr, '{}')); v_out := v_out || ' contratos_alheios=' || v_n || '/' || coalesce(cardinality(a_contr), 0);
    select count(*) into v_n from studio_producoes where id = any(coalesce(a_prod, '{}')); v_out := v_out || ' producoes_alheias=' || v_n || '/' || coalesce(cardinality(a_prod), 0);
    select count(*) into v_n from studio_conhecimento where id = any(coalesce(a_mem, '{}')); v_out := v_out || ' memoria_privada=' || v_n || '/' || coalesce(cardinality(a_mem), 0) || E'\n';
  end loop;
  execute 'reset role';
  raise exception E'RESULTADO\n%', v_out;
end $$;
