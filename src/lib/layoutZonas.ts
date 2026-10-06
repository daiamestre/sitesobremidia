/**
 * F-147 — Divisão da tela em zonas (Screen Layout & Zone Engine): núcleo de geometria e regras.
 * Código puro (sem React nem banco): usado pelo editor, pela prévia e pelo Player web.
 * As zonas ficam em PIXELS da tela lógica (largura × altura do layout); o percentual é só leitura.
 */

export type ModoEncaixe = 'CONTER' | 'COBRIR' | 'ESTICAR';

export interface Zona {
  /** id do banco; ausente enquanto a zona ainda não foi salva */
  id?: string;
  /** chave local estável para o editor (id do banco ou um provisório) */
  chave: string;
  numero: number;
  nome: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  ordem_z: number;
  modo_encaixe: ModoEncaixe;
  visivel: boolean;
  travada: boolean;
  principal: boolean;
  audio: boolean;
  anuncios_pagos: boolean;
  playlist_id: string | null;
}

export interface LayoutDaTela {
  largura: number;
  altura: number;
  cor_fundo: string;
  zonas: Zona[];
}

export interface Ponto { x: number; y: number }
export interface Retangulo { x: number; y: number; largura: number; altura: number }

export const TAMANHO_MINIMO_ZONA = 16;
export const LIMITE_DE_ZONAS = 500;

export const TELAS_PRONTAS: Array<{ rotulo: string; largura: number; altura: number }> = [
  { rotulo: 'Full HD deitada — 1920 × 1080', largura: 1920, altura: 1080 },
  { rotulo: 'Full HD em pé — 1080 × 1920', largura: 1080, altura: 1920 },
  { rotulo: '4K deitada — 3840 × 2160', largura: 3840, altura: 2160 },
  { rotulo: '4K em pé — 2160 × 3840', largura: 2160, altura: 3840 },
  { rotulo: 'HD deitada — 1280 × 720', largura: 1280, altura: 720 },
  { rotulo: 'Painel LED 2:1 — 1920 × 960', largura: 1920, altura: 960 },
  { rotulo: 'Painel LED 4:1 — 3840 × 960', largura: 3840, altura: 960 },
];

const inteiro = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const entre = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/** Tamanho da tela lógica a partir do cadastro da tela ("1920x1080", "16x9", "9x16", orientação). */
export function telaLogicaPadrao(resolution?: string | null, orientation?: string | null): { largura: number; altura: number } {
  const r = String(resolution ?? '').toLowerCase().trim();
  const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(r);
  if (m && Number(m[1]) >= 240 && Number(m[2]) >= 240) return { largura: Number(m[1]), altura: Number(m[2]) };
  const emPe = ['9x16', '9:16', 'portrait', 'vertical', 'retrato'].includes(r)
    || (!['16x9', '16:9', 'landscape', 'horizontal', 'paisagem'].includes(r) && ['portrait', 'vertical', 'retrato'].includes(String(orientation ?? '').toLowerCase().trim()));
  return emPe ? { largura: 1080, altura: 1920 } : { largura: 1920, altura: 1080 };
}

/** Mantém a zona inteira dentro da tela, com o tamanho mínimo. */
export function limitarZona<T extends Retangulo>(z: T, largura: number, altura: number): T {
  const w = entre(inteiro(z.largura), Math.min(TAMANHO_MINIMO_ZONA, largura), largura);
  const h = entre(inteiro(z.altura), Math.min(TAMANHO_MINIMO_ZONA, altura), altura);
  return { ...z, largura: w, altura: h, x: entre(inteiro(z.x), 0, largura - w), y: entre(inteiro(z.y), 0, altura - h) };
}

/** Retângulo desenhado ao clicar e arrastar de `a` até `b` (em pixels da tela lógica), já dentro dos limites. */
export function zonaDoArrasto(a: Ponto, b: Ponto, largura: number, altura: number): Retangulo {
  const x1 = entre(inteiro(Math.min(a.x, b.x)), 0, largura);
  const y1 = entre(inteiro(Math.min(a.y, b.y)), 0, altura);
  const x2 = entre(inteiro(Math.max(a.x, b.x)), 0, largura);
  const y2 = entre(inteiro(Math.max(a.y, b.y)), 0, altura);
  return { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 };
}

/** Só vira zona de verdade se o arrasto tiver um tamanho mínimo (evita criar zona com um clique). */
export const arrastoVale = (r: Retangulo) => r.largura >= TAMANHO_MINIMO_ZONA && r.altura >= TAMANHO_MINIMO_ZONA;

/** Encaixa o valor na grade (0 = sem grade). */
export const naGrade = (valor: number, grade: number) => (grade > 1 ? Math.round(valor / grade) * grade : inteiro(valor));

/** Quanto da tela a zona ocupa, em % com uma casa. */
export function percentual(z: Retangulo, largura: number, altura: number) {
  const p = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  return { x: p(z.x, largura), y: p(z.y, altura), largura: p(z.largura, largura), altura: p(z.altura, altura),
           area: p(z.largura * z.altura, largura * altura) };
}

/** Posição e tamanho em CSS (percentual do contêiner): o mesmo cálculo no editor, na prévia e no Player. */
export function estiloDaZona(z: Retangulo, largura: number, altura: number) {
  return {
    left: `${(z.x / largura) * 100}%`, top: `${(z.y / altura) * 100}%`,
    width: `${(z.largura / largura) * 100}%`, height: `${(z.altura / altura) * 100}%`,
  };
}

/** Menor número livre a partir de 1. */
export function proximoNumero(zonas: Array<{ numero: number }>): number {
  const usados = new Set(zonas.map((z) => z.numero));
  let n = 1;
  while (usados.has(n)) n++;
  return n;
}

let contador = 0;
export const novaChave = () => `nova-${Date.now().toString(36)}-${(contador++).toString(36)}`;

export function novaZona(r: Retangulo, zonas: Zona[], largura: number, altura: number): Zona {
  const numero = proximoNumero(zonas);
  return {
    chave: novaChave(), numero, nome: `Zona ${numero}`, ...limitarZona(r, largura, altura),
    ordem_z: zonas.reduce((m, z) => Math.max(m, z.ordem_z), -1) + 1,
    modo_encaixe: 'CONTER', visivel: true, travada: false,
    principal: zonas.length === 0, audio: false, anuncios_pagos: true, playlist_id: null,
  };
}

/** Divisões prontas. `fracao` = parte da tela para a zona menor (ex.: 0.25 = 25%). */
export type DivisaoPronta = 'TELA_CHEIA' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA' | 'RODAPE' | 'DUAS_COLUNAS' | 'QUATRO';
export function dividir(tipo: DivisaoPronta, largura: number, altura: number, fracao = 0.25): Retangulo[] {
  const f = entre(fracao, 0.05, 0.95);
  const lw = inteiro(largura * f);
  const rh = inteiro(altura * f);
  switch (tipo) {
    case 'LATERAL_DIREITA': return [{ x: 0, y: 0, largura: largura - lw, altura }, { x: largura - lw, y: 0, largura: lw, altura }];
    case 'LATERAL_ESQUERDA': return [{ x: lw, y: 0, largura: largura - lw, altura }, { x: 0, y: 0, largura: lw, altura }];
    case 'RODAPE': return [{ x: 0, y: 0, largura, altura: altura - rh }, { x: 0, y: altura - rh, largura, altura: rh }];
    case 'DUAS_COLUNAS': { const m = inteiro(largura / 2); return [{ x: 0, y: 0, largura: m, altura }, { x: m, y: 0, largura: largura - m, altura }]; }
    case 'QUATRO': {
      const mx = inteiro(largura / 2); const my = inteiro(altura / 2);
      return [{ x: 0, y: 0, largura: mx, altura: my }, { x: mx, y: 0, largura: largura - mx, altura: my },
              { x: 0, y: my, largura: mx, altura: altura - my }, { x: mx, y: my, largura: largura - mx, altura: altura - my }];
    }
    default: return [{ x: 0, y: 0, largura, altura }];
  }
}

export function zonasDaDivisao(tipo: DivisaoPronta, largura: number, altura: number, fracao = 0.25): Zona[] {
  const zonas: Zona[] = [];
  for (const r of dividir(tipo, largura, altura, fracao)) zonas.push(novaZona(r, zonas, largura, altura));
  return zonas;
}

/** Ao mudar o tamanho da tela lógica, as zonas acompanham na mesma proporção. */
export function redimensionarLayout(l: LayoutDaTela, largura: number, altura: number): LayoutDaTela {
  const fx = largura / l.largura; const fy = altura / l.altura;
  return {
    ...l, largura, altura,
    zonas: l.zonas.map((z) => limitarZona({ ...z, x: z.x * fx, y: z.y * fy, largura: z.largura * fx, altura: z.altura * fy }, largura, altura)),
  };
}

/** Uma só principal e no máximo uma com som: marcar numa zona desmarca nas outras. */
export function marcarUnica(zonas: Zona[], chave: string, campo: 'principal' | 'audio', valor: boolean): Zona[] {
  return zonas.map((z) => {
    if (z.chave === chave) return { ...z, [campo]: valor, ...(campo === 'principal' && valor ? { playlist_id: null } : {}) };
    return valor ? { ...z, [campo]: false } : z;
  });
}

export function sobrepoe(a: Retangulo, b: Retangulo): boolean {
  return a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;
}

/** Problemas que impedem salvar (em português, prontos para mostrar). Sobreposição é permitida (não entra aqui). */
export function validarLayout(l: LayoutDaTela): string[] {
  const erros: string[] = [];
  if (!(l.largura >= 16 && l.largura <= 32768 && l.altura >= 16 && l.altura <= 32768)) erros.push('Informe a largura e a altura da tela em pixels (de 16 a 32768).');
  if (l.zonas.length === 0) erros.push('Crie pelo menos uma zona.');
  if (l.zonas.length > LIMITE_DE_ZONAS) erros.push(`Limite de ${LIMITE_DE_ZONAS} zonas por tela.`);
  const vistos = new Set<number>();
  for (const z of l.zonas) {
    if (!Number.isInteger(z.numero) || z.numero < 1) erros.push('Toda zona precisa de um número a partir de 1.');
    else if (vistos.has(z.numero)) erros.push(`A zona ${z.numero} está repetida.`);
    vistos.add(z.numero);
    if (z.x < 0 || z.y < 0 || z.largura < 1 || z.altura < 1) erros.push(`A zona ${z.numero} tem posição ou tamanho inválido.`);
    else if (z.x + z.largura > l.largura || z.y + z.altura > l.altura) erros.push(`A zona ${z.numero} passa do limite da tela.`);
  }
  if (l.zonas.filter((z) => z.principal).length > 1) erros.push('Só uma zona pode ser a principal.');
  if (l.zonas.filter((z) => z.audio).length > 1) erros.push('Só uma zona pode ter som.');
  return erros;
}

/** Zonas que se sobrepõem (aviso, não erro). */
export function paresSobrepostos(zonas: Zona[]): Array<[number, number]> {
  const pares: Array<[number, number]> = [];
  for (let i = 0; i < zonas.length; i++) for (let j = i + 1; j < zonas.length; j++) {
    if (zonas[i].visivel && zonas[j].visivel && sobrepoe(zonas[i], zonas[j])) pares.push([zonas[i].numero, zonas[j].numero]);
  }
  return pares;
}

/** Formato que a função fn_salvar_layout_da_tela recebe. */
export function paraSalvar(zonas: Zona[]) {
  return zonas.map((z) => ({
    ...(z.id ? { id: z.id } : {}), numero: z.numero, nome: z.nome.trim() || null, x: z.x, y: z.y, largura: z.largura, altura: z.altura,
    ordem_z: z.ordem_z, modo_encaixe: z.modo_encaixe, visivel: z.visivel, travada: z.travada, principal: z.principal,
    audio: z.audio, anuncios_pagos: z.anuncios_pagos, playlist_id: z.principal ? null : z.playlist_id,
  }));
}

export function doBanco(linha: Record<string, unknown>): Zona {
  const n = (k: string, padrao = 0) => (Number.isFinite(Number(linha[k])) ? Number(linha[k]) : padrao);
  const modo = String(linha.modo_encaixe ?? 'CONTER').toUpperCase();
  return {
    id: String(linha.id), chave: String(linha.id), numero: n('numero', 1), nome: String(linha.nome ?? ''),
    x: n('x'), y: n('y'), largura: n('largura', 1), altura: n('altura', 1), ordem_z: n('ordem_z'),
    modo_encaixe: modo === 'COBRIR' || modo === 'ESTICAR' ? modo : 'CONTER',
    visivel: linha.visivel !== false, travada: linha.travada === true, principal: linha.principal === true,
    audio: linha.audio === true, anuncios_pagos: linha.anuncios_pagos !== false,
    playlist_id: (linha.playlist_id as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------------------------- Player

export const AJUSTE_CSS: Record<ModoEncaixe, 'contain' | 'cover' | 'fill'> = { CONTER: 'contain', COBRIR: 'cover', ESTICAR: 'fill' };

/**
 * Regra do proprietário: a MESMA mídia nunca toca em duas zonas da mesma tela ao mesmo tempo.
 * Devolve o índice do próximo item da zona cuja mídia não está em uso por outra zona; -1 quando todos estão em uso
 * (a zona espera e tenta de novo, sem repetir o que a outra está mostrando).
 */
export function proximoItemLivre(itens: Array<{ mediaId: string }>, atual: number, emUsoPorOutras: ReadonlySet<string>): number {
  const total = itens.length;
  if (total === 0) return -1;
  for (let passo = 1; passo <= total; passo++) {
    const i = (((atual + passo) % total) + total) % total;
    if (!emUsoPorOutras.has(itens[i].mediaId)) return i;
  }
  return -1;
}
