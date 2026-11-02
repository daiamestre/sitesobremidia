/**
 * F-253 — refaz as fotos do catálogo de produtos no padrão profissional: maior foto original que existe, recorte na Cloudflare,
 * inspeção (mesmas contas do site, qualidadeRecorte.ts) e IA de visão. Nada de ruim entra: reprovado continua como estava.
 *   node scripts/ops/refazer-recortes-catalogo.mjs gerar <pasta>     só gera os PNGs e o manifesto na pasta (não mexe em nada)
 *   node scripts/ops/refazer-recortes-catalogo.mjs gravar <pasta>    envia ao R2 e troca no catálogo o que está no manifesto
 * `gerar` guarda em <pasta>/antes.json as fotos atuais: é o rollback do catálogo.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { R2_PUBLICO } from './segredos.mjs';
import { acabamento, realcar, repararMordidas } from '../../src/lib/tabloide/qualidadeRecorte.ts';
import { baixar, enviar, LADO, recortar, sharp, sqlBruto, tamanhoReal, UA } from './recorte-do-catalogo.mjs';

const [modo, pasta] = process.argv.slice(2);
if (!['gerar', 'gravar', 'retocar'].includes(modo) || !pasta) { console.log('uso: gerar|gravar|retocar <pasta>'); process.exit(1); }
fs.mkdirSync(pasta, { recursive: true });
const R2 = /r2\.dev|r2\.cloudflarestorage/;

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (v) => (Array.isArray(v) ? v.join(' ') : String(v ?? ''));
const medidas = (t) => [...norm(t).replace(/(\d),(\d)/g, '$1.$2').matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l|lt|mg)\b/g)].map((m) => m[1] + (m[2] === 'lt' ? 'l' : m[2] === 'gr' ? 'g' : m[2]));
const palavras = (t) => norm(t).replace(/(\d),(\d)/g, '$1.$2').replace(/\b\d+(\.\d+)?\s*(kg|g|gr|ml|l|lt|un|und|mg)\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter((p) => p.length >= 2 && !/^\d+$/.test(p) && !['com', 'sem', 'para', 'por', 'dos', 'das', 'tipo', 'de', 'da', 'do', 'em'].includes(p));
/** Mesma conta do catálogo: tudo que foi pedido precisa aparecer no nome+marca, com a mesma medida. */
function nota(p, ps, ms) {
  const nome = norm(texto(p.product_name)).replace(/[^a-z0-9.,\s]/g, ' ').replace(/(\d)\s+(kg|g|ml|l)\b/g, '$1$2').replace(/,/g, '.');
  const todas = `${nome} ${norm(texto(p.brands)).replace(/[^a-z0-9\s]/g, ' ')} ${norm(texto(p.quantity)).replace(/\s+/g, '')}`;
  const lista = todas.split(/\s+/).filter(Boolean);
  if (!ps.every((w) => lista.includes(w))) return 0;
  for (const m of ms) if (!new RegExp(`(^|[^0-9.])${m.replace('.', '\\.')}($|[^a-z0-9])`).test(todas)) return 0;
  const pos = nome.split(/\s+/).indexOf(ps[0]);
  return 1 + ps.length + (pos === 0 ? 4 : pos === 1 ? 2 : 0);
}
async function buscarFotos(nome) {
  const q = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(`${nome} countries_tags:"en:brazil"`)}&page_size=30&langs=pt&fields=product_name,brands,quantity,image_front_url`;
  const r = await fetch(q, { headers: UA, signal: AbortSignal.timeout(15000) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  const ps = palavras(nome), ms = medidas(nome);
  return (j?.hits ?? []).filter((h) => h.image_front_url).map((h) => ({ u: h.image_front_url, n: nota(h, ps, ms) })).filter((x) => x.n >= 4).sort((a, b) => b.n - a.n).slice(0, 5).map((x) => x.u);
}

async function gerar() {
  const linhas = await sqlBruto('select id, nome, nome_norm, imagem_url, fonte, recortada, cliente_id, origem from public.tabloide_catalogo order by nome');
  fs.writeFileSync(`${pasta}/antes.json`, JSON.stringify(linhas, null, 1));
  const arq = `${pasta}/manifesto.jsonl`;
  // o que a conferência a olho recusou (recusados.txt) sai do manifesto e volta a ser tentado com outra foto; o reprovado também
  const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
  const anteriores = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const excluidas = new Set(anteriores.filter((x) => fora.has(x.arquivo)).map((x) => x.origem));
  const validos = anteriores.filter((x) => x.arquivo && !fora.has(x.arquivo));
  fs.writeFileSync(arq, validos.map((x) => `${JSON.stringify(x)}\n`).join(''));
  const feitos = new Set(validos.map((x) => x.id));
  // a mesma foto em várias chaves (nome e código de barras) sai uma vez só
  const resolvidas = new Map();
  let i = 0;
  const trabalhador = async () => {
    while (i < linhas.length) {
      const l = linhas[i++];
      if (feitos.has(l.id)) continue;
      const nome = l.nome ?? l.nome_norm;
      const chave = norm(nome);
      if (!resolvidas.has(chave)) resolvidas.set(chave, (async () => {
        const atual = R2.test(l.imagem_url) ? [] : [tamanhoReal(l.imagem_url), l.imagem_url];
        const lista = [...new Set([...atual, ...(await buscarFotos(nome)).map(tamanhoReal)])];
        const fotos = [];
        for (const u of lista) { const b = await baixar(u); if (b) fotos.push({ u, ...b, peso: b.area * (atual.includes(u) ? 2 : 1) }); }
        fotos.sort((a, c) => c.peso - a.peso);
        const erros = [];
        for (const f of fotos.filter((x) => !excluidas.has(x.u)).slice(0, 4)) {
          const r = await recortar(f.u, f.b, nome).catch((e) => ({ erro: String(e).slice(0, 80) }));
          if (r.png) { const arquivo = `${crypto.createHash('md5').update(r.png).digest('hex').slice(0, 16)}.png`; fs.writeFileSync(`${pasta}/${arquivo}`, r.png); return { arquivo, origem: f.u, lado: r.origemLado, W: r.W, H: r.H }; }
          erros.push(r.erro);
        }
        return { erros: erros.length ? erros : ['sem foto'] };
      })());
      const r = await resolvidas.get(chave);
      fs.appendFileSync(arq, `${JSON.stringify({ id: l.id, nome, cut: !!l.recortada, ...r })}\n`);
      console.log(i, '/', linhas.length, String(nome).slice(0, 40), r.arquivo ? `OK lado ${r.lado}` : `REPROVADO ${r.erros.join(', ')}`);
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
}

async function gravar() {
  const fora = new Set(fs.existsSync(`${pasta}/recusados.txt`) ? fs.readFileSync(`${pasta}/recusados.txt`, 'utf8').split(/\s+/).filter(Boolean) : []);
  const itens = fs.readFileSync(`${pasta}/manifesto.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.arquivo && !fora.has(x.arquivo));
  const enviados = new Map();
  let n = 0;
  for (const x of itens) {
    if (!enviados.has(x.arquivo)) { const chave = `catalogo/recortes/${x.arquivo}`; await enviar(chave, fs.readFileSync(`${pasta}/${x.arquivo}`)); enviados.set(x.arquivo, `${R2_PUBLICO}${chave}`); }
    // a foto pode ter vindo de outra fonte: o crédito acompanha a foto que entrou
    const fonte = /openfoodfacts/.test(x.origem) ? ", fonte = 'OPENFOODFACTS', credito = 'Open Food Facts (CC BY-SA)'" : '';
    await sqlBruto(`update public.tabloide_catalogo set imagem_url = '${enviados.get(x.arquivo)}', recortada = true, recorte_tentado = true${fonte}, updated_at = now() where id = '${x.id}'`);
    n++;
  }
  console.log('linhas trocadas', n, 'arquivos', enviados.size);
}

/** Recorte antigo sem foto original para refazer: só limpa o contorno e dá nitidez. <pasta>/retocar.json = [{ id, url }]. */
async function retocar() {
  for (const { id, url } of JSON.parse(fs.readFileSync(`${pasta}/retocar.json`, 'utf8'))) {
    const b = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
    const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    const rec = new Uint8ClampedArray(data), foto = new Uint8ClampedArray(data);
    repararMordidas(foto, rec, w, h);
    acabamento(foto, rec, w, h);
    const escala = Math.max(1, Math.min(2.5, LADO / Math.max(w, h)));
    const W = Math.round(w * escala), H = Math.round(h * escala);
    const fin = new Uint8ClampedArray(await sharp(Buffer.from(rec), { raw: { width: w, height: h, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer());
    realcar(fin, W, H, escala > 1 ? 0.8 : 0.4);
    const png = await sharp(Buffer.from(fin), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const chave = `catalogo/recortes/${crypto.createHash('md5').update(png).digest('hex').slice(0, 16)}.png`;
    await enviar(chave, png);
    await sqlBruto(`update public.tabloide_catalogo set imagem_url = '${R2_PUBLICO}${chave}', updated_at = now() where id = '${id}'`);
    fs.writeFileSync(`${pasta}/retocada-${id}.png`, png);
    console.log('retocada', id);
  }
}

await (modo === 'gerar' ? gerar() : modo === 'retocar' ? retocar() : gravar());
