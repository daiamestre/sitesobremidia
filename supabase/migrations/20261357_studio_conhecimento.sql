-- =====================================================================================================================
-- MG-STUDIO-02 — MEMÓRIA CRIATIVA do SOBRE MÍDIA CREATIVE CORE (DNA visual, manual, segmentos, regras, referências).
-- Uma linha = uma VERSÃO de um conhecimento. Nunca se apaga nem se sobrescreve: versão nova desliga a anterior.
-- Escopos (não se misturam): global (padrão SOBRE MÍDIA) < empresa < cliente < campanha.
--   * global: só pelo servidor (semente a partir do Git: scripts/studio/semear-conhecimento.mjs) — regra revisada e
--     aprovada; nenhum usuário muda o DNA global pelo site;
--   * empresa/cliente/campanha: só OWNER/ADMIN da empresa, pela função studio_conhecimento_publicar (autor, data, motivo).
-- Leitura (RLS): global = quem usa o Studio; empresa = usuários daquela empresa; cliente/campanha = o próprio cliente
-- (anunciante) e OWNER/ADMIN da empresa. Escopo SEMPRE da sessão (studio_ai_escopo), nunca do navegador.
-- Aditivo: não altera tabela, função, RLS ou dado existente. Player: nenhum impacto.
-- ROLLBACK: drop function if exists public.studio_conhecimento_publicar(text, text, text, jsonb, text, uuid, uuid);
--           drop table if exists public.studio_conhecimento;
-- =====================================================================================================================

create table if not exists public.studio_conhecimento (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('global', 'empresa', 'cliente', 'campanha')),
  empresa_operadora_id uuid references public.empresa_operadora(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  producao_id uuid,                                    -- campanha (a FK entra quando studio_producoes existir)
  tipo text not null check (tipo in ('dna', 'manual', 'segmento', 'regra', 'referencia', 'persona', 'preferencia')),
  chave text not null check (char_length(chave) between 1 and 80),
  versao int not null check (versao > 0),
  conteudo jsonb not null,
  impressao text not null,                             -- md5 do conteúdo: semente idempotente e auditoria
  ativo boolean not null default true,
  motivo text not null check (char_length(motivo) between 3 and 500),
  autor uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  constraint studio_conhecimento_escopo_ok check (
    (escopo = 'global' and empresa_operadora_id is null and cliente_id is null and producao_id is null)
    or (escopo = 'empresa' and empresa_operadora_id is not null and cliente_id is null and producao_id is null)
    or (escopo = 'cliente' and empresa_operadora_id is not null and cliente_id is not null and producao_id is null)
    or (escopo = 'campanha' and empresa_operadora_id is not null and producao_id is not null))
);
create unique index if not exists studio_conhecimento_versao_uk on public.studio_conhecimento
  (escopo, coalesce(empresa_operadora_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(producao_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, chave, versao);
create unique index if not exists studio_conhecimento_ativo_uk on public.studio_conhecimento
  (escopo, coalesce(empresa_operadora_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(producao_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, chave) where ativo;
create index if not exists studio_conhecimento_busca_idx on public.studio_conhecimento (tipo, ativo, escopo, empresa_operadora_id);

alter table public.studio_conhecimento enable row level security;
revoke all on public.studio_conhecimento from anon;
revoke insert, update, delete, truncate on public.studio_conhecimento from authenticated;
grant select on public.studio_conhecimento to authenticated;

drop policy if exists studio_conhecimento_ver on public.studio_conhecimento;
create policy studio_conhecimento_ver on public.studio_conhecimento for select to authenticated using (
  exists (select 1 from public.studio_ai_escopo() e where e.pode and (
    studio_conhecimento.escopo = 'global'
    or (studio_conhecimento.escopo = 'empresa' and studio_conhecimento.empresa_operadora_id = e.empresa)
    or (studio_conhecimento.escopo in ('cliente', 'campanha') and studio_conhecimento.empresa_operadora_id = e.empresa
        and (e.admin or (e.cliente is not null and studio_conhecimento.cliente_id = e.cliente))))));

/** Publica uma versão nova (empresa/cliente/campanha) — só OWNER/ADMIN da empresa; a anterior fica guardada e inativa. */
create or replace function public.studio_conhecimento_publicar(p_escopo text, p_tipo text, p_chave text, p_conteudo jsonb, p_motivo text,
  p_cliente uuid default null, p_producao uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; v_versao int; v_id uuid;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário/administrador da empresa altera a memória criativa.' using errcode = '42501'; end if;
  if p_escopo not in ('empresa', 'cliente', 'campanha') then raise exception 'O DNA global só muda pela revisão da SOBRE MÍDIA (semente do Git).' using errcode = '42501'; end if;
  if p_escopo = 'empresa' and (p_cliente is not null or p_producao is not null) then raise exception 'Escopo empresa não leva cliente/campanha.'; end if;
  if p_escopo = 'cliente' and (p_cliente is null or p_producao is not null) then raise exception 'Informe o cliente.'; end if;
  if p_escopo = 'campanha' and p_producao is null then raise exception 'Informe a campanha.'; end if;
  if p_cliente is not null and not exists (select 1 from public.clientes c where c.id = p_cliente and c.empresa_operadora_id = e.empresa) then
    raise exception 'Cliente de outra empresa.' using errcode = '42501';
  end if;
  if pg_column_size(p_conteudo) > 200000 then raise exception 'Conteúdo grande demais.'; end if;
  perform pg_advisory_xact_lock(hashtext('studio_conhecimento:' || e.empresa::text || p_tipo || p_chave));
  select coalesce(max(versao), 0) + 1 into v_versao from public.studio_conhecimento
   where escopo = p_escopo and empresa_operadora_id = e.empresa and cliente_id is not distinct from p_cliente
     and producao_id is not distinct from p_producao and tipo = p_tipo and chave = p_chave;
  update public.studio_conhecimento set ativo = false
   where escopo = p_escopo and empresa_operadora_id = e.empresa and cliente_id is not distinct from p_cliente
     and producao_id is not distinct from p_producao and tipo = p_tipo and chave = p_chave and ativo;
  insert into public.studio_conhecimento (escopo, empresa_operadora_id, cliente_id, producao_id, tipo, chave, versao, conteudo, impressao, ativo, motivo, autor)
  values (p_escopo, e.empresa, p_cliente, p_producao, p_tipo, left(p_chave, 80), v_versao, p_conteudo, md5(p_conteudo::text), true, left(p_motivo, 500), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.studio_conhecimento_publicar(text, text, text, jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.studio_conhecimento_publicar(text, text, text, jsonb, text, uuid, uuid) to authenticated;
