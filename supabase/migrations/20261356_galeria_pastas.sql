-- =====================================================================================================================
-- F-225 — Galeria em PASTAS por segmento (igual às pastas de modelos do SOBRE MÍDIA Studio).
-- Toda arte (imagem ou VÍDEO) criada a partir de um modelo do Studio entra sozinha, na galeria de quem criou, na pasta
-- daquele modelo (ex.: "Açougue – Carnes Selecionadas"). Cada pessoa vê SÓ as suas pastas e as suas mídias.
--   galeria_pastas → as pastas de cada pessoa (nome e capa escolhida por ela)
--   galeria_midias → em que pasta está cada mídia dela (media da equipe ou cliente_assets do anunciante)
-- Nada muda nas tabelas existentes (media, cliente_assets) nem no que o Player recebe.
-- ROLLBACK: drop table if exists public.galeria_midias, public.galeria_pastas;
-- =====================================================================================================================

create table if not exists public.galeria_pastas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave text not null check (length(chave) between 1 and 80),
  nome text not null check (length(nome) between 1 and 120),
  segmento text,
  capa_url text check (capa_url is null or capa_url ~ '^https://'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, chave)
);

create table if not exists public.galeria_midias (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origem text not null check (origem in ('media', 'cliente_assets')),
  midia_id uuid not null,
  chave text not null check (length(chave) between 1 and 80),
  criado_em timestamptz not null default now(),
  primary key (usuario_id, origem, midia_id)
);
create index if not exists galeria_midias_pasta on public.galeria_midias (usuario_id, chave);

alter table public.galeria_pastas enable row level security;
alter table public.galeria_midias enable row level security;

-- cada pessoa só vê e mexe no que é dela (regra permanente: cada conta vê só o seu)
drop policy if exists galeria_pastas_propria on public.galeria_pastas;
create policy galeria_pastas_propria on public.galeria_pastas for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists galeria_midias_propria on public.galeria_midias;
create policy galeria_midias_propria on public.galeria_midias for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

revoke all on public.galeria_pastas, public.galeria_midias from anon;
grant select, insert, update, delete on public.galeria_pastas, public.galeria_midias to authenticated;
