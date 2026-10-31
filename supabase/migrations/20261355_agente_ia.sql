-- =====================================================================================================================
-- F-223 — "Trabalhar com IA": agente da SOBRE MÍDIA com modelos GRÁTIS (Groq, Google AI Studio, OpenRouter) que
-- consulta telas, cobranças e clientes COM O LOGIN DE QUEM PERGUNTA (as regras de visibilidade do banco continuam
-- valendo: cada conta vê só o seu) e PROPÕE ações (ex.: criar cobrança) que só acontecem depois do "Confirmar".
--   agente_ia_escopo()  → empresa, papel e se a pessoa pode criar cobrança (OWNER, ADMIN, FINANCEIRO)
--   agente_ia_acoes     → ações propostas pelo agente, aguardando confirmação (só a própria pessoa vê)
--   agente_ia_registros → registro de cada pergunta (provedor, ferramentas usadas, tempo), para auditoria
-- Gravação nas duas tabelas: só pela função agente-ia (chave de serviço). Nada muda nas tabelas existentes.
-- ROLLBACK: drop table if exists public.agente_ia_acoes, public.agente_ia_registros; drop function if exists public.agente_ia_escopo();
-- =====================================================================================================================

create or replace function public.agente_ia_escopo()
returns table(empresa uuid, papel text, admin boolean, pode_cobrar boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.empresa_operadora_id,
         upper(coalesce(p.nome, case when coalesce(u.is_owner, false) then 'OWNER' end, '')),
         (coalesce(u.is_owner, false) or upper(coalesce(p.nome, '')) in ('OWNER', 'ADMIN') or public.has_role(u.id, 'admin'::app_role)),
         (coalesce(u.is_owner, false) or upper(coalesce(p.nome, '')) in ('OWNER', 'ADMIN', 'FINANCEIRO') or public.has_role(u.id, 'admin'::app_role))
    from public.usuarios u left join public.perfis p on p.id = u.perfil_id
   where u.id = auth.uid();
$$;
revoke all on function public.agente_ia_escopo() from public, anon;
grant execute on function public.agente_ia_escopo() to authenticated;

create table if not exists public.agente_ia_acoes (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null,
  usuario_id uuid not null,
  tipo text not null check (tipo in ('CRIAR_COBRANCA')),
  parametros jsonb not null,
  resumo text not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'EXECUTADA', 'CANCELADA', 'FALHA', 'EXPIRADA')),
  resultado jsonb,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create index if not exists agente_ia_acoes_usuario on public.agente_ia_acoes (usuario_id, criado_em desc);
alter table public.agente_ia_acoes enable row level security;
drop policy if exists agente_ia_acoes_propria on public.agente_ia_acoes;
create policy agente_ia_acoes_propria on public.agente_ia_acoes for select to authenticated using (usuario_id = auth.uid());

create table if not exists public.agente_ia_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid,
  usuario_id uuid not null,
  pergunta text not null,
  provedor text,
  modelo text,
  ferramentas text[] not null default '{}',
  ms integer,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists agente_ia_registros_usuario on public.agente_ia_registros (usuario_id, criado_em desc);
alter table public.agente_ia_registros enable row level security;
drop policy if exists agente_ia_registros_proprio on public.agente_ia_registros;
create policy agente_ia_registros_proprio on public.agente_ia_registros for select to authenticated
  using (usuario_id = auth.uid() or exists (select 1 from public.agente_ia_escopo() e where e.admin));
