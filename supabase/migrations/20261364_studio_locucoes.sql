-- F-300 (P-33) — LOCUTOR do SOBRE MÍDIA: registro de cada frase GERADA na ElevenLabs (as reaproveitadas não entram).
-- Serve para o teto diário por pessoa e para o dono acompanhar o gasto de créditos. Aditivo: tabela nova, sem mexer em
-- nada existente; só a função studio-locucao (chave de serviço) grava. Sem impacto no Player.
-- ROLLBACK: drop table if exists public.studio_locucoes;

create table if not exists public.studio_locucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null,
  usuario_id uuid not null,
  voz text not null,
  modelo text not null,
  caracteres integer not null check (caracteres > 0),
  url text not null,
  criado_em timestamptz not null default now()
);
create index if not exists studio_locucoes_usuario_dia on public.studio_locucoes (usuario_id, criado_em desc);
create index if not exists studio_locucoes_empresa_mes on public.studio_locucoes (empresa_operadora_id, criado_em desc);

alter table public.studio_locucoes enable row level security;
-- cada pessoa vê só o que ela gerou (regra permanente: cada conta vê o seu); quem grava é a função, com a chave de serviço
drop policy if exists studio_locucoes_ver_o_seu on public.studio_locucoes;
create policy studio_locucoes_ver_o_seu on public.studio_locucoes for select to authenticated using (usuario_id = auth.uid());

comment on table public.studio_locucoes is 'F-300: frases de locução geradas na ElevenLabs (teto diário e gasto de créditos).';
