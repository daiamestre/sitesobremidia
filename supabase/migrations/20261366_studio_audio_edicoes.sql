-- F-328 (pedido do dono, 18/11/2026) — EDITOR DE ÁUDIO: os áudios salvos e os RASCUNHOS ficam no sistema da SOBRE MÍDIA
-- (antes ficavam só no aparelho e "sumiam" em outro). Cada linha guarda as faixas/clipes (jsonb) e os endereços dos sons
-- (arquivos WAV no R2, na pasta da própria conta: {usuario}/studio-audio/...).
-- Aditivo: tabela nova; nada existente muda. Sem impacto no Player (não toca playlist, telas ou aparelhos).
-- Visibilidade: cada conta vê e mexe só nas próprias edições (regra F-195).
-- ROLLBACK:
--   drop table if exists public.studio_audio_edicoes;

create table if not exists public.studio_audio_edicoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid(),
  tipo text not null default 'rascunho' check (tipo in ('salvo', 'rascunho')),
  nome text not null default 'Áudio sem nome' check (char_length(nome) <= 120),
  versao integer not null default 1,
  duracao real not null default 0,
  faixas integer not null default 0,
  projeto jsonb not null,
  sons jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint studio_audio_edicoes_tamanho check (pg_column_size(projeto) + pg_column_size(sons) < 2000000)
);
create index if not exists studio_audio_edicoes_usuario on public.studio_audio_edicoes (usuario_id, tipo, atualizado_em desc);

alter table public.studio_audio_edicoes enable row level security;
revoke all on public.studio_audio_edicoes from anon;
grant select, insert, update, delete on public.studio_audio_edicoes to authenticated;

drop policy if exists studio_audio_edicoes_dono on public.studio_audio_edicoes;
create policy studio_audio_edicoes_dono on public.studio_audio_edicoes
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
