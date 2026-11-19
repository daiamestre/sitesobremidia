// SOBRE MÍDIA STUDIO — EDITOR DE ÁUDIO: o PROJETO (faixas e clipes), em funções puras.
// Um clipe aponta para um som guardado (somId) e mostra o trecho [deslocamento, deslocamento + duracao) dele, a partir de
// `inicio` na linha do tempo. Editar nunca altera o som guardado: cortar/dividir/aparar só mudam os clipes, e os efeitos
// criam um som novo. Assim desfazer/refazer é só guardar o projeto anterior.

export interface Clipe {
  id: string; somId: string; nome: string;
  inicio: number; deslocamento: number; duracao: number;
  ganhoDb: number; fadeEntrada: number; fadeSaida: number;
}
export interface Faixa { id: string; nome: string; volumeDb: number; pan: number; mudo: boolean; solo: boolean; cor: string; clipes: Clipe[] }
export interface Projeto { faixas: Faixa[]; volumeGeralDb: number }

const EPS = 1e-6;
let contador = 0;
export const novoId = (p = 'id') => `${p}-${Date.now().toString(36)}-${(contador++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const CORES_DAS_FAIXAS = ['#8A2EFF', '#25D366', '#FFD400', '#38BDF8', '#F472B6', '#FB923C', '#A3E635', '#F87171'];

export const projetoVazio = (): Projeto => ({ faixas: [], volumeGeralDb: 0 });
export const fimDoClipe = (c: Clipe) => c.inicio + c.duracao;
export const fimDaFaixa = (f: Faixa) => f.clipes.reduce((m, c) => Math.max(m, fimDoClipe(c)), 0);
export const fimDoProjeto = (p: Projeto) => p.faixas.reduce((m, f) => Math.max(m, fimDaFaixa(f)), 0);
const ordenar = (cs: Clipe[]) => [...cs].sort((a, b) => a.inicio - b.inicio);

export function novaFaixa(p: Projeto, nome?: string): Faixa {
  return { id: novoId('faixa'), nome: nome ?? `Faixa ${p.faixas.length + 1}`, volumeDb: 0, pan: 0, mudo: false, solo: false, cor: CORES_DAS_FAIXAS[p.faixas.length % CORES_DAS_FAIXAS.length], clipes: [] };
}
export function novoClipe(somId: string, nome: string, duracao: number, inicio = 0): Clipe {
  return { id: novoId('clipe'), somId, nome, inicio: Math.max(0, inicio), deslocamento: 0, duracao, ganhoDb: 0, fadeEntrada: 0, fadeSaida: 0 };
}

export const trocarFaixa = (p: Projeto, id: string, f: (x: Faixa) => Faixa): Projeto => ({ ...p, faixas: p.faixas.map((x) => (x.id === id ? f(x) : x)) });
export const trocarClipe = (p: Projeto, clipeId: string, f: (c: Clipe) => Clipe): Projeto =>
  ({ ...p, faixas: p.faixas.map((x) => (x.clipes.some((c) => c.id === clipeId) ? { ...x, clipes: x.clipes.map((c) => (c.id === clipeId ? f(c) : c)) } : x)) });
export function acharClipe(p: Projeto, clipeId: string | null): { faixa: Faixa; clipe: Clipe } | null {
  if (!clipeId) return null;
  for (const faixa of p.faixas) { const clipe = faixa.clipes.find((c) => c.id === clipeId); if (clipe) return { faixa, clipe }; }
  return null;
}

/** divide em dois o clipe que passa pelo instante t (os fades ficam nas pontas de fora) */
export function dividirClipe(c: Clipe, t: number): [Clipe, Clipe] | null {
  if (t <= c.inicio + EPS || t >= fimDoClipe(c) - EPS) return null;
  const d = t - c.inicio;
  return [
    { ...c, duracao: d, fadeSaida: 0, fadeEntrada: Math.min(c.fadeEntrada, d) },
    { ...c, id: novoId('clipe'), inicio: t, deslocamento: c.deslocamento + d, duracao: c.duracao - d, fadeEntrada: 0, fadeSaida: Math.min(c.fadeSaida, c.duracao - d) },
  ];
}
export function dividirFaixa(f: Faixa, t: number): Faixa {
  return { ...f, clipes: ordenar(f.clipes.flatMap((c) => dividirClipe(c, t) ?? [c])) };
}

/** os clipes de [a, b) copiados, com o início relativo a `a` (é o que vai para a área de transferência) */
export function copiarIntervalo(f: Faixa, a: number, b: number): Clipe[] {
  const g = dividirFaixa(dividirFaixa(f, a), b);
  return g.clipes.filter((c) => c.inicio >= a - EPS && fimDoClipe(c) <= b + EPS).map((c) => ({ ...c, id: novoId('clipe'), inicio: c.inicio - a }));
}

/** apaga [a, b); com `puxar`, o que vem depois anda para trás (como cortar num editor de áudio) */
export function apagarIntervalo(f: Faixa, a: number, b: number, puxar = true): Faixa {
  if (b <= a) return f;
  const g = dividirFaixa(dividirFaixa(f, a), b);
  const dentro = (c: Clipe) => c.inicio >= a - EPS && fimDoClipe(c) <= b + EPS;
  return { ...f, clipes: ordenar(g.clipes.filter((c) => !dentro(c)).map((c) => (puxar && c.inicio >= b - EPS ? { ...c, inicio: c.inicio - (b - a) } : c))) };
}

/** abre um espaço de `dur` em t (empurra o que vem depois) */
export function abrirEspaco(f: Faixa, t: number, dur: number): Faixa {
  if (dur <= 0) return f;
  const g = dividirFaixa(f, t);
  return { ...f, clipes: g.clipes.map((c) => (c.inicio >= t - EPS ? { ...c, inicio: c.inicio + dur } : c)) };
}

/** cola os clipes em t; com `inserir`, empurra o que vem depois (senão mistura por cima) */
export function colar(f: Faixa, t: number, clipes: Clipe[], inserir = true): Faixa {
  if (!clipes.length) return f;
  const dur = clipes.reduce((m, c) => Math.max(m, fimDoClipe(c)), 0);
  const base = inserir ? abrirEspaco(f, t, dur) : f;
  return { ...base, clipes: ordenar([...base.clipes, ...clipes.map((c) => ({ ...c, id: novoId('clipe'), inicio: c.inicio + t }))]) };
}

/** deixa só [a, b) (o resto da faixa sai) e leva para o começo */
export function manterSo(f: Faixa, a: number, b: number): Faixa {
  return { ...f, clipes: copiarIntervalo(f, a, b) };
}

/** apara a ponta do clipe arrastando a borda (nunca passa do som guardado) */
export function apararClipe(c: Clipe, lado: 'inicio' | 'fim', t: number, duracaoDoSom: number): Clipe {
  const MIN = 0.01;
  if (lado === 'fim') return { ...c, duracao: Math.max(MIN, Math.min(t - c.inicio, duracaoDoSom - c.deslocamento)) };
  const fim = fimDoClipe(c);
  let ini = Math.min(t, fim - MIN);
  ini = Math.max(ini, c.inicio - c.deslocamento, 0);
  return { ...c, inicio: ini, deslocamento: c.deslocamento + (ini - c.inicio), duracao: fim - ini };
}

/**
 * Prepara a aplicação de um efeito em [a, b): divide os clipes nas pontas e devolve a faixa dividida e os clipes de dentro.
 * Quem chama processa o som de cada clipe de dentro e chama `trocarSomDosClipes`.
 */
export function clipesNoIntervalo(f: Faixa, a: number, b: number): { faixa: Faixa; dentro: Clipe[] } {
  const g = dividirFaixa(dividirFaixa(f, a), b);
  return { faixa: g, dentro: g.clipes.filter((c) => c.inicio >= a - EPS && fimDoClipe(c) <= b + EPS) };
}

/** troca o som dos clipes processados; se a duração mudou (velocidade), o que vem depois anda junto */
export function trocarSomDosClipes(f: Faixa, novos: Array<{ id: string; somId: string; duracao: number }>): Faixa {
  let clipes = ordenar(f.clipes);
  for (const n of novos) {
    const c = clipes.find((x) => x.id === n.id); if (!c) continue;
    const dif = n.duracao - c.duracao, fim = fimDoClipe(c);
    clipes = clipes.map((x) => {
      if (x.id === c.id) return { ...x, somId: n.somId, deslocamento: 0, duracao: n.duracao, fadeEntrada: Math.min(x.fadeEntrada, n.duracao), fadeSaida: Math.min(x.fadeSaida, n.duracao) };
      return Math.abs(dif) > EPS && x.inicio >= fim - EPS ? { ...x, inicio: Math.max(0, x.inicio + dif) } : x;
    });
  }
  return { ...f, clipes: ordenar(clipes) };
}

/** o ganho de um clipe no instante t da linha do tempo (volume do clipe + fades) */
export function ganhoDoClipeEm(c: Clipe, t: number): number {
  const x = t - c.inicio; if (x < 0 || x > c.duracao) return 0;
  let g = Math.pow(10, c.ganhoDb / 20);
  if (c.fadeEntrada > 0 && x < c.fadeEntrada) g *= x / c.fadeEntrada;
  if (c.fadeSaida > 0 && x > c.duracao - c.fadeSaida) g *= (c.duracao - x) / c.fadeSaida;
  return g;
}

/** F-341: tira as lasquinhas (clipes menores que `min` s) que sobram de cortes e encaixes; devolve o MESMO projeto se não houver */
export function semMigalhas(p: Projeto, min = 0.02): Projeto {
  if (!p.faixas.some((f) => f.clipes.some((c) => c.duracao < min))) return p;
  return { ...p, faixas: p.faixas.map((f) => (f.clipes.some((c) => c.duracao < min) ? { ...f, clipes: f.clipes.filter((c) => c.duracao >= min) } : f)) };
}

/**
 * F-343: os clipes TOCAM UM ATRÁS DO OUTRO — vão para uma faixa só, colados (sem espaço), na ordem: faixa de cima primeiro,
 * depois o tempo. Começa onde o primeiro clipe começava. As faixas que ficaram vazias saem.
 */
export function emSequencia(p: Projeto, ids?: string[]): Projeto {
  const alvo = p.faixas.filter((f) => (!ids || ids.includes(f.id)) && f.clipes.length);
  const clipes = alvo.flatMap((f) => [...f.clipes].sort((a, b) => a.inicio - b.inicio));
  if (clipes.length < 2) return p;
  const destino = alvo[0];
  let t = Math.max(0, clipes[0].inicio);
  const seq = clipes.map((c) => { const n = { ...c, inicio: t }; t += c.duracao; return n; });
  const sair = new Set(alvo.filter((f) => f.id !== destino.id).map((f) => f.id));
  return { ...p, faixas: p.faixas.filter((f) => !sair.has(f.id)).map((f) => (f.id === destino.id ? { ...f, clipes: seq } : f)) };
}

/** as faixas que tocam (solo ganha de tudo; mudo não toca) */
export function faixasAudiveis(p: Projeto): Faixa[] {
  const solo = p.faixas.some((f) => f.solo);
  return p.faixas.filter((f) => (solo ? f.solo : !f.mudo));
}

/** os sons que o projeto ainda usa (para limpar a memória e salvar só o necessário) */
export const sonsUsados = (p: Projeto) => new Set(p.faixas.flatMap((f) => f.clipes.map((c) => c.somId)));

/** tempo em m:ss.mmm */
export function formatarTempo(t: number, ms = true): string {
  const s = Math.max(0, t), m = Math.floor(s / 60), r = s - m * 60;
  return ms ? `${m}:${r.toFixed(3).padStart(6, '0')}` : `${m}:${Math.floor(r).toString().padStart(2, '0')}`;
}
