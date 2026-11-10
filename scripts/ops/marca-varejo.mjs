/**
 * Missão do catálogo (F-275) — 2ª FONTE DA FOTO OFICIAL: quando o site da marca não tem foto aproveitável (ou recusa robôs),
 * a mesma foto de embalagem que o FABRICANTE entrega às grandes lojas é lida no catálogo aberto dessas lojas (VTEX), com nome
 * exato, peso e código de barras (EAN), na ordem dos MAIS VENDIDOS.
 *   node scripts/ops/marca-varejo.mjs <pasta marcas> [--grupo=Bebidas] [--segmento=regex] [--marcas=A,B] [--status=pesquisar,...]
 *        [--max-marcas=N] [--por-marca=120] [--saida=../marcas-v3]
 * ORDEM DAS FONTES (regra do dono): 1) site oficial da marca (marca-loja / marca-site) → 2) estas lojas → 3) no encarte, a busca
 * aberta (Open Food Facts, Wikimedia...) → 4) imagem criada por IA. Produto nunca fica sem foto.
 * Respeita o robots.txt de cada loja e NÃO contorna bloqueio (loja que recusa fica de fora). Nada é baixado aqui: cada marca
 * ganha <saida>/<marca>/com-fundo.json, que marca-recortar-local.mjs baixa SÓ PARA O PC, recorta, inspeciona e transforma em link.
 */
import fs from 'node:fs';
import path from 'node:path';
import { naoEProduto } from './nao-e-produto.mjs';

const args = process.argv.slice(2);
const marcasDir = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SAIDA = path.resolve(opt('saida', path.join(marcasDir ?? '.', '..', 'marcas-v3')));
const POR_MARCA = Number(opt('por-marca', 120));
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)', Accept: 'application/json' };

/** Lojas com catálogo aberto e robots.txt que permite a leitura (conferido em 09/11/2026). A mesma lista está no passa-foto. */
export const LOJAS = [
  { nome: 'Pague Menos', dominio: 'www.paguemenos.com.br' },
  { nome: 'Drogarias Pacheco', dominio: 'www.drogariaspacheco.com.br' },
  { nome: 'Drogaria Venancio', dominio: 'www.drogariavenancio.com.br' },
  { nome: 'Drogal', dominio: 'www.drogal.com.br' },
  { nome: 'Drogaria São Paulo', dominio: 'www.drogariasaopaulo.com.br' },
  { nome: 'Savegnago', dominio: 'www.savegnago.com.br' },
  { nome: 'Super Muffato', dominio: 'www.supermuffato.com.br' },
  { nome: 'Covabra', dominio: 'www.covabra.com.br' },
  { nome: 'Mambo', dominio: 'www.mambo.com.br' },
  { nome: 'Divvino', dominio: 'www.divvino.com.br' },
  // F-295 (robots.txt conferido em 10/11/2026: a busca do catálogo é permitida); GBarbosa é rede do Nordeste
  { nome: 'Atacadão', dominio: 'www.atacadao.com.br' },
  { nome: 'GBarbosa', dominio: 'www.gbarbosa.com.br' },
  { nome: 'Prezunic', dominio: 'www.prezunic.com.br' },
  { nome: 'Super Nosso', dominio: 'www.supernosso.com' },
  { nome: 'Giassi', dominio: 'www.giassi.com.br' },
  { nome: 'Super Pague Menos', dominio: 'www.superpaguemenos.com.br' },
];
const BUSCA = '/api/catalog_system/pub/products/search';

const espera = (ms) => new Promise((o) => setTimeout(o, ms));
const buscar = (u, ms = 20000) => fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }).catch(() => null);
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugDe = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const limpar = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const gtinValido = (c) => /^\d{8}$|^\d{12,14}$/.test(String(c ?? '')) && !/^0+$/.test(String(c)) && !/^12345678/.test(String(c));
const pesoDe = (t) => { const m = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i.exec(t); if (!m) return null; const n = Number(m[1].replace(',', '.')); return Math.round(m[2].toLowerCase() === 'kg' ? n * 1000 : n); };
/** kits, combos, fardos, brindes e afins: a foto não é a de UMA embalagem e não serve para o encarte */
const KIT = /\b(kit|combo|leve\s*\d|pague\s*\d|ganhe|brinde|gratis|estojo|fardo|pack|display com|caixa com \d+ (latas|garrafas|unidades)|\d+\s*(latas|garrafas)\b|presente|copo|taca|camiseta|bone|abridor|coqueteleira)\b/i;

/** Remédio que pede receita (a regra do encarte de farmácia é: só isentos de prescrição). Cada loja usa um campo. */
export function pedeReceita(p) {
  const v = (k) => semAcento(JSON.stringify(p[k] ?? '')).toLowerCase();
  const presc = v('Prescrição Médica');
  if (presc && presc !== '""' && !/isent|nao|livre/.test(presc)) return true; // "Sim", "Sem Retenção De Receita", "Com Retenção"
  if (/sim/.test(v('Retenção Receita')) || /sim/.test(v('MedicamentoControlado'))) return true;
  const tipo = v('Tipo de receita');
  if (tipo && tipo !== '""' && !/n\/a|isent|nao/.test(tipo)) return true;
  return false;
}

/** robots.txt do grupo "User-agent: *", com * e $ (igual ao marca-loja.mjs) */
async function robotsDe(dominio) {
  const r = await buscar(`https://${dominio}/robots.txt`);
  if (!r || r.status >= 500 || r.status === 403) return null; // sem resposta ou recusou: a loja fica de fora
  const txt = r.ok ? await r.text().catch(() => '') : '';
  const proibidos = [];
  let vale = false, emGrupo = false;
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.replace(/#.*/, '').match(/^\s*(user-agent|disallow|allow)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') { if (!emGrupo) vale = false; emGrupo = true; if (m[2] === '*') vale = true; continue; }
    emGrupo = false;
    if (vale && k === 'disallow' && m[2]) {
      const fim = m[2].endsWith('$');
      const corpo = (fim ? m[2].slice(0, -1) : m[2]).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      proibidos.push(new RegExp(`^${corpo}${fim ? '$' : ''}`));
    }
  }
  return (p) => !proibidos.some((re) => re.test(p));
}

/** O produto da loja é mesmo da marca da lista? (campo marca da loja, fabricante e nome) */
/** produto de bebida (para marca da lista de Bebidas não trazer, por exemplo, a "Absolut Nutrition" no lugar da vodka) */
export const BEBIDA = /cerve|chopp|vodka|whisk|vinho|espumant|gin|rum|cacha|aguardent|licor|destilad|conhaque|aperitiv|vermute|sake|saque|tequila|ice|drink|refriger|suco|agua|energetic|cha|isotonic|bebida|sidra|brandy|catuaba|batida/;
export function daMarca(marca, fabricante, segmento, p, grupo) {
  const m = norm(marca.replace(/\(.*?\)/g, ''));
  const b = norm(p.brand);
  const nome = norm(p.productName);
  if (!m || !b) return false;
  const marcaBate = b === m || (m.length >= 4 && (b.startsWith(m) || (m.startsWith(b) && b.length >= 4)));
  const fab = norm(String(fabricante ?? '').split(/[(/,]/)[0]);
  const peloFabricante = fab.length >= 4 && (b === fab || fab.startsWith(b) && b.length >= 4) && nome.includes(m);
  if (!marcaBate && !peloFabricante) return false;
  if (grupo === 'Bebidas' && !BEBIDA.test(semAcento(`${p.productName} ${(p.categories ?? []).join(' ')}`).toLowerCase())) return false;
  // nome curto e comum ("51", "Sol", "Original", "Relax"): exige o tipo do produto no nome
  if (m.length <= 4 || /^(original|imperial|modelo|colonia|relax|janeiro|polar|conti|nevada)$/.test(m)) {
    const tipo = norm(String(segmento ?? '').split(/[ ,/]/)[0]).slice(0, 5);
    if (tipo.length >= 4 && !norm(p.productName).includes(tipo) && !norm((p.categories ?? []).join(' ')).includes(tipo)) return false;
  }
  return true;
}

async function lerLoja(loja, marca, fabricante, segmento, receita, grupo) {
  const out = [];
  for (let de = 0; de < 150; de += 50) {
    const r = await buscar(`https://${loja.dominio}${BUSCA}?ft=${encodeURIComponent(marca.replace(/\(.*?\)/g, '').trim())}&O=OrderByTopSaleDESC&_from=${de}&_to=${de + 49}`);
    if (!r?.ok) break;
    const j = await r.json().catch(() => null);
    if (!Array.isArray(j) || !j.length) break;
    for (const p of j) {
      if (!daMarca(marca, fabricante, segmento, p, grupo)) continue;
      if (pedeReceita(p)) { for (const it of p.items ?? []) if (it.ean) receita.add(String(it.ean)); continue; }
      for (const it of (p.items ?? []).slice(0, 3)) {
        const titulo = limpar(it.nameComplete || it.name || p.productName);
        const foto = it.images?.[0]?.imageUrl;
        if (!foto || !titulo || KIT.test(semAcento(titulo)) || naoEProduto(titulo)) continue;
        out.push({ titulo, pagina: p.link || `https://${loja.dominio}/${p.linkText}/p`, url: String(foto).replace(/^http:/, 'https:').replace(/\?.*$/, ''), codigo: gtinValido(it.ean) ? String(it.ean) : undefined, segmento: (p.categories?.[0] ?? '').split('/').filter(Boolean).pop(), loja: loja.nome });
      }
    }
    const total = Number(/\/(\d+)$/.exec(r.headers.get('resources') ?? '')?.[1] ?? 0);
    if (!total || de + 50 >= total) break;
    await espera(250);
  }
  return out;
}

// --- execução direta ---
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (!marcasDir) { console.log('uso: <pasta marcas> [--grupo=] [--segmento=] [--marcas=] [--status=] [--max-marcas=] [--por-marca=] [--saida=]'); process.exit(1); }
  const lista = JSON.parse(fs.readFileSync(path.join(marcasDir, 'lista', 'consolidado.json'), 'utf8'));
  const status = opt('status', 'pesquisar,pronta-para-buscar').split(',');
  const grupo = opt('grupo', ''), seg = opt('segmento', ''), nomes = opt('marcas', '');
  const nota = { alta: 0, media: 1, regional: 1, baixa: 2 };
  let alvos = lista.filter((x) => x.anunciar !== false && status.includes(x.status));
  if (grupo) alvos = alvos.filter((x) => x.grupo === grupo);
  if (seg) { const re = new RegExp(seg, 'i'); alvos = alvos.filter((x) => re.test(`${x.segmento} ${x.subcategoria}`)); }
  if (nomes) { const q = new Set(nomes.split(',').map(norm)); alvos = lista.filter((x) => q.has(norm(x.marca))); }
  // Pernambuco primeiro, depois as mais conhecidas
  alvos.sort((a, b) => (a.prioridade_pe ?? 99) - (b.prioridade_pe ?? 99) || (nota[a.notoriedade] ?? 3) - (nota[b.notoriedade] ?? 3));
  const vistas = new Set();
  alvos = alvos.filter((x) => !vistas.has(norm(x.marca)) && vistas.add(norm(x.marca))).slice(0, Number(opt('max-marcas', 100000)));

  const lojas = [];
  for (const l of LOJAS) { const ok = await robotsDe(l.dominio); if (ok?.(BUSCA)) lojas.push(l); else console.log('fora (robots.txt ou sem resposta):', l.nome); }
  fs.mkdirSync(path.join(marcasDir, 'lista'), { recursive: true });
  const registro = path.join(marcasDir, 'lista', 'varejo.jsonl');
  let k = 0, totalItens = 0;
  const trabalhar = async () => {
    while (k < alvos.length) {
      const x = alvos[k++];
      const receita = new Set();
      const porLoja = await Promise.all(lojas.map((l) => lerLoja(l, x.marca, x.fabricante, x.segmento, receita, x.grupo).catch(() => [])));
      // mesmo produto em várias lojas: vale o primeiro (pelo código de barras; sem código, pelo nome)
      const unicos = new Map();
      for (const it of porLoja.flat()) { if (it.codigo && receita.has(it.codigo)) continue; const chave = it.codigo ?? slugDe(it.titulo); if (!unicos.has(chave)) unicos.set(chave, it); }
      const itens = [...unicos.values()].slice(0, POR_MARCA).map((it, i) => ({
        ...it, slug: `${slugDe(it.titulo)}-v${i}`, peso: pesoDe(it.titulo), marca: x.marca,
        credito: `Imagem oficial ${x.marca} (via ${it.loja})`,
        licenca: 'Imagem do fabricante publicada pela loja; sem autorização formal registrada',
      }));
      const pasta = path.join(SAIDA, slugDe(x.marca) || `marca-${k}`);
      if (itens.length) { fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(path.join(pasta, 'com-fundo.json'), JSON.stringify(itens, null, 1)); }
      totalItens += itens.length;
      fs.appendFileSync(registro, `${JSON.stringify({ marca: x.marca, grupo: x.grupo, pe: x.prioridade_pe ?? null, pasta, itens: itens.length, em: new Date().toISOString() })}\n`);
      console.log(`${x.marca.slice(0, 26).padEnd(27)} ${String(itens.length).padStart(4)} produtos ${itens.length ? `| ${[...new Set(itens.map((i) => i.loja))].join(', ').slice(0, 70)}` : ''}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, trabalhar));
  console.log(`RESULTADO marcas ${alvos.length} | produtos ${totalItens} | lojas ${lojas.map((l) => l.nome).join(', ')}`);
}
