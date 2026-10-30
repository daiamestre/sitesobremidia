// SOBRE MÍDIA Studio AI — adaptador da OpenAI (GPT Image). Conferido na documentação oficial em 30/10/2026:
//   POST /v1/images/generations (JSON) e POST /v1/images/edits (multipart, imagens de referência em image[]);
//   size 1024x1024 | 1536x1024 | 1024x1536; quality low|medium|high; background transparent|opaque|auto (transparente
//   exige png/webp); output_format png. Preços por 1 milhão de tokens (developers.openai.com/api/docs/pricing).
// A chave fica só no segredo OPENAI_API_KEY da Edge Function. Nomes de modelo só aqui e na studio_ai_config.

export type Proporcao = 'quadrado' | 'horizontal' | 'vertical';
export const TAMANHO: Record<Proporcao, string> = { quadrado: '1024x1024', horizontal: '1536x1024', vertical: '1024x1536' };
export type Qualidade = 'low' | 'medium' | 'high';

/** US$ por 1 milhão de tokens (texto de entrada, imagem de entrada, imagem de saída). */
export const PRECOS: Record<string, { texto: number; imagemEntrada: number; imagemSaida: number }> = {
  'gpt-image-2': { texto: 5, imagemEntrada: 8, imagemSaida: 30 },
  'gpt-image-2.5-flare': { texto: 5, imagemEntrada: 8, imagemSaida: 30 },
  'gpt-image-2.5-sunburst': { texto: 5, imagemEntrada: 8, imagemSaida: 30 },
  'gpt-image-1.5': { texto: 5, imagemEntrada: 8, imagemSaida: 32 },
  'gpt-image-1-mini': { texto: 2, imagemEntrada: 2.5, imagemSaida: 8 },
};
export const PRECO_TEXTO = { 'gpt-5-mini': { entrada: 0.25, saida: 2 } };

export interface UsoImagem {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

/** Custo real em dólar a partir do "usage" devolvido pela API. */
export function custoDaImagem(modelo: string, uso: UsoImagem | null | undefined): number | null {
  const p = PRECOS[modelo];
  if (!p || !uso) return null;
  const texto = uso.input_tokens_details?.text_tokens ?? (uso.input_tokens_details ? 0 : uso.input_tokens ?? 0);
  const imagem = uso.input_tokens_details?.image_tokens ?? 0;
  const saida = uso.output_tokens ?? 0;
  return Math.round(((texto * p.texto + imagem * p.imagemEntrada + saida * p.imagemSaida) / 1_000_000) * 10_000) / 10_000;
}

/**
 * Transparência DE VERDADE (mesma regra de validarAlfa do Cartaz Digital): 4 cantos 100% transparentes, área vazia ≥ 5%
 * e área opaca ≥ 10%. Um "quadriculado" desenhado na imagem é opaco e nunca passa.
 */
export function analisarAlfa(dados: Uint8Array | Uint8ClampedArray | Uint16Array, largura: number, altura: number, canais: number) {
  const total = largura * altura;
  if (canais !== 4 && canais !== 2) return { transparente: false, vazio: 0, opaco: 1, cantosLivres: false, temCanal: false };
  const max = dados instanceof Uint16Array ? 65535 : 255;
  const alfa = (i: number) => dados[i * canais + canais - 1] / max;
  let vazio = 0;
  let opaco = 0;
  for (let i = 0; i < total; i++) { const a = alfa(i); if (a < 0.03) vazio++; else if (a >= 0.98) opaco++; }
  const bloco = Math.max(2, Math.min(12, Math.floor(Math.min(largura, altura) / 8)));
  const cantoLivre = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + bloco; y++) for (let x = x0; x < x0 + bloco; x++) if (alfa(y * largura + x) >= 0.03) return false;
    return true;
  };
  const cantosLivres = cantoLivre(0, 0) && cantoLivre(largura - bloco, 0) && cantoLivre(0, altura - bloco) && cantoLivre(largura - bloco, altura - bloco);
  const r = { vazio: vazio / total, opaco: opaco / total, cantosLivres, temCanal: true };
  return { ...r, transparente: cantosLivres && r.vazio >= 0.05 && r.opaco >= 0.1 };
}

/** Textos entre aspas e números do pedido precisam continuar idênticos no prompt melhorado (nada muda em silêncio). */
export function trechosObrigatorios(texto: string): string[] {
  const aspas = [...texto.matchAll(/["“”']([^"“”']{2,80})["“”']/g)].map((m) => m[1].trim());
  const numeros = [...texto.matchAll(/(?:R\$\s*)?\d+(?:[.,]\d+)*\s*%?/g)].map((m) => m[0].trim()).filter((n) => /\d/.test(n));
  return [...new Set([...aspas, ...numeros])];
}
export const faltando = (original: string, melhorado: string) => trechosObrigatorios(original).filter((t) => !melhorado.includes(t));

export class ErroOpenAI extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, msg: string) { super(msg); this.status = status; this.codigo = codigo; }
}

/** Mensagem para o cliente (nunca expõe detalhes internos nem a chave). */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroOpenAI) {
    if (e.codigo === 'moderation_blocked') return 'O pedido foi recusado pelo filtro de conteúdo da IA. Reescreva a descrição ou troque as referências.';
    if (e.codigo === 'credit_balance_exhausted' || e.codigo === 'insufficient_quota') return 'O serviço de IA está temporariamente indisponível (saldo da plataforma). Seu crédito foi devolvido.';
    if (e.status === 429) return 'Muitas criações ao mesmo tempo. Tente de novo em instantes; seu crédito foi devolvido.';
    if (e.status >= 500) return 'O serviço de IA falhou. Tente de novo; seu crédito foi devolvido.';
    return `A IA não aceitou o pedido (${e.codigo}).`;
  }
  return 'Falha inesperada ao criar a imagem. Seu crédito foi devolvido.';
}

async function lerErro(r: Response): Promise<never> {
  let codigo = `http_${r.status}`;
  let msg = '';
  try { const j = await r.json(); codigo = j?.error?.code ?? j?.error?.type ?? codigo; msg = String(j?.error?.message ?? '').slice(0, 300); } catch { /* sem corpo */ }
  throw new ErroOpenAI(r.status, codigo, msg || codigo);
}

export interface PedidoImagem {
  chave: string;
  modelo: string;
  prompt: string;
  proporcao: Proporcao;
  qualidade: Qualidade;
  transparente: boolean;
  /** imagens de referência já baixadas (a anterior primeiro, quando é uma nova versão) */
  referencias: { bytes: Uint8Array<ArrayBuffer>; tipo: string; nome: string }[];
}

/** Gera (sem referência) ou edita (com referências). Devolve o PNG e o uso de tokens. */
export async function criarImagem(p: PedidoImagem, tempoMs = 140_000): Promise<{ png: Uint8Array; uso: UsoImagem | null }> {
  const comum = { model: p.modelo, prompt: p.prompt, size: TAMANHO[p.proporcao], quality: p.qualidade, background: p.transparente ? 'transparent' : 'auto', output_format: 'png', n: 1 };
  let r: Response;
  if (p.referencias.length === 0) {
    r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${p.chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(comum), signal: AbortSignal.timeout(tempoMs),
    });
  } else {
    const f = new FormData();
    for (const [k, v] of Object.entries(comum)) f.append(k, String(v));
    for (const ref of p.referencias) f.append('image[]', new Blob([ref.bytes], { type: ref.tipo }), ref.nome);
    r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${p.chave}` }, body: f, signal: AbortSignal.timeout(tempoMs) });
  }
  if (!r.ok) await lerErro(r);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new ErroOpenAI(502, 'sem_imagem', 'a API não devolveu imagem');
  const bin = atob(b64);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, uso: j.usage ?? null };
}

/** Assistente de prompt (gpt-5-mini): organiza o pedido para publicidade; o validador garante textos e números intactos. */
export async function melhorarPrompt(chave: string, texto: string): Promise<{ prompt: string; dicas: string[]; custo: number }> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      max_completion_tokens: 1200,
      response_format: { type: 'json_schema', json_schema: { name: 'prompt_publicitario', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['prompt', 'dicas'],
        properties: { prompt: { type: 'string' }, dicas: { type: 'array', items: { type: 'string' } } } } } },
      messages: [
        { role: 'system', content: 'Você é diretor de arte de uma agência de mídia indoor brasileira. Reescreva o pedido do cliente como um prompt de geração de imagem publicitária profissional, em português, detalhando composição, iluminação, materiais, cores e acabamento. Regras: copie EXATAMENTE, sem traduzir nem corrigir, todo texto entre aspas e todo número/preço; não invente marcas, lojas ou preços; não acrescente pessoas reais. Em "dicas" dê até 3 sugestões curtas do que o cliente pode especificar.' },
        { role: 'user', content: texto.slice(0, 2000) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) await lerErro(r);
  const j = await r.json();
  const v = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}');
  const u = j?.usage ?? {};
  const custo = ((u.prompt_tokens ?? 0) * PRECO_TEXTO['gpt-5-mini'].entrada + (u.completion_tokens ?? 0) * PRECO_TEXTO['gpt-5-mini'].saida) / 1_000_000;
  return { prompt: String(v.prompt ?? ''), dicas: Array.isArray(v.dicas) ? v.dicas.slice(0, 3).map(String) : [], custo };
}
