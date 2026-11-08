-- F-263 — Teste do PAREAMENTO POR CÓDIGO (somente leitura: termina com RESULTADO e DESFAZ tudo).
-- Uso: node scripts/ops/sql.mjs @scripts/ops/teste-pareamento.sql
-- Ensaio antes de aplicar: junte a migração + este arquivo num único envio (tudo é desfeito no fim).
-- Esperado: toda linha começa com OK.
do $$
declare
  v_out text := '';
  v_tela uuid; v_emp uuid; v_outra uuid;
  v_dono uuid; v_anun uuid; v_cli uuid; v_gestor uuid; v_dono_b uuid;
  v_hash text := 'teste-f263-' || gen_random_uuid()::text;
  v_hash2 text := 'teste-f263-' || gen_random_uuid()::text;
  v_r jsonb; v_code text; v_code2 text; v_n int; v_logs0 int; v_logs1 int;
  procedure_ok boolean;

begin
  -- ---------- preparo (acesso total) ----------
  select s.id, s.empresa_operadora_id into v_tela, v_emp from screens s
   where s.empresa_operadora_id = '7d62aaec-e24d-4273-b257-867183cf658c' order by s.created_at limit 1;
  select id into v_dono from usuarios where empresa_operadora_id = v_emp and is_owner limit 1;
  select u.id into v_anun from usuarios u join perfis p on p.id = u.perfil_id where u.empresa_operadora_id = v_emp and p.nome = 'ANUNCIANTE'
     and not exists (select 1 from screens s where s.user_id = u.id) limit 1;
  select u.id into v_cli from usuarios u join perfis p on p.id = u.perfil_id where u.empresa_operadora_id = v_emp and p.nome = 'CLIENTE'
     and not exists (select 1 from screens s where s.user_id = u.id) limit 1;
  select u.id into v_gestor from usuarios u join perfis p on p.id = u.perfil_id where u.empresa_operadora_id = v_emp and p.nome = 'GESTOR'
     and u.id is distinct from (select user_id from screens where id = v_tela) limit 1;
  select id into v_dono_b from usuarios where empresa_operadora_id is distinct from v_emp and empresa_operadora_id is not null and is_owner
     and not public.has_role(id, 'admin'::app_role) limit 1;
  select count(*) into v_logs0 from security_logs where event_type = 'ACCESS_DENIED' and details->>'acao' = 'pareamento';

  -- ---------- anônimo: tabela fechada; funções públicas funcionam ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform count(*) from device_pairing_codes; v_out := v_out || E'FALHA anon leu a tabela\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anon não lê a tabela\n'; end;
  begin insert into device_pairing_codes (pairing_code, identity_hash, status, expires_at) values ('999999', v_hash, 'pending', now() + interval '1 hour');
        v_out := v_out || E'FALHA anon inseriu código\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anon não insere código direto\n'; end;
  v_r := public.fn_request_pairing_code(v_hash, 'EMULADOR-F263');
  v_code := v_r->>'pairing_code';
  v_out := v_out || case when (v_r->>'ok')::boolean and length(v_code) = 6 then 'OK' else 'FALHA' end || E' aparelho pede código pela função\n';
  v_r := public.fn_check_pairing_status(v_hash);
  v_out := v_out || case when v_r->>'status' = 'pending' then 'OK' else 'FALHA' end || E' aparelho consulta: pendente\n';
  v_r := public.fn_check_pairing_status('teste-f263-outro-aparelho');
  v_out := v_out || case when v_r->>'status' = 'not_found' then 'OK' else 'FALHA' end || E' identificador de outro aparelho: não encontrado\n';
  begin v_r := public.fn_link_device_to_screen(v_code, v_tela); v_out := v_out || 'FALHA anon chamou o vínculo: ' || v_r::text || E'\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anon não chama o vínculo\n'; end;
  execute 'reset role';

  -- ---------- anunciante da mesma empresa ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_anun, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from device_pairing_codes; v_out := v_out || E'FALHA anunciante leu a tabela\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anunciante não lê a tabela\n'; end;
  begin update device_pairing_codes set status = status; v_out := v_out || E'FALHA anunciante alterou\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anunciante não altera\n'; end;
  begin delete from device_pairing_codes; v_out := v_out || E'FALHA anunciante apagou\n';
  exception when insufficient_privilege then v_out := v_out || E'OK anunciante não apaga\n'; end;
  v_r := public.fn_link_device_to_screen(v_code, v_tela);
  v_out := v_out || case when v_r->>'error' = 'forbidden_screen' then 'OK' else 'FALHA' end || ' anunciante não liga aparelho à tela da empresa: ' || coalesce(v_r->>'error', v_r::text) || E'\n';
  execute 'reset role';

  -- ---------- cliente, gestor (tela que não é dele) e dono de OUTRA empresa ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_r := public.fn_link_device_to_screen(v_code, v_tela);
  v_out := v_out || case when v_r->>'error' = 'forbidden_screen' then 'OK' else 'FALHA' end || E' cliente bloqueado\n';
  execute 'reset role';
  if v_gestor is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_r := public.fn_link_device_to_screen(v_code, v_tela);
    v_out := v_out || case when v_r->>'error' = 'forbidden_screen' then 'OK' else 'FALHA' end || E' gestor bloqueado em tela que não é dele\n';
    execute 'reset role';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_r := public.fn_link_device_to_screen(v_code, v_tela);
  v_out := v_out || case when v_r->>'error' = 'forbidden_screen' then 'OK' else 'FALHA' end || E' dono de outra empresa bloqueado\n';
  execute 'reset role';

  -- ---------- dono da empresa: código inválido, vínculo válido, reuso ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_r := public.fn_link_device_to_screen('ZZZZZZ', v_tela);
  v_out := v_out || case when v_r->>'error' = 'invalid_or_expired_code' then 'OK' else 'FALHA' end || E' código inválido recusado\n';
  v_r := public.fn_link_device_to_screen(v_code, v_tela);
  v_out := v_out || case when (v_r->>'ok')::boolean and length(v_r->>'screen_token') = 64 then 'OK' else 'FALHA ' || v_r::text end || E' dono liga o aparelho à tela\n';
  v_r := public.fn_link_device_to_screen(v_code, v_tela);
  v_out := v_out || case when v_r->>'error' = 'invalid_or_expired_code' then 'OK' else 'FALHA' end || E' código já usado recusado\n';
  execute 'reset role';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  v_r := public.fn_check_pairing_status(v_hash);
  v_out := v_out || case when v_r->>'status' = 'paired' and (v_r->>'screen_id')::uuid = v_tela and length(v_r->>'screen_token') = 64 then 'OK' else 'FALHA' end || E' aparelho recebe: pareado + token\n';
  v_r := public.fn_request_pairing_code(v_hash2, 'EMULADOR-F263');
  v_code2 := v_r->>'pairing_code';
  execute 'reset role';

  -- ---------- casos POSITIVOS por perfil: gestor na PRÓPRIA tela; ADMIN (não dono) em tela da empresa dele ----------
  declare v_g uuid; v_gt uuid; v_ad uuid; v_at uuid; v_h text; v_c text;
  begin
    select s.user_id, s.id into v_g, v_gt from screens s join usuarios u on u.id = s.user_id join perfis p on p.id = u.perfil_id
     where p.nome = 'GESTOR' limit 1;
    select u.id, s.id into v_ad, v_at from usuarios u join perfis p on p.id = u.perfil_id join screens s on s.empresa_operadora_id = u.empresa_operadora_id
     where p.nome = 'ADMIN' and not coalesce(u.is_owner, false) and not public.has_role(u.id, 'admin'::app_role) limit 1;
    foreach v_h in array array['g', 'a'] loop
      continue when (v_h = 'g' and v_g is null) or (v_h = 'a' and v_ad is null);
      execute 'set local role anon';
      v_c := public.fn_request_pairing_code('teste-f263-' || v_h || gen_random_uuid()::text, 'EMULADOR-F263')->>'pairing_code';
      execute 'reset role';
      perform set_config('request.jwt.claims', json_build_object('sub', case v_h when 'g' then v_g else v_ad end, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      v_r := public.fn_link_device_to_screen(v_c, case v_h when 'g' then v_gt else v_at end);
      v_out := v_out || case when (v_r->>'ok')::boolean then 'OK' else 'FALHA ' || v_r::text end
            || case v_h when 'g' then ' gestor liga aparelho na PRÓPRIA tela' else ' ADMIN (não dono) liga aparelho em tela da empresa' end || E'\n';
      execute 'reset role';
    end loop;
  end;

  -- ---------- código expirado ----------
  update device_pairing_codes set expires_at = now() - interval '1 minute' where identity_hash = v_hash2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_r := public.fn_link_device_to_screen(v_code2, v_tela);
  v_out := v_out || case when v_r->>'error' = 'invalid_or_expired_code' then 'OK' else 'FALHA' end || E' código expirado recusado\n';
  execute 'reset role';

  select count(*) into v_logs1 from security_logs where event_type = 'ACCESS_DENIED' and details->>'acao' = 'pareamento';
  v_out := v_out || case when v_logs1 - v_logs0 >= 3 then 'OK' else 'FALHA' end || ' recusas registradas em security_logs: ' || (v_logs1 - v_logs0) || E'\n';
  select count(*) into v_n from security_logs where event_type = 'DEVICE_PAIRED' and details->>'screen_id' = v_tela::text and created_at > now() - interval '1 minute';
  v_out := v_out || case when v_n >= 1 then 'OK' else 'FALHA' end || E' vínculo registrado em security_logs\n';

  raise exception E'RESULTADO\n%', v_out;
end $$;
