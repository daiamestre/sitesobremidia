// SOBRE MÍDIA Studio — camada de provedores. O Studio fala com "tipos" de provedor; trocar de fornecedor = novo adaptador aqui.
// Regras: chave só no servidor; nada simulado. Provedor sem chave/orçamento/autorização fica BLOQUEADO com o motivo.
import type { Executar } from './agentes.ts';

export type TipoProvedor = 'texto' | 'visao' | 'imagem' | 'imagem_paga' | 'video_ia' | 'voz' | 'musica' | 'montagem' | 'edicao_externa';

export interface Provedor {
  id: string;
  tipo: TipoProvedor;
  nome: string;
  modelo?: string;
  custo: 'gratuito_na_cota' | 'infraestrutura_existente' | 'pago' | 'depende_de_configuracao';
  custoTexto: string;
  /** variáveis de ambiente (segredos) exigidas no servidor */
  requer: string[];
  /** bloqueio explícito (decisão do dono, orçamento, conta externa) — mesmo com segredos presentes */
  bloqueio?: string;
  documentacao?: string;
}

export const PROVEDORES: Provedor[] = [
  { id: 'cf-llama4-scout', tipo: 'texto', nome: 'Cloudflare Workers AI · Llama 4 Scout', modelo: '@cf/meta/llama-4-scout-17b-16e-instruct', custo: 'gratuito_na_cota', custoTexto: '≈ 100–300 neurons por agente (cota grátis de 10.000/dia da conta do dono)', requer: ['TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO'], documentacao: 'https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/' },
  { id: 'cf-llama4-scout-visao', tipo: 'visao', nome: 'Cloudflare Workers AI · Llama 4 Scout (visão)', modelo: '@cf/meta/llama-4-scout-17b-16e-instruct', custo: 'gratuito_na_cota', custoTexto: '≈ 50–150 neurons por foto', requer: ['TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO'] },
  // MG-STUDIO-03: texto grátis de reserva (as mesmas chaves do F-222/F-223). O planejamento usa estes primeiro para POUPAR a cota da Cloudflare para as imagens.
  { id: 'groq-texto', tipo: 'texto', nome: 'Groq · gpt-oss-120b', modelo: 'openai/gpt-oss-120b', custo: 'gratuito_na_cota', custoTexto: 'grátis dentro do limite da conta Groq', requer: ['GROQ_API_KEY'] },
  { id: 'gemini-texto', tipo: 'texto', nome: 'Google AI Studio · Gemini Flash-Lite', modelo: 'gemini-flash-lite-latest', custo: 'gratuito_na_cota', custoTexto: 'grátis dentro do limite do Google AI Studio', requer: ['GEMINI_API_KEY'] },
  { id: 'openrouter-texto', tipo: 'texto', nome: 'OpenRouter · modelo :free', modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free', custo: 'gratuito_na_cota', custoTexto: 'modelos :free do OpenRouter (limite diário da conta)', requer: ['OPENROUTER_API_KEY'] },
  { id: 'cf-flux-schnell', tipo: 'imagem', nome: 'Cloudflare Workers AI · FLUX.1 schnell', modelo: '@cf/black-forest-labs/flux-1-schnell', custo: 'gratuito_na_cota', custoTexto: '≈ 96 neurons por cenário 1024×1024', requer: ['TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO'], documentacao: 'https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/' },
  { id: 'cf-lucid-origin', tipo: 'imagem_paga', nome: 'Cloudflare Workers AI · Lucid Origin (1920×1080 nativo)', modelo: '@cf/leonardo/lucid-origin', custo: 'pago', custoTexto: '≈ 7.900 neurons ≈ US$ 0,087 por imagem 1920×1080 (consome a cota grátis inteira em 1 imagem)', requer: ['TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO', 'STUDIO_PERMITIR_IMAGEM_PAGA'], bloqueio: 'Desligado até o dono autorizar gasto (STUDIO_PERMITIR_IMAGEM_PAGA=1) e o plano Workers Paid.' },
  { id: 'gh-actions-ffmpeg', tipo: 'montagem', nome: 'GitHub Actions · FFmpeg + Playwright', custo: 'infraestrutura_existente', custoTexto: 'R$ 0 (repositório público: minutos grátis)', requer: ['GITHUB_TOKEN', 'GITHUB_REPO', 'STUDIO_SEGREDO'] },
  { id: 'video-ia', tipo: 'video_ia', nome: 'Vídeo gerado por IA (Kling / Seedance / Gemini)', custo: 'pago', custoTexto: '≈ US$ 0,07–0,10 por segundo (fontes de terceiros; confirmar no contrato)', requer: [], bloqueio: 'Sem provedor escolhido, orçamento e chave. Nada é simulado: o Studio entrega "vídeo montado a partir de imagens" até isso existir.' },
  { id: 'voz', tipo: 'voz', nome: 'Locução em português', custo: 'depende_de_configuracao', custoTexto: 'Piper (aberto, a testar) ou ElevenLabs Starter (US$ 6/mês, uso comercial)', requer: [], bloqueio: 'Provedor de voz não escolhido.' },
  { id: 'musica', tipo: 'musica', nome: 'Trilha sonora licenciada', custo: 'depende_de_configuracao', custoTexto: 'Biblioteca licenciada a definir', requer: [], bloqueio: 'Sem biblioteca de músicas com licença comercial definida. Os vídeos saem sem áudio.' },
  { id: 'canva', tipo: 'edicao_externa', nome: 'Canva Connect (autofill + exportação)', custo: 'depende_de_configuracao', custoTexto: 'Integração grátis; o dono precisa de Canva Pro/Teams', requer: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'], bloqueio: 'Integração privada ainda não criada pelo dono no Canva Developers.', documentacao: 'https://www.canva.dev/docs/connect/' },
];

export function statusDosProvedores(env: (k: string) => string | undefined) {
  return PROVEDORES.map((p) => {
    const faltam = p.requer.filter((k) => !env(k));
    const liberadoPeloDono = p.id === 'cf-lucid-origin' && env('STUDIO_PERMITIR_IMAGEM_PAGA') === '1';
    const disponivel = faltam.length === 0 && (!p.bloqueio || liberadoPeloDono);
    return { ...p, disponivel, faltam, motivo: disponivel ? null : (p.bloqueio ?? `Falta configurar: ${faltam.join(', ')}`) };
  });
}

// ---------------------------------------------------------------- adaptador Cloudflare

export type ConfigCloudflare =
  | { via: 'worker'; url: string; segredo: string }
  | { via: 'rest'; accountId: string; token: string };

/** Modelos que o Studio pode pedir ao Worker (a mesma lista vive no Worker: nada fora dela roda). */
export const MODELOS_PERMITIDOS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/black-forest-labs/flux-1-schnell', '@cf/leonardo/lucid-origin'] as const;

export function executorCloudflare(cfg: ConfigCloudflare, tempoMs = 90_000): Executar {
  return async (modelo, entrada) => {
    if (!(MODELOS_PERMITIDOS as readonly string[]).includes(modelo)) throw new Error(`modelo não permitido: ${modelo}`);
    const r = cfg.via === 'worker'
      ? await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-segredo': cfg.segredo }, body: JSON.stringify({ acao: 'studio-modelo', modelo, entrada }), signal: AbortSignal.timeout(tempoMs) })
      : await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${modelo}`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(entrada), signal: AbortSignal.timeout(tempoMs) });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 200)}`);
    const j = JSON.parse(texto) as Record<string, unknown>;
    return (j.result as Record<string, unknown>) ?? j;
  };
}

/** Gera um CENÁRIO (sem produto, sem texto). Devolve os bytes JPEG. */
export async function gerarCenario(exec: Executar, prompt: string, pago = false): Promise<{ bytes: Uint8Array<ArrayBuffer>; modelo: string; neurons: number }> {
  const modelo = pago ? '@cf/leonardo/lucid-origin' : '@cf/black-forest-labs/flux-1-schnell';
  const entrada = pago ? { prompt, width: 1920, height: 1080, steps: 20 } : { prompt, steps: 8 };
  const r = await exec(modelo, entrada);
  const b64 = String((r as { image?: string }).image ?? '');
  if (!b64) throw new Error('o provedor não devolveu imagem');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, modelo, neurons: pago ? 7_872 : 96 };
}

// ---------------------------------------------------------------- texto grátis compatível com OpenAI (Groq, Gemini, OpenRouter)

const URL_TEXTO: Record<string, { url: string; chave: string; modeloEnv: string }> = {
  'groq-texto': { url: 'https://api.groq.com/openai/v1/chat/completions', chave: 'GROQ_API_KEY', modeloEnv: 'GROQ_MODELO_AGENTE' },
  'gemini-texto': { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', chave: 'GEMINI_API_KEY', modeloEnv: 'GEMINI_MODELO_AGENTE' },
  'openrouter-texto': { url: 'https://openrouter.ai/api/v1/chat/completions', chave: 'OPENROUTER_API_KEY', modeloEnv: 'OPENROUTER_MODELO_AGENTE' },
};

/** Executor no formato do Studio para um provedor compatível com OpenAI (pede JSON simples: nem todos aceitam json_schema). */
export function executorCompativelOpenAI(id: string, env: (k: string) => string | undefined, tempoMs = 60_000): { exec: Executar; modelo: string; provedor: string } | null {
  const cfg = URL_TEXTO[id];
  const p = PROVEDORES.find((x) => x.id === id);
  const chave = cfg && env(cfg.chave);
  if (!cfg || !p || !chave) return null;
  const modelo = env(cfg.modeloEnv) || p.modelo!;
  const exec: Executar = async (_modelo, entrada) => {
    const { response_format, ...resto } = entrada as { response_format?: unknown } & Record<string, unknown>;
    const r = await fetch(cfg.url, { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...resto, model: modelo, ...(response_format ? { response_format: { type: 'json_object' } } : {}) }), signal: AbortSignal.timeout(tempoMs) });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 200)}`);
    return JSON.parse(texto) as Record<string, unknown>;
  };
  return { exec, modelo, provedor: id };
}

/** O primeiro modelo de texto grátis disponível (Groq → Google → OpenRouter), poupando a cota de imagens da Cloudflare. */
export function textoGratis(env: (k: string) => string | undefined) {
  for (const id of ['groq-texto', 'gemini-texto', 'openrouter-texto']) { const e = executorCompativelOpenAI(id, env); if (e) return e; }
  return null;
}
