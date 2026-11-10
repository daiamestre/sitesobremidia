/**
 * F-277 — FOTOS DE QUITANDA E HORTIFRÚTI (frutas, legumes, verduras, temperos, ovos e cogumelos) para os encartes e palcos.
 * Ordem do dono: foto VERDADEIRA, em alta, sem sombra, sem reflexo, sem recorte falho. Para cada produto da LISTA:
 *   1) procura nos catálogos abertos dos mercados (os mesmos de marca-varejo.mjs, robots.txt respeitado) só na seção de hortifrúti;
 *   2) baixa as candidatas SÓ PARA O PC (../hortifruti), exige lado ≥ 800 px;
 *   3) recorte do site (recortarFundo) + selos soltos + inspeção (qualidadeRecorte) + CONFERÊNCIA DUPLA com a IA (BiRefNet):
 *      parte comida ou sombra/reflexo/sobra = recusada;
 *   4) fica a MAIOR foto aprovada; sem aprovada, o produto fica sem foto (melhor que foto ruim) e vai para a lista de faltas.
 *   node scripts/ops/hortifruti-fotos.mjs buscar [--so=banana-prata,...]   → ../hortifruti/<produto>/escolhida.json + folha rev.png
 *   node scripts/ops/hortifruti-fotos.mjs gravar                           → grava POR LINK no catálogo (nome, "kg" e "un")
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { linkDaFoto } from './passa-foto.mjs';
import { LOJAS } from './marca-varejo.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const jiti = require('jiti')(import.meta.filename);
const RAIZ = path.resolve(import.meta.dirname, '../..');
const SAIDA = path.resolve(RAIZ, '..', 'hortifruti');
const { recortarFundo, apagarSelosSoltos, caixaOpaca } = jiti('../../src/lib/tabloide/recorte.ts');
const { repararMordidas, inspecionar } = jiti('../../src/lib/tabloide/qualidadeRecorte.ts');
const { chaveCanonica } = jiti('../../src/lib/tabloide/chave.ts');

export const LISTA = {
  Frutas: ['Banana Prata', 'Banana Nanica', 'Banana da Terra', 'Banana Maçã', 'Banana Ouro', 'Lima da Pérsia', 'Limão Cravo', 'Maçã Argentina', 'Pera Portuguesa', 'Maracujá Doce', 'Jaca', 'Maçã Gala', 'Maçã Fuji', 'Maçã Verde', 'Pera Williams', 'Laranja Pera', 'Laranja Lima', 'Laranja Bahia', 'Tangerina Ponkan', 'Mexerica Murcote', 'Limão Taiti', 'Limão Siciliano', 'Mamão Formosa', 'Mamão Papaya', 'Melancia', 'Melão Amarelo', 'Abacaxi Pérola', 'Manga Palmer', 'Manga Tommy', 'Manga Espada', 'Uva Thompson', 'Uva Vitória', 'Uva Niágara', 'Uva Crimson', 'Morango', 'Kiwi', 'Abacate', 'Goiaba Vermelha', 'Maracujá Azedo', 'Coco Verde', 'Coco Seco', 'Caqui', 'Ameixa', 'Pêssego', 'Nectarina', 'Acerola', 'Caju', 'Pitaya', 'Graviola', 'Carambola', 'Figo', 'Mirtilo', 'Framboesa', 'Lichia', 'Romã', 'Cereja', 'Jabuticaba', 'Atemoia', 'Pinha'],
  Legumes: ['Tomate', 'Tomate Italiano', 'Tomate Cereja', 'Batata', 'Batata Doce', 'Batata Doce Roxa', 'Batata Doce Branca', 'Batata Baroa', 'Mandioca', 'Cebola', 'Cebola Roxa', 'Alho', 'Alho Roxo', 'Abóbora Paulista', 'Pimenta de Cheiro', 'Pimenta Dedo-de-moça', 'Pimenta Biquinho', 'Ervilha Torta', 'Cenoura', 'Beterraba', 'Abóbora Cabotiá', 'Abóbora Moranga', 'Abobrinha', 'Berinjela', 'Chuchu', 'Pepino', 'Pepino Japonês', 'Pimentão Verde', 'Pimentão Vermelho', 'Pimentão Amarelo', 'Quiabo', 'Maxixe', 'Jiló', 'Vagem', 'Milho Verde', 'Inhame', 'Gengibre', 'Cará', 'Rabanete', 'Nabo'],
  Verduras: ['Alface Crespa', 'Alface Americana', 'Alface Roxa', 'Rúcula', 'Agrião', 'Couve Manteiga', 'Couve-flor', 'Brócolis', 'Repolho Verde', 'Repolho Roxo', 'Espinafre', 'Acelga', 'Salsa', 'Cebolinha', 'Coentro', 'Cheiro-verde', 'Hortelã', 'Manjericão', 'Alho-poró', 'Salsão', 'Cheiro-verde'],
  Outros: ['Ovos Brancos', 'Ovos Vermelhos', 'Cogumelo Champignon', 'Cogumelo Shimeji'],
};
/** mercados com seção de hortifrúti aberta (robots.txt conferido em 09/11/2026); a rede Hortifruti primeiro */
const LOJAS_HORTI = [
  { nome: 'Hortifruti', dominio: 'www.hortifruti.com.br' }, { nome: 'Giassi', dominio: 'www.giassi.com.br' }, { nome: 'Super Nosso', dominio: 'www.supernosso.com.br' },
  { nome: 'Super Pague Menos', dominio: 'www.superpaguemenos.com.br' },
  ...LOJAS.filter((l) => !/drog|pague|divvino/i.test(l.dominio)),
];
const UA = { 'User-Agent': 'SobreMidia-Catalogo/1.0 (contato@sobremidia.com.br)', Accept: 'application/json' };
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugDe = (t) => semAcento(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SECAO = /horti|frut|legum|verdur|hortal|tempero|ovo|granja|cogumel|folhos|mercearia|frios/;
/** foto que não é o produto in natura (doce, suco, polpa, congelado, embalagem de marca); bandeja vale (morango, tomate-cereja) */
const FORA = /\b(polpa|suco|doce|geleia|desidratad|congelad|chips|farinha|organic|organico|org\b|turma da|picad|ralad|cozid|em conserva|conserva|cristaliz|seca\b|passa|xarope|mix|salada|higienizad|fatiad|cubos|baby|mini|kit)/;

/** o nome da loja é SÓ o produto in natura: tirando as palavras do produto, sobra só peso, unidade e afins */
const PERMITIDAS = /^(\d+([.,]\d+)?|\d+(kg|g|gr|un|und)|inglesa|lavada|asterix|monalisa|comum|classe|escovada|vermelha|vermelhos?|branca|brancos?|caipira|unid|cartela|bdj|pct|pacote|kg|g|gr|grs|un|und|unid|unidade|unidades|granel|aprox|aproximadamente|peso|por|ate|de|da|do|a|o|e|com|nacional|importad[oa]s?|selecionad[oa]s?|especial|extra|tipo|fresc[oa]s?|in|natura|graud[oa]s?|miud[oa]s?|madur[oa]s?|premium|grandes?|medi[oa]s?|pequen[oa]s?|duzia|dz|c|cx|bandeja|maço|maco|pe|cabeca|cacho|mao|molho)$/;
export function inNatura(n, palavras) {
  const t = n.split(/[^a-z0-9.,]+/).filter(Boolean);
  if (!palavras.every((w) => t.includes(w) || t.includes(`${w}s`))) return false;
  return t.filter((w) => !palavras.includes(w) && !palavras.includes(w.replace(/s$/, '')) && !PERMITIDAS.test(w)).length === 0;
}

/** F-291: como as lojas chamam o mesmo produto (batata-doce roxa = rosada; salsão = aipo; salsa = salsinha; cheiro-verde = tempero verde) */
const NOMES_NAS_LOJAS = { 'Batata Doce Roxa': ['Batata Doce Roxa', 'Batata Doce Rosada'], 'Batata Doce Branca': ['Batata Doce Branca'], 'Batata Doce': ['Batata Doce', 'Batata Doce Rosada'], 'Salsão': ['Salsão', 'Aipo'], 'Salsa': ['Salsa', 'Salsinha'], 'Cheiro-verde': ['Cheiro Verde', 'Tempero Verde'], 'Coentro': ['Coentro'], 'Agrião': ['Agrião'], 'Uva Niágara': ['Uva Niágara', 'Uva Niagara Rosada'] };
/** F-291: folhas e temperos têm contorno irregular por natureza (não é recorte falho) */
export const FOLHAS = /\b(coentro|salsa|salsinha|cebolinha|cheiro|agriao|salsao|aipo|rucula|hortela|manjericao|alface|couve|espinafre|acelga|alho poro|alho-poro)\b/;

async function buscarCandidatas(nome) {
  const nomes = NOMES_NAS_LOJAS[nome] ?? [nome];
  const todas = [];
  for (const n of nomes) todas.push(...await buscarCandidatasDe(n));
  const vistas = new Set();
  return todas.filter((c) => !vistas.has(c.url) && vistas.add(c.url)).slice(0, 16);
}

async function buscarCandidatasDe(nome) {
  const palavras = semAcento(nome).replace(/-/g, ' ').split(/\s+/).filter((p) => p.length > 1);
  const out = [];
  for (const loja of LOJAS_HORTI) {
    const r = await fetch(`https://${loja.dominio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(nome)}&_from=0&_to=29`, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r?.ok) continue;
    const j = await r.json().catch(() => []);
    for (const p of Array.isArray(j) ? j : []) {
      const n = semAcento(p.productName).replace(/-/g, ' ');
      // F-291: a palavra pedida não conta como industrializado ("Batata DOCE" não é doce de leite)
      const resto = n.split(/\s+/).filter((w) => !palavras.includes(w)).join(' ');
      if (!SECAO.test(semAcento((p.categories ?? []).join(' '))) || FORA.test(resto) || !inNatura(n, palavras)) continue;
      for (const img of (p.items?.[0]?.images ?? []).slice(0, 2)) out.push({ titulo: p.productName, pagina: p.link, url: String(img.imageUrl).replace(/^http:/, 'https:').replace(/\?.*$/, ''), loja: loja.nome });
    }
  }
  const vistas = new Set();
  return out.filter((c) => !vistas.has(c.url) && vistas.add(c.url)).slice(0, 14);
}

let modelo = null, processador = null, RawImage = null;
async function ia() {
  if (modelo) return;
  const t = await import(pathToFileURL(path.join(RAIZ, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href);
  t.env.cacheDir = path.resolve(RAIZ, '..', 'modelos-ia');
  modelo = await t.AutoModel.from_pretrained('studioludens/birefnet-lite-512', { dtype: 'fp32' });
  processador = await t.AutoProcessor.from_pretrained('studioludens/birefnet-lite-512');
  RawImage = t.RawImage;
}

/** recorte + inspeção + conferência dupla com a IA; devolve a avaliação ou o motivo da recusa */
/** máscara da IA (BiRefNet) no tamanho da foto, 0–255 */
async function mascaraDaIA(data, w, h) {
  await ia();
  const rgb = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).removeAlpha().raw().toBuffer();
  const { pixel_values } = await processador(new RawImage(new Uint8ClampedArray(rgb), w, h, 3));
  const saida = await modelo({ input_image: pixel_values });
  return (await RawImage.fromTensor((saida.logits ?? saida.output_image)[0].sigmoid().mul(255).to('uint8')).resize(w, h)).data;
}

/** o resultado aprovado: caixa de corte do link e a prévia (só no PC) */
async function aprovado(recorte, w, h, selos, via) {
  const c = caixaOpaca(recorte, w, h, true);
  if (!c) return { motivo: 'vazio' };
  const folga = Math.round(Math.max(c.w, c.h) * (selos ? 0.01 : 0.03));
  const caixa = { left: Math.max(0, c.x - folga), top: Math.max(0, c.y - folga), width: 0, height: 0 };
  caixa.width = Math.min(w - caixa.left, c.w + folga * 2); caixa.height = Math.min(h - caixa.top, c.h + folga * 2);
  const previa = await sharp(Buffer.from(recorte.buffer), { raw: { width: w, height: h, channels: 4 } }).extract({ left: c.x, top: c.y, width: c.w, height: c.h }).resize(600, 600, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
  return { ok: true, via, area: c.w * c.h, caixa: (c.w * c.h) / (w * h) >= 0.6 && !selos ? null : caixa, previa };
}

/**
 * Recorte + inspeção + conferência dupla. Caminho 1: fundo liso (recorte do site) que a IA confirma. Caminho 2 (F-286, frescos e
 * fotos com sombra/fundo não liso): o recorte da PRÓPRIA IA — o mesmo tipo de recorte que a Cloudflare e o Removedor da SOBRE MÍDIA
 * fazem — aprovado só se a máscara é firme (contorno nítido), o produto ocupa uma área razoável e passa na inspeção de qualidade.
 */
export async function avaliar(buf, { folhas = false } = {}) {
  // F-291: em folhas/temperos o contorno irregular é natural (a conferência humana decide)
  const semFolha = (d) => (folhas ? d.filter((x) => x !== 'contorno-irregular') : d);
  const meta = await sharp(buf).metadata();
  if (!meta.width || Math.min(meta.width, meta.height) < 800) return { motivo: 'baixa resolução' };
  const { data, info } = await sharp(buf).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const foto = new Uint8ClampedArray(data), recorte = new Uint8ClampedArray(data);
  const m = await mascaraDaIA(data, w, h);
  let motivo1 = '';
  if (recortarFundo({ data: recorte, width: w, height: h })) {
    const antes = new Uint8ClampedArray(recorte);
    const selos = apagarSelosSoltos(recorte, w, h);
    repararMordidas(foto, recorte, w, h);
    const ins = inspecionar(recorte, w, h, foto);
    if (ins.aprovado || semFolha(ins.defeitos).length === 0) {
      let produto = 0, comido = 0, sobra = 0;
      for (let i = 0; i < w * h; i++) {
        const mi = antes[i * 4 + 3] >= 16 && recorte[i * 4 + 3] < 16 ? 0 : m[i], a = recorte[i * 4 + 3];
        if (mi >= 128) produto++;
        if (mi >= 230 && a < 16) comido++; else if (mi <= 25 && a >= 128) sobra++;
      }
      produto = Math.max(1, produto);
      if (comido / produto <= 0.002 && sobra / produto <= 0.008) return aprovado(recorte, w, h, selos, 'recorte+IA');
      motivo1 = comido / produto > 0.002 ? `parte comida ${(comido / produto * 100).toFixed(1)}%` : `sombra/reflexo ${(sobra / produto * 100).toFixed(1)}%`;
    } else motivo1 = ins.defeitos.join('+');
  } else motivo1 = 'fundo não é liso';
  // caminho 2: o recorte da IA
  const ia2 = new Uint8ClampedArray(data);
  let firme = 0, meio = 0;
  for (let i = 0; i < w * h; i++) { const v = m[i]; ia2[i * 4 + 3] = v < 12 ? 0 : v > 243 ? 255 : v; if (v >= 128) firme++; else if (v > 30) meio++; }
  const fracao = firme / (w * h);
  if (fracao < 0.06 || fracao > 0.92) return { motivo: `${motivo1}; IA: área ${(fracao * 100).toFixed(0)}%` };
  if (meio / Math.max(1, firme) > 0.12) return { motivo: `${motivo1}; IA: contorno incerto` };
  const selos2 = apagarSelosSoltos(ia2, w, h);
  const ins2 = inspecionar(ia2, w, h, foto);
  if (!ins2.aprovado && semFolha(ins2.defeitos).length) return { motivo: `${motivo1}; IA: ${ins2.defeitos.join('+')}` };
  return aprovado(ia2, w, h, selos2, 'IA');
}

const direto = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
const [modo] = direto ? process.argv.slice(2) : ['importado'];
const so = (process.argv.find((a) => a.startsWith('--so=')) ?? '').slice(5).split(',').filter(Boolean);
if (modo === 'buscar') {
  fs.mkdirSync(SAIDA, { recursive: true });
  const faltas = [];
  for (const [grupo, nomes] of Object.entries(LISTA)) for (const nome of nomes) {
    const slug = slugDe(nome);
    if (so.length && !so.includes(slug)) continue;
    const pasta = path.join(SAIDA, slug);
    if (!so.length && fs.existsSync(path.join(pasta, 'escolhida.json'))) continue;
    fs.mkdirSync(pasta, { recursive: true });
    const cands = await buscarCandidatas(nome);
    let melhor = null;
    const motivos = [];
    for (const [k, c] of cands.entries()) {
      const r = await fetch(c.url, { headers: { ...UA, Accept: 'image/*' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
      if (!r?.ok) { motivos.push('não abriu'); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(path.join(pasta, `c${k}${path.extname(new URL(c.url).pathname) || '.jpg'}`), buf);
      const a = await avaliar(buf, { folhas: FOLHAS.test(semAcento(nome)) }).catch((e) => ({ motivo: `erro ${String(e?.message ?? e).slice(0, 30)}` }));
      if (!a.ok) { motivos.push(a.motivo); continue; }
      if (!melhor || a.area > melhor.area) melhor = { ...c, ...a, k };
    }
    if (melhor) {
      fs.writeFileSync(path.join(pasta, 'previa.png'), melhor.previa);
      fs.writeFileSync(path.join(pasta, 'escolhida.json'), JSON.stringify({ nome, grupo, titulo: melhor.titulo, pagina: melhor.pagina, url: melhor.url, loja: melhor.loja, link: linkDaFoto(melhor.url, melhor.caixa, true) }, null, 1));
    } else faltas.push(nome);
    console.log(`${nome.padEnd(22)} ${melhor ? `OK (${melhor.loja})` : 'SEM FOTO APROVADA'} | candidatas ${cands.length} | recusas ${motivos.slice(0, 4).join(', ')}`);
  }
  fs.writeFileSync(path.join(SAIDA, 'faltas.json'), JSON.stringify(faltas, null, 1));
  // folha de conferência visual: todas as escolhidas sobre fundo magenta
  const escolhidas = fs.readdirSync(SAIDA).filter((d) => fs.existsSync(path.join(SAIDA, d, 'previa.png')));
  for (let f = 0; f * 24 < escolhidas.length; f++) {
    const comp = await Promise.all(escolhidas.slice(f * 24, f * 24 + 24).map(async (d, i) => ({ input: await sharp(path.join(SAIDA, d, 'previa.png')).resize(290, 290, { fit: 'contain', background: { r: 255, g: 43, b: 214, alpha: 1 } }).flatten({ background: '#ff2bd6' }).png().toBuffer(), left: (i % 6) * 300, top: Math.floor(i / 6) * 300 })));
    await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#ff2bd6' } }).composite(comp).png().toFile(path.join(SAIDA, `rev${f}.png`));
  }
  console.log(`RESULTADO aprovados ${escolhidas.length} | sem foto ${faltas.length}: ${faltas.join(', ')}`);
} else if (modo === 'gravar') {
  const { sqlBruto } = await import('./recorte-do-catalogo.mjs');
  const esc = (s) => String(s ?? '').replace(/'/g, "''");
  const EMPRESAS = (await sqlBruto(`select distinct empresa_operadora_id id from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null`)).map((l) => l.id);
  const recusados = new Set(fs.existsSync(path.join(SAIDA, 'recusados.txt')) ? fs.readFileSync(path.join(SAIDA, 'recusados.txt'), 'utf8').split(/\s+/).filter(Boolean) : []);
  let n = 0;
  for (const d of fs.readdirSync(SAIDA)) {
    const arq = path.join(SAIDA, d, 'escolhida.json');
    if (!fs.existsSync(arq) || recusados.has(d) || (so.length && !so.includes(d))) continue;
    const e = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const r = await fetch(e.link, { signal: AbortSignal.timeout(40000) }).catch(() => null);
    if (!r?.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) { console.log('link não abriu:', e.nome); continue; }
    await r.body?.cancel();
    const chaves = [...new Set([e.nome, `${e.nome} kg`, `${e.nome} un`].map(chaveCanonica))];
    const linhas = EMPRESAS.flatMap((emp) => chaves.map((k) => `('${emp}', NULL, '${esc(k)}', '${esc(e.nome)}', '${esc(e.link)}', 'MARCA', '${esc(`Foto do produto (via ${e.loja})`)}', true, true, 'SEMENTE', '${esc(e.pagina)}', 'Foto publicada pela loja; sem autorização formal registrada', NULL, 'hortifruti')`));
    await sqlBruto(`INSERT INTO public.tabloide_catalogo (empresa_operadora_id, cliente_id, nome_norm, nome, imagem_url, fonte, credito, recortada, recorte_tentado, origem, origem_url, licenca, codigo, segmento) VALUES ${linhas.join(',')} ON CONFLICT (empresa_operadora_id, COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), nome_norm) DO UPDATE SET imagem_url = EXCLUDED.imagem_url, fonte = EXCLUDED.fonte, credito = EXCLUDED.credito, recortada = true, recorte_tentado = true, origem_url = EXCLUDED.origem_url, licenca = EXCLUDED.licenca, segmento = EXCLUDED.segmento, updated_at = now()`);
    n++;
  }
  console.log('produtos de hortifrúti gravados', n);
} else if (modo !== 'importado') console.log('uso: buscar [--so=...] | gravar');
