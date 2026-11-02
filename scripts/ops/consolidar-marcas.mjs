/**
 * Missão do catálogo: junta as listas de marcas por segmento, marca a prioridade de Pernambuco e cruza com o catálogo.
 *   node scripts/ops/consolidar-marcas.mjs <pasta marcas>     lê <pasta>/lista/*.json e grava <pasta>/lista/consolidado.json
 */
import fs from 'node:fs';
import { sqlBruto } from './recorte-do-catalogo.mjs';

const pasta = process.argv[2];
if (!pasta) { console.log('uso: node scripts/ops/consolidar-marcas.mjs <pasta marcas>'); process.exit(1); }
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ler = (n) => JSON.parse(fs.readFileSync(`${pasta}/lista/${n}.json`, 'utf8'));
const grupos = { Alimentos: 'alimentos', Bebidas: 'bebidas', 'Perecíveis': 'pereciveis', 'Não alimentos': 'nao-alimentos' };
const pe = ler('pernambuco');
const prioPE = new Map();
for (const x of pe) { const k = norm(x.marca); if (!prioPE.has(k) || x.prioridade_pe < prioPE.get(k)) prioPE.set(k, x.prioridade_pe); }
// sem acesso ao banco, usa a última leitura guardada
const usadas = await sqlBruto("select split_part(split_part(imagem_url,'catalogo/marcas/',2),'/',1) marca, count(distinct imagem_url)::int imagens, count(distinct codigo)::int codigos from public.tabloide_catalogo where fonte='MARCA' group by 1").then((u) => { fs.writeFileSync(`${pasta}/lista/ultima-foto.json`, JSON.stringify(u)); return u; }).catch(() => JSON.parse(fs.readFileSync(`${pasta}/lista/ultima-foto.json`, 'utf8')));
const naBase = new Map(usadas.map((u) => [norm(u.marca), u]));
// a marca entra como "feita" pelo próprio nome; Treloso e demais linhas da Vitarella contam dentro dela
const LINHAS = { 'sao braz': 'braz sao', treloso: 'vitarella', chocoresco: 'vitarella', 'd tone': 'vitarella', delicita: 'vitarella', amori: 'richester', escureto: 'richester', 'animados zoo': 'richester' };
const saida = [];
for (const [grupo, arq] of Object.entries(grupos)) {
  for (const x of ler(arq)) {
    const k = norm(x.marca);
    const semMarca = k === 'sem marca';
    const feita = naBase.get(k) ?? naBase.get(LINHAS[k]);
    const propria = naBase.get(k) ?? (k === 'sao braz' ? naBase.get('braz sao') : null); // linha de outra marca não soma imagens de novo
    saida.push({
      grupo, segmento: x.segmento, subcategoria: x.subcategoria ?? '', marca: x.marca, fabricante: x.fabricante ?? '', site: x.site ?? '', abrangencia: x.abrangencia ?? '',
      notoriedade: x.notoriedade ?? '', variantes: x.variantes ?? [], lista_no_site: x.lista_no_site ?? 'nao_confirmado', confirmado: !!x.confirmado, anunciar: x.anunciar !== false,
      prioridade_pe: semMarca ? null : prioPE.get(k) ?? null,
      status: semMarca ? 'foto-propria' : x.anunciar === false ? 'nao-anunciar' : feita ? 'feita' : x.lista_no_site === 'sim' ? 'pronta-para-buscar' : 'pesquisar',
      imagens: propria?.imagens ?? 0, codigos: propria?.codigos ?? 0,
    });
  }
}
// marcas de Pernambuco que as listas gerais não trouxeram
const conhecidas = new Set(saida.map((x) => norm(x.marca)));
for (const x of pe) {
  const k = norm(x.marca);
  if (conhecidas.has(k) || k.startsWith('sem marca')) continue;
  conhecidas.add(k);
  saida.push({ grupo: 'Pernambuco', segmento: x.segmento, subcategoria: '', marca: x.marca, fabricante: x.fabricante ?? '', site: x.site ?? '', abrangencia: 'regional', notoriedade: 'regional', variantes: x.variantes ?? [], lista_no_site: x.lista_no_site ?? 'nao_confirmado', confirmado: !!x.confirmado, anunciar: true, prioridade_pe: x.prioridade_pe, status: naBase.get(k) ? 'feita' : x.lista_no_site === 'sim' ? 'pronta-para-buscar' : 'pesquisar', imagens: naBase.get(k)?.imagens ?? 0, codigos: naBase.get(k)?.codigos ?? 0 });
}
fs.writeFileSync(`${pasta}/lista/consolidado.json`, JSON.stringify(saida));
// o site reconhece estas marcas para não pedir "marca" em quem escreveu só "Coca-Cola 2L"
const nomesDeMarca = [...new Set(saida.filter((x) => x.confirmado && norm(x.marca) !== 'sem marca' && !norm(x.marca).startsWith('sem marca')).map((x) => norm(x.marca)).filter((m) => m.length >= 3 && m.split(' ').length <= 3))].sort();
fs.writeFileSync(new URL('../../src/lib/tabloide/marcasConhecidas.ts', import.meta.url), `/** Marcas da lista consolidada. Gerado por scripts/ops/consolidar-marcas.mjs: não editar à mão. */\nexport const MARCAS_CONHECIDAS = new Set('${nomesDeMarca.join('|').replace(/'/g, '')}'.split('|'));\n`);
const marcas = new Set(saida.filter((x) => norm(x.marca) !== 'sem marca').map((x) => norm(x.marca)));
const conta = (f) => new Set(saida.filter(f).map((x) => norm(x.marca))).size;
console.log('linhas', saida.length, '| marcas distintas', marcas.size, '| feitas', conta((x) => x.status === 'feita'), '| prontas', conta((x) => x.status === 'pronta-para-buscar'), '| pesquisar', conta((x) => x.status === 'pesquisar'), '| não anunciar', conta((x) => x.status === 'nao-anunciar'), '| itens sem marca', saida.filter((x) => x.status === 'foto-propria').length);
console.log('Pernambuco prioridade 1:', conta((x) => x.prioridade_pe === 1), '| feitas', conta((x) => x.prioridade_pe === 1 && x.status === 'feita'));
const seg = {};
for (const x of saida) { const s = (seg[x.segmento] ??= { g: x.grupo, m: new Set(), f: new Set() }); if (norm(x.marca) !== 'sem marca') s.m.add(norm(x.marca)); if (x.status === 'feita') s.f.add(norm(x.marca)); }
console.log('segmentos', Object.keys(seg).length, Object.entries(seg).filter(([, v]) => v.f.size).map(([k, v]) => `${k}: ${v.f.size}/${v.m.size}`).join(' | '));
