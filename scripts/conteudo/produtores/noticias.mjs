/**
 * Pastas de notícias (F-95): SOBREMÍDIA NEWS, Cinema, Turismo, Esportes e Futebol. Toda notícia com a foto da própria
 * notícia e o crédito/fonte na tela (decisão do proprietário, F-91). 10 notícias por pasta, fontes intercaladas.
 * Cada notícia é um item próprio da pasta (chave = hash do link): entra quando surge e sai quando fica velha.
 */
import crypto from 'node:crypto';
import { esc, cortar, pagina } from '../arte-base.mjs';
import { lerFeed, completarImagens } from '../rss.mjs';

export const FONTES_RSS = {
  noticias: { selo: 'SOBREMÍDIA NEWS', fontes: [['Agência Brasil', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml'], ['g1', 'https://g1.globo.com/rss/g1/']] },
  cinema: { selo: 'CINEMA', fontes: [['g1', 'https://g1.globo.com/rss/g1/pop-arte/cinema/'], ['CinePOP', 'https://cinepop.com.br/feed/']] },
  turismo: { selo: 'TURISMO', fontes: [['g1', 'https://g1.globo.com/rss/g1/turismo-e-viagem/'], ['Viagem e Turismo', 'https://viagemeturismo.abril.com.br/feed/']] },
};
export const POR_PASTA = 10;
const FUTEBOL = /futebol|brasileir|copa do|copa sul|libertadores|sul-americana|seleção|sele[cç]ão|\bgol|técnico|atacante|zagueiro|goleiro|meia |premier league|champions|la liga|flamengo|palmeiras|corinthians|são paulo|santos|vasco|botafogo|fluminense|grêmio|internacional|cruzeiro|atlético|bahia|fortaleza|real madrid|barcelona|neymar|vini/i;

/** Intercala as listas (1ª de cada fonte, depois 2ª…), sem repetir título. */
export function intercalar(listas, n) {
  const out = []; const vistos = new Set();
  for (let i = 0; out.length < n && listas.some((l) => i < l.length); i++) {
    for (const l of listas) {
      const it = l[i];
      if (!it || out.length >= n) continue;
      const k = it.titulo.toLowerCase().slice(0, 60);
      if (vistos.has(k)) continue;
      vistos.add(k); out.push(it);
    }
  }
  return out;
}

export function creditoNoticia(n) {
  const c = (n.credito ?? '').trim();
  if (!c) return `Imagem e notícia: ${n.fonte}`;
  const base = /^arte\b/i.test(c) ? c : `Foto: ${c}`;
  return c.toLowerCase().includes(String(n.fonte).toLowerCase()) ? base : `${base} · ${n.fonte}`;
}

export function htmlNoticia(n, selo, w, h) {
  const v = h > w;
  const css = `
.meio{flex:1}
.bloco{display:flex;flex-direction:column;gap:${v ? 26 : 18}px;${v ? '' : 'max-width:86%'}}
.titulo{font-weight:900;line-height:1.06;font-size:${v ? 70 : 66}px;text-shadow:0 4px 18px rgba(0,0,0,.55)}
.resumo{font-weight:600;line-height:1.3;font-size:${v ? 38 : 32}px;opacity:.93;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.cred{font-weight:600;font-size:${v ? 26 : 22}px;opacity:.8;margin-top:${v ? 18 : 12}px}
.foto{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:28px;box-shadow:0 20px 60px rgba(0,0,0,.5);margin-top:40px}
.fundo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.borrao{position:absolute;inset:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(40px) brightness(.45)}`;
  const texto = `<div class="bloco"><div class="titulo">${esc(cortar(n.titulo, v ? 150 : 130))}</div>${n.resumo ? `<div class="resumo">${esc(cortar(n.resumo, v ? 230 : 190))}</div>` : ''}</div>`;
  const corpo = v
    ? `<img class="foto" src="${esc(n.imagem)}"><div class="cred" style="text-align:right">${esc(creditoNoticia(n))}</div><div class="meio" style="display:flex;align-items:center">${texto}</div>`
    : `<div class="meio"></div>${texto}<div class="cred">${esc(creditoNoticia(n))}</div>`;
  const html = pagina({ w, h, fundo: '#0b0620', selo, corpo, css, escuro: v ? 0.2 : 0.45 });
  // a foto vai por baixo de tudo (horizontal: tela cheia; vertical: a mesma foto desfocada no fundo)
  return html.replace('<body>', `<body><img class="${v ? 'borrao' : 'fundo'}" src="${esc(n.imagem)}">`);
}

const chaveDe = (link) => 'n-' + crypto.createHash('md5').update(link).digest('hex').slice(0, 12);

async function feed(url, fonte) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SobreMidiaConteudo/1.0)' }, signal: AbortSignal.timeout(20000) });
    return r.ok ? lerFeed(await r.text(), fonte) : [];
  } catch { return []; }
}

/** Notícias por pasta: { noticias: [itens], cinema: [...], turismo: [...], esportes: [...], futebol: [...] } */
export async function produzirNoticias({ esportesNews }) {
  const out = {};
  for (const [conteudo, cfg] of Object.entries(FONTES_RSS)) {
    const listas = [];
    for (const [fonte, url] of cfg.fontes) listas.push(await completarImagens((await feed(url, fonte)).slice(0, 20)));
    const escolhidas = intercalar(listas.map((l) => l.filter((x) => x.imagem)), POR_PASTA);
    out[conteudo] = escolhidas.map((n) => ({ chave: chaveDe(n.link), nome: cortar(n.titulo, 90), descricao: `${n.fonte} — ${n.link}`, html: (w, h) => htmlNoticia(n, cfg.selo, w, h) }));
  }
  // Esportes e Futebol: as notícias do motor (Agência Brasil + ge), já com foto e crédito
  const esp = (esportesNews?.itens ?? []).map((i) => ({ titulo: i.titulo, resumo: i.resumo, imagem: i.imagem, credito: i.creditoImagem, fonte: i.fonte, link: i.id }));
  out.esportes = esp.slice(0, POR_PASTA).map((n) => ({ chave: chaveDe(n.link), nome: cortar(n.titulo, 90), descricao: n.fonte, html: (w, h) => htmlNoticia(n, 'ESPORTES', w, h) }));
  out.futebol = esp.filter((n) => FUTEBOL.test(`${n.titulo} ${n.resumo ?? ''}`)).slice(0, POR_PASTA)
    .map((n) => ({ chave: chaveDe(n.link), nome: cortar(n.titulo, 90), descricao: n.fonte, html: (w, h) => htmlNoticia(n, 'FUTEBOL', w, h) }));
  return out;
}
