/**
 * Missão do catálogo, Fase 1: traz produtos do Brasil do Open Food Facts em lotes, pela mesma inspeção de recorte do site.
 *   node scripts/ops/importar-open-facts.mjs gerar <pasta> <quantos>   recorta e monta <pasta>/lote-AAAAMMDD (não mexe no catálogo)
 *   node scripts/ops/importar-open-facts.mjs gravar <pasta do lote>     envia ao R2 e cadastra pelo nome e pelo código de barras
 * Antes de gravar, conferir a folha do lote; o que for recusado vai em <pasta do lote>/recusados.txt (um arquivo por linha).
 * Não troca foto que já existe (ON CONFLICT DO NOTHING). Fotos CC BY-SA: crédito e origem ficam gravados.
 */
import fs from 'node:fs';
import { R2_PUBLICO } from './segredos.mjs';
import { chaveCanonica } from '../../src/lib/tabloide/chave.ts';
import { baixar, enviar, recortar, sharp, sqlBruto, tamanhoReal } from './recorte-do-catalogo.mjs';

const EMPRESAS = (process.env.TABLOIDE_EMPRESAS ?? '7d62aaec-e24d-4273-b257-867183cf658c,22345678-1234-1234-1234-123456789012').split(',');
const LADO_MINIMO = 500; // foto menor que isto não sai nítida no encarte
const LICENCA = 'CC BY-SA 3.0 (Open Food Facts)';

/** Categoria do Open Food Facts → segmento de docs/catalogo/segmentos-de-produtos.md e prioridade. A ordem importa. */
const SEGMENTOS = [
  [/infant|baby-milk|baby-formula/, null, 0], // promoção proibida (Lei 11.265/2006): não entra
  [/tobacco|cigarette/, null, 0],
  [/sodas|colas/, 'Refrigerantes', 1],
  [/fruit-juices|nectars|waters|iced-teas|energy-drinks/, 'Sucos, águas e bebidas sem álcool', 1],
  [/beers|wines|spirits|(?<!non-)alcoholic-beverages/, 'Cervejas e bebidas alcoólicas', 1],
  [/coffees|teas|breakfast-cereals|chocolate-powders|cocoa/, 'Café, chá e matinais', 1],
  [/biscuits|cookies|crackers|chips|crisps|salty-snacks|popcorn/, 'Biscoitos e snacks', 1],
  [/chocolates|candies|confectioner|sweet-spreads|bonbons|chewing-gum/, 'Doces, chocolates e bomboniere', 1],
  [/dairies|milks|cheeses|yogurts|butters|margarines|eggs|cream/, 'Laticínios e ovos', 1],
  [/frozen|ice-creams/, 'Congelados e sorvetes', 1],
  [/sausages|hams|cold-cuts|meats|poultries/, 'Frios e embutidos', 1],
  [/sauces|condiments|spices|seasonings|canned|preserves|ketchup|mayonnaise|mustard/, 'Molhos, temperos e conservas', 1],
  [/cereals|rices|beans|legumes|pastas|flours|sugars|vegetable-oils|olive-oils|noodles/, 'Mercearia básica', 1],
  [/breads|bakery/, 'Padaria e confeitaria', 1],
  [/pet-food/, 'Pet shop', 2],
];
const classificar = (cat) => { for (const [re, seg, pri] of SEGMENTOS) if (re.test(cat)) return { seg, pri }; return { seg: null, pri: 2 }; };
const limpo = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const nomeCompleto = (p) => {
  const marca = limpo(p.marca).split(',')[0].trim();
  const base = limpo(p.nome);
  const qtd = limpo(p.quantidade);
  return limpo(`${base}${marca && !base.toLowerCase().includes(marca.toLowerCase()) ? ` ${marca}` : ''}${qtd && !base.toLowerCase().replace(/\s/g, '').includes(qtd.toLowerCase().replace(/\s/g, '')) ? ` ${qtd}` : ''}`).slice(0, 120);
};

async function gerar(pasta, quantos) {
  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lote = `${pasta}/lote-${dia}`;
  fs.mkdirSync(lote, { recursive: true });
  const arq = `${lote}/manifesto.jsonl`;
  const feitos = new Set(fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).codigo) : []);
  // cada tentativa gasta a cota mensal da Cloudflare: o que já foi tentado não volta
  const tentados = `${pasta}/tentados.txt`;
  for (const c of fs.existsSync(tentados) ? fs.readFileSync(tentados, 'utf8').split(/\s+/) : []) if (c) feitos.add(c);
  const noCatalogo = new Set((await sqlBruto('select distinct nome_norm from public.tabloide_catalogo')).map((l) => l.nome_norm));
  const vistos = new Set();
  const fila = [];
  for (const l of fs.readFileSync(`${pasta}/off-brasil.jsonl`, 'utf8').split('\n').filter(Boolean)) {
    const p = JSON.parse(l);
    if (!/^\d{8,14}$/.test(p.codigo) || feitos.has(p.codigo) || !/[a-záàâãéêíóôõúç]{3}/i.test(p.nome)) continue;
    const { seg, pri: base } = classificar(p.categorias);
    if (!base) continue;
    // 789 e 790 são os prefixos do Brasil: o importado fica para o fim da fila
    const pri = /^0?(789|790)/.test(p.codigo) ? base : 3;
    const nome = nomeCompleto(p), chave = chaveCanonica(nome), chaveCod = chaveCanonica(`codigo ${p.codigo}`);
    if (chave.length < 2 || vistos.has(chave) || noCatalogo.has(chave) || noCatalogo.has(chaveCod)) continue;
    vistos.add(chave);
    fila.push({ ...p, nomeFinal: nome, seg, pri });
  }
  fila.sort((a, b) => a.pri - b.pri);
  console.log('produtos novos na fila', fila.length, '| prioridade 1:', fila.filter((x) => x.pri === 1).length);
  const contagem = {};
  fila.forEach((x) => { contagem[x.seg ?? 'sem segmento'] = (contagem[x.seg ?? 'sem segmento'] ?? 0) + 1; });
  fs.writeFileSync(`${pasta}/fila-por-segmento.json`, JSON.stringify(contagem, null, 1));
  // alterna os segmentos: o lote pequeno já cobre um pouco de cada um
  const porSeg = new Map();
  for (const p of fila.filter((x) => x.pri === 1)) { if (!porSeg.has(p.seg)) porSeg.set(p.seg, []); porSeg.get(p.seg).push(p); }
  const ordem = [];
  while ([...porSeg.values()].some((v) => v.length)) for (const v of porSeg.values()) if (v.length) ordem.push(v.shift());
  const alvo = [...ordem, ...fila.filter((x) => x.pri !== 1)];
  let i = 0, aprovados = 0;
  const trabalhador = async () => {
    while (i < alvo.length && aprovados < quantos) {
      const p = alvo[i++];
      fs.appendFileSync(tentados, `${p.codigo}\n`);
      let url = tamanhoReal(p.foto);
      let f = await baixar(url);
      if (!f) { url = p.foto; f = await baixar(url); }
      if (!f) { console.log(i, 'sem foto', p.nomeFinal.slice(0, 40)); continue; }
      const m = await sharp(f.b).metadata();
      if (Math.max(m.width, m.height) < LADO_MINIMO) { console.log(i, 'pequena', m.width, p.nomeFinal.slice(0, 40)); continue; }
      const r = await recortar(url, f.b, p.nomeFinal).catch((e) => ({ erro: String(e).slice(0, 70) }));
      if (!r.png) { console.log(i, 'reprovado', r.erro, p.nomeFinal.slice(0, 40)); continue; }
      const arquivo = `${p.codigo}.png`;
      fs.writeFileSync(`${lote}/${arquivo}`, r.png);
      fs.appendFileSync(arq, `${JSON.stringify({ codigo: p.codigo, nome: p.nomeFinal, seg: p.seg, arquivo, origem: url, W: r.W, H: r.H })}\n`);
      aprovados++;
      console.log(i, 'OK', p.seg, p.nomeFinal.slice(0, 40));
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  console.log('FIM aprovados', aprovados, 'tentados', i);
}

async function gravar(lote) {
  const esc = (s) => String(s ?? '').replace(/'/g, "''");
  const fora = new Set(fs.existsSync(`${lote}/recusados.txt`) ? fs.readFileSync(`${lote}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
  const itens = fs.readFileSync(`${lote}/manifesto.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => !fora.has(x.arquivo));
  let n = 0;
  for (const x of itens) {
    const chave = `catalogo/produtos/${x.arquivo}`;
    await enviar(chave, fs.readFileSync(`${lote}/${x.arquivo}`));
    const url = `${R2_PUBLICO}${chave}`;
    const linhas = EMPRESAS.flatMap((e) => [chaveCanonica(x.nome), chaveCanonica(`codigo ${x.codigo}`)].map((k) =>
      `('${e}', NULL, '${esc(k)}', '${esc(x.nome)}', '${esc(url)}', 'OPENFOODFACTS', 'Open Food Facts (CC BY-SA)', true, true, 'SEMENTE', '${esc(x.origem)}', '${LICENCA}', '${esc(x.codigo)}', ${x.seg ? `'${esc(x.seg)}'` : 'NULL'})`));
    await sqlBruto(`INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem, origem_url, licenca, codigo, segmento) VALUES ${linhas.join(',')} ON CONFLICT DO NOTHING`);
    n++;
  }
  console.log('produtos gravados', n, 'recusados', fora.size);
}

const [modo, pasta, quantos] = process.argv.slice(2);
if (modo === 'gerar' && pasta) await gerar(pasta, Number(quantos ?? 100));
else if (modo === 'gravar' && pasta) await gravar(pasta);
else console.log('uso: gerar <pasta> <quantos> | gravar <pasta do lote>');
