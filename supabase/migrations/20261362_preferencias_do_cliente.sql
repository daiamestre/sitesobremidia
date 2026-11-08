-- =====================================================================================================================
-- F-268 (MG-AUT-12) — MEMÓRIA DE ESTILO POR CLIENTE, COM CONSENTIMENTO, sobre a tabela que JÁ existe (studio_conhecimento,
-- escopo 'cliente', tipo 'preferencia', chave 'estilo'). Nada de tabela nova.
-- Regras:
--   * só guarda com consentimento explícito (p_consentimento = true), registrado no próprio conteúdo (quem, quando, termo);
--   * anunciante/cliente: só o estilo do PRÓPRIO cliente; OWNER/ADMIN: clientes da própria empresa; outros perfis: não;
--   * só campos permitidos (tom, estabelecimento, público, formato, paleta #RRGGBB até 6, observações até 300);
--   * versão nova desliga a anterior (histórico); revogar desliga tudo; apagar remove de fato (pedido de exclusão);
--   * leitura continua pela regra que já existe (studio_conhecimento_ver): o próprio cliente e OWNER/ADMIN da empresa.
-- ADITIVO: só cria 2 funções. Player: nenhum impacto.
-- ROLLBACK: drop function if exists public.studio_preferencia_salvar(jsonb, boolean, uuid), public.studio_preferencia_revogar(uuid, boolean),
--             public.studio_preferencia_cliente_alvo(uuid);  (as linhas tipo preferencia, se houver, podem ser apagadas antes)
-- =====================================================================================================================

create or replace function public.studio_preferencia_cliente_alvo(p_cliente uuid)
returns table(empresa uuid, cliente uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.pode, false) then raise exception 'Sem acesso ao Studio.' using errcode = '42501'; end if;
  if e.cliente is not null then
    if p_cliente is not null and p_cliente <> e.cliente then raise exception 'Esse estilo é de outro cliente.' using errcode = '42501'; end if;
    return query select e.empresa, e.cliente;
  elsif coalesce(e.admin, false) then
    if p_cliente is null then raise exception 'Informe o cliente.'; end if;
    if not exists (select 1 from public.clientes c where c.id = p_cliente and c.empresa_operadora_id = e.empresa) then
      raise exception 'Cliente de outra empresa.' using errcode = '42501';
    end if;
    return query select e.empresa, p_cliente;
  else
    raise exception 'Só o próprio anunciante ou o proprietário/administrador guardam o estilo de um cliente.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.studio_preferencia_cliente_alvo(uuid) from public, anon, authenticated;

create or replace function public.studio_preferencia_salvar(p_estilo jsonb, p_consentimento boolean, p_cliente uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; v_estilo jsonb; v_versao int; v_id uuid;
begin
  if coalesce(p_consentimento, false) is not true then
    raise exception 'Para guardar o seu estilo é preciso o seu consentimento.' using errcode = '22023';
  end if;
  select * into a from public.studio_preferencia_cliente_alvo(p_cliente);
  v_estilo := jsonb_strip_nulls(jsonb_build_object(
    'tom', nullif(left(trim(p_estilo->>'tom'), 60), ''),
    'estabelecimento', nullif(left(trim(p_estilo->>'estabelecimento'), 120), ''),
    'publico', nullif(left(trim(p_estilo->>'publico'), 120), ''),
    'formato', case when p_estilo->>'formato' in ('16:9', '9:16', '1:1') then p_estilo->>'formato' end,
    'observacoes', nullif(left(trim(p_estilo->>'observacoes'), 300), ''),
    'paleta', (select jsonb_agg(upper(c)) from (select c from jsonb_array_elements_text(
                 case when jsonb_typeof(p_estilo->'paleta') = 'array' then p_estilo->'paleta' else '[]'::jsonb end) c
               where c ~ '^#[0-9A-Fa-f]{6}$' limit 6) s)));
  if v_estilo = '{}'::jsonb then raise exception 'Nada para guardar (tom, cores, público, formato ou observações).'; end if;
  perform pg_advisory_xact_lock(hashtext('studio_preferencia:' || a.cliente::text));
  select coalesce(max(versao), 0) + 1 into v_versao from public.studio_conhecimento
   where escopo = 'cliente' and cliente_id = a.cliente and tipo = 'preferencia' and chave = 'estilo';
  update public.studio_conhecimento set ativo = false
   where escopo = 'cliente' and cliente_id = a.cliente and tipo = 'preferencia' and chave = 'estilo' and ativo;
  insert into public.studio_conhecimento (escopo, empresa_operadora_id, cliente_id, tipo, chave, versao, conteudo, impressao, ativo, motivo, autor)
  values ('cliente', a.empresa, a.cliente, 'preferencia', 'estilo', v_versao,
          jsonb_build_object('estilo', v_estilo, 'consentimento', jsonb_build_object('aceito', true, 'em', now(), 'por', auth.uid(), 'termo', 'preferencias.v1')),
          md5(v_estilo::text), true, 'estilo do cliente guardado com consentimento', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.studio_preferencia_salvar(jsonb, boolean, uuid) from public, anon;
grant execute on function public.studio_preferencia_salvar(jsonb, boolean, uuid) to authenticated;

/** Revoga (desliga todas as versões) ou, com p_apagar, APAGA o estilo guardado do cliente. Devolve quantas versões. */
create or replace function public.studio_preferencia_revogar(p_cliente uuid default null, p_apagar boolean default false)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; v_n int;
begin
  select * into a from public.studio_preferencia_cliente_alvo(p_cliente);
  if coalesce(p_apagar, false) then
    delete from public.studio_conhecimento where escopo = 'cliente' and cliente_id = a.cliente and tipo = 'preferencia';
  else
    update public.studio_conhecimento set ativo = false where escopo = 'cliente' and cliente_id = a.cliente and tipo = 'preferencia' and ativo;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.studio_preferencia_revogar(uuid, boolean) from public, anon;
grant execute on function public.studio_preferencia_revogar(uuid, boolean) to authenticated;
