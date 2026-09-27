/**
 * Loterias CAIXA — leitura e normalização dos resultados (F-94). Código puro (robô + testes).
 * Fonte 1: API pública do portal de loterias da CAIXA. Fonte 2 (reserva): espelho público loteriascaixa-api (mesmos
 * dados oficiais; pode atrasar 1 concurso). Vale o concurso mais NOVO entre as duas.
 */
export const LOTERIAS = [
  { slug: 'megasena', nome: 'Mega-Sena', cor: '#209869', cor2: '#0b4f33', dias: 'terças, quintas e sábados' },
  { slug: 'lotofacil', nome: 'Lotofácil', cor: '#930089', cor2: '#4a0045', dias: 'segunda a sábado' },
  { slug: 'quina', nome: 'Quina', cor: '#260085', cor2: '#130043', dias: 'segunda a sábado' },
  { slug: 'lotomania', nome: 'Lotomania', cor: '#f78100', cor2: '#8a4200', dias: 'segundas, quartas e sextas' },
  { slug: 'timemania', nome: 'Timemania', cor: '#00a13a', cor2: '#00531e', dias: 'terças, quintas e sábados' },
  { slug: 'duplasena', nome: 'Dupla Sena', cor: '#a61324', cor2: '#540a12', dias: 'segundas, quartas e sextas' },
  { slug: 'diadesorte', nome: 'Dia de Sorte', cor: '#cb852b', cor2: '#6b4311', dias: 'terças, quintas e sábados' },
  { slug: 'supersete', nome: 'Super Sete', cor: '#7ea530', cor2: '#3e5317', dias: 'segundas, quartas e sextas' },
  { slug: 'maismilionaria', nome: '+Milionária', cor: '#2e3078', cor2: '#15163c', dias: 'quartas e sábados' },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : null);
const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const lista = (v) => (Array.isArray(v) ? v.map((x) => texto(String(x))).filter(Boolean) : []);
/** "24/09/2026" -> "2026-09-24" (sem fuso: é a data do sorteio em Brasília). Inválida -> null. */
export function dataIso(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(br));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Resultado no formato da API da CAIXA -> formato único. null se faltar o essencial. */
export function daCaixa(slug, j) {
  if (!j || typeof j !== 'object') return null;
  const concurso = num(j.numero);
  const data = dataIso(j.dataApuracao);
  const dezenas = lista(j.listaDezenas);
  if (!concurso || !data || !dezenas.length) return null;
  const faixas = (Array.isArray(j.listaRateioPremio) ? j.listaRateioPremio : []).map((f) => ({
    descricao: texto(f.descricaoFaixa), ganhadores: num(f.numeroDeGanhadores) ?? 0, premio: num(f.valorPremio) ?? 0,
  }));
  const extra = texto(j.nomeTimeCoracaoMesSorte).replace(/\s*\/\s*/g, '/');
  return {
    slug, concurso, data, dezenas,
    dezenas2: lista(j.listaDezenasSegundoSorteio),
    trevos: lista(j.trevosSorteados),
    timeCoracao: slug === 'timemania' ? extra || null : null,
    mesSorte: slug === 'diadesorte' ? extra || null : null,
    acumulou: j.acumulado === true,
    faixas,
    proximo: { concurso: num(j.numeroConcursoProximo), data: dataIso(j.dataProximoConcurso), estimativa: num(j.valorEstimadoProximoConcurso) },
    fonte: 'CAIXA',
  };
}

/** Resultado no formato do espelho loteriascaixa-api -> formato único. */
export function doEspelho(slug, j) {
  if (!j || typeof j !== 'object') return null;
  const concurso = num(j.concurso);
  const data = dataIso(j.data);
  let dezenas = lista(j.dezenas);
  let dezenas2 = [];
  // Dupla Sena no espelho: as 12 dezenas juntas (6 do 1º sorteio + 6 do 2º)
  if (slug === 'duplasena' && dezenas.length === 12) { dezenas2 = dezenas.slice(6); dezenas = dezenas.slice(0, 6); }
  if (!concurso || !data || !dezenas.length) return null;
  const faixas = (Array.isArray(j.premiacoes) ? j.premiacoes : []).map((f) => ({
    descricao: texto(f.descricao), ganhadores: num(f.ganhadores) ?? 0, premio: num(f.valorPremio) ?? 0,
  }));
  return {
    slug, concurso, data, dezenas, dezenas2,
    trevos: lista(j.trevos),
    timeCoracao: slug === 'timemania' ? texto(j.timeCoracao).replace(/\s*\/\s*/g, '/') || null : null,
    mesSorte: slug === 'diadesorte' ? texto(j.mesSorte) || null : null,
    acumulou: j.acumulou === true,
    faixas,
    proximo: { concurso: num(j.proximoConcurso), data: dataIso(j.dataProximoConcurso), estimativa: num(j.valorEstimadoProximoConcurso) },
    fonte: 'CAIXA',
  };
}

/** Entre as duas fontes, o concurso mais novo (empate: a da CAIXA). */
export function maisNovo(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.concurso > a.concurso ? b : a;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** "2026-09-27" -> "sábado, 27/09" (dia da semana calculado sem fuso). */
export function dataLonga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DIAS[d.getUTCDay()]}, ${m[3]}/${m[2]}`;
}

/** R$ 45000000 -> "R$ 45 milhões"; 8055220.68 -> "R$ 8,05 milhões"; 2259.58 -> "R$ 2.259,58". */
export function valorCurto(v) {
  if (v == null || !Number.isFinite(v)) return '';
  const fmt = (n, casas) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  if (v >= 1e9) { const b = Math.floor(v / 1e7) / 100; return `R$ ${fmt(b, Number.isInteger(b) ? 0 : 2)} ${b >= 2 ? 'bilhões' : 'bilhão'}`; }
  if (v >= 1e6) { const m = Math.floor(v / 1e4) / 100; return `R$ ${fmt(m, Number.isInteger(m) ? 0 : 2)} ${m >= 2 ? 'milhões' : 'milhão'}`; }
  return `R$ ${fmt(v, 2)}`;
}

/** Texto da faixa principal: "Acumulou!" / "1 ganhador — R$ 8,05 milhões" / "3 ganhadores — R$ 1,2 milhão cada". */
export function faixaPrincipal(r) {
  const f = r.faixas[0];
  if (!f || r.acumulou || f.ganhadores === 0) return { acumulou: true, texto: 'ACUMULOU!' };
  return { acumulou: false, texto: `${f.ganhadores} ${f.ganhadores === 1 ? 'ganhador' : 'ganhadores'} — ${valorCurto(f.premio)}${f.ganhadores > 1 ? ' cada' : ''}` };
}
