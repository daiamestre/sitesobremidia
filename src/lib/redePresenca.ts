/**
 * F-150 — Presença da rede por cidade e estado (mapa automático).
 * Os números vêm do cadastro (fn_rede_presenca: anunciantes, gestores de mídias e pontos parceiros); aqui eles são
 * casados com os municípios do Brasil para saber onde marcar no mapa. Código puro, sem React.
 */
export interface LinhaDePresenca { cidade: string | null; uf: string | null; anunciantes: number; pontos: number; gestores: number; total: number }
export interface Contagem { anunciantes: number; pontos: number; gestores: number; total: number }
export interface CidadeNoMapa extends Contagem { nome: string; uf: string; lat: number; lon: number }
export interface EstadoNoMapa extends Contagem { uf: string; cidades: CidadeNoMapa[]; /** cadastros do estado cuja cidade não foi reconhecida */ semCidade: number }
export interface PresencaNoMapa { estados: EstadoNoMapa[]; total: Contagem; cidades: number; naoLocalizados: number }

/** Municípios por UF: [nome, latitude, longitude] (public/geo/brasil-municipios.json). */
export type Municipios = Record<string, Array<[string, number, number]>>;

/** "São Paulo", "Sao Paulo " e "SAO PAULO" são a mesma cidade. */
export function normalizarNome(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const zero = (): Contagem => ({ anunciantes: 0, pontos: 0, gestores: 0, total: 0 });
const somar = (a: Contagem, b: Contagem) => { a.anunciantes += b.anunciantes; a.pontos += b.pontos; a.gestores += b.gestores; a.total += b.total; };

/**
 * Junta as linhas do cadastro por cidade e estado.
 *  - cidade com UF: marca a cidade (se existir naquele estado) e soma no estado;
 *  - cidade sem UF: vale quando só existe UMA cidade com aquele nome no Brasil (ex.: Caruaru); nome repetido em vários
 *    estados sem UF informada não tem como ser localizado e fica de fora do mapa (conta em `naoLocalizados`);
 *  - UF sem cidade reconhecida: soma só no estado.
 */
export function montarPresenca(linhas: LinhaDePresenca[], municipios: Municipios): PresencaNoMapa {
  const indice = new Map<string, Map<string, [string, number, number]>>(); // uf -> nome normalizado -> município
  const porNome = new Map<string, Array<{ uf: string; m: [string, number, number] }>>();
  for (const uf of Object.keys(municipios)) {
    const mapa = new Map<string, [string, number, number]>();
    for (const m of municipios[uf]) {
      const n = normalizarNome(m[0]);
      mapa.set(n, m);
      const lista = porNome.get(n) ?? [];
      lista.push({ uf, m });
      porNome.set(n, lista);
    }
    indice.set(uf, mapa);
  }

  const estados = new Map<string, EstadoNoMapa>();
  const cidades = new Map<string, CidadeNoMapa>();
  const total = zero();
  let naoLocalizados = 0;
  const estadoDe = (uf: string) => {
    let e = estados.get(uf);
    if (!e) { e = { uf, ...zero(), cidades: [], semCidade: 0 }; estados.set(uf, e); }
    return e;
  };

  for (const l of linhas) {
    const c: Contagem = { anunciantes: Number(l.anunciantes) || 0, pontos: Number(l.pontos) || 0, gestores: Number(l.gestores) || 0, total: Number(l.total) || 0 };
    if (c.total <= 0) continue;
    const nome = normalizarNome(l.cidade);
    let uf = l.uf && indice.has(l.uf.toUpperCase()) ? l.uf.toUpperCase() : null;
    let municipio = uf && nome ? indice.get(uf)!.get(nome) ?? null : null;
    if (!uf && nome) {
      const candidatos = porNome.get(nome) ?? [];
      if (candidatos.length === 1) { uf = candidatos[0].uf; municipio = candidatos[0].m; }
    }
    if (!uf) { naoLocalizados += c.total; continue; }
    const e = estadoDe(uf);
    somar(e, c);
    somar(total, c);
    if (municipio) {
      const chave = `${uf}|${normalizarNome(municipio[0])}`;
      let cid = cidades.get(chave);
      if (!cid) { cid = { nome: municipio[0], uf, lat: municipio[1], lon: municipio[2], ...zero() }; cidades.set(chave, cid); e.cidades.push(cid); }
      somar(cid, c);
    } else e.semCidade += c.total;
  }

  const lista = [...estados.values()].sort((a, b) => b.total - a.total || a.uf.localeCompare(b.uf));
  for (const e of lista) e.cidades.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { estados: lista, total, cidades: cidades.size, naoLocalizados };
}

// ---------------------------------------------------------------------------------------------- projeção do mapa
export const LIMITES_DO_BRASIL = { oeste: -74.1, leste: -34.6, norte: 5.4, sul: -33.9 };
export const ESCALA_DO_MAPA = 25; // unidades do desenho por grau
export const LARGURA_DO_MAPA = (LIMITES_DO_BRASIL.leste - LIMITES_DO_BRASIL.oeste) * ESCALA_DO_MAPA;
export const ALTURA_DO_MAPA = (LIMITES_DO_BRASIL.norte - LIMITES_DO_BRASIL.sul) * ESCALA_DO_MAPA;

/** Longitude/latitude -> ponto no desenho (norte em cima). */
export function projetar(lon: number, lat: number): [number, number] {
  return [(lon - LIMITES_DO_BRASIL.oeste) * ESCALA_DO_MAPA, (LIMITES_DO_BRASIL.norte - lat) * ESCALA_DO_MAPA];
}

export function caminhoDoEstado(aneis: number[][][]): string {
  return aneis.map((a) => a.map(([lon, lat], i) => { const [x, y] = projetar(lon, lat); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('') + 'Z').join('');
}

export function caixaDoEstado(aneis: number[][][]): { x: number; y: number; largura: number; altura: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const a of aneis) for (const [lon, lat] of a) { const [x, y] = projetar(lon, lat); x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
  return { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 };
}

/** A partir desta aproximação, as cidades aparecem marcadas. */
export const APROXIMACAO_DAS_CIDADES = 2.2;
export const APROXIMACAO_MAXIMA = 40;

/** Texto do tipo "3 anunciantes · 1 gestor · 2 pontos parceiros" (só o que existe). */
export function detalheDaContagem(c: Contagem): string {
  const p = (n: number, um: string, varios: string) => (n > 0 ? `${n} ${n === 1 ? um : varios}` : null);
  return [p(c.anunciantes, 'anunciante', 'anunciantes'), p(c.gestores, 'gestor de mídias', 'gestores de mídias'), p(c.pontos, 'ponto parceiro', 'pontos parceiros')].filter(Boolean).join(' · ');
}
