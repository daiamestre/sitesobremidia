-- F-268 — Teste da MEMÓRIA DE ESTILO POR CLIENTE (somente leitura: termina com RESULTADO e DESFAZ tudo).
-- Uso: node scripts/ops/sql.mjs @scripts/ops/teste-preferencias.sql | node scripts/ops/resultado-sql.mjs
do $$
declare
  v_out text := ''; v_emp uuid; v_a uuid; v_ca uuid; v_b uuid; v_cb uuid; v_dono uuid; v_dono_b uuid; v_gestor uuid;
  v_n int; v_id uuid; v_r jsonb;
begin
  select u.id, u.cliente_id, u.empresa_operadora_id into v_a, v_ca, v_emp from usuarios u join perfis p on p.id = u.perfil_id
   where p.nome = 'ANUNCIANTE' and u.cliente_id is not null and u.empresa_operadora_id = '7d62aaec-e24d-4273-b257-867183cf658c' order by u.id limit 1;
  select u.id, u.cliente_id into v_b, v_cb from usuarios u join perfis p on p.id = u.perfil_id
   where p.nome = 'ANUNCIANTE' and u.cliente_id is not null and u.cliente_id <> v_ca and u.empresa_operadora_id = v_emp order by u.id limit 1;
  select id into v_dono from usuarios where empresa_operadora_id = v_emp and is_owner limit 1;
  select id into v_dono_b from usuarios where empresa_operadora_id is distinct from v_emp and empresa_operadora_id is not null and is_owner
     and not public.has_role(id, 'admin'::app_role) limit 1;
  select u.id into v_gestor from usuarios u join perfis p on p.id = u.perfil_id where p.nome = 'GESTOR' and u.empresa_operadora_id = v_emp limit 1;

  -- ---------- anunciante A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.studio_preferencia_salvar('{"tom":"Alegre e popular"}', false); v_out := v_out || E'FALHA salvou sem consentimento\n';
  exception when others then v_out := v_out || E'OK sem consentimento nada é guardado\n'; end;
  v_id := public.studio_preferencia_salvar('{"tom":"Alegre e popular","paleta":["#0a9a50","#FFD21F","red","#123"],"observacoes":"logo sempre no canto","senha":"x"}', true);
  select conteudo into v_r from studio_conhecimento where id = v_id;
  v_out := v_out || case when v_r->'estilo'->>'tom' = 'Alegre e popular' and v_r->'estilo'->'paleta' = '["#0A9A50","#FFD21F"]'::jsonb and v_r->'estilo'->'senha' is null
           and (v_r->'consentimento'->>'aceito')::boolean and v_r->'consentimento'->>'por' = v_a::text then 'OK' else 'FALHA ' || v_r::text end
           || E' anunciante guarda o PRÓPRIO estilo com consentimento (só campos permitidos)\n';
  select count(*) into v_n from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca and ativo;
  v_out := v_out || case when v_n = 1 then 'OK' else 'FALHA' end || E' anunciante lê o próprio estilo\n';
  begin perform public.studio_preferencia_salvar('{"tom":"Impactante"}', true, v_cb); v_out := v_out || E'FALHA anunciante gravou estilo de OUTRO cliente\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anunciante não grava estilo de outro cliente\n'; end;
  begin insert into studio_conhecimento (escopo, empresa_operadora_id, cliente_id, tipo, chave, versao, conteudo, impressao, motivo)
        values ('cliente', v_emp, v_ca, 'preferencia', 'estilo', 99, '{}', 'x', 'direto'); v_out := v_out || E'FALHA inseriu direto na tabela\n';
  exception when insufficient_privilege then v_out := v_out || E'OK ninguém grava direto na tabela (só pela função)\n'; end;
  execute 'reset role';

  -- ---------- anunciante B (outro cliente da mesma empresa), dono de outra empresa, gestor ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca;
  v_out := v_out || case when v_n = 0 then 'OK' else 'FALHA' end || E' outro cliente da mesma empresa NÃO vê o estilo\n';
  begin perform public.studio_preferencia_revogar(v_ca, true); v_out := v_out || E'FALHA outro cliente apagou\n';
  exception when insufficient_privilege then v_out := v_out || E'OK outro cliente não apaga\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca;
  v_out := v_out || case when v_n = 0 then 'OK' else 'FALHA' end || E' dono de OUTRA empresa não vê\n';
  begin perform public.studio_preferencia_salvar('{"tom":"Impactante"}', true, v_ca); v_out := v_out || E'FALHA outra empresa gravou\n';
  exception when insufficient_privilege then v_out := v_out || E'OK dono de outra empresa não grava\n'; end;
  execute 'reset role';
  if v_gestor is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin perform public.studio_preferencia_salvar('{"tom":"Impactante"}', true, v_ca); v_out := v_out || E'FALHA gestor gravou\n';
    exception when insufficient_privilege then v_out := v_out || E'OK gestor não grava estilo de cliente\n'; end;
    execute 'reset role';
  end if;

  -- ---------- dono da empresa: lê, atualiza (versão nova), revoga e apaga ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca and ativo;
  v_out := v_out || case when v_n = 1 then 'OK' else 'FALHA' end || E' dono da empresa vê o estilo do cliente\n';
  perform public.studio_preferencia_salvar('{"tom":"Premium e sofisticado","formato":"9:16"}', true, v_ca);
  execute 'reset role';
  select count(*) into v_n from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca and ativo and conteudo->'estilo'->>'tom' = 'Premium e sofisticado';
  v_out := v_out || case when v_n = 1 and (select count(*) from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca) = 2 then 'OK' else 'FALHA' end
           || E' atualização vira versão nova e a anterior fica no histórico (inativa)\n';
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_n := public.studio_preferencia_revogar();
  execute 'reset role';
  v_out := v_out || case when v_n = 1 and not exists (select 1 from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca and ativo) then 'OK' else 'FALHA' end
           || E' anunciante REVOGA o consentimento: nada fica ativo\n';
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_n := public.studio_preferencia_revogar(null, true);
  execute 'reset role';
  v_out := v_out || case when v_n = 2 and not exists (select 1 from studio_conhecimento where tipo = 'preferencia' and cliente_id = v_ca) then 'OK' else 'FALHA' end
           || E' pedido de EXCLUSÃO apaga todas as versões\n';
  raise exception E'RESULTADO\n%', v_out;
end $$;
