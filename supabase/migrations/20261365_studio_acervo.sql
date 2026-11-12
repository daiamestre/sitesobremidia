-- F-310 (P-33, pedido do dono 12/11/2026) — ACERVO DO STUDIO: tudo o que os usuários enviam (fundos, logos, imagens) e cada
-- vídeo/arte que criam e salvam fica guardado no SOBRE MÍDIA, organizado por SEGMENTO, para o dono/ADM transformar em
-- modelos do sistema (a promoção a modelo é feita pelo dono/ADM, sem a marca do cliente).
-- Aditivo: tabela nova + 3 funções novas; nada existente muda. Sem impacto no Player (não toca playlist, telas ou aparelhos).
-- Visibilidade: só o dono e os ADM veem o acervo (regra F-195); quem enviou grava pela função e não lê a tabela.
-- ROLLBACK:
--   drop function if exists public.studio_acervo_registrar(text, text, text, text, text, jsonb);
--   drop function if exists public.studio_acervo_listar(text, integer);
--   drop function if exists public.studio_acervo_promovido(uuid, text);
--   drop table if exists public.studio_acervo;

create table if not exists public.studio_acervo (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null,
  usuario_id uuid not null,
  tipo text not null check (tipo in ('fundo', 'logo', 'imagem', 'palco', 'encarte', 'arte')),
  segmento text,
  nome text,
  url text,
  video text,
  dados jsonb,
  promovido_para text,
  criado_em timestamptz not null default now()
);
create index if not exists studio_acervo_empresa_segmento on public.studio_acervo (empresa_operadora_id, segmento, criado_em desc);
create index if not exists studio_acervo_usuario_dia on public.studio_acervo (usuario_id, criado_em desc);

alter table public.studio_acervo enable row level security;
-- sem políticas: ninguém lê nem grava direto; tudo passa pelas funções abaixo
revoke all on public.studio_acervo from anon, authenticated;

create or replace function public.studio_acervo_registrar(p_tipo text, p_segmento text, p_nome text, p_url text, p_video text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; v_id uuid; v_hoje integer;
begin
  select * into e from public.studio_ai_escopo();
  if e.empresa is null then return null; end if;
  if p_tipo not in ('fundo', 'logo', 'imagem', 'palco', 'encarte', 'arte') then raise exception 'Tipo inválido.'; end if;
  if p_url is not null and p_url !~ '^(https://|/studio/)' then raise exception 'Endereço inválido.'; end if;
  if p_video is not null and p_video !~ '^https://' then raise exception 'Endereço inválido.'; end if;
  if p_dados is not null and pg_column_size(p_dados) > 400000 then p_dados := null; end if;
  -- teto por pessoa (evita encher o acervo por engano)
  select count(*) into v_hoje from public.studio_acervo where usuario_id = auth.uid() and criado_em > now() - interval '1 day';
  if v_hoje >= 300 then return null; end if;
  -- o mesmo arquivo da mesma pessoa não entra duas vezes
  if p_url is not null and p_tipo in ('fundo', 'logo', 'imagem') then
    select id into v_id from public.studio_acervo where usuario_id = auth.uid() and url = p_url limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  -- a mesma criação (mesmo projeto) salva de novo atualiza o registro, não duplica
  if p_dados ? 'chave' then
    update public.studio_acervo set segmento = coalesce(nullif(left(coalesce(p_segmento, ''), 40), ''), segmento), nome = coalesce(left(p_nome, 120), nome),
           url = coalesce(p_url, url), video = coalesce(p_video, video), dados = p_dados, criado_em = now()
     where usuario_id = auth.uid() and tipo = p_tipo and dados->>'chave' = p_dados->>'chave'
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.studio_acervo (empresa_operadora_id, usuario_id, tipo, segmento, nome, url, video, dados)
  values (e.empresa, auth.uid(), p_tipo, nullif(left(coalesce(p_segmento, ''), 40), ''), left(p_nome, 120), p_url, p_video, p_dados)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.studio_acervo_listar(p_segmento text default null, p_limite integer default 300)
returns table (id uuid, tipo text, segmento text, nome text, url text, video text, dados jsonb, promovido_para text, criado_em timestamptz, usuario_id uuid, autor text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores.' using errcode = '42501'; end if;
  return query
    select a.id, a.tipo, a.segmento, a.nome, a.url, a.video, a.dados, a.promovido_para, a.criado_em, a.usuario_id, coalesce(u.nome, '')::text
      from public.studio_acervo a left join public.usuarios u on u.id = a.usuario_id
     where a.empresa_operadora_id = e.empresa and (p_segmento is null or a.segmento = p_segmento)
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 300), 1), 1000);
end $$;

create or replace function public.studio_acervo_promovido(p_id uuid, p_modelo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores.' using errcode = '42501'; end if;
  update public.studio_acervo set promovido_para = p_modelo where id = p_id and empresa_operadora_id = e.empresa;
end $$;

revoke all on function public.studio_acervo_registrar(text, text, text, text, text, jsonb), public.studio_acervo_listar(text, integer), public.studio_acervo_promovido(uuid, text) from public, anon;
grant execute on function public.studio_acervo_registrar(text, text, text, text, text, jsonb), public.studio_acervo_listar(text, integer), public.studio_acervo_promovido(uuid, text) to authenticated;

comment on table public.studio_acervo is 'F-310: acervo do Studio — fundos, logos e imagens enviados e as criações salvas, por segmento (só dono/ADM veem).';
