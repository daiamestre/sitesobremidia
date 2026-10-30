-- =====================================================================================================================
-- STUDIO AI (F-219) — Studio para TODOS os usuários; modelos novos só owner/ADM; criação com IA paga (R$ 4,99) por todos
-- menos owner/ADM; liberação imediata do crédito quando o PIX é confirmado.
-- O que muda:
--   * studio_ai_escopo: qualquer usuário da empresa usa o Studio (antes: só anunciante e owner/ADM).
--   * Carteira de créditos também por USUÁRIO (equipe sem cadastro de cliente: gestor, representante, parceiro…).
--   * Cobrança PIX do Studio em contas_receber com notes "Studio AI (user <uid>) …": cada um vê só a SUA.
--     - política nova (permissiva) studio_ai_cobranca_propria;
--     - política restritiva so_o_proprio recriada IGUAL à viva + o mesmo padrão do Studio (definição anterior em
--       docs/engineering/evidence/F-219_studio_todos/so_o_proprio_antes.json). Nenhuma cobrança antiga muda de visibilidade.
--   * studio_ai_creditar_pagas(): o servidor credita sozinho as compras cujo PIX já foi pago (sem o cliente clicar).
--   * studio_modelos: modelos novos do catálogo, criados/arquivados só por owner/ADM; todos editam cópias.
-- Impacto no Player: nenhum.
-- ROLLBACK:
--   drop policy if exists studio_ai_cobranca_propria on public.contas_receber;
--   drop policy if exists so_o_proprio on public.contas_receber;
--   create policy so_o_proprio on public.contas_receber as restrictive for select to authenticated using (<qual do arquivo de evidência>);
--   drop table if exists public.studio_modelos; drop function if exists public.studio_modelo_salvar(text, jsonb), public.studio_modelo_arquivar(text),
--     public.studio_ai_creditar_pagas(), public.studio_ai_carteira_de(uuid, uuid, uuid);
--   (carteiras/compras: as colunas usuario_id ficam; reaplicar 20261351 restaura as funções anteriores)
-- =====================================================================================================================

-- ---------------------------------------------------------------- carteira por cliente OU por usuário
alter table public.studio_ai_carteiras alter column cliente_id drop not null;
alter table public.studio_ai_carteiras add column if not exists usuario_id uuid references public.usuarios(id) on delete cascade;
alter table public.studio_ai_carteiras drop constraint if exists studio_ai_carteiras_dono;
alter table public.studio_ai_carteiras add constraint studio_ai_carteiras_dono check ((cliente_id is not null) <> (usuario_id is not null));
create unique index if not exists studio_ai_carteiras_usuario_uk on public.studio_ai_carteiras (usuario_id) where usuario_id is not null;
alter table public.studio_ai_compras alter column cliente_id drop not null;
alter table public.studio_ai_compras add column if not exists usuario_id uuid;

-- ---------------------------------------------------------------- todos os usuários da empresa usam o Studio
create or replace function public.studio_ai_escopo()
returns table (empresa uuid, cliente uuid, admin boolean, pode boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.empresa_operadora_id,
         case when upper(coalesce(p.nome, '')) in ('ANUNCIANTE', 'CLIENTE') and not coalesce(u.is_owner, false) then u.cliente_id end,
         (coalesce(u.is_owner, false) or upper(coalesce(p.nome, '')) in ('OWNER', 'ADMIN') or public.has_role(u.id, 'admin'::app_role)),
         u.empresa_operadora_id is not null
    from public.usuarios u left join public.perfis p on p.id = u.perfil_id
   where u.id = auth.uid();
$$;

drop policy if exists studio_ai_carteiras_ver on public.studio_ai_carteiras;
create policy studio_ai_carteiras_ver on public.studio_ai_carteiras for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, usuario_id));
drop policy if exists studio_ai_compras_ver on public.studio_ai_compras;
create policy studio_ai_compras_ver on public.studio_ai_compras for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, criado_por));
drop policy if exists studio_ai_movimentos_ver on public.studio_ai_movimentos;
create policy studio_ai_movimentos_ver on public.studio_ai_movimentos for select to authenticated
  using (exists (select 1 from public.studio_ai_carteiras c where c.id = carteira_id and public.studio_ai_pode_ver(c.empresa_operadora_id, c.cliente_id, c.usuario_id)));

/** Carteira de quem paga: a do cliente (anunciante) ou a pessoal (equipe sem cliente). Cria se não existir, travada. */
create or replace function public.studio_ai_carteira_de(p_empresa uuid, p_cliente uuid, p_usuario uuid)
returns public.studio_ai_carteiras language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.studio_ai_carteiras;
begin
  if p_cliente is not null then
    insert into public.studio_ai_carteiras (empresa_operadora_id, cliente_id) values (p_empresa, p_cliente) on conflict (cliente_id) do nothing;
    select * into c from public.studio_ai_carteiras where cliente_id = p_cliente for update;
  else
    insert into public.studio_ai_carteiras (empresa_operadora_id, usuario_id) values (p_empresa, p_usuario) on conflict (usuario_id) where usuario_id is not null do nothing;
    select * into c from public.studio_ai_carteiras where usuario_id = p_usuario for update;
  end if;
  if c.empresa_operadora_id <> p_empresa then raise exception 'Carteira de outra empresa.'; end if;
  return c;
end $$;

create or replace function public.studio_ai_comprar_creditos(p_quantidade int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; c public.studio_ai_carteiras; v_preco int; v_valor int; v_conta uuid; v_codigo text; v_compra uuid;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.pode, false) then raise exception 'Sem acesso ao Studio.' using errcode = '42501'; end if;
  if e.admin then raise exception 'Owner e administradores criam sem cobrança.'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then raise exception 'Escolha de 1 a 100 créditos.'; end if;
  select preco_credito_centavos into v_preco from public.studio_ai_config where empresa_operadora_id = e.empresa;
  v_preco := coalesce(v_preco, 499);
  v_valor := v_preco * p_quantidade;
  c := public.studio_ai_carteira_de(e.empresa, e.cliente, auth.uid());
  -- o prefixo "Studio AI (user <uid>)" é o que deixa cada pessoa ver SÓ a própria cobrança (políticas abaixo)
  insert into public.contas_receber (empresa_operadora_id, cliente_id, contrato_id, valor, data_vencimento, status, metodo_cobranca, recorrencia, notes)
  values (e.empresa, e.cliente, null, round(v_valor / 100.0, 2), current_date, 'ABERTA', 'PIX', 'AVULSA',
          'Studio AI (user ' || auth.uid()::text || ') ' || p_quantidade || ' crédito(s) de criação com IA (' || public.fn_brl(round(v_preco / 100.0, 2)) || ' cada)')
  returning id into v_conta;
  select codigo_operacional into v_codigo from public.contas_receber where id = v_conta;
  insert into public.studio_ai_compras (empresa_operadora_id, cliente_id, usuario_id, carteira_id, quantidade, valor_centavos, conta_receber_id, criado_por)
  values (e.empresa, e.cliente, case when e.cliente is null then auth.uid() end, c.id, p_quantidade, v_valor, v_conta, auth.uid()) returning id into v_compra;
  insert into public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  values (e.empresa, auth.uid(), 'STUDIO_AI', v_compra, 'INSERT', 'ABERTA', 'Cobrança ' || coalesce(v_codigo, '') || ' de ' || p_quantidade || ' crédito(s).');
  return jsonb_build_object('compra_id', v_compra, 'cobranca_id', v_conta, 'codigo', v_codigo, 'valor_centavos', v_valor);
end $$;

create or replace function public.studio_ai_confirmar_compra(p_compra uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.studio_ai_compras; v_status text;
begin
  select * into k from public.studio_ai_compras where id = p_compra for update;
  if k.id is null or not public.studio_ai_pode_ver(k.empresa_operadora_id, k.cliente_id, k.criado_por) then raise exception 'Compra não encontrada.' using errcode = '42501'; end if;
  if k.status = 'CREDITADA' then return jsonb_build_object('creditado', true, 'ja_estava', true); end if;
  select status into v_status from public.contas_receber where id = k.conta_receber_id;
  if upper(coalesce(v_status, '')) not in ('PAGA', 'PAGO') then return jsonb_build_object('creditado', false, 'status', v_status); end if;
  perform public.studio_ai_mover(k.carteira_id, 'COMPRA', k.quantidade, 'compra:' || k.id, null, k.id, 'PIX confirmado');
  update public.studio_ai_compras set status = 'CREDITADA', creditado_em = now() where id = k.id;
  return jsonb_build_object('creditado', true, 'quantidade', k.quantidade);
end $$;

/** Servidor (varredura): credita sozinho toda compra cujo PIX já foi pago — liberação mesmo sem o cliente voltar à tela. */
create or replace function public.studio_ai_creditar_pagas()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare k record; n int := 0;
begin
  for k in select c.* from public.studio_ai_compras c join public.contas_receber r on r.id = c.conta_receber_id
            where c.status = 'PENDENTE' and upper(coalesce(r.status, '')) in ('PAGA', 'PAGO') for update of c skip locked loop
    perform public.studio_ai_mover(k.carteira_id, 'COMPRA', k.quantidade, 'compra:' || k.id, null, k.id, 'PIX confirmado (automático)');
    update public.studio_ai_compras set status = 'CREDITADA', creditado_em = now() where id = k.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.studio_ai_meu_saldo()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cliente', e.cliente, 'admin', e.admin, 'pode', e.pode, 'paga', coalesce(e.pode, false) and not coalesce(e.admin, false),
    'saldo', coalesce(c.saldo, 0), 'reservado', coalesce(c.reservado, 0),
    'preco_centavos', coalesce(cfg.preco_credito_centavos, 499), 'habilitado', coalesce(cfg.habilitado, true))
  from public.studio_ai_escopo() e
  left join public.studio_ai_carteiras c on (e.cliente is not null and c.cliente_id = e.cliente) or (e.cliente is null and c.usuario_id = auth.uid())
  left join public.studio_ai_config cfg on cfg.empresa_operadora_id = e.empresa;
$$;

-- ---------------------------------------------------------------- cada um vê só a SUA cobrança do Studio (PIX)
drop policy if exists studio_ai_cobranca_propria on public.contas_receber;
create policy studio_ai_cobranca_propria on public.contas_receber for select to authenticated
  using (notes like 'Studio AI (user ' || (select auth.uid())::text || ')%'
         and empresa_operadora_id = (select usuarios.empresa_operadora_id from public.usuarios where usuarios.id = auth.uid() limit 1));
drop policy if exists so_o_proprio on public.contas_receber;
create policy so_o_proprio on public.contas_receber as restrictive for select to authenticated using (
  (NOT ( SELECT fn_perfil_so_proprias_telas() AS fn_perfil_so_proprias_telas))
  OR (notes = (('Criacao de tela — Gestor de Midias (user '::text || (( SELECT auth.uid() AS uid))::text) || ')'::text))
  OR (notes ~~ (('Criacao de tela — Gestor de Midias (user '::text || (( SELECT auth.uid() AS uid))::text) || ')%'::text))
  OR (cliente_id IN ( SELECT fn_meus_clientes() AS fn_meus_clientes))
  OR (notes ~~ (('Studio AI (user '::text || (( SELECT auth.uid() AS uid))::text) || ')%'::text)));

-- ---------------------------------------------------------------- modelos novos do catálogo (só owner/ADM)
create table if not exists public.studio_modelos (
  id text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  dados jsonb not null,
  ativo boolean not null default true,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.studio_modelos enable row level security;
revoke all on public.studio_modelos from anon;
revoke insert, update, delete, truncate on public.studio_modelos from authenticated;
grant select on public.studio_modelos to authenticated;
drop policy if exists studio_modelos_ver on public.studio_modelos;
create policy studio_modelos_ver on public.studio_modelos for select to authenticated
  using (exists (select 1 from public.studio_ai_escopo() e where e.pode and e.empresa = studio_modelos.empresa_operadora_id and (studio_modelos.ativo or e.admin)));

create or replace function public.studio_modelo_salvar(p_id text, p_dados jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores adicionam modelos.' using errcode = '42501'; end if;
  if jsonb_typeof(p_dados) <> 'object' or coalesce(p_dados->>'nome', '') = '' or (p_dados->>'formato') not in ('16:9', '9:16') then raise exception 'Modelo inválido.'; end if;
  insert into public.studio_modelos (id, empresa_operadora_id, dados, criado_por)
  values (p_id, e.empresa, p_dados || jsonb_build_object('id', p_id), auth.uid())
  on conflict (id) do update set dados = excluded.dados, ativo = true, atualizado_em = now()
    where studio_modelos.empresa_operadora_id = e.empresa;
  return p_id;
end $$;

create or replace function public.studio_modelo_arquivar(p_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores.' using errcode = '42501'; end if;
  update public.studio_modelos set ativo = false, atualizado_em = now() where id = p_id and empresa_operadora_id = e.empresa;
end $$;

revoke all on function public.studio_ai_carteira_de(uuid, uuid, uuid), public.studio_ai_creditar_pagas() from public, anon, authenticated;
grant execute on function public.studio_ai_creditar_pagas() to service_role;
revoke all on function public.studio_modelo_salvar(text, jsonb), public.studio_modelo_arquivar(text) from public, anon;
grant execute on function public.studio_modelo_salvar(text, jsonb), public.studio_modelo_arquivar(text) to authenticated;
