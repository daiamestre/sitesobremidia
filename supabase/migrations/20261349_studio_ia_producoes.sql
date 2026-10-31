-- =====================================================================================================================
-- STUDIO DE IA (MG01) — produções e etapas dos agentes. REVISADA em 31/10/2026 (MG-STUDIO-03, nunca tinha sido aplicada):
--   * SEM a tabela studio_uso: a contagem diária sai de studio_producoes/studio_etapas (regra do dono: nada de 2º sistema de cota);
--   * studio_escopo() = studio_ai_escopo() (a regra de acesso que já está no ar; Studio para todos da empresa, cada um vê o seu);
--   * produção pode ter 0 produto (o Creative Core cria cenas de serviço, ex.: clínica, academia).
-- Motivo: docs/studio-ai/ARQUITETURA_PROPOSTA.md §5 e MATRIZ_DE_EXECUCAO.md (MG01).
-- ADITIVO: só cria tabelas/funções novas com prefixo studio_. Não altera nenhuma tabela, função, RLS ou dado existente.
-- Impacto no Player: NENHUM (o Player continua recebendo media/cliente_assets comuns pelas playlists).
-- Segurança:
--   * RLS própria (NÃO usa is_central_privileged): anunciante vê só o seu cliente; OWNER/ADMIN veem a empresa;
--     FINANCEIRO/GERENTE/GESTOR/REPRESENTANTE não têm acesso ao Studio.
--   * Sem INSERT/UPDATE/DELETE direto para usuários: tudo passa por funções que tiram empresa/cliente/usuário da sessão
--     (nunca do navegador) e controlam as mudanças de estado. O orquestrador usa service_role.
-- ROLLBACK (desfaz tudo, sem tocar em dados de outras tabelas):
--   drop function if exists public.studio_criar_producao(jsonb, text), public.studio_aprovar_plano(uuid),
--     public.studio_pedir_replanejar(uuid, text), public.studio_decidir_imagem(uuid, int, int, text),
--     public.studio_pedir_imagem(uuid, int, text), public.studio_salvar_edicao(uuid, jsonb, int[]),
--     public.studio_pedir_montagem(uuid), public.studio_entregar(uuid, uuid), public.studio_cancelar(uuid),
--     public.studio_minha_cota(), public.studio_consumir_cota(uuid, uuid, text, int, int),
--     public.studio_mudar_estado(uuid, text, text, jsonb), public.studio_reservar(int),
--     public.studio_transicao_valida(text, text), public.studio_escopo(), public.studio_pode_ver(uuid),
--     public.studio_registrar(uuid, text, jsonb), public.studio_minha(uuid), public.studio_tentar_de_novo(uuid),
--     public.studio_tocar_atualizado();
--   drop table if exists public.studio_etapas, public.studio_producoes;
-- =====================================================================================================================

-- ---------------------------------------------------------------- tabelas

create table if not exists public.studio_producoes (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,          -- null = produção da equipe (owner/ADM)
  user_id uuid not null references public.usuarios(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 80),
  tipo text not null check (tipo in ('imagens', 'video_montado', 'video_ia', 'modelo_editavel')),
  formato text not null check (formato in ('16:9', '9:16', '1:1')),
  duracao_s int not null check (duracao_s between 5 and 60),
  cenas_qtd int not null check (cenas_qtd between 1 and 8),
  briefing jsonb not null,
  produtos jsonb not null,                                                   -- preços em centavos (inteiros): a única fonte
  estado text not null default 'recebido' check (estado in ('recebido', 'planejando', 'aguardando_aprovacao_plano',
    'gerando_imagens', 'aguardando_aprovacao_imagens', 'montando', 'conferindo', 'pronto', 'entregue', 'reprovado', 'erro', 'cancelado')),
  plano jsonb,
  plano_versao int not null default 1,
  instrucao_ajuste text,
  cenas jsonb not null default '{}'::jsonb,                                  -- imagens por cena: {"1": {versoes:[...], escolhida, gerar, instrucao}}
  edicoes jsonb not null default '{}'::jsonb,                                -- camadas editáveis por cena (EdicaoCena)
  ordem int[],                                                               -- ordem das cenas (editor)
  edicao_versao int not null default 0,
  montagem jsonb not null default '{}'::jsonb,                               -- disparo, tentativas, chave
  resultado jsonb not null default '{}'::jsonb,                              -- video_url, imagens, miniatura_url, quadros, qc
  rotulo text,
  custo_neurons int not null default 0,
  custo_usd numeric(10, 4) not null default 0,
  erro text,
  chave_idempotencia text not null,
  processando_ate timestamptz,
  resultado_asset_id uuid,
  resultado_media_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aprovado_plano_em timestamptz,
  entregue_em timestamptz,
  unique (user_id, chave_idempotencia)
);
create index if not exists studio_producoes_empresa_idx on public.studio_producoes (empresa_operadora_id, criado_em desc);
create index if not exists studio_producoes_cliente_idx on public.studio_producoes (cliente_id, criado_em desc);
create index if not exists studio_producoes_ativas_idx on public.studio_producoes (estado, atualizado_em)
  where estado in ('recebido', 'planejando', 'gerando_imagens', 'montando', 'conferindo');

create table if not exists public.studio_etapas (
  id uuid primary key default gen_random_uuid(),
  producao_id uuid not null references public.studio_producoes(id) on delete cascade,
  empresa_operadora_id uuid not null,
  agente text not null,                 -- produtos | diretor | roteirista | fotografia | prompts | imagem | montagem | qualidade | distribuicao | usuario | pedido
  chave text not null,                  -- ex.: "produtos:p1", "imagem:2:v3", "usuario:aprovar_plano"
  plano_versao int not null default 1,
  provedor text,
  modelo text,
  versao_diretriz text,
  entrada jsonb,
  saida jsonb,
  arquivos jsonb,
  neurons int not null default 0,
  custo_usd numeric(10, 4) not null default 0,
  tentativas int not null default 1,
  estado text not null default 'ok' check (estado in ('ok', 'erro', 'substituida')),
  erro text,
  idempotencia text unique,
  por_usuario uuid,
  criado_em timestamptz not null default now()
);
create index if not exists studio_etapas_producao_idx on public.studio_etapas (producao_id, criado_em);

-- (studio_uso removida na revisão de 31/10/2026: a contagem usa studio_producoes/studio_etapas)

alter table public.studio_producoes enable row level security;
alter table public.studio_etapas enable row level security;
revoke all on public.studio_producoes, public.studio_etapas from anon;
revoke insert, update, delete, truncate on public.studio_producoes, public.studio_etapas from authenticated;
grant select on public.studio_producoes, public.studio_etapas to authenticated;

-- ---------------------------------------------------------------- quem pode usar (modelo real do banco: usuarios + perfis + user_roles)

create or replace function public.studio_escopo()
returns table (empresa uuid, cliente uuid, admin boolean, pode boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.studio_ai_escopo();   -- a mesma regra do Studio no ar (sem regra paralela)
$$;

create or replace function public.studio_pode_ver(p_producao uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.studio_producoes s, public.studio_escopo() e
     where s.id = p_producao and e.pode and s.empresa_operadora_id = e.empresa
       and (e.admin or (e.cliente is not null and s.cliente_id = e.cliente) or (e.cliente is null and s.user_id = auth.uid())));
$$;

create policy studio_producoes_ver on public.studio_producoes for select to authenticated using (public.studio_pode_ver(id));
create policy studio_etapas_ver on public.studio_etapas for select to authenticated using (public.studio_pode_ver(producao_id));

create or replace function public.studio_tocar_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists studio_producoes_atualizado on public.studio_producoes;
create trigger studio_producoes_atualizado before update on public.studio_producoes for each row execute function public.studio_tocar_atualizado();

-- ---------------------------------------------------------------- estados (mesma tabela do contrato.ts)

create or replace function public.studio_transicao_valida(p_de text, p_para text)
returns boolean language sql immutable as $$
  select p_para = any (case p_de
    when 'recebido' then array['planejando', 'cancelado', 'erro']
    when 'planejando' then array['aguardando_aprovacao_plano', 'erro', 'cancelado']
    when 'aguardando_aprovacao_plano' then array['gerando_imagens', 'planejando', 'recebido', 'cancelado']
    when 'gerando_imagens' then array['aguardando_aprovacao_imagens', 'erro', 'cancelado']
    when 'aguardando_aprovacao_imagens' then array['gerando_imagens', 'montando', 'pronto', 'cancelado']
    when 'montando' then array['conferindo', 'erro', 'cancelado']
    when 'conferindo' then array['pronto', 'reprovado', 'erro']
    when 'pronto' then array['entregue', 'montando', 'aguardando_aprovacao_imagens']
    when 'entregue' then array['montando', 'aguardando_aprovacao_imagens']
    when 'reprovado' then array['montando', 'aguardando_aprovacao_imagens', 'cancelado']
    when 'erro' then array['recebido', 'gerando_imagens', 'montando', 'cancelado']
    else array[]::text[] end);
$$;

-- registro de auditoria (toda ação do usuário vira uma etapa "usuario")
create or replace function public.studio_registrar(p_producao uuid, p_acao text, p_dados jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.studio_etapas (producao_id, empresa_operadora_id, agente, chave, plano_versao, saida, por_usuario)
  select id, empresa_operadora_id, 'usuario', 'usuario:' || p_acao, plano_versao, p_dados, auth.uid() from public.studio_producoes where id = p_producao;
$$;

-- ---------------------------------------------------------------- cota (limites iguais a COTA_DIARIA do contrato.ts)

create or replace function public.studio_consumir_cota(p_empresa uuid, p_user uuid, p_modalidade text, p_qtd int default 1, p_neurons int default 0)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_lim_pessoa int; v_lim_empresa int; v_meu int; v_emp int;
begin
  select lp, le into v_lim_pessoa, v_lim_empresa from (values
    ('plano', 10, 60), ('imagem', 40, 200), ('montagem', 10, 60), ('imagem_paga', 0, 0), ('video_ia', 0, 0), ('voz', 0, 0)) t(m, lp, le)
   where m = p_modalidade;
  if v_lim_pessoa is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('studio_cota:' || p_empresa::text || p_modalidade));
  if p_modalidade = 'plano' then
    select count(*) into v_emp from public.studio_producoes where empresa_operadora_id = p_empresa and criado_em >= v_ini;
    select count(*) into v_meu from public.studio_producoes where empresa_operadora_id = p_empresa and user_id = p_user and criado_em >= v_ini;
  else
    select count(*) into v_emp from public.studio_etapas e where e.empresa_operadora_id = p_empresa and e.agente = p_modalidade and e.estado = 'ok' and e.criado_em >= v_ini
       and e.chave not like 'montagem:disparo:%';
    select count(*) into v_meu from public.studio_etapas e join public.studio_producoes s on s.id = e.producao_id
     where e.empresa_operadora_id = p_empresa and s.user_id = p_user and e.agente = p_modalidade and e.estado = 'ok' and e.criado_em >= v_ini
       and e.chave not like 'montagem:disparo:%';
  end if;
  return v_meu + p_qtd <= v_lim_pessoa and v_emp + p_qtd <= v_lim_empresa;
end $$;

create or replace function public.studio_minha_cota()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with ini as (select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as t)
  select jsonb_build_object(
    'plano', jsonb_build_object('usado', (select count(*) from public.studio_producoes, ini where user_id = auth.uid() and criado_em >= ini.t), 'limite', 10),
    'imagem', jsonb_build_object('usado', (select count(*) from public.studio_etapas e join public.studio_producoes s on s.id = e.producao_id, ini
                                            where s.user_id = auth.uid() and e.agente = 'imagem' and e.estado = 'ok' and e.criado_em >= ini.t), 'limite', 40),
    'montagem', jsonb_build_object('usado', (select count(*) from public.studio_etapas e join public.studio_producoes s on s.id = e.producao_id, ini
                                              where s.user_id = auth.uid() and e.agente = 'montagem' and e.estado = 'ok' and e.criado_em >= ini.t
                                                and e.chave not like 'montagem:disparo:%'), 'limite', 10));
$$;

-- ---------------------------------------------------------------- ações do usuário (empresa/cliente/usuário SEMPRE da sessão)

create or replace function public.studio_criar_producao(p_pedido jsonb, p_chave text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e record; v_id uuid; v_prod jsonb; v_tipo text := p_pedido->>'tipo'; v_n int;
  v_preco bigint; v_promo bigint; v_ativos int;
begin
  select * into e from public.studio_escopo();
  if not coalesce(e.pode, false) then raise exception 'O Studio está disponível para anunciantes e para o proprietário/administradores.' using errcode = '42501'; end if;
  if p_chave is null or char_length(p_chave) < 16 then raise exception 'Chave do pedido inválida.'; end if;
  select id into v_id from public.studio_producoes where user_id = auth.uid() and chave_idempotencia = p_chave;
  if v_id is not null then return v_id; end if;                       -- clique duplo / rede lenta: mesma produção
  if v_tipo not in ('imagens', 'video_montado') then
    raise exception 'Este tipo de produção ainda não está disponível (depende de provedor externo).';
  end if;
  if (p_pedido->>'formato') not in ('16:9', '9:16', '1:1') then raise exception 'Formato inválido.'; end if;
  if jsonb_typeof(p_pedido->'produtos') <> 'array' then raise exception 'Produtos inválidos.'; end if;
  v_n := jsonb_array_length(p_pedido->'produtos');
  if v_n > 6 then raise exception 'Informe no máximo 6 produtos.'; end if;   -- 0 = serviço/campanha sem produto (Creative Core)
  for v_prod in select * from jsonb_array_elements(p_pedido->'produtos') loop
    if coalesce(trim(v_prod->>'nome'), '') = '' then raise exception 'Produto sem nome.'; end if;
    if v_prod->'preco_centavos' is not null and jsonb_typeof(v_prod->'preco_centavos') <> 'null' then
      if jsonb_typeof(v_prod->'preco_centavos') <> 'number' or (v_prod->>'preco_centavos') !~ '^[0-9]+$' then raise exception 'Preço deve estar em centavos inteiros.'; end if;
      v_preco := (v_prod->>'preco_centavos')::bigint;
      if v_preco <= 0 or v_preco > 99999999 then raise exception 'Preço fora do limite.'; end if;
    else v_preco := null; end if;
    if v_prod->'preco_promo_centavos' is not null and jsonb_typeof(v_prod->'preco_promo_centavos') <> 'null' then
      if (v_prod->>'preco_promo_centavos') !~ '^[0-9]+$' then raise exception 'Preço promocional deve estar em centavos inteiros.'; end if;
      v_promo := (v_prod->>'preco_promo_centavos')::bigint;
      if v_preco is null or v_promo <= 0 or v_promo >= v_preco then raise exception 'O preço promocional precisa ser menor que o preço normal.'; end if;
    end if;
  end loop;
  select count(*) into v_ativos from public.studio_producoes
   where user_id = auth.uid() and estado in ('recebido', 'planejando', 'gerando_imagens', 'montando', 'conferindo');
  if v_ativos >= 3 then raise exception 'Você já tem 3 produções em andamento. Aguarde uma terminar.'; end if;
  if not public.studio_consumir_cota(e.empresa, auth.uid(), 'plano', 1, 0) then
    raise exception 'Limite diário de novos planejamentos atingido. Tente amanhã.';
  end if;
  insert into public.studio_producoes (empresa_operadora_id, cliente_id, user_id, titulo, tipo, formato, duracao_s, cenas_qtd,
    briefing, produtos, chave_idempotencia, rotulo)
  values (e.empresa, e.cliente, auth.uid(), left(coalesce(p_pedido->'briefing'->>'titulo', 'Campanha'), 80), v_tipo, p_pedido->>'formato',
    (p_pedido->>'duracao_s')::int, (p_pedido->>'cenas')::int, p_pedido->'briefing', p_pedido->'produtos', p_chave,
    case v_tipo when 'imagens' then 'Imagem gerada por IA com o produto real' else 'Vídeo montado a partir de imagens' end)
  returning id into v_id;
  perform public.studio_registrar(v_id, 'criar', jsonb_build_object('tipo', v_tipo));
  return v_id;
end $$;

/** Linha da produção que o usuário pode alterar (mesmo escopo da leitura), travada para a mudança. */
create or replace function public.studio_minha(p_id uuid)
returns public.studio_producoes language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes;
begin
  if not public.studio_pode_ver(p_id) then raise exception 'Produção não encontrada.' using errcode = '42501'; end if;
  select * into r from public.studio_producoes where id = p_id for update;
  return r;
end $$;

create or replace function public.studio_aprovar_plano(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes;
begin
  r := public.studio_minha(p_id);
  if r.estado <> 'aguardando_aprovacao_plano' or r.plano is null then raise exception 'O plano não está aguardando aprovação.'; end if;
  update public.studio_producoes set estado = 'gerando_imagens', aprovado_plano_em = now(), processando_ate = null where id = p_id;
  perform public.studio_registrar(p_id, 'aprovar_plano', jsonb_build_object('plano_versao', r.plano_versao));
end $$;

create or replace function public.studio_pedir_replanejar(p_id uuid, p_instrucao text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes;
begin
  r := public.studio_minha(p_id);
  if r.estado <> 'aguardando_aprovacao_plano' then raise exception 'Só dá para pedir ajuste quando o plano está aguardando aprovação.'; end if;
  if not public.studio_consumir_cota(r.empresa_operadora_id, auth.uid(), 'plano', 1, 0) then raise exception 'Limite diário de planejamentos atingido.'; end if;
  update public.studio_etapas set estado = 'substituida' where producao_id = p_id and plano_versao = r.plano_versao and agente in ('diretor', 'roteirista', 'fotografia', 'prompts');
  update public.studio_producoes set estado = 'recebido', plano = null, plano_versao = r.plano_versao + 1,
    instrucao_ajuste = left(coalesce(p_instrucao, ''), 600), processando_ate = null where id = p_id;
  perform public.studio_registrar(p_id, 'pedir_replanejar', jsonb_build_object('instrucao', left(coalesce(p_instrucao, ''), 600)));
end $$;

create or replace function public.studio_decidir_imagem(p_id uuid, p_cena int, p_versao int, p_decisao text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; v_cena jsonb; v_versoes jsonb; v_nova jsonb := '[]'::jsonb; v jsonb; v_achou boolean := false;
begin
  r := public.studio_minha(p_id);
  if r.estado not in ('aguardando_aprovacao_imagens', 'pronto', 'entregue', 'reprovado') then raise exception 'As imagens não estão em revisão.'; end if;
  if p_decisao not in ('aprovada', 'rejeitada') then raise exception 'Decisão inválida.'; end if;
  v_cena := r.cenas -> p_cena::text;
  if v_cena is null then raise exception 'Cena inexistente.'; end if;
  v_versoes := coalesce(v_cena->'versoes', '[]'::jsonb);
  for v in select * from jsonb_array_elements(v_versoes) loop
    if (v->>'versao')::int = p_versao then v := jsonb_set(v, '{decisao}', to_jsonb(p_decisao)); v_achou := true; end if;
    v_nova := v_nova || jsonb_build_array(v);
  end loop;
  if not v_achou then raise exception 'Versão inexistente.'; end if;
  v_cena := jsonb_set(v_cena, '{versoes}', v_nova);
  if p_decisao = 'aprovada' then v_cena := jsonb_set(v_cena, '{escolhida}', to_jsonb(p_versao));
  elsif (v_cena->>'escolhida')::int = p_versao then v_cena := v_cena - 'escolhida'; end if;
  update public.studio_producoes set cenas = jsonb_set(cenas, array[p_cena::text], v_cena) where id = p_id;
  perform public.studio_registrar(p_id, 'decidir_imagem', jsonb_build_object('cena', p_cena, 'versao', p_versao, 'decisao', p_decisao));
end $$;

create or replace function public.studio_pedir_imagem(p_id uuid, p_cena int, p_instrucao text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; v_cota jsonb;
begin
  r := public.studio_minha(p_id);
  if r.estado not in ('aguardando_aprovacao_imagens', 'reprovado', 'pronto', 'entregue') then raise exception 'Não é possível gerar nova imagem agora.'; end if;
  if r.cenas -> p_cena::text is null then raise exception 'Cena inexistente.'; end if;
  v_cota := public.studio_minha_cota();
  if (v_cota->'imagem'->>'usado')::int >= (v_cota->'imagem'->>'limite')::int then raise exception 'Limite diário de imagens atingido.'; end if;
  update public.studio_producoes
     set cenas = jsonb_set(cenas, array[p_cena::text], (cenas -> p_cena::text) || jsonb_build_object('gerar', true, 'instrucao', left(coalesce(p_instrucao, ''), 300))),
         estado = 'gerando_imagens', processando_ate = null
   where id = p_id;
  perform public.studio_registrar(p_id, 'pedir_imagem', jsonb_build_object('cena', p_cena, 'instrucao', left(coalesce(p_instrucao, ''), 300)));
end $$;

create or replace function public.studio_salvar_edicao(p_id uuid, p_edicoes jsonb, p_ordem int[])
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; k text; v jsonb;
begin
  r := public.studio_minha(p_id);
  if r.estado not in ('aguardando_aprovacao_imagens', 'pronto', 'entregue', 'reprovado') then raise exception 'A produção não está em edição.'; end if;
  if jsonb_typeof(p_edicoes) <> 'object' then raise exception 'Edição inválida.'; end if;
  for k, v in select * from jsonb_each(p_edicoes) loop
    if r.cenas -> k is null then raise exception 'Cena % inexistente.', k; end if;
    if (v->>'titulo') ~* '(r\$|[0-9]+[.,][0-9]{2})' or (v->>'subtitulo') ~* '(r\$|[0-9]+[.,][0-9]{2})' then
      raise exception 'Preço não vai no título: ele vem do cadastro do produto.';
    end if;
    if char_length(coalesce(v->>'titulo', '')) > 70 or char_length(coalesce(v->>'subtitulo', '')) > 90 then raise exception 'Texto longo demais.'; end if;
    if coalesce((v->>'duracao_s')::numeric, 0) < 2 or (v->>'duracao_s')::numeric > 30 then raise exception 'Duração da cena fora do limite.'; end if;
  end loop;
  if p_ordem is not null and (select array_agg(x order by x) from unnest(p_ordem) x) <> (select array_agg(k::int order by k::int) from jsonb_object_keys(r.cenas) k) then
    raise exception 'Ordem das cenas inválida.';
  end if;
  update public.studio_producoes set edicoes = edicoes || p_edicoes, ordem = coalesce(p_ordem, ordem), edicao_versao = r.edicao_versao + 1 where id = p_id;
  perform public.studio_registrar(p_id, 'salvar_edicao', jsonb_build_object('versao', r.edicao_versao + 1, 'edicoes', p_edicoes, 'ordem', p_ordem));
  return r.edicao_versao + 1;
end $$;

create or replace function public.studio_pedir_montagem(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; k text;
begin
  r := public.studio_minha(p_id);
  if r.estado not in ('aguardando_aprovacao_imagens', 'pronto', 'entregue', 'reprovado') then raise exception 'A produção não está pronta para montar.'; end if;
  for k in select jsonb_object_keys(r.cenas) loop
    if (r.cenas -> k ->> 'escolhida') is null then raise exception 'Aprove uma imagem da cena % antes de montar.', k; end if;
  end loop;
  if not public.studio_consumir_cota(r.empresa_operadora_id, auth.uid(), 'montagem', 1, 0) then raise exception 'Limite diário de montagens atingido.'; end if;
  update public.studio_producoes
     set estado = 'montando', processando_ate = null, erro = null,
         montagem = jsonb_build_object('chave', gen_random_uuid(), 'pedida_em', now(), 'edicao_versao', r.edicao_versao, 'disparada', false)
   where id = p_id;
  perform public.studio_registrar(p_id, 'pedir_montagem', jsonb_build_object('edicao_versao', r.edicao_versao));
end $$;

/** Envia o resultado aprovado para a estrutura EXISTENTE: anunciante → cliente_assets (passa pela análise de conteúdo);
 *  owner/ADM → media (+ pasta da Biblioteca opcional). Nunca publica em tela sozinho: a playlist continua sendo do usuário. */
create or replace function public.studio_entregar(p_id uuid, p_pasta uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; e record; v_url text; v_path text; v_tipo text; v_mime text; v_id uuid; v_tam bigint;
begin
  r := public.studio_minha(p_id);
  select * into e from public.studio_escopo();
  if r.estado <> 'pronto' then raise exception 'Só produções prontas (aprovadas na conferência) podem ser enviadas.'; end if;
  if r.tipo = 'video_montado' then
    v_url := r.resultado->>'video_url'; v_path := r.resultado->>'video_path'; v_tipo := 'video'; v_mime := 'video/mp4';
  else
    v_url := r.resultado->>'imagem_url'; v_path := r.resultado->>'imagem_path'; v_tipo := 'imagem'; v_mime := 'image/png';
  end if;
  v_tam := coalesce((r.resultado->>'tamanho')::bigint, 0);
  if v_url is null or v_path is null then raise exception 'Arquivo final não encontrado.'; end if;
  if r.cliente_id is not null then
    insert into public.cliente_assets (empresa_operadora_id, cliente_id, nome, tipo, mime_type, object_url, tamanho, largura, altura, duracao, tags, usuario_id, quadros)
    values (r.empresa_operadora_id, r.cliente_id, left(r.titulo, 120), v_tipo, v_mime, v_url, v_tam,
      (r.resultado->>'largura')::int, (r.resultado->>'altura')::int, case when v_tipo = 'video' then r.duracao_s end,
      array['studio', 'studio:' || r.tipo], auth.uid(), r.resultado->'quadros')
    returning id into v_id;
    update public.studio_producoes set estado = 'entregue', entregue_em = now(), resultado_asset_id = v_id where id = p_id;
  else
    if not e.admin then raise exception 'Sem permissão para enviar à Biblioteca.' using errcode = '42501'; end if;
    insert into public.media (user_id, name, file_path, file_url, file_type, file_size, mime_type, aspect_ratio, thumbnail_url, duration_ms)
    values (auth.uid(), left(r.titulo, 120), v_path, v_url, case when v_tipo = 'video' then 'video' else 'image' end, v_tam, v_mime,
      r.formato, r.resultado->>'miniatura_url', case when v_tipo = 'video' then r.duracao_s * 1000 end)
    returning id into v_id;
    if p_pasta is not null then
      if not exists (select 1 from public.biblioteca_pastas where id = p_pasta and empresa_operadora_id = r.empresa_operadora_id and deleted_at is null) then
        raise exception 'Pasta da Biblioteca inválida.';
      end if;
      insert into public.biblioteca_itens (pasta_id, media_id, tags) values (p_pasta, v_id, array['studio', 'studio:' || r.tipo]);
    end if;
    update public.studio_producoes set estado = 'entregue', entregue_em = now(), resultado_media_id = v_id where id = p_id;
  end if;
  perform public.studio_registrar(p_id, 'entregar', jsonb_build_object('destino', case when r.cliente_id is not null then 'cliente_assets' else 'media' end, 'id', v_id, 'pasta', p_pasta));
  return jsonb_build_object('destino', case when r.cliente_id is not null then 'cliente_assets' else 'media' end, 'id', v_id);
end $$;

create or replace function public.studio_cancelar(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes;
begin
  r := public.studio_minha(p_id);
  if not public.studio_transicao_valida(r.estado, 'cancelado') then raise exception 'Esta produção não pode ser cancelada agora.'; end if;
  update public.studio_producoes set estado = 'cancelado', processando_ate = null where id = p_id;
  perform public.studio_registrar(p_id, 'cancelar', '{}'::jsonb);
end $$;

/** Depois de um erro: volta para a etapa que falhou. Só etapas GRATUITAS são repetidas (não há etapa paga ligada);
 *  a cota já consumida não é cobrada de novo. */
create or replace function public.studio_tentar_de_novo(p_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.studio_producoes; v_para text;
begin
  r := public.studio_minha(p_id);
  if r.estado <> 'erro' then raise exception 'Só produções com erro podem ser tentadas de novo.'; end if;
  v_para := case
    when r.plano is null then 'recebido'
    when coalesce(r.montagem->>'pedida_em', '') <> '' then 'montando'
    else 'gerando_imagens' end;
  update public.studio_producoes set estado = v_para, erro = null, processando_ate = null,
    montagem = case when v_para = 'montando' then montagem || jsonb_build_object('chave', gen_random_uuid(), 'disparada', false) else montagem end
   where id = p_id;
  perform public.studio_registrar(p_id, 'tentar_de_novo', jsonb_build_object('para', v_para));
  return v_para;
end $$;

-- ---------------------------------------------------------------- funções do orquestrador (somente service_role)

create or replace function public.studio_mudar_estado(p_id uuid, p_de text, p_para text, p_campos jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public.studio_transicao_valida(p_de, p_para) then raise exception 'Transição inválida: % → %', p_de, p_para; end if;
  update public.studio_producoes set
      estado = p_para,
      plano = case when p_campos ? 'plano' then p_campos->'plano' else plano end,
      cenas = case when p_campos ? 'cenas' then p_campos->'cenas' else cenas end,
      edicoes = case when p_campos ? 'edicoes' then p_campos->'edicoes' else edicoes end,
      montagem = case when p_campos ? 'montagem' then p_campos->'montagem' else montagem end,
      resultado = case when p_campos ? 'resultado' then p_campos->'resultado' else resultado end,
      erro = case when p_campos ? 'erro' then p_campos->>'erro' else erro end,
      custo_neurons = custo_neurons + coalesce((p_campos->>'neurons')::int, 0),
      processando_ate = null
   where id = p_id and estado = p_de;
  get diagnostics n = row_count;
  return n = 1;                                   -- false = outro processo já mudou o estado (corrida): ninguém repete trabalho
end $$;

/** Reserva até p_limite produções com trabalho pendente (lease de 4 min; quem cair no meio é retomado depois). */
create or replace function public.studio_reservar(p_limite int default 3)
returns setof public.studio_producoes language sql security definer set search_path = public, pg_temp as $$
  update public.studio_producoes s set processando_ate = now() + interval '4 minutes'
   where s.id in (
     select id from public.studio_producoes
      where estado in ('recebido', 'planejando', 'gerando_imagens', 'montando', 'conferindo')
        and (processando_ate is null or processando_ate < now())
      order by atualizado_em
      limit greatest(1, least(p_limite, 10))
      for update skip locked)
  returning s.*;
$$;

revoke all on function public.studio_consumir_cota(uuid, uuid, text, int, int), public.studio_mudar_estado(uuid, text, text, jsonb),
  public.studio_reservar(int), public.studio_registrar(uuid, text, jsonb), public.studio_minha(uuid) from public, anon, authenticated;
grant execute on function public.studio_consumir_cota(uuid, uuid, text, int, int), public.studio_mudar_estado(uuid, text, text, jsonb),
  public.studio_reservar(int) to service_role;
revoke all on function public.studio_criar_producao(jsonb, text), public.studio_aprovar_plano(uuid), public.studio_pedir_replanejar(uuid, text),
  public.studio_decidir_imagem(uuid, int, int, text), public.studio_pedir_imagem(uuid, int, text), public.studio_salvar_edicao(uuid, jsonb, int[]),
  public.studio_pedir_montagem(uuid), public.studio_entregar(uuid, uuid), public.studio_cancelar(uuid), public.studio_tentar_de_novo(uuid), public.studio_minha_cota(),
  public.studio_escopo(), public.studio_pode_ver(uuid) from public, anon;
grant execute on function public.studio_criar_producao(jsonb, text), public.studio_aprovar_plano(uuid), public.studio_pedir_replanejar(uuid, text),
  public.studio_decidir_imagem(uuid, int, int, text), public.studio_pedir_imagem(uuid, int, text), public.studio_salvar_edicao(uuid, jsonb, int[]),
  public.studio_pedir_montagem(uuid), public.studio_entregar(uuid, uuid), public.studio_cancelar(uuid), public.studio_tentar_de_novo(uuid), public.studio_minha_cota(),
  public.studio_escopo(), public.studio_pode_ver(uuid) to authenticated;
