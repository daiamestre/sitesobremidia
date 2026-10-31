// SOBRE MÍDIA — "Trabalhar com IA" (F-223). Agente com modelos GRÁTIS (Groq → Google AI Studio → OpenRouter) que usa
// ferramentas da própria SOBRE MÍDIA. Toda consulta roda com o LOGIN de quem pergunta (as regras de visibilidade do
// banco valem: cada conta vê só o seu). Ações (criar cobrança) ficam PENDENTES até a pessoa clicar em "Confirmar".
//   POST { acao: 'perguntar', pergunta, historico? }  → { resposta, acoes, provedor, ferramentas }
//   POST { acao: 'confirmar' | 'cancelar', id }        → executa ou descarta a ação proposta
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  PROVEDORES, brl, dataBR, ferramentas, hojeSP, instrucoes, situacaoDaCobranca, situacaoDaTela, tempoDesde, validarCobranca,
} from '../_shared/agente/ferramentas.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';

interface Escopo { empresa: string; papel: string; admin: boolean; pode_cobrar: boolean }
type Msg = { role: string; content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string };
interface Ctx { usuario: SupabaseClient; srv: SupabaseClient; uid: string; e: Escopo; hoje: string; acoes: string[] }

// ───────────────────────────────────────────── ferramentas (consultas com o login do usuário)
async function nomesDosClientes(usuario: SupabaseClient, ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map<string, string>();
  const { data } = await usuario.from('empresas').select('cliente_id, nome_fantasia, razao_social').in('cliente_id', unicos).is('deleted_at', null);
  return new Map((data ?? []).map((x) => [x.cliente_id as string, (x.nome_fantasia || x.razao_social) as string]));
}

async function relatorioTelas(c: Ctx, a: { filtro?: string }) {
  const { data, error } = await c.usuario.from('screens')
    .select('name, location, local_instalacao, cidade, last_ping_at, bound_device_id, app_version, is_active, playlist:playlists(name)').order('name').limit(1000);
  if (error) return { erro: error.message };
  const agora = Date.now();
  const telas = (data ?? []).map((t) => {
    const s = situacaoDaTela(t as { last_ping_at: string | null; bound_device_id: string | null }, agora);
    return { nome: t.name, local: t.local_instalacao || t.location || t.cidade || '', situacao: s.situacao, ultimo_sinal: tempoDesde(s.minutos), minutos: s.minutos,
      versao: t.app_version ?? '', playlist: (t.playlist as { name?: string } | null)?.name ?? 'sem playlist' };
  });
  const conta = (s: string) => telas.filter((t) => t.situacao === s).length;
  const filtro = a.filtro === 'no_ar' ? 'no ar' : a.filtro === 'fora_do_ar' ? 'fora do ar' : a.filtro === 'sem_aparelho' ? 'sem aparelho' : null;
  const lista = (filtro ? telas.filter((t) => t.situacao === filtro) : telas).sort((x, y) => (y.minutos ?? 1e9) - (x.minutos ?? 1e9)).slice(0, 150);
  return { total: telas.length, no_ar: conta('no ar'), fora_do_ar: conta('fora do ar'), sem_aparelho: conta('sem aparelho'), telas: lista.map(({ minutos: _m, ...t }) => t) };
}

async function resumoFinanceiro(c: Ctx, a: { mes?: string }) {
  const mes = /^\d{4}-\d{2}$/.test(a.mes ?? '') ? a.mes! : c.hoje.slice(0, 7);
  const [y, m] = mes.split('-').map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data, error } = await c.usuario.from('contas_receber').select('valor, valor_pago, status, data_vencimento')
    .gte('data_vencimento', `${mes}-01`).lte('data_vencimento', fim).limit(5000);
  if (error) return { erro: error.message };
  const t = { emitido: 0, recebido: 0, em_aberto: 0, vencido: 0, cancelado: 0, quantidade: 0 };
  for (const r of data ?? []) {
    const v = Number(r.valor) || 0;
    const s = situacaoDaCobranca(r.status as string, r.data_vencimento as string, c.hoje);
    if (s === 'cancelada') { t.cancelado += v; continue; }
    t.emitido += v; t.quantidade++;
    if (s === 'paga') t.recebido += Number(r.valor_pago) || v; else if (s === 'vencida') t.vencido += v; else t.em_aberto += v;
  }
  return { mes, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === 'quantidade' ? v : brl(v)])) };
}

async function listarCobrancas(c: Ctx, a: { situacao?: string; cliente_id?: string; limite?: number }) {
  let q = c.usuario.from('contas_receber').select('codigo_operacional, valor, data_vencimento, status, cliente_id, notes').order('data_vencimento', { ascending: false }).limit(1000);
  if (a.cliente_id) q = q.eq('cliente_id', a.cliente_id);
  const { data, error } = await q;
  if (error) return { erro: error.message };
  const alvo = { abertas: 'aberta', vencidas: 'vencida', pagas: 'paga' }[a.situacao ?? ''] ?? null;
  const linhas = (data ?? []).map((r) => ({ ...r, sit: situacaoDaCobranca(r.status as string, r.data_vencimento as string, c.hoje) }))
    .filter((r) => (alvo ? r.sit === alvo : true)).slice(0, Math.min(Math.max(Number(a.limite) || 30, 1), 100));
  const nomes = await nomesDosClientes(c.usuario, linhas.map((r) => r.cliente_id as string));
  return {
    total: linhas.length,
    soma: brl(linhas.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
    cobrancas: linhas.map((r) => ({ codigo: r.codigo_operacional, cliente: nomes.get(r.cliente_id as string) ?? 'cliente não identificado', valor: brl(Number(r.valor) || 0),
      vencimento: dataBR(r.data_vencimento as string), situacao: r.sit, descricao: String(r.notes ?? '').slice(0, 80) })),
  };
}

async function buscarCliente(c: Ctx, a: { texto?: string }) {
  const t = String(a.texto ?? '').replace(/[%,()]/g, ' ').trim();
  if (t.length < 2) return { erro: 'Informe parte do nome ou o CNPJ.' };
  const digitos = t.replace(/\D/g, '');
  const filtro = [`nome_fantasia.ilike.%${t}%`, `razao_social.ilike.%${t}%`, ...(digitos.length >= 5 ? [`cnpj.ilike.%${digitos}%`] : [])].join(',');
  const { data, error } = await c.usuario.from('empresas').select('cliente_id, nome_fantasia, razao_social, cnpj, cidade, segmento').or(filtro).is('deleted_at', null).limit(10);
  if (error) return { erro: error.message };
  return { encontrados: (data ?? []).filter((x) => x.cliente_id).map((x) => ({ cliente_id: x.cliente_id, nome: x.nome_fantasia || x.razao_social, razao_social: x.razao_social, cnpj: x.cnpj, cidade: x.cidade, segmento: x.segmento })) };
}

async function oportunidades(c: Ctx) {
  const ano = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const [emp, cli, cob, telas] = await Promise.all([
    c.usuario.from('empresas').select('cliente_id, segmento, cidade').is('deleted_at', null).limit(5000),
    c.usuario.from('clientes').select('id, status').is('deleted_at', null).limit(5000),
    c.usuario.from('contas_receber').select('cliente_id, valor, status, data_vencimento').gte('data_vencimento', ano).limit(10000),
    relatorioTelas(c, {}),
  ]);
  const contar = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x || 'não informado'] = (m[x || 'não informado'] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const porCliente = new Map<string, { pago: number; ultimoPago: string; devendo: number }>();
  for (const r of cob.data ?? []) {
    const k = r.cliente_id as string; if (!k) continue;
    const s = situacaoDaCobranca(r.status as string, r.data_vencimento as string, c.hoje);
    const p = porCliente.get(k) ?? { pago: 0, ultimoPago: '', devendo: 0 };
    if (s === 'paga') { p.pago += Number(r.valor) || 0; if ((r.data_vencimento as string) > p.ultimoPago) p.ultimoPago = r.data_vencimento as string; }
    if (s === 'vencida') p.devendo += Number(r.valor) || 0;
    porCliente.set(k, p);
  }
  const limite60 = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const pararam = [...porCliente.entries()].filter(([, p]) => p.ultimoPago && p.ultimoPago < limite60).sort((a, b) => b[1].pago - a[1].pago).slice(0, 15);
  const devedores = [...porCliente.entries()].filter(([, p]) => p.devendo > 0).sort((a, b) => b[1].devendo - a[1].devendo).slice(0, 10);
  const nomes = await nomesDosClientes(c.usuario, [...pararam, ...devedores].map(([k]) => k));
  const t = telas as { total?: number; fora_do_ar?: number; sem_aparelho?: number; telas?: Array<{ situacao: string; playlist: string; ultimo_sinal: string; nome: string }> };
  return {
    clientes_por_situacao: contar((cli.data ?? []).map((x) => String(x.status))),
    segmentos_com_mais_clientes: contar((emp.data ?? []).map((x) => String(x.segmento ?? ''))),
    cidades_com_mais_clientes: contar((emp.data ?? []).map((x) => String(x.cidade ?? ''))),
    clientes_que_pararam_de_pagar_ha_60_dias: pararam.map(([k, p]) => ({ cliente: nomes.get(k) ?? k, ja_pagou_no_ano: brl(p.pago), ultimo_pagamento: dataBR(p.ultimoPago) })),
    maiores_devedores: devedores.map(([k, p]) => ({ cliente: nomes.get(k) ?? k, vencido: brl(p.devendo) })),
    telas: { total: t.total, fora_do_ar: t.fora_do_ar, sem_aparelho: t.sem_aparelho, sem_playlist: (t.telas ?? []).filter((x) => x.playlist === 'sem playlist').length },
  };
}

async function proporCobranca(c: Ctx, a: { cliente_id?: string; valor?: number; vencimento?: string; descricao?: string }) {
  if (!c.e.pode_cobrar) return { erro: 'Só owner, ADM e financeiro podem criar cobranças.' };
  const erros = validarCobranca(a, c.hoje);
  if (erros.length) return { erro: erros.join(' ') };
  const { data: cli } = await c.usuario.from('clientes').select('id, empresa_operadora_id').eq('id', String(a.cliente_id ?? '')).maybeSingle();
  if (!cli) return { erro: 'Cliente não encontrado (ou você não tem acesso a ele). Use buscar_cliente.' };
  const nome = (await nomesDosClientes(c.usuario, [cli.id as string])).get(cli.id as string) ?? 'cliente';
  const valor = Math.round(Number(a.valor) * 100) / 100;
  const descricao = String(a.descricao ?? '').trim().slice(0, 300) || 'Cobrança avulsa';
  const resumo = `Cobrança de ${brl(valor)} para ${nome}, vencimento ${dataBR(String(a.vencimento))} (PIX ou boleto) — ${descricao}`;
  const { data, error } = await c.srv.from('agente_ia_acoes').insert({
    empresa_operadora_id: cli.empresa_operadora_id, usuario_id: c.uid, tipo: 'CRIAR_COBRANCA', resumo,
    parametros: { cliente_id: cli.id, cliente_nome: nome, valor, vencimento: a.vencimento, descricao, empresa_operadora_id: cli.empresa_operadora_id },
  }).select('id').single();
  if (error) return { erro: error.message };
  c.acoes.push(data.id as string);
  return { status: 'AGUARDANDO_CONFIRMACAO_DO_USUARIO', resumo };
}

const EXECUTAR: Record<string, (c: Ctx, a: Record<string, unknown>) => Promise<unknown>> = {
  relatorio_telas: relatorioTelas, resumo_financeiro: resumoFinanceiro, listar_cobrancas: listarCobrancas,
  buscar_cliente: buscarCliente, oportunidades: (c) => oportunidades(c), propor_cobranca: proporCobranca,
};

// ───────────────────────────────────────────── modelo (com reservas)
async function chamarModelo(mensagens: Msg[], tools: unknown[], inicio: number): Promise<{ msg: Msg; provedor: string; modelo: string; indice: number }> {
  const falhas: string[] = [];
  for (let i = inicio; i < PROVEDORES.length; i++) {
    const p = PROVEDORES[i];
    const chave = env(p.chave);
    if (!chave) continue;
    const modelo = env(p.modeloEnv) || p.modelo;
    try {
      const r = await fetch(p.url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo, messages: mensagens, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 2000 }),
        signal: AbortSignal.timeout(60_000),
      });
      const j = await r.json().catch(() => ({})) as { choices?: Array<{ message: Msg }>; error?: { message?: string } };
      if (r.ok && j.choices?.[0]?.message) return { msg: j.choices[0].message, provedor: p.nome, modelo, indice: i };
      falhas.push(`${p.nome} ${r.status} ${String(j.error?.message ?? '').slice(0, 80)}`);
    } catch (e) { falhas.push(`${p.nome} ${String((e as Error)?.message ?? e).slice(0, 80)}`); }
  }
  throw new Error(falhas.length ? `Os serviços de IA grátis não responderam agora (${falhas.join('; ')}). Tente de novo em alguns minutos.` : 'Nenhuma chave de IA configurada para o agente.');
}

async function perguntar(c: Ctx, pergunta: string, historico: Array<{ role: string; content: string }>, nome: string) {
  const mensagens: Msg[] = [
    { role: 'system', content: instrucoes({ hoje: c.hoje, papel: c.e.papel, podeCobrar: c.e.pode_cobrar, nome }) },
    ...historico.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content).slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
    { role: 'user', content: pergunta },
  ];
  const tools = ferramentas(c.e.pode_cobrar);
  const usadas: string[] = [];
  let indice = 0, provedor = '', modelo = '';
  for (let passo = 0; passo < 6; passo++) {
    const r = await chamarModelo(mensagens, tools, indice);
    indice = r.indice; provedor = r.provedor; modelo = r.modelo;
    const chamadas = r.msg.tool_calls ?? [];
    if (!chamadas.length) return { resposta: String(r.msg.content ?? '').trim(), provedor, modelo, usadas };
    mensagens.push({ role: 'assistant', content: r.msg.content ?? '', tool_calls: chamadas });
    for (const ch of chamadas) {
      const fn = EXECUTAR[ch.function.name];
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(ch.function.arguments || '{}'); } catch { /* argumentos inválidos: a ferramenta responde o erro */ }
      const saida = fn ? await fn(c, args).catch((e) => ({ erro: String((e as Error)?.message ?? e) })) : { erro: 'ferramenta desconhecida' };
      usadas.push(ch.function.name);
      mensagens.push({ role: 'tool', tool_call_id: ch.id, content: JSON.stringify(saida).slice(0, 14000) });
    }
  }
  return { resposta: 'Não consegui concluir com poucas etapas. Tente perguntar de forma mais direta.', provedor, modelo, usadas };
}

// ───────────────────────────────────────────── ação confirmada: cria a cobrança pelo mesmo caminho do painel
async function executarAcao(c: Ctx, id: string) {
  const { data: a } = await c.srv.from('agente_ia_acoes').select('*').eq('id', id).eq('usuario_id', c.uid).maybeSingle();
  if (!a) return json(404, { error: 'Ação não encontrada.' });
  if (a.status !== 'PENDENTE') return json(409, { error: 'Esta ação já foi decidida.' });
  if (Date.now() - new Date(a.criado_em as string).getTime() > 30 * 60_000) {
    await c.srv.from('agente_ia_acoes').update({ status: 'EXPIRADA', decidido_em: new Date().toISOString() }).eq('id', id);
    return json(410, { error: 'A proposta expirou (30 minutos). Peça de novo ao agente.' });
  }
  if (!c.e.pode_cobrar) return json(403, { error: 'Só owner, ADM e financeiro podem criar cobranças.' });
  const p = a.parametros as { cliente_id: string; valor: number; vencimento: string; descricao: string; empresa_operadora_id: string };
  const erros = validarCobranca(p, c.hoje);
  if (erros.length) return json(400, { error: erros.join(' ') });
  // insere COM O LOGIN da pessoa: as regras do banco decidem se ela pode criar cobrança para esse cliente
  const { data: conta, error } = await c.usuario.from('contas_receber').insert({
    empresa_operadora_id: p.empresa_operadora_id, cliente_id: p.cliente_id, competencia_date: `${p.vencimento.slice(0, 7)}-01`, data_vencimento: p.vencimento,
    valor: p.valor, status: 'PENDENTE', notes: p.descricao, metodo_cobranca: 'PIX', metodos_gateway: ['PIX', 'BOLETO'], recorrencia: 'AVULSA',
  }).select('id, codigo_operacional').single();
  if (error || !conta) {
    await c.srv.from('agente_ia_acoes').update({ status: 'FALHA', resultado: { erro: error?.message }, decidido_em: new Date().toISOString() }).eq('id', id);
    return json(400, { error: 'O sistema recusou a cobrança: ' + (error?.message ?? 'sem retorno') });
  }
  await c.usuario.from('financeiro_auditoria').insert({ empresa_operadora_id: p.empresa_operadora_id, evento: 'CONTA_CRIADA', usuario_id: c.uid, detalhes: { origem: 'agente-ia', acao_id: id, conta_id: conta.id } });
  await c.srv.from('agente_ia_acoes').update({ status: 'EXECUTADA', resultado: { conta_id: conta.id, codigo: conta.codigo_operacional }, decidido_em: new Date().toISOString() }).eq('id', id);
  return json(200, { ok: true, codigo: conta.codigo_operacional, conta_id: conta.id });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' });
  const usuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { error: 'Entre na sua conta.' });
  const { data: esc } = await usuario.rpc('agente_ia_escopo');
  const e = (esc as Escopo[] | null)?.[0];
  if (!e?.empresa) return json(403, { error: 'Sua conta ainda não está ligada a uma empresa.' });
  const srv = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const c: Ctx = { usuario, srv, uid: u.user.id, e, hoje: hojeSP(), acoes: [] };
  const acao = String(body.acao ?? '');

  if (acao === 'confirmar') return executarAcao(c, String(body.id ?? ''));
  if (acao === 'cancelar') {
    const { data } = await srv.from('agente_ia_acoes').update({ status: 'CANCELADA', decidido_em: new Date().toISOString() }).eq('id', String(body.id ?? '')).eq('usuario_id', c.uid).eq('status', 'PENDENTE').select('id');
    return json(data?.length ? 200 : 409, data?.length ? { ok: true } : { error: 'Esta ação já foi decidida.' });
  }
  if (acao !== 'perguntar') return json(400, { error: 'ação desconhecida' });

  const pergunta = String(body.pergunta ?? '').trim().slice(0, 2000);
  if (pergunta.length < 2) return json(400, { error: 'Escreva o que você precisa.' });
  // limite simples por pessoa para não esgotar a cota grátis de todos
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await srv.from('agente_ia_registros').select('id', { count: 'exact', head: true }).eq('usuario_id', c.uid).gte('criado_em', desde);
  if ((count ?? 0) >= 60) return json(429, { error: 'Muitas perguntas na última hora. Aguarde alguns minutos.' });

  const inicio = Date.now();
  const { data: perfil } = await usuario.from('usuarios').select('nome').eq('id', c.uid).maybeSingle();
  try {
    const r = await perguntar(c, pergunta, Array.isArray(body.historico) ? body.historico as Array<{ role: string; content: string }> : [], String(perfil?.nome ?? ''));
    await srv.from('agente_ia_registros').insert({ empresa_operadora_id: e.empresa, usuario_id: c.uid, pergunta, provedor: r.provedor, modelo: r.modelo, ferramentas: r.usadas, ms: Date.now() - inicio });
    const { data: acoes } = c.acoes.length ? await srv.from('agente_ia_acoes').select('id, tipo, resumo, status, criado_em').in('id', c.acoes) : { data: [] };
    return json(200, { resposta: r.resposta, provedor: r.provedor, ferramentas: r.usadas, acoes: acoes ?? [] });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 400);
    await srv.from('agente_ia_registros').insert({ empresa_operadora_id: e.empresa, usuario_id: c.uid, pergunta, erro: msg, ms: Date.now() - inicio });
    return json(503, { error: msg });
  }
});
