-- =====================================================================================================================
-- F-263 (MG-AUT-09a, R-1) — PAREAMENTO POR CÓDIGO SEGURO.
-- Motivo (provado em transação desfeita, F-262): a regra `dpc_all_auth` (ALL, true) deixava QUALQUER usuário logado ler e
-- alterar todos os códigos de pareamento (anunciante alterou 6 de 6); as regras `dpc_*_anon` davam o mesmo ao anônimo.
-- E `fn_link_device_to_screen` só exigia login: qualquer logado com um código ligava o aparelho a uma tela de OUTRA
-- empresa e recebia o token dessa tela.
-- O que muda:
--   1. A tabela `device_pairing_codes` fica SEM acesso direto (sem regra = nega tudo; grants retirados). Ninguém no site
--      nem no Player lê a tabela direto (grep em src/ e native-android-player/: 0 usos); tudo passa pelas funções
--      SECURITY DEFINER (dono postgres), que continuam funcionando: fn_request_pairing_code, fn_check_pairing_status
--      (Player web, anônimo, pelo identity_hash do próprio aparelho) e fn_link_device_to_screen (painel).
--   2. `fn_link_device_to_screen` passa a exigir a MESMA regra de "alterar tela" que já existe no banco:
--      fn_player_can_access_screen(tela) E (tela é do próprio usuário OU o perfil gerencia telas —
--      fn_perfil_sem_gestao_de_telas, a trava restritiva `scr_update_so_gestao`). Recusas e vínculos vão para security_logs.
-- Impacto no Player: NENHUM no Player Android (pareia por login, fn_device_bind). O Player web segue pelas mesmas funções.
-- Não toca em get_player_playlist_for_screen, devices já vinculados nem screens.
-- ROLLBACK (volta exatamente ao estado anterior; definição antiga em docs/engineering/evidence/F-263_pareamento/):
--   grant select, insert, update, delete on public.device_pairing_codes to anon, authenticated;
--   create policy dpc_all_auth on public.device_pairing_codes for all to authenticated using (true) with check (true);
--   create policy dpc_insert_anon on public.device_pairing_codes for insert to anon with check (true);
--   create policy dpc_select_anon on public.device_pairing_codes for select to anon using (true);
--   create policy dpc_update_anon on public.device_pairing_codes for update to anon using (true) with check (true);
--   e reaplicar docs/engineering/evidence/F-263_pareamento/fn_link_device_to_screen.sql
--   alter table public.security_logs drop constraint security_logs_event_type_check; alter table public.security_logs add constraint
--     security_logs_event_type_check check (event_type::text = any (array['LOGIN_FAILED','LOGIN_SUCCESS','LOGOUT','REPRESENTATIVE_APPROVED','PASSWORD_CHANGED','ACCESS_DENIED']));
--     (antes, apagar as linhas DEVICE_PAIRED se houver)
-- =====================================================================================================================

drop policy if exists dpc_all_auth on public.device_pairing_codes;
drop policy if exists dpc_insert_anon on public.device_pairing_codes;
drop policy if exists dpc_select_anon on public.device_pairing_codes;
drop policy if exists dpc_update_anon on public.device_pairing_codes;
alter table public.device_pairing_codes enable row level security;
revoke select, insert, update, delete, truncate on public.device_pairing_codes from anon, authenticated;

-- registro de auditoria: o evento DEVICE_PAIRED entra na lista aceita (aditivo; recusa usa o ACCESS_DENIED que já existe)
alter table public.security_logs drop constraint if exists security_logs_event_type_check;
alter table public.security_logs add constraint security_logs_event_type_check check (event_type::text = any (array['LOGIN_FAILED', 'LOGIN_SUCCESS', 'LOGOUT', 'REPRESENTATIVE_APPROVED', 'PASSWORD_CHANGED', 'ACCESS_DENIED', 'DEVICE_PAIRED']));

create or replace function public.fn_link_device_to_screen(p_pairing_code character varying, p_screen_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_record public.device_pairing_codes%rowtype;
  v_new_screen_token text;
  v_dono_da_tela uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- F-263: só quem pode ALTERAR a tela pode ligar um aparelho a ela (mesma regra das políticas de screens)
  select s.user_id into v_dono_da_tela from public.screens s where s.id = p_screen_id;
  if not found
     or not public.fn_player_can_access_screen(p_screen_id)
     or (v_dono_da_tela is distinct from v_uid and public.fn_perfil_sem_gestao_de_telas()) then
    insert into public.security_logs (event_type, user_id, details)
    values ('ACCESS_DENIED', v_uid, jsonb_build_object('acao', 'pareamento', 'screen_id', p_screen_id, 'motivo', 'sem_permissao_na_tela'));
    return jsonb_build_object('ok', false, 'error', 'forbidden_screen');
  end if;

  select * into v_record
  from public.device_pairing_codes
  where pairing_code = p_pairing_code and status = 'pending'
  limit 1;

  if v_record.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if v_record.expires_at < now() then
    update public.device_pairing_codes set status = 'expired' where id = v_record.id;
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  update public.device_pairing_codes
  set status = 'paired', screen_id = p_screen_id
  where id = v_record.id;

  v_new_screen_token := encode(gen_random_bytes(32), 'hex');

  -- F-263: a versão anterior gravava a coluna `status` (não existe em devices) e usava ON CONFLICT (identity_hash) sem chave
  -- única — o pareamento por código NUNCA completava (37 aparelhos, 0 com screen_token). Agora: atualiza o aparelho
  -- daquele identity_hash ou cria um novo (o campo obrigatório `name` recebe o modelo do aparelho).
  update public.devices
     set screen_id = p_screen_id,
         screen_token = v_new_screen_token,
         model = coalesce(v_record.device_model, devices.model),
         activated_at = now(),
         last_seen = now()
   where identity_hash = v_record.identity_hash;
  if not found then
    insert into public.devices (name, screen_id, identity_hash, screen_token, model, activated_at, last_seen, first_seen_at)
    values (coalesce(v_record.device_model, 'Aparelho pareado por código'), p_screen_id, v_record.identity_hash,
            v_new_screen_token, v_record.device_model, now(), now(), now());
  end if;

  insert into public.security_logs (event_type, user_id, details)
  values ('DEVICE_PAIRED', v_uid, jsonb_build_object('acao', 'pareamento', 'screen_id', p_screen_id, 'pairing_id', v_record.id));

  return jsonb_build_object('ok', true, 'identity_hash', v_record.identity_hash, 'screen_token', v_new_screen_token);
end;
$function$;

revoke all on function public.fn_link_device_to_screen(character varying, uuid) from public, anon;
grant execute on function public.fn_link_device_to_screen(character varying, uuid) to authenticated;
