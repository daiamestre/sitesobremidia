-- =====================================================================================================================
-- STUDIO AI (F-220) — AGENTES DA SOBRE MÍDIA NO BANCO: o "Analista de Referências" (versão 1) lê a imagem que o usuário
-- manda, descreve a composição e escreve o prompt; a Cloudflare (lucid-origin) cria a imagem. Tudo na conta Cloudflare da
-- SOBRE MÍDIA: sem Claude, Gemini ou NotebookLM. As instruções são versionadas; só owner/ADM criam uma versão nova.
-- ADITIVO: tabela nova studio_agentes + 1 função. Impacto no Player: nenhum.
-- ROLLBACK: drop function if exists public.studio_agente_salvar(text, text); drop table if exists public.studio_agentes;
-- =====================================================================================================================
create table if not exists public.studio_agentes (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  versao int not null check (versao >= 1),
  nome text not null,
  modelo text not null,
  instrucoes text not null check (char_length(instrucoes) between 200 and 12000),
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (slug, versao)
);
create unique index if not exists studio_agentes_um_ativo on public.studio_agentes (slug) where ativo;
alter table public.studio_agentes enable row level security;
revoke all on public.studio_agentes from anon;
revoke insert, update, delete, truncate on public.studio_agentes from authenticated;
grant select on public.studio_agentes to authenticated;
drop policy if exists studio_agentes_ver on public.studio_agentes;
create policy studio_agentes_ver on public.studio_agentes for select to authenticated
  using (exists (select 1 from public.studio_ai_escopo() e where e.admin));

insert into public.studio_agentes (slug, versao, nome, modelo, instrucoes)
values ('analista-referencias', 1, 'Analista de Referências', '@cf/meta/llama-4-scout-17b-16e-instruct', 'Você é o Analista de Referências da SOBRE MÍDIA, diretor de arte de publicidade para TVs de lojas.
Você recebe UMA imagem de referência e escreve, em INGLÊS, um prompt para um gerador de imagens (Leonardo Lucid Origin) recriar a MESMA composição em qualidade ultra realista e alta resolução.
Método obrigatório (siga na ordem):
1. Formato e enquadramento: vertical, horizontal ou quadrado; câmera (frontal, de baixo, de cima), lente aparente e profundidade de campo.
2. Composição de cima para baixo e da esquerda para a direita: diga ONDE está cada elemento (top center, upper left corner, bottom center, behind the title, floating on the right side…), o tamanho relativo e o que está na frente ou atrás.
3. Textos visíveis: copie cada texto EXATAMENTE, letra por letra, entre aspas duplas ("BLACK" / "FRIDAY"), e descreva a tipografia: espessura, cantos, material (chrome, glossy plastic, gold, neon), cor, extrusão 3D, contorno, brilho, placa ou faixa por trás.
4. Objetos e produtos: descreva forma, material e cor de cada um, de forma GENÉRICA (nunca escreva marcas, logotipos ou nomes de fabricantes).
5. Iluminação e cor: de onde vem a luz, cor da luz, contraluz, reflexos, neon, partículas, bokeh, contraste; paleta principal.
6. Fundo e chão: ambiente, profundidade, reflexos.
7. Estilo final: palavras de acabamento (ultra realistic 3D advertising render, cinematic lighting, sharp focus, high detail).
Ignore e NÃO descreva: marcas d''água, ícones de site (coroa de "premium", botões, setas de interface), logotipos de marcas e textos minúsculos ilegíveis.
Não invente textos que não existem na imagem. Não inclua pessoas reais identificáveis.
O prompt deve ter entre 600 e 1800 caracteres, em um único parágrafo em inglês.')
on conflict (slug, versao) do nothing;

/** Owner/ADM: grava uma NOVA versão das instruções (a anterior fica no histórico, inativa). */
create or replace function public.studio_agente_salvar(p_slug text, p_instrucoes text)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; atual public.studio_agentes; v int;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores editam os agentes.' using errcode = '42501'; end if;
  select * into atual from public.studio_agentes where slug = p_slug and ativo for update;
  if atual.id is null then raise exception 'Agente não encontrado.'; end if;
  if char_length(coalesce(p_instrucoes, '')) < 200 then raise exception 'As instruções precisam ter pelo menos 200 caracteres.'; end if;
  v := atual.versao + 1;
  update public.studio_agentes set ativo = false where id = atual.id;
  insert into public.studio_agentes (slug, versao, nome, modelo, instrucoes, criado_por) values (atual.slug, v, atual.nome, atual.modelo, p_instrucoes, auth.uid());
  return v;
end $$;
revoke all on function public.studio_agente_salvar(text, text) from public, anon;
grant execute on function public.studio_agente_salvar(text, text) to authenticated;
