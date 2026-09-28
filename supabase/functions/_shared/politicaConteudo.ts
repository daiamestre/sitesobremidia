// SOBRE MÍDIA — política de conteúdo do analisador próprio (F-111).
// Recebe os sinais medidos nas funções da Vercel (quadros com nota de nudez, textos lidos na imagem,
// fala transcrita, duração real) e decide: APROVADA, RECUSADA ou DUVIDA (vai para a equipe).
// Módulo puro (sem Deno/Node): usado pela função analisar-midia e pelos testes.

export type Decisao = 'APROVADA' | 'RECUSADA' | 'DUVIDA';
export type Gravidade = 'recusar' | 'revisar';
export type OrigemTexto = 'fala' | 'imagem';

export interface Achado {
  tipo: 'duracao' | 'nudez' | 'texto' | 'falha';
  gravidade: Gravidade;
  /** Frase formal para o cliente (nunca repete o termo ofensivo). */
  motivo: string;
  /** Detalhe para a equipe (pode citar o termo encontrado). */
  detalhe: string;
}

export interface QuadroAnalisado { t: number; porn: number; hentai: number; sexy: number; neutral?: number; drawing?: number }
export interface SinaisVisao { ok: boolean; erro?: string; duracao: number | null; tem_audio?: boolean; quadros: QuadroAnalisado[]; textos: string[]; texto_ok?: boolean }
export interface SinaisAudio { ok: boolean; erro?: string; texto: string }
export interface Sinais { tipo: 'imagem' | 'video'; visao: SinaisVisao | null; audio: SinaisAudio | null }
export interface Resultado { decisao: Decisao; motivo: string | null; achados: Achado[] }

// ── Limites de nudez (NSFWJS: Porn/Hentai/Sexy/Neutral/Drawing, 0 a 1) ─────────────────────
export const NUDEZ_RECUSAR = 0.7;   // Porn + Hentai em algum quadro
export const NUDEZ_REVISAR = 0.35;  // Porn + Hentai
export const SENSUAL_REVISAR = 0.75; // Sexy (roupa de banho, lingerie, pose sensual)

// ── Termos ─────────────────────────────────────────────────────────────────────────────
type Categoria = 'sexual' | 'palavrao' | 'discriminacao' | 'drogas';
const MOTIVO: Record<Categoria, string> = {
  sexual: 'contém linguagem sexual explícita',
  palavrao: 'contém palavrões ou linguagem obscena',
  discriminacao: 'contém termo racista, discriminatório ou de ódio',
  drogas: 'menciona substâncias ilícitas',
};

/** Termos que recusam sozinhos (palavra inteira; "*" no fim = qualquer terminação). */
const FORTES: Record<Categoria, string[]> = {
  sexual: ['porno*', 'porn', 'pornografi*', 'xxx', 'xvideo*', 'pornhub', 'xhamster', 'redtube', 'onlyfans', 'putaria*', 'sexo explicito',
    'sexo anal', 'sexo oral', 'boquete*', 'punheta*', 'siririca*', 'buceta*', 'boceta*', 'xoxota*', 'xereca*', 'piroca*', 'nudes',
    'tesuda*', 'safadinha*', 'rola grossa', 'pau duro', 'gozar', 'gozando', 'gozada*'],
  palavrao: ['caralho*', 'porra*', 'foder', 'fodase', 'foda se', 'fodido*', 'fodendo', 'filho da puta', 'filha da puta', 'puta que pariu',
    'tomar no cu', 'vai se foder', 'arrombad*', 'desgracad*', 'cuzao', 'cuzona'],
  discriminacao: ['crioulo*', 'criola*', 'baitola*', 'boiola*', 'sapatao', 'sapatona*', 'traveco*', 'viado', 'viadinho*', 'viadagem',
    'cabelo de bombril', 'cabelo de palha de aco', 'servico de preto', 'coisa de preto', 'coisa de macaco', 'picole de asfalto',
    'heil hitler', 'sieg heil', 'white power', 'supremacia branca', 'raca inferior', 'judeu sujo', 'nordestino burro', 'volta pra africa'],
  drogas: [],
};

/** Termos ambíguos: não recusam, mandam para a equipe olhar. */
const FRACOS: Record<Categoria, string[]> = {
  sexual: ['sexo', 'transar', 'transando', 'gostosa*', 'gostosao', 'tesao', 'pelada*', 'pelado*', 'nua', 'nuas', 'nu', 'erotic*', 'sensual*',
    'sexy', 'safada*', 'safado*', 'puta', 'putas', 'rola', 'pinto', 'peitos', 'bunda*'],
  palavrao: ['merda*', 'bosta*', 'cacete*', 'porcaria', 'cu'],
  discriminacao: ['macaco', 'macaca', 'macacos', 'tiziu', 'neguinho*', 'neguinha*', 'mulata*', 'cabelo ruim', 'bicha', 'bichas', 'veado',
    'retardad*', 'aleijad*', 'mongoloide*', 'paraiba', 'nazis*', 'hitler', 'suastica'],
  drogas: ['cocaina', 'maconha', 'crack', 'lsd', 'ecstasy', 'lanca perfume', 'lolo', 'baseado', 'cheirar po', 'maconheiro*', 'droga*'],
};

const GRUPOS = '(negr[oa]s?|pret[oa]s?|gays?|lesbicas?|travestis?|trans|transexuais|homossexuais|nordestin[oa]s?|judeus?|judias?|cigan[oa]s?|indi[oa]s?|indigenas?|deficientes?|evangelic[oa]s?|catolic[oa]s?|macumbeir[oa]s?|umbandistas?|muculman[oa]s?|imigrantes?|haitian[oa]s?|venezuelan[oa]s?|bolivian[oa]s?|gord[oa]s?|velh[oa]s?|mulheres)';
/** Frases de exclusão de um grupo ("proibido negros", "não atendemos gays"...). */
const EXCLUSAO_FORTE = new RegExp(`\\b(proibid[oa]s?|vetad[oa]s?|nao (aceitamos|atendemos|queremos|contratamos|vendemos para|servimos)|nao (e|sao) permitid[oa]s?|nao entra[mn]?|morte (a|aos|as)|exterminar|abaixo (os|as))( \\w+){0,3} ${GRUPOS}\\b`);
const EXCLUSAO_FRACA = new RegExp(`\\b(fora|sem|odeio|odiamos)( \\w+){0,2} ${GRUPOS}\\b`);

const LEET: Record<string, string> = { '0': 'o', '@': 'a', '4': 'a', '1': 'i', '!': 'i', '3': 'e', '5': 's', '$': 's', '7': 't' };

/** Minúsculas, sem acento, sem "l33t", só letras e espaço, letras repetidas 3+ vezes viram uma. */
export function normalizar(texto: string): string {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // "l33t" só dentro de palavra (p0rn0, put@ria): preços e números ("R$ 10", "20%") continuam números
    .replace(/(?<=[a-z])[0@41!35$7]+|[0@41!35$7]+(?=[a-z])/g, (m) => m.replace(/[0@41!35$7]/g, (c) => LEET[c]))
    .replace(/[^a-z]+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function paraRegex(termo: string): RegExp {
  const prefixo = termo.endsWith('*');
  const base = (prefixo ? termo.slice(0, -1) : termo).replace(/ /g, ' +');
  return new RegExp(`\\b${base}${prefixo ? '[a-z]*' : ''}\\b`);
}
const compilar = (t: Record<Categoria, string[]>) =>
  (Object.keys(t) as Categoria[]).flatMap((c) => t[c].map((termo) => ({ categoria: c, termo, re: paraRegex(termo) })));
const REGRAS_FORTES = compilar(FORTES);
const REGRAS_FRACAS = compilar(FRACOS);
/** Termos fortes compridos também procurados com as palavras coladas ("por no" → "porno"): só mandam revisar. */
const COLADOS = REGRAS_FORTES.filter((r) => r.termo.replace(/[* ]/g, '').length >= 5)
  .map((r) => ({ ...r, colado: r.termo.replace(/[* ]/g, '') }));

export interface TermoEncontrado { categoria: Categoria; termo: string; gravidade: Gravidade; como: 'palavra' | 'colado' | 'frase' }

export function procurarTermos(texto: string): TermoEncontrado[] {
  const n = normalizar(texto);
  if (!n) return [];
  const achados: TermoEncontrado[] = [];
  const ja = new Set<string>();
  const add = (a: TermoEncontrado) => { const k = a.categoria + a.termo; if (!ja.has(k)) { ja.add(k); achados.push(a); } };
  for (const r of REGRAS_FORTES) if (r.re.test(n)) add({ categoria: r.categoria, termo: r.termo, gravidade: 'recusar', como: 'palavra' });
  const m = n.match(EXCLUSAO_FORTE);
  if (m) add({ categoria: 'discriminacao', termo: m[0], gravidade: 'recusar', como: 'frase' });
  const colado = n.replace(/ /g, '');
  for (const r of COLADOS) {
    if (!ja.has(r.categoria + r.termo) && colado.includes(r.colado)) add({ categoria: r.categoria, termo: r.termo, gravidade: 'revisar', como: 'colado' });
  }
  for (const r of REGRAS_FRACAS) if (r.re.test(n)) add({ categoria: r.categoria, termo: r.termo, gravidade: 'revisar', como: 'palavra' });
  const f = n.match(EXCLUSAO_FRACA);
  if (f && !m) add({ categoria: 'discriminacao', termo: f[0], gravidade: 'revisar', como: 'frase' });
  return achados;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function decidir(s: Sinais, opcoes: { duracaoMaxima: number }): Resultado {
  const achados: Achado[] = [];
  const v = s.visao;

  if (!v || !v.ok) {
    achados.push({ tipo: 'falha', gravidade: 'revisar', motivo: 'A análise automática não foi concluída.', detalhe: `Análise de imagem falhou: ${v?.erro ?? 'sem resposta'}` });
  } else {
    if (s.tipo === 'video' && v.duracao != null && v.duracao > opcoes.duracaoMaxima + 0.5) {
      achados.push({ tipo: 'duracao', gravidade: 'recusar', motivo: `Vídeo com ${Math.round(v.duracao)} segundos; o limite é ${opcoes.duracaoMaxima} segundos.`, detalhe: `Duração real ${v.duracao.toFixed(1)} s` });
    }
    if (!v.quadros.length) {
      achados.push({ tipo: 'falha', gravidade: 'revisar', motivo: 'Não foi possível ler a imagem da mídia.', detalhe: 'Nenhum quadro extraído' });
    }
    const pior = { sexual: 0, sexy: 0, t: 0 };
    for (const q of v.quadros) {
      const sexual = (q.porn ?? 0) + (q.hentai ?? 0);
      if (sexual > pior.sexual) { pior.sexual = sexual; pior.t = q.t; }
      if ((q.sexy ?? 0) > pior.sexy) { pior.sexy = q.sexy ?? 0; if (pior.sexual < NUDEZ_REVISAR) pior.t = q.t; }
    }
    const quando = s.tipo === 'video' ? ` (aos ${Math.round(pior.t)} s)` : '';
    if (pior.sexual >= NUDEZ_RECUSAR) {
      achados.push({ tipo: 'nudez', gravidade: 'recusar', motivo: 'A mídia contém nudez ou conteúdo sexual.', detalhe: `Nudez/sexo ${pct(pior.sexual)}${quando}` });
    } else if (pior.sexual >= NUDEZ_REVISAR || pior.sexy >= SENSUAL_REVISAR) {
      achados.push({ tipo: 'nudez', gravidade: 'revisar', motivo: 'A mídia pode conter nudez ou conteúdo sensual.', detalhe: `Nudez/sexo ${pct(pior.sexual)}, sensual ${pct(pior.sexy)}${quando}` });
    }
    if (v.texto_ok === false && v.quadros.length) {
      achados.push({ tipo: 'falha', gravidade: 'revisar', motivo: 'A leitura dos textos da imagem não foi concluída.', detalhe: 'Leitor de texto (OCR) falhou' });
    }
    textos(achados, v.textos.join(' \n '), 'imagem');
  }

  if (s.tipo === 'video') {
    const a = s.audio;
    if (!a || !a.ok) {
      if (v?.ok && v.tem_audio === false) { /* vídeo sem som: nada a ouvir */ }
      else achados.push({ tipo: 'falha', gravidade: 'revisar', motivo: 'A análise do áudio não foi concluída.', detalhe: `Análise de áudio falhou: ${a?.erro ?? 'sem resposta'}` });
    } else {
      textos(achados, a.texto, 'fala');
    }
  }

  const recusas = achados.filter((x) => x.gravidade === 'recusar');
  if (recusas.length) return { decisao: 'RECUSADA', motivo: [...new Set(recusas.map((x) => x.motivo))].join(' '), achados };
  if (achados.length) return { decisao: 'DUVIDA', motivo: [...new Set(achados.map((x) => x.motivo))].join(' '), achados };
  return { decisao: 'APROVADA', motivo: null, achados };
}

function textos(achados: Achado[], texto: string, origem: OrigemTexto) {
  const onde = origem === 'fala' ? 'A fala da mídia' : 'O texto da imagem';
  const porCategoria = new Map<string, TermoEncontrado[]>();
  for (const t of procurarTermos(texto)) {
    const k = `${t.gravidade}:${t.categoria}`;
    porCategoria.set(k, [...(porCategoria.get(k) ?? []), t]);
  }
  for (const [k, lista] of porCategoria) {
    const [gravidade, categoria] = k.split(':') as [Gravidade, Categoria];
    achados.push({
      tipo: 'texto', gravidade,
      motivo: gravidade === 'recusar' ? `${onde} ${MOTIVO[categoria]}.` : `${onde} pode conter termo impróprio.`,
      detalhe: `${origem === 'fala' ? 'Fala' : 'Texto na imagem'}: ${lista.map((t) => `"${t.termo.replace('*', '')}"${t.como === 'colado' ? ' (palavras coladas)' : ''}`).join(', ')}`,
    });
  }
}
