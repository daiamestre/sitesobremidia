-- =====================================================================================================================
-- F-284 — PEDIDOS DE FOTO (ordem do dono, 09/11/2026): produto que entrou no encarte SEM foto (ou sem foto confiável) vira um
-- pedido; os agentes da SOBRE MÍDIA (ciclo no PC: scripts/ops/catalogo-ciclo.mjs) procuram na hora a foto OFICIAL da marca e,
-- sem ela, a mesma foto nas lojas que vendem a marca, com recorte e conferência dupla, e gravam no catálogo pelo nome do pedido.
-- Aditivo: tabela e função novas; não altera tabela, função, RLS ou dado existente. Player: nenhum impacto.
-- ROLLBACK: drop function if exists public.tabloide_pedir_fotos(text[], text[]); drop table if exists public.tabloide_pedidos_de_foto;
-- =====================================================================================================================

create table if not exists public.tabloide_pedidos_de_foto (
  id bigint generated always as identity primary key,
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 160),
  nome_norm text not null check (char_length(nome_norm) between 2 and 160),
  pedidos int not null default 1,
  status text not null default 'pendente' check (status in ('pendente', 'procurando', 'achada', 'sem_foto')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_operadora_id, nome_norm)
);
alter table public.tabloide_pedidos_de_foto enable row level security;
-- só o servidor (agentes) lê e muda; o site só pede pela função abaixo
revoke all on public.tabloide_pedidos_de_foto from anon, authenticated;

/** O site pede as fotos que faltaram (até 40 por vez). Pedido repetido soma; pedido já resolvido volta a pendente. */
create or replace function public.tabloide_pedir_fotos(p_nomes text[], p_normas text[])
returns int language plpgsql security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_n int := 0;
  i int;
begin
  if auth.uid() is null or v_tenant is null then raise exception 'Sessão inválida'; end if;
  if p_nomes is null or p_normas is null or array_length(p_nomes, 1) is distinct from array_length(p_normas, 1) then return 0; end if;
  for i in 1 .. least(coalesce(array_length(p_nomes, 1), 0), 40) loop
    continue when coalesce(char_length(p_normas[i]), 0) < 2 or char_length(p_normas[i]) > 160 or char_length(p_nomes[i]) > 160;
    insert into public.tabloide_pedidos_de_foto (empresa_operadora_id, nome, nome_norm)
    values (v_tenant, p_nomes[i], p_normas[i])
    on conflict (empresa_operadora_id, nome_norm) do update
      set pedidos = public.tabloide_pedidos_de_foto.pedidos + 1,
          status = case when public.tabloide_pedidos_de_foto.status = 'procurando' then 'procurando' else 'pendente' end,
          atualizado_em = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.tabloide_pedir_fotos(text[], text[]) from public, anon;
grant execute on function public.tabloide_pedir_fotos(text[], text[]) to authenticated;
