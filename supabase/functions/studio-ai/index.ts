// SOBRE MÍDIA STUDIO AI — criação de imagens com a OpenAI (GPT Image), cobrada por crédito do cliente.
//   POST { acao: 'gerar', … }            → JWT obrigatório: reserva 1 crédito, cria a imagem em segundo plano e devolve o job
//   POST { acao: 'melhorar_prompt', texto } → JWT: sugere um prompt publicitário (mostrado ao cliente, nunca trocado em silêncio)
//   POST { acao: 'varrer' }               → cron: gerações interrompidas há mais de 15 min viram falha + crédito devolvido
// A chave OPENAI_API_KEY só existe aqui (segredo da função). O navegador acompanha o status real pela tabela studio_ai_jobs.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { decode } from 'npm:fast-png@6.2.0';
import { analisarAlfa, criarImagem, custoDaImagem, ErroOpenAI, faltando, melhorarPrompt, mensagemDoErro, type Proporcao, type Qualidade } from '../_shared/studio/openai.ts';
import { configR2, enviarAoR2 } from '../_shared/studio/r2.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';

interface Escopo { empresa: string; cliente: string | null; admin: boolean; pode: boolean }
interface Config { habilitado: boolean; modelo_padrao: string; modelos_habilitados: string[]; qualidade_padrao: Qualidade; limite_usd_mes: number; max_referencias: number }

async function sha256(b: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Baixa uma referência SÓ do nosso R2 (evita o servidor buscar endereços arbitrários). */
async function baixarReferencia(url: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; tipo: string; nome: string }> {
  const dominio = env('R2_PUBLIC_DOMAIN').replace(/\/$/, '');
  if (!dominio || !url.startsWith(dominio + '/')) throw new Error('Referência fora do armazenamento da SOBRE MÍDIA.');
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error('Não foi possível ler a imagem de referência.');
  const tipo = (r.headers.get('content-type') ?? '').split(';')[0];
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(tipo)) throw new Error('Referência precisa ser PNG, JPG ou WebP.');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error('Referência maior que 20 MB.');
  return { bytes, tipo, nome: `referencia.${tipo.split('/')[1]}` };
}

async function processar(srv: SupabaseClient, jobId: string) {
  const { data: job } = await srv.from('studio_ai_jobs').select('*').eq('id', jobId).single();
  if (!job) return;
  try {
    const refs: { bytes: Uint8Array<ArrayBuffer>; tipo: string; nome: string }[] = [];
    if (job.origem_imagem_id) {
      const { data: origem } = await srv.from('studio_ai_imagens').select('url, conversa_id').eq('id', job.origem_imagem_id).single();
      if (!origem || origem.conversa_id !== job.conversa_id) throw new Error('Versão de origem inválida.');
      refs.push(await baixarReferencia(origem.url));
    }
    for (const u of (job.referencias as string[]) ?? []) refs.push(await baixarReferencia(u));
    const p = job.parametros as { proporcao: Proporcao; qualidade: Qualidade; transparente: boolean };
    const { png, uso } = await criarImagem({ chave: env('OPENAI_API_KEY'), modelo: job.modelo, prompt: job.prompt_enviado, proporcao: p.proporcao, qualidade: p.qualidade, transparente: p.transparente, referencias: refs });
    const img = decode(png);
    const alfa = analisarAlfa(img.data, img.width, img.height, img.channels);
    const r2 = configR2(env);
    if (!r2) throw new Error('Armazenamento não configurado.');
    const caminho = `tenants/${job.empresa_operadora_id}/studio/${job.conversa_id}/ia-${job.id}.png`;
    const url = await enviarAoR2(r2, caminho, png as Uint8Array<ArrayBuffer>, 'image/png');
    await srv.from('studio_ai_imagens').insert({
      job_id: job.id, conversa_id: job.conversa_id, empresa_operadora_id: job.empresa_operadora_id, cliente_id: job.cliente_id, versao_de: job.origem_imagem_id,
      url, path: caminho, mime: 'image/png', largura: img.width, altura: img.height, bytes: png.length, sha256: await sha256(png),
      alfa: !p.transparente ? 'nao_verificado' : alfa.transparente ? 'verificado' : 'ausente', alfa_relatorio: alfa, modelo: job.modelo,
    });
    await srv.rpc('studio_ai_consumir', { p_job: job.id });
    await srv.from('studio_ai_jobs').update({ status: 'CONCLUIDO', concluido_em: new Date().toISOString(), uso, custo_usd: custoDaImagem(job.modelo, uso) }).eq('id', job.id);
    await srv.from('studio_ai_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', job.conversa_id);
  } catch (e) {
    console.error('[studio-ai] falha', job.id, (e as Error)?.message);
    await srv.rpc('studio_ai_estornar', { p_job: job.id, p_motivo: String((e as Error)?.message ?? e).slice(0, 200) });
    await srv.from('studio_ai_jobs').update({
      status: job.cobrar ? 'ESTORNADO' : 'FALHA', concluido_em: new Date().toISOString(),
      erro: e instanceof ErroOpenAI ? (job.cobrar ? mensagemDoErro(e) : mensagemDoErro(e).replace(' Seu crédito foi devolvido.', '')) : String((e as Error)?.message ?? e).slice(0, 300),
    }).eq('id', job.id);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' });
  const srv = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const acao = String(body.acao ?? '');

  if (acao === 'varrer') {
    const limite = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data } = await srv.from('studio_ai_jobs').select('id, cobrar').in('status', ['RESERVANDO', 'PROCESSANDO']).lt('criado_em', limite).limit(50);
    for (const j of data ?? []) {
      await srv.rpc('studio_ai_estornar', { p_job: j.id, p_motivo: 'Geração interrompida' });
      await srv.from('studio_ai_jobs').update({ status: j.cobrar ? 'ESTORNADO' : 'FALHA', erro: 'A geração foi interrompida. Seu crédito foi devolvido.', concluido_em: new Date().toISOString() }).eq('id', j.id);
    }
    return json(200, { recuperadas: (data ?? []).length });
  }

  // ----- daqui em diante: só usuário autenticado com acesso ao Studio
  const usuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { error: 'Entre na sua conta.' });
  const { data: esc } = await usuario.rpc('studio_ai_escopo');
  const e = (esc as Escopo[] | null)?.[0];
  if (!e?.pode) return json(403, { error: 'Seu perfil não tem acesso ao Studio AI.' });
  const { data: cfgLinha } = await srv.from('studio_ai_config').select('*').eq('empresa_operadora_id', e.empresa).maybeSingle();
  const cfg = cfgLinha as Config | null;
  if (!cfg?.habilitado) return json(403, { error: 'A criação com IA está desligada para esta empresa.' });
  if (!env('OPENAI_API_KEY')) return json(503, { error: 'IA não configurada no servidor.' });

  // teto mensal de gasto real com a OpenAI (proteção da SOBRE MÍDIA, além do saldo da conta na OpenAI)
  const inicioMes = new Date(); inicioMes.setUTCDate(1); inicioMes.setUTCHours(0, 0, 0, 0);
  const { data: gastos } = await srv.from('studio_ai_jobs').select('custo_usd').eq('empresa_operadora_id', e.empresa).gte('criado_em', inicioMes.toISOString());
  const gastoMes = (gastos ?? []).reduce((s, g) => s + Number(g.custo_usd ?? 0), 0);
  if (gastoMes >= Number(cfg.limite_usd_mes)) return json(429, { error: 'O limite mensal de uso de IA da empresa foi atingido. Fale com a SOBRE MÍDIA.' });

  if (acao === 'melhorar_prompt') {
    const texto = String(body.texto ?? '').trim();
    if (texto.length < 5) return json(400, { error: 'Descreva o que você quer criar.' });
    try {
      const r = await melhorarPrompt(env('OPENAI_API_KEY'), texto);
      const faltam = faltando(texto, r.prompt);
      return json(200, { prompt: faltam.length ? null : r.prompt, dicas: r.dicas, aviso: faltam.length ? `A sugestão alterava textos que você pediu (${faltam.join(', ')}); mantivemos o seu texto.` : null });
    } catch (err) { return json(502, { error: mensagemDoErro(err).replace(' Seu crédito foi devolvido.', '') }); }
  }

  if (acao !== 'gerar') return json(400, { error: 'ação desconhecida' });

  const prompt = String(body.prompt ?? '').trim();
  const chave = String(body.chave ?? '');
  const proporcao = (['quadrado', 'horizontal', 'vertical'].includes(String(body.proporcao)) ? body.proporcao : 'quadrado') as Proporcao;
  const qualidade = (['low', 'medium', 'high'].includes(String(body.qualidade)) ? body.qualidade : cfg.qualidade_padrao) as Qualidade;
  const transparente = body.transparente === true;
  const referencias = (Array.isArray(body.referencias) ? body.referencias : []).map(String).slice(0, cfg.max_referencias);
  const origem = body.origem_imagem_id ? String(body.origem_imagem_id) : null;
  if (prompt.length < 5 || prompt.length > 4000) return json(400, { error: 'Descreva o que você quer criar (5 a 4000 caracteres).' });
  if (!/^[A-Za-z0-9-]{16,64}$/.test(chave)) return json(400, { error: 'Chave do pedido inválida.' });

  const idem = `${u.user.id}:${chave}`;
  const { data: repetido } = await srv.from('studio_ai_jobs').select('id, conversa_id, status').eq('idempotencia', idem).maybeSingle();
  if (repetido) return json(200, { job_id: repetido.id, conversa_id: repetido.conversa_id, repetido: true });

  // conversa: a existente precisa ser visível para quem pede; senão cria uma nova
  let conversaId = body.conversa_id ? String(body.conversa_id) : null;
  if (conversaId) {
    const { data: visivel } = await usuario.from('studio_ai_conversas').select('id').eq('id', conversaId).maybeSingle();
    if (!visivel) return json(404, { error: 'Conversa não encontrada.' });
  } else {
    const { data: nova, error } = await srv.from('studio_ai_conversas').insert({ empresa_operadora_id: e.empresa, cliente_id: e.cliente, operador_id: u.user.id, titulo: prompt.slice(0, 80) }).select('id').single();
    if (error || !nova) return json(500, { error: 'Não foi possível abrir a conversa.' });
    conversaId = nova.id;
  }

  // anunciante paga 1 crédito por criação; owner/ADM criam para a empresa (uso interno, custo registrado)
  const cobrar = !!e.cliente;
  let carteiraId: string | null = null;
  if (cobrar) {
    const { data: cart } = await srv.from('studio_ai_carteiras').select('id, saldo').eq('cliente_id', e.cliente).maybeSingle();
    if (!cart || cart.saldo < 1) return json(402, { error: 'Você não tem créditos. Compre créditos para criar com IA.', sem_creditos: true });
    carteiraId = cart.id;
  }
  const { data: job, error: errJob } = await srv.from('studio_ai_jobs').insert({
    conversa_id: conversaId, empresa_operadora_id: e.empresa, cliente_id: e.cliente, operador_id: u.user.id,
    tipo: origem || referencias.length ? 'editar' : 'gerar', status: 'RESERVANDO', prompt_original: String(body.prompt_original ?? prompt).slice(0, 4000), prompt_enviado: prompt,
    parametros: { proporcao, qualidade, transparente }, modelo: cfg.modelo_padrao, referencias, origem_imagem_id: origem,
    cobrar, carteira_id: carteiraId, creditos: cobrar ? 1 : 0, idempotencia: idem,
  }).select('id').single();
  if (errJob || !job) {
    const { data: corrida } = await srv.from('studio_ai_jobs').select('id, conversa_id').eq('idempotencia', idem).maybeSingle(); // clique duplo simultâneo
    return corrida ? json(200, { job_id: corrida.id, conversa_id: corrida.conversa_id, repetido: true }) : json(500, { error: 'Não foi possível registrar o pedido.' });
  }
  const { error: errReserva } = await srv.rpc('studio_ai_reservar', { p_job: job.id });
  if (errReserva) {
    await srv.from('studio_ai_jobs').update({ status: 'FALHA', erro: 'Saldo de créditos insuficiente.', concluido_em: new Date().toISOString() }).eq('id', job.id);
    return json(402, { error: 'Você não tem créditos suficientes.', sem_creditos: true });
  }
  await srv.from('studio_ai_jobs').update({ status: 'PROCESSANDO', iniciado_em: new Date().toISOString() }).eq('id', job.id);
  const trabalho = processar(srv, job.id);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho); else await trabalho;
  return json(202, { job_id: job.id, conversa_id: conversaId });
});
