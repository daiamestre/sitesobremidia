import type { TabelaWiki } from './tipos.ts';

/** Palavras que não identificam o clube (siglas societárias e artigos). */
const IGNORAR = new Set([
  'fc', 'afc', 'cf', 'sc', 'ec', 'cr', 'se', 'ca', 'fbpa', 'fr', 'fbc', 'af', 'ac', 'ud', 'cd', 'rcd', 'rc', 'sd', 'sad', 'sa',
  'club', 'clube', 'de', 'da', 'do', 'del', 'la', 'el', 'the', 'futebol', 'football', 'futbol', 'balompie', 'real', 'and',
]);

export function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter((t) => t && !IGNORAR.has(t)).join(' ');
}

function tokens(s: string): Set<string> { return new Set(normalizarNome(s).split(' ').filter(Boolean)); }

function semelhanca(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let comum = 0;
  for (const t of a) if (b.has(t)) comum++;
  return comum / Math.min(a.size, b.size);
}

export interface Correspondencia { ok: boolean; mapa: Record<string, string>; faltando: string[]; ambiguos: string[] }

/**
 * Cada time da fonte primária precisa corresponder a exatamente UM código da Wikipédia (bijeção).
 * Ordem: apelido explícito -> nome normalizado idêntico -> maior semelhança de palavras (>= 0,5, sem empate).
 * Se não fechar a bijeção, `ok = false` e nada novo é validado na competição.
 */
export function corresponderTimes(nomesFonte: string[], tabela: TabelaWiki, apelidos: Record<string, string> = {}): Correspondencia {
  const codigos = Object.keys(tabela.times);
  const mapa: Record<string, string> = {};
  const faltando: string[] = [];
  const ambiguos: string[] = [];
  const usados = new Set<string>();
  const unicos = [...new Set(nomesFonte)];
  const candidatosDe = (c: string) => [tabela.times[c].rotulo, tabela.times[c].artigo ?? ''].filter(Boolean);
  const apelidosNorm = Object.fromEntries(Object.entries(apelidos).map(([k, v]) => [normalizarNome(k), v]));

  // 1) apelidos e nomes idênticos
  for (const n of unicos) {
    const norm = normalizarNome(n);
    const ap = apelidosNorm[norm];
    if (ap && tabela.times[ap]) { mapa[n] = ap; continue; }
    const iguais = codigos.filter((c) => candidatosDe(c).some((x) => normalizarNome(x) === norm));
    if (iguais.length === 1) mapa[n] = iguais[0];
  }
  for (const c of Object.values(mapa)) usados.add(c);
  // 2) semelhança de palavras entre os restantes
  for (const n of unicos) {
    if (mapa[n]) continue;
    const tn = tokens(n);
    const notas = codigos.filter((c) => !usados.has(c))
      .map((c) => ({ c, nota: Math.max(...candidatosDe(c).map((x) => semelhanca(tn, tokens(x)))) }))
      .sort((a, b) => b.nota - a.nota);
    if (!notas.length || notas[0].nota < 0.5) { faltando.push(n); continue; }
    if (notas[1] && notas[1].nota === notas[0].nota) { ambiguos.push(n); continue; }
    mapa[n] = notas[0].c;
    usados.add(notas[0].c);
  }
  const repetidos = Object.values(mapa).filter((c, i, arr) => arr.indexOf(c) !== i);
  for (const r of new Set(repetidos)) ambiguos.push(...Object.keys(mapa).filter((k) => mapa[k] === r));
  return { ok: !faltando.length && !ambiguos.length && Object.keys(mapa).length === unicos.length, mapa, faltando, ambiguos: [...new Set(ambiguos)] };
}
