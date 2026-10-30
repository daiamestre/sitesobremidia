-- =====================================================================================================================
-- SOBRE MÍDIA STUDIO AI — catálogo/editor de modelos + criação com IA (OpenAI GPT Image) cobrada por crédito.
-- Regra do dono (30/10/2026): cada criação com IA custa R$ 4,99 ao cliente. O cliente compra créditos por PIX
-- (mesma cobrança avulsa em contas_receber que a playlist já usa); 1 crédito = 1 criação. O preço fica em
-- studio_ai_config (configurável). Owner/ADM criam para a própria empresa sem cobrança (uso interno, custo registrado).
-- ADITIVO: só objetos novos com prefixo studio_ai_ / studio_projetos. Não altera tabela, função, RLS ou dado existente
-- (a cobrança só INSERE em contas_receber, exatamente como adicionar_midia_playlist).
-- Impacto no Player: nenhum (o resultado vira cliente_assets/media comuns e segue pelas playlists).
-- ROLLBACK:
--   drop table if exists public.studio_ai_imagens, public.studio_ai_jobs, public.studio_ai_conversas, public.studio_ai_movimentos,
--     public.studio_ai_compras, public.studio_ai_carteiras, public.studio_ai_config, public.studio_projetos cascade;
--   drop function if exists public.studio_ai_escopo(), public.studio_ai_pode_ver(uuid, uuid, uuid), public.studio_ai_carteira(uuid, uuid),
--     public.studio_ai_mover(uuid, text, int, text, uuid, uuid, text), public.studio_ai_comprar_creditos(int),
--     public.studio_ai_confirmar_compra(uuid), public.studio_ai_creditar_manual(uuid, int, text), public.studio_ai_reservar(uuid),
--     public.studio_ai_consumir(uuid), public.studio_ai_estornar(uuid, text), public.studio_ai_meu_saldo(),
--     public.studio_projeto_salvar(uuid, text, text, text, jsonb, text), public.studio_projeto_apagar(uuid),
--     public.studio_ai_salvar_config(jsonb), public.studio_ai_bloquear_alteracao();
-- =====================================================================================================================

-- ---------------------------------------------------------------- configuração (preço, modelo, teto de gasto)
create table if not exists public.studio_ai_config (
  empresa_operadora_id uuid primary key references public.empresa_operadora(id) on delete cascade,
  habilitado boolean not null default true,
  preco_credito_centavos int not null default 499 check (preco_credito_centavos > 0),
  modelo_padrao text not null default 'gpt-image-2',
  modelos_habilitados text[] not null default array['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-1.5'],
  qualidade_padrao text not null default 'medium' check (qualidade_padrao in ('low', 'medium', 'high')),
  limite_usd_mes numeric(10, 2) not null default 50 check (limite_usd_mes >= 0),
  max_referencias int not null default 4 check (max_referencias between 0 and 8),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now()
);
insert into public.studio_ai_config (empresa_operadora_id) select id from public.empresa_operadora on conflict do nothing;

-- ---------------------------------------------------------------- carteira, compras e extrato (imutável)
create table if not exists public.studio_ai_carteiras (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  saldo int not null default 0 check (saldo >= 0),
  reservado int not null default 0 check (reservado >= 0),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id)
);

create table if not exists public.studio_ai_compras (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  carteira_id uuid not null references public.studio_ai_carteiras(id) on delete cascade,
  quantidade int not null check (quantidade between 1 and 100),
  valor_centavos int not null check (valor_centavos > 0),
  conta_receber_id uuid not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CREDITADA', 'CANCELADA')),
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  creditado_em timestamptz
);

create table if not exists public.studio_ai_movimentos (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.studio_ai_carteiras(id) on delete cascade,
  tipo text not null check (tipo in ('COMPRA', 'CORTESIA', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'RESERVA', 'CONSUMO', 'ESTORNO')),
  quantidade int not null check (quantidade > 0),
  saldo_apos int not null,
  reservado_apos int not null,
  job_id uuid,
  compra_id uuid,
  operador_id uuid,
  motivo text,
  idempotencia text not null unique,
  criado_em timestamptz not null default now()
);
create index if not exists studio_ai_mov_carteira_idx on public.studio_ai_movimentos (carteira_id, criado_em desc);

-- o extrato é IMUTÁVEL: correção = novo movimento
create or replace function public.studio_ai_bloquear_alteracao() returns trigger language plpgsql as $$
begin raise exception 'O extrato de créditos é imutável: registre um novo movimento.'; end $$;
drop trigger if exists studio_ai_movimentos_imutavel on public.studio_ai_movimentos;
create trigger studio_ai_movimentos_imutavel before update or delete on public.studio_ai_movimentos
  for each row execute function public.studio_ai_bloquear_alteracao();

-- ---------------------------------------------------------------- conversas, gerações e imagens
create table if not exists public.studio_ai_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,   -- null = uso interno da equipe (owner/ADM)
  operador_id uuid not null,
  titulo text not null default 'Nova criação',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists studio_ai_conversas_idx on public.studio_ai_conversas (empresa_operadora_id, atualizado_em desc);

create table if not exists public.studio_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.studio_ai_conversas(id) on delete cascade,
  empresa_operadora_id uuid not null,
  cliente_id uuid,
  operador_id uuid not null,
  tipo text not null check (tipo in ('gerar', 'editar')),
  status text not null default 'AGUARDANDO' check (status in ('AGUARDANDO', 'RESERVANDO', 'PROCESSANDO', 'CONCLUIDO', 'FALHA', 'CANCELADO', 'ESTORNO_PENDENTE', 'ESTORNADO')),
  prompt_original text not null,
  prompt_enviado text not null,
  parametros jsonb not null default '{}'::jsonb,
  modelo text not null,
  referencias jsonb not null default '[]'::jsonb,
  origem_imagem_id uuid,
  cobrar boolean not null,
  carteira_id uuid,
  creditos int not null default 0,
  custo_usd numeric(10, 4),
  uso jsonb,
  erro text,
  idempotencia text not null unique,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz
);
create index if not exists studio_ai_jobs_conversa_idx on public.studio_ai_jobs (conversa_id, criado_em);
create index if not exists studio_ai_jobs_ativos_idx on public.studio_ai_jobs (status, criado_em) where status in ('RESERVANDO', 'PROCESSANDO', 'ESTORNO_PENDENTE');

create table if not exists public.studio_ai_imagens (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.studio_ai_jobs(id) on delete cascade,
  conversa_id uuid not null references public.studio_ai_conversas(id) on delete cascade,
  empresa_operadora_id uuid not null,
  cliente_id uuid,
  versao_de uuid references public.studio_ai_imagens(id) on delete set null,
  url text not null,
  path text not null,
  mime text not null,
  largura int not null,
  altura int not null,
  bytes int not null,
  sha256 text not null,
  alfa text not null check (alfa in ('verificado', 'ausente', 'nao_verificado')),
  alfa_relatorio jsonb,
  modelo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists studio_ai_imagens_conversa_idx on public.studio_ai_imagens (conversa_id, criado_em);

-- ---------------------------------------------------------------- projetos do editor (modelo do catálogo personalizado)
create table if not exists public.studio_projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_operadora_id uuid not null references public.empresa_operadora(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  user_id uuid not null,
  modelo_id text not null,
  nome text not null check (char_length(nome) between 1 and 120),
  formato text not null check (formato in ('16:9', '9:16')),
  dados jsonb not null,
  miniatura_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists studio_projetos_idx on public.studio_projetos (empresa_operadora_id, atualizado_em desc);

-- ---------------------------------------------------------------- escopo (modelo real: usuarios + perfis + user_roles)
create or replace function public.studio_ai_escopo()
returns table (empresa uuid, cliente uuid, admin boolean, pode boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.empresa_operadora_id,
         case when upper(coalesce(p.nome, '')) in ('ANUNCIANTE', 'CLIENTE') and not coalesce(u.is_owner, false) then u.cliente_id end,
         (coalesce(u.is_owner, false) or upper(coalesce(p.nome, '')) in ('OWNER', 'ADMIN') or public.has_role(u.id, 'admin'::app_role)),
         (coalesce(u.is_owner, false) or upper(coalesce(p.nome, '')) in ('OWNER', 'ADMIN') or public.has_role(u.id, 'admin'::app_role)
           or (upper(coalesce(p.nome, '')) in ('ANUNCIANTE', 'CLIENTE') and u.cliente_id is not null))
    from public.usuarios u left join public.perfis p on p.id = u.perfil_id
   where u.id = auth.uid();
$$;

/** Pode ver um registro (empresa, cliente, dono)? anunciante: o seu cliente; owner/ADM: a empresa; equipe interna: o seu. */
create or replace function public.studio_ai_pode_ver(p_empresa uuid, p_cliente uuid, p_dono uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.studio_ai_escopo() e
                  where e.pode and e.empresa = p_empresa
                    and (e.admin or (e.cliente is not null and p_cliente = e.cliente) or (e.cliente is null and p_cliente is null and p_dono = auth.uid())));
$$;

alter table public.studio_ai_config enable row level security;
alter table public.studio_ai_carteiras enable row level security;
alter table public.studio_ai_compras enable row level security;
alter table public.studio_ai_movimentos enable row level security;
alter table public.studio_ai_conversas enable row level security;
alter table public.studio_ai_jobs enable row level security;
alter table public.studio_ai_imagens enable row level security;
alter table public.studio_projetos enable row level security;
revoke all on public.studio_ai_config, public.studio_ai_carteiras, public.studio_ai_compras, public.studio_ai_movimentos,
  public.studio_ai_conversas, public.studio_ai_jobs, public.studio_ai_imagens, public.studio_projetos from anon;
revoke insert, update, delete, truncate on public.studio_ai_config, public.studio_ai_carteiras, public.studio_ai_compras, public.studio_ai_movimentos,
  public.studio_ai_conversas, public.studio_ai_jobs, public.studio_ai_imagens, public.studio_projetos from authenticated;
grant select on public.studio_ai_config, public.studio_ai_carteiras, public.studio_ai_compras, public.studio_ai_movimentos,
  public.studio_ai_conversas, public.studio_ai_jobs, public.studio_ai_imagens, public.studio_projetos to authenticated;

create policy studio_ai_config_ver on public.studio_ai_config for select to authenticated
  using (exists (select 1 from public.studio_ai_escopo() e where e.pode and e.empresa = studio_ai_config.empresa_operadora_id));
create policy studio_ai_carteiras_ver on public.studio_ai_carteiras for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, null));
create policy studio_ai_compras_ver on public.studio_ai_compras for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, null));
create policy studio_ai_movimentos_ver on public.studio_ai_movimentos for select to authenticated
  using (exists (select 1 from public.studio_ai_carteiras c where c.id = carteira_id and public.studio_ai_pode_ver(c.empresa_operadora_id, c.cliente_id, null)));
create policy studio_ai_conversas_ver on public.studio_ai_conversas for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, operador_id));
create policy studio_ai_jobs_ver on public.studio_ai_jobs for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, operador_id));
create policy studio_ai_imagens_ver on public.studio_ai_imagens for select to authenticated
  using (exists (select 1 from public.studio_ai_conversas c where c.id = conversa_id and public.studio_ai_pode_ver(c.empresa_operadora_id, c.cliente_id, c.operador_id)));
create policy studio_projetos_ver on public.studio_projetos for select to authenticated using (public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, user_id));

-- ---------------------------------------------------------------- créditos (todas as mudanças de saldo passam por aqui)

/** Carteira do cliente (cria se não existir), travada para a mudança. */
create or replace function public.studio_ai_carteira(p_empresa uuid, p_cliente uuid)
returns public.studio_ai_carteiras language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.studio_ai_carteiras;
begin
  insert into public.studio_ai_carteiras (empresa_operadora_id, cliente_id) values (p_empresa, p_cliente) on conflict (cliente_id) do nothing;
  select * into c from public.studio_ai_carteiras where cliente_id = p_cliente for update;
  if c.empresa_operadora_id <> p_empresa then raise exception 'Carteira de outra empresa.'; end if;
  return c;
end $$;

/** Movimento único e idempotente: mesma chave = nada acontece de novo (devolve false). */
create or replace function public.studio_ai_mover(p_carteira uuid, p_tipo text, p_qtd int, p_chave text, p_job uuid, p_compra uuid, p_motivo text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.studio_ai_carteiras; v_saldo int; v_res int;
begin
  if p_qtd <= 0 then raise exception 'Quantidade inválida.'; end if;
  if exists (select 1 from public.studio_ai_movimentos where idempotencia = p_chave) then return false; end if;
  select * into c from public.studio_ai_carteiras where id = p_carteira for update;
  v_saldo := c.saldo; v_res := c.reservado;
  case p_tipo
    when 'COMPRA', 'CORTESIA', 'AJUSTE_ENTRADA' then v_saldo := v_saldo + p_qtd;
    when 'AJUSTE_SAIDA' then v_saldo := v_saldo - p_qtd;
    when 'RESERVA' then v_saldo := v_saldo - p_qtd; v_res := v_res + p_qtd;
    when 'CONSUMO' then v_res := v_res - p_qtd;
    when 'ESTORNO' then v_saldo := v_saldo + p_qtd; v_res := v_res - p_qtd;
    else raise exception 'Tipo de movimento inválido.';
  end case;
  if v_saldo < 0 then raise exception 'Saldo de créditos insuficiente.' using errcode = 'P0001'; end if;
  if v_res < 0 then raise exception 'Reserva inconsistente.'; end if;
  update public.studio_ai_carteiras set saldo = v_saldo, reservado = v_res, atualizado_em = now() where id = p_carteira;
  insert into public.studio_ai_movimentos (carteira_id, tipo, quantidade, saldo_apos, reservado_apos, job_id, compra_id, operador_id, motivo, idempotencia)
  values (p_carteira, p_tipo, p_qtd, v_saldo, v_res, p_job, p_compra, auth.uid(), p_motivo, p_chave);
  return true;
end $$;

/** Cliente compra créditos: gera a cobrança PIX avulsa (mesmo caminho da mídia paga da playlist). */
create or replace function public.studio_ai_comprar_creditos(p_quantidade int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; c public.studio_ai_carteiras; v_preco int; v_valor int; v_conta uuid; v_codigo text; v_compra uuid;
begin
  select * into e from public.studio_ai_escopo();
  if e.cliente is null then raise exception 'A compra de créditos é feita pelo anunciante.' using errcode = '42501'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then raise exception 'Escolha de 1 a 100 créditos.'; end if;
  select preco_credito_centavos into v_preco from public.studio_ai_config where empresa_operadora_id = e.empresa;
  v_preco := coalesce(v_preco, 499);
  v_valor := v_preco * p_quantidade;
  c := public.studio_ai_carteira(e.empresa, e.cliente);
  insert into public.contas_receber (empresa_operadora_id, cliente_id, contrato_id, valor, data_vencimento, status, metodo_cobranca, recorrencia, notes)
  values (e.empresa, e.cliente, null, round(v_valor / 100.0, 2), current_date, 'ABERTA', 'PIX', 'AVULSA',
          'Studio AI: ' || p_quantidade || ' crédito(s) de criação com IA (' || public.fn_brl(round(v_preco / 100.0, 2)) || ' cada)')
  returning id into v_conta;
  select codigo_operacional into v_codigo from public.contas_receber where id = v_conta;
  insert into public.studio_ai_compras (empresa_operadora_id, cliente_id, carteira_id, quantidade, valor_centavos, conta_receber_id, criado_por)
  values (e.empresa, e.cliente, c.id, p_quantidade, v_valor, v_conta, auth.uid()) returning id into v_compra;
  insert into public.auditoria_logs (empresa_operadora_id, usuario_id, entidade_tipo, entidade_id, acao, status_novo, observacoes)
  values (e.empresa, auth.uid(), 'STUDIO_AI', v_compra, 'INSERT', 'ABERTA', 'Cobrança ' || coalesce(v_codigo, '') || ' de ' || p_quantidade || ' crédito(s).');
  return jsonb_build_object('compra_id', v_compra, 'cobranca_id', v_conta, 'codigo', v_codigo, 'valor_centavos', v_valor);
end $$;

/** Depois do PIX confirmado (contas_receber PAGA): credita uma única vez. */
create or replace function public.studio_ai_confirmar_compra(p_compra uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; k public.studio_ai_compras; v_status text;
begin
  select * into e from public.studio_ai_escopo();
  select * into k from public.studio_ai_compras where id = p_compra for update;
  if k.id is null or not public.studio_ai_pode_ver(k.empresa_operadora_id, k.cliente_id, null) then raise exception 'Compra não encontrada.' using errcode = '42501'; end if;
  if k.status = 'CREDITADA' then return jsonb_build_object('creditado', true, 'ja_estava', true); end if;
  select status into v_status from public.contas_receber where id = k.conta_receber_id;
  if upper(coalesce(v_status, '')) not in ('PAGA', 'PAGO') then return jsonb_build_object('creditado', false, 'status', v_status); end if;
  perform public.studio_ai_mover(k.carteira_id, 'COMPRA', k.quantidade, 'compra:' || k.id, null, k.id, 'PIX confirmado');
  update public.studio_ai_compras set status = 'CREDITADA', creditado_em = now() where id = k.id;
  return jsonb_build_object('creditado', true, 'quantidade', k.quantidade);
end $$;

/** Owner/ADM: cortesia ou ajuste manual, com motivo obrigatório (fica no extrato). */
create or replace function public.studio_ai_creditar_manual(p_cliente uuid, p_quantidade int, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; c public.studio_ai_carteiras; v_empresa uuid;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores ajustam créditos.' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo), '') = '' or char_length(trim(p_motivo)) < 5 then raise exception 'Informe o motivo (mínimo 5 caracteres).'; end if;
  select empresa_operadora_id into v_empresa from public.clientes where id = p_cliente;
  if v_empresa is distinct from e.empresa then raise exception 'Cliente de outra empresa.' using errcode = '42501'; end if;
  if p_quantidade = 0 then raise exception 'Quantidade inválida.'; end if;
  c := public.studio_ai_carteira(e.empresa, p_cliente);
  perform public.studio_ai_mover(c.id, case when p_quantidade > 0 then 'CORTESIA' else 'AJUSTE_SAIDA' end, abs(p_quantidade),
    'manual:' || gen_random_uuid(), null, null, trim(p_motivo));
end $$;

/** Reserva (antes da chamada à OpenAI), consumo (sucesso) e estorno (falha): só o servidor; idempotentes por job. */
create or replace function public.studio_ai_reservar(p_job uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.studio_ai_jobs;
begin
  select * into j from public.studio_ai_jobs where id = p_job for update;
  if not j.cobrar then return true; end if;
  return public.studio_ai_mover(j.carteira_id, 'RESERVA', j.creditos, 'reserva:' || j.id, j.id, null, null)
      or exists (select 1 from public.studio_ai_movimentos where idempotencia = 'reserva:' || j.id);
end $$;
create or replace function public.studio_ai_consumir(p_job uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.studio_ai_jobs;
begin
  select * into j from public.studio_ai_jobs where id = p_job for update;
  if j.cobrar and not exists (select 1 from public.studio_ai_movimentos where idempotencia = 'estorno:' || j.id) then
    perform public.studio_ai_mover(j.carteira_id, 'CONSUMO', j.creditos, 'consumo:' || j.id, j.id, null, null);
  end if;
end $$;
create or replace function public.studio_ai_estornar(p_job uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.studio_ai_jobs;
begin
  select * into j from public.studio_ai_jobs where id = p_job for update;
  if j.cobrar and exists (select 1 from public.studio_ai_movimentos where idempotencia = 'reserva:' || j.id)
     and not exists (select 1 from public.studio_ai_movimentos where idempotencia = 'consumo:' || j.id) then
    perform public.studio_ai_mover(j.carteira_id, 'ESTORNO', j.creditos, 'estorno:' || j.id, j.id, null, left(p_motivo, 300));
  end if;
end $$;

create or replace function public.studio_ai_meu_saldo()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cliente', e.cliente, 'admin', e.admin, 'pode', e.pode,
    'saldo', coalesce(c.saldo, 0), 'reservado', coalesce(c.reservado, 0),
    'preco_centavos', coalesce(cfg.preco_credito_centavos, 499), 'habilitado', coalesce(cfg.habilitado, true))
  from public.studio_ai_escopo() e
  left join public.studio_ai_carteiras c on c.cliente_id = e.cliente
  left join public.studio_ai_config cfg on cfg.empresa_operadora_id = e.empresa;
$$;

create or replace function public.studio_ai_salvar_config(p_cfg jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.admin, false) then raise exception 'Só o proprietário e os administradores.' using errcode = '42501'; end if;
  update public.studio_ai_config set
    habilitado = coalesce((p_cfg->>'habilitado')::boolean, habilitado),
    preco_credito_centavos = coalesce((p_cfg->>'preco_credito_centavos')::int, preco_credito_centavos),
    modelo_padrao = coalesce(p_cfg->>'modelo_padrao', modelo_padrao),
    qualidade_padrao = coalesce(p_cfg->>'qualidade_padrao', qualidade_padrao),
    limite_usd_mes = coalesce((p_cfg->>'limite_usd_mes')::numeric, limite_usd_mes),
    atualizado_por = auth.uid(), atualizado_em = now()
  where empresa_operadora_id = e.empresa;
  if (p_cfg->>'modelo_padrao') is not null and not exists (select 1 from public.studio_ai_config where empresa_operadora_id = e.empresa and modelo_padrao = any(modelos_habilitados)) then
    raise exception 'Modelo não habilitado.';
  end if;
end $$;

-- ---------------------------------------------------------------- projetos (dono/cliente/empresa SEMPRE da sessão)
create or replace function public.studio_projeto_salvar(p_id uuid, p_modelo text, p_nome text, p_formato text, p_dados jsonb, p_miniatura text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; v_id uuid;
begin
  select * into e from public.studio_ai_escopo();
  if not coalesce(e.pode, false) then raise exception 'Sem acesso ao Studio.' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.studio_projetos (empresa_operadora_id, cliente_id, user_id, modelo_id, nome, formato, dados, miniatura_url)
    values (e.empresa, e.cliente, auth.uid(), left(p_modelo, 80), left(p_nome, 120), p_formato, p_dados, p_miniatura) returning id into v_id;
  else
    select id into v_id from public.studio_projetos where id = p_id and public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, user_id) for update;
    if v_id is null then raise exception 'Projeto não encontrado.' using errcode = '42501'; end if;
    update public.studio_projetos set nome = left(p_nome, 120), dados = p_dados, miniatura_url = coalesce(p_miniatura, miniatura_url), atualizado_em = now() where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.studio_projeto_apagar(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.studio_projetos where id = p_id and public.studio_ai_pode_ver(empresa_operadora_id, cliente_id, user_id);
end $$;

revoke all on function public.studio_ai_carteira(uuid, uuid), public.studio_ai_mover(uuid, text, int, text, uuid, uuid, text),
  public.studio_ai_reservar(uuid), public.studio_ai_consumir(uuid), public.studio_ai_estornar(uuid, text) from public, anon, authenticated;
grant execute on function public.studio_ai_reservar(uuid), public.studio_ai_consumir(uuid), public.studio_ai_estornar(uuid, text) to service_role;
revoke all on function public.studio_ai_escopo(), public.studio_ai_pode_ver(uuid, uuid, uuid), public.studio_ai_comprar_creditos(int),
  public.studio_ai_confirmar_compra(uuid), public.studio_ai_creditar_manual(uuid, int, text), public.studio_ai_meu_saldo(),
  public.studio_ai_salvar_config(jsonb), public.studio_projeto_salvar(uuid, text, text, text, jsonb, text), public.studio_projeto_apagar(uuid) from public, anon;
grant execute on function public.studio_ai_escopo(), public.studio_ai_pode_ver(uuid, uuid, uuid), public.studio_ai_comprar_creditos(int),
  public.studio_ai_confirmar_compra(uuid), public.studio_ai_creditar_manual(uuid, int, text), public.studio_ai_meu_saldo(),
  public.studio_ai_salvar_config(jsonb), public.studio_projeto_salvar(uuid, text, text, text, jsonb, text), public.studio_projeto_apagar(uuid) to authenticated;
