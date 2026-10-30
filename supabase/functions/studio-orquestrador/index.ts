// SOBRE MÍDIA Studio de IA — ORQUESTRADOR (coordena os agentes; nada roda na Vercel).
//   POST { acao: 'tick' }                         → pg_cron (1 min): avança até 3 produções pendentes (lease de 4 min, retomável)
//   POST { acao: 'cutucar', producao_id }         → navegador (JWT): avança já a produção do próprio usuário
//   POST { acao: 'provedores' }                   → situação de cada provedor (sem expor segredos)
//   POST { acao: 'dados_montagem', producao_id }  → GitHub Actions (x-studio-segredo): tudo que a montagem precisa
//   POST { acao: 'montagem_concluida' | 'montagem_falhou', … } → GitHub Actions devolve o resultado e a conferência
// Agentes: _shared/studio/agentes.ts · contrato e validações: _shared/studio/contrato.ts · provedores: _shared/studio/provedores.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { ajustarPrompt, FalhaDoAgente, type RegistroAgente } from '../_shared/studio/agentes.ts';
import { planejarProducao } from '../_shared/studio/pipeline.ts';
import { edicaoInicial, validarEdicao, validarPedido, type EdicaoCena, type PedidoStudio, type PlanoCriativo, type VersaoImagem, usdDosNeurons } from '../_shared/studio/contrato.ts';
import { executorCloudflare, gerarCenario, statusDosProvedores } from '../_shared/studio/provedores.ts';
import { configR2, enviarAoR2 } from '../_shared/studio/r2.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-studio-segredo' };
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k);
const ATIVOS = ['recebido', 'planejando', 'gerando_imagens', 'montando'];
const LIMITE_TEMPO_MS = 110_000; // margem para o limite de 150 s da Edge Function

type Producao = {
  id: string; empresa_operadora_id: string; cliente_id: string | null; user_id: string; estado: string; tipo: string; formato: PedidoStudio['formato'];
  duracao_s: number; cenas_qtd: number; briefing: PedidoStudio['briefing']; produtos: PedidoStudio['produtos']; plano: PlanoCriativo | null;
  plano_versao: number; instrucao_ajuste: string | null; cenas: Record<string, { versoes: VersaoImagem[]; escolhida?: number; gerar?: boolean; instrucao?: string }>;
  edicoes: Record<string, EdicaoCena>; ordem: number[] | null; montagem: Record<string, unknown>; resultado: Record<string, unknown>; rotulo: string | null;
};

const pedidoDa = (p: Producao): PedidoStudio => ({
  briefing: p.instrucao_ajuste ? { ...p.briefing, ideia: `${p.briefing.ideia}\nAjuste pedido pelo cliente: ${p.instrucao_ajuste}` } : p.briefing,
  produtos: p.produtos, formato: p.formato, duracao_s: p.duracao_s, cenas: p.cenas_qtd, tipo: p.tipo as PedidoStudio['tipo'],
});

function executor() {
  const url = env('TABLOIDE_IA_URL'), segredo = env('TABLOIDE_IA_SEGREDO');
  if (!url || !segredo) throw new Error('IA não configurada no servidor (TABLOIDE_IA_URL/TABLOIDE_IA_SEGREDO).');
  return executorCloudflare({ via: 'worker', url, segredo });
}

async function registrar(srv: SupabaseClient, p: Producao, chave: string, r: Partial<RegistroAgente<unknown>> & { agente: string }, extra: Record<string, unknown> = {}) {
  await srv.from('studio_etapas').upsert({
    producao_id: p.id, empresa_operadora_id: p.empresa_operadora_id, agente: r.agente, chave, plano_versao: p.plano_versao,
    provedor: 'cloudflare-workers-ai', modelo: r.modelo ?? null, versao_diretriz: r.versao ?? null, entrada: r.entrada ?? null, saida: r.saida ?? null,
    neurons: r.neurons ?? 0, custo_usd: usdDosNeurons(r.neurons ?? 0), tentativas: r.tentativas ?? 1, idempotencia: `${p.id}:${p.plano_versao}:${chave}`, ...extra,
  }, { onConflict: 'idempotencia', ignoreDuplicates: true });
}

async function mudar(srv: SupabaseClient, p: Producao, para: string, campos: Record<string, unknown> = {}) {
  const { data, error } = await srv.rpc('studio_mudar_estado', { p_id: p.id, p_de: p.estado, p_para: para, p_campos: campos });
  if (error) throw new Error(error.message);
  if (data) p.estado = para;
  return !!data;
}

async function falhar(srv: SupabaseClient, p: Producao, msg: string) {
  console.error('[studio]', p.id, msg);
  await srv.rpc('studio_mudar_estado', { p_id: p.id, p_de: p.estado, p_para: 'erro', p_campos: { erro: msg.slice(0, 500) } });
}

async function imagemComoDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') ?? 'image/jpeg';
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 4_000_000 || !/^image\//.test(tipo)) return null;
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${tipo};base64,${btoa(s)}`;
  } catch { return null; }
}

// ---------------------------------------------------------------- etapas

async function planejar(srv: SupabaseClient, p: Producao) {
  const pedido = pedidoDa(p);
  const erros = validarPedido(pedido);
  if (erros.length) return falhar(srv, p, `Pedido inválido: ${erros.join(' ')}`);
  if (p.estado === 'recebido' && !(await mudar(srv, p, 'planejando'))) return;
  const { data: feitas } = await srv.from('studio_etapas').select('chave, saida').eq('producao_id', p.id).eq('plano_versao', p.plano_versao).eq('estado', 'ok');
  const memoria = Object.fromEntries((feitas ?? []).filter((e) => e.chave !== 'pedido').map((e) => [e.chave, e.saida]));
  let neurons = 0;
  try {
    const { plano, erros: errosPlano } = await planejarProducao(executor(), pedido, {
      feitas: memoria,
      imagem: imagemComoDataUrl,
      gravar: async (chave, r) => { neurons += r.neurons; await registrar(srv, p, chave, r); },
    });
    if (errosPlano.length) return falhar(srv, p, `O plano dos agentes não passou na validação: ${errosPlano.join(' ')}`);
    const cenas = Object.fromEntries(plano.cenas.map((c) => [String(c.numero), { versoes: [], gerar: true }]));
    const edicoes = Object.fromEntries(plano.cenas.map((c) => [String(c.numero), edicaoInicial(c, p.formato)]));
    await mudar(srv, p, 'aguardando_aprovacao_plano', { plano, cenas, edicoes, neurons, erro: null });
  } catch (e) {
    if (e instanceof FalhaDoAgente) {
      await registrar(srv, p, `${e.agente}:falha`, { agente: e.agente, neurons: e.neurons, tentativas: e.tentativas }, { estado: 'erro', erro: e.message.slice(0, 500), idempotencia: `${p.id}:${p.plano_versao}:${e.agente}:falha:${Date.now()}` });
      return falhar(srv, p, /cota/.test(e.message) ? 'A cota diária gratuita de IA acabou. Tente de novo amanhã (sem custo).' : `Um agente não conseguiu concluir: ${e.message}`);
    }
    throw e;
  }
}

async function gerarImagens(srv: SupabaseClient, p: Producao, inicio: number) {
  const r2 = configR2(env);
  if (!r2) return falhar(srv, p, 'Armazenamento R2 não configurado no servidor.');
  if (!p.plano) return falhar(srv, p, 'Produção sem plano aprovado.');
  const exec = executor();
  const cenas = structuredClone(p.cenas);
  let neurons = 0;
  for (const c of p.plano.cenas) {
    const k = String(c.numero);
    const cena = cenas[k] ?? { versoes: [] };
    if (!(cena.gerar || cena.versoes.length === 0)) continue;
    if (Date.now() - inicio > LIMITE_TEMPO_MS) break; // o próximo tick continua
    const { data: liberado } = await srv.rpc('studio_consumir_cota', { p_empresa: p.empresa_operadora_id, p_user: p.user_id, p_modalidade: 'imagem', p_qtd: 1, p_neurons: 96 });
    if (!liberado) {
      const temTodas = p.plano.cenas.every((x) => (cenas[String(x.numero)]?.versoes ?? []).length > 0);
      cenas[k] = { ...cena, gerar: false };
      return temTodas
        ? mudar(srv, p, 'aguardando_aprovacao_imagens', { cenas, neurons, erro: 'Limite diário de imagens atingido: as cenas pendentes ficam para amanhã.' })
        : falhar(srv, p, 'Limite diário de imagens atingido. Use "Tentar de novo" amanhã (sem custo).');
    }
    let prompt = c.prompt_cenario;
    if (cena.instrucao) {
      try {
        const aj = await ajustarPrompt(exec, prompt, cena.instrucao);
        neurons += aj.neurons;
        prompt = `${aj.saida.prompt_cenario} Empty scene, no product, no people, no text, no letters, no logos.`;
        await registrar(srv, p, `prompts:cena${k}:ajuste:${cena.versoes.length + 1}`, aj);
      } catch { /* sem ajuste: usa o prompt aprovado */ }
    }
    try {
      const img = await gerarCenario(exec, prompt);
      neurons += img.neurons;
      const versao = (cena.versoes.at(-1)?.versao ?? 0) + 1;
      const caminho = `tenants/${p.empresa_operadora_id}/studio/${p.id}/cena-${k}-v${versao}.jpg`;
      const url = await enviarAoR2(r2, caminho, img.bytes, 'image/jpeg');
      const v: VersaoImagem = { versao, url, path: caminho, provedor: 'cloudflare-workers-ai', modelo: img.modelo, prompt, instrucao: cena.instrucao ?? null, criada_em: new Date().toISOString(), decisao: 'pendente' };
      cenas[k] = { versoes: [...cena.versoes, v], escolhida: cena.escolhida, gerar: false };
      await registrar(srv, p, `imagem:${k}:v${versao}`, { agente: 'imagem', modelo: img.modelo, entrada: { prompt }, saida: { url, path: caminho }, neurons: img.neurons });
      await srv.from('studio_producoes').update({ cenas }).eq('id', p.id).eq('estado', 'gerando_imagens'); // progresso visível já
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      return falhar(srv, p, /quota|neurons|429/i.test(msg) ? 'A cota diária gratuita de IA acabou. Tente de novo amanhã (sem custo).' : `Falha ao gerar a imagem da cena ${k}: ${msg.slice(0, 200)}`);
    }
  }
  const pendentes = p.plano.cenas.filter((x) => { const s = cenas[String(x.numero)]; return !s || s.gerar || s.versoes.length === 0; });
  if (!pendentes.length) await mudar(srv, p, 'aguardando_aprovacao_imagens', { cenas, neurons, erro: null });
}

async function dispararMontagem(srv: SupabaseClient, p: Producao) {
  const m = p.montagem ?? {};
  if (m.disparada) {
    const desde = Date.parse(String(m.disparada_em ?? 0));
    if (Date.now() - desde > 40 * 60_000) await falhar(srv, p, 'A montagem não respondeu em 40 minutos.');
    return;
  }
  for (const [k, e] of Object.entries(p.edicoes)) {
    const erros = validarEdicao(e);
    if (erros.length) return falhar(srv, p, `Edição da cena ${k} inválida: ${erros.join(' ')}`);
  }
  const token = env('GITHUB_TOKEN'), repo = env('GITHUB_REPO');
  if (!token || !repo || !env('STUDIO_SEGREDO')) return falhar(srv, p, 'Montagem não configurada no servidor (GITHUB_TOKEN/GITHUB_REPO/STUDIO_SEGREDO).');
  const gh = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'studio_montar', client_payload: { producao_id: p.id, chave: m.chave } }),
  });
  if (!gh.ok) return falhar(srv, p, `Não foi possível iniciar a montagem (GitHub ${gh.status}).`);
  await srv.from('studio_producoes').update({ montagem: { ...m, disparada: true, disparada_em: new Date().toISOString() } }).eq('id', p.id).eq('estado', 'montando');
  await registrar(srv, p, `montagem:disparo:${m.chave}`, { agente: 'montagem', saida: { workflow: 'studio-montar', chave: m.chave } });
}

async function processar(srv: SupabaseClient, p: Producao, inicio: number) {
  try {
    if (p.estado === 'recebido' || p.estado === 'planejando') await planejar(srv, p);
    else if (p.estado === 'gerando_imagens') await gerarImagens(srv, p, inicio);
    else if (p.estado === 'montando') await dispararMontagem(srv, p);
  } catch (e) {
    await falhar(srv, p, `Erro inesperado: ${String((e as Error)?.message ?? e).slice(0, 300)}`);
  } finally {
    await srv.from('studio_producoes').update({ processando_ate: null }).eq('id', p.id);
  }
}

// ---------------------------------------------------------------- entrada

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' });
  const srv = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!);
  const inicio = Date.now();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const acao = String(body.acao ?? '');

  // situação pública dos provedores: sem nomes nem valores de segredos
  if (acao === 'provedores') {
    return json(200, { provedores: statusDosProvedores(env).map(({ requer: _r, faltam, motivo, ...p }) => ({ ...p, motivo: faltam.length && !p.bloqueio ? 'Aguardando configuração no servidor.' : motivo })) });
  }

  if (acao === 'tick') {
    const { data } = await srv.rpc('studio_reservar', { p_limite: 3 });
    for (const p of (data ?? []) as Producao[]) { if (Date.now() - inicio < LIMITE_TEMPO_MS) await processar(srv, p, inicio); }
    return json(200, { processadas: (data ?? []).length });
  }

  if (acao === 'cutucar') {
    const id = String(body.producao_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'producao_id inválido' });
    const usuario = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } });
    const { data: visivel } = await usuario.from('studio_producoes').select('id').eq('id', id).maybeSingle(); // RLS: só o dono vê
    if (!visivel) return json(404, { error: 'Produção não encontrada.' });
    const { data } = await srv.from('studio_producoes').update({ processando_ate: new Date(Date.now() + 4 * 60_000).toISOString() })
      .eq('id', id).in('estado', ATIVOS).or(`processando_ate.is.null,processando_ate.lt.${new Date().toISOString()}`).select('*').maybeSingle();
    if (data) await processar(srv, data as Producao, inicio);
    return json(200, { ok: true, processou: !!data });
  }

  // ----- chamadas do GitHub Actions (segredo próprio, comparação em tempo constante)
  const segredo = env('STUDIO_SEGREDO') ?? '';
  const recebido = req.headers.get('x-studio-segredo') ?? '';
  let diferenca = segredo.length ^ recebido.length;
  for (let i = 0; i < segredo.length; i++) diferenca |= segredo.charCodeAt(i) ^ (recebido.charCodeAt(i) || 0);
  if (!segredo || diferenca !== 0) return json(401, { error: 'não autorizado' });

  const id = String(body.producao_id ?? '');
  const { data: prod } = await srv.from('studio_producoes').select('*').eq('id', id).maybeSingle();
  const p = prod as Producao | null;
  if (!p) return json(404, { error: 'produção não encontrada' });
  if (String(body.chave ?? '') !== String(p.montagem?.chave ?? '')) return json(409, { error: 'chave de montagem diferente (pedido antigo)' });

  if (acao === 'dados_montagem') {
    if (p.estado !== 'montando' || !p.plano) return json(409, { error: `estado ${p.estado}` });
    const ordem = p.ordem?.length ? p.ordem : p.plano.cenas.map((c) => c.numero);
    const cenas = ordem.map((n) => p.plano!.cenas.find((c) => c.numero === n)!).filter(Boolean);
    const fundos = Object.fromEntries(cenas.map((c) => { const s = p.cenas[String(c.numero)]; return [c.numero, s?.versoes.find((v) => v.versao === s.escolhida)?.url ?? null]; }));
    return json(200, {
      producao_id: p.id, empresa_operadora_id: p.empresa_operadora_id, tipo: p.tipo, rotulo: p.rotulo,
      pedido: pedidoDa(p), plano: { ...p.plano, cenas }, edicoes: p.edicoes, fundos,
      destino_prefixo: `tenants/${p.empresa_operadora_id}/studio/${p.id}/final-${String(p.montagem.chave).slice(0, 8)}`,
      publico: (env('R2_PUBLIC_DOMAIN') ?? '').replace(/\/$/, ''),
    });
  }

  if (acao === 'montagem_falhou') {
    if (p.estado === 'montando') await falhar(srv, p, `A montagem falhou: ${String(body.erro ?? '').slice(0, 300)}`);
    return json(200, { ok: true });
  }

  if (acao === 'montagem_concluida') {
    if (p.estado !== 'montando') return json(409, { error: `estado ${p.estado}` });
    const res = (body.resultado ?? {}) as Record<string, unknown>;
    const qc = (res.qc ?? {}) as { aprovado?: boolean; verificacoes?: unknown[] };
    await registrar(srv, p, `montagem:${p.montagem.chave}`, { agente: 'montagem', saida: { ...res, qc: undefined } });
    await registrar(srv, p, `qualidade:${p.montagem.chave}`, { agente: 'qualidade', saida: qc });
    if (!(await mudar(srv, p, 'conferindo', { resultado: res }))) return json(409, { error: 'corrida' });
    await mudar(srv, p, qc.aprovado === true ? 'pronto' : 'reprovado', { erro: qc.aprovado === true ? null : 'A conferência automática reprovou a produção (veja o relatório de qualidade).' });
    return json(200, { ok: true, estado: p.estado });
  }

  return json(400, { error: 'ação desconhecida' });
});
