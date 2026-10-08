/**
 * Fotos de apoio das artes de humor, charadas, memes, curiosidades, nostalgia e datas comemorativas (F-163).
 * Cada item do banco traz um termo de busca em inglês que combina com o texto (ex.: piada do tomate → "tomatoes");
 * a foto vem do Pexels ou do Pixabay (licenças de uso comercial gratuito; o autor vai no crédito da arte).
 * A foto escolhida de cada termo é guardada no R2 (conteudo/_cache/fotos-v1.json): as telas não trocam de foto a cada
 * rodada, a arte não é redesenhada à toa e a cota gratuita das duas fontes não estoura.
 */
import crypto from 'node:crypto';

export const CACHE_CAMINHO = 'conteudo/_cache/fotos-v1.json';
/** Depois disto a foto do termo é escolhida de novo (a fonte pode ter tirado a imagem do ar). */
export const VALIDADE_DIAS = 60;

const hash = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16);

/** Pexels (v1/search) -> candidatos. Imagem na largura/altura certa para a arte (1920 ou 1080x1920). */
export function candidatosPexels(json, orientacao) {
  return (Array.isArray(json?.photos) ? json.photos : [])
    .filter((f) => f?.id && /^https:\/\/images\.pexels\.com\//.test(f?.src?.original ?? '') && f.width && f.height
      && (orientacao === 'landscape' ? f.width >= f.height : f.height > f.width))
    .map((f) => ({
      id: `pexels-${f.id}`,
      url: `${f.src.original}?auto=compress&cs=tinysrgb&${orientacao === 'landscape' ? 'w=1920' : 'h=1920'}`,
      autor: f.photographer || 'autor', pagina: f.url || 'https://www.pexels.com', fonte: 'Pexels',
    }));
}

/** Pixabay (api/) -> candidatos (a maior versão pública: 1280 px). */
export function candidatosPixabay(json, orientacao) {
  return (Array.isArray(json?.hits) ? json.hits : [])
    .filter((f) => f?.id && /^https:\/\//.test(f?.largeImageURL ?? '') && f.imageWidth && f.imageHeight
      && (orientacao === 'landscape' ? f.imageWidth >= f.imageHeight : f.imageHeight > f.imageWidth))
    .map((f) => ({
      id: `pixabay-${f.id}`, url: f.largeImageURL, autor: f.user || 'autor', pagina: f.pageURL || 'https://pixabay.com', fonte: 'Pixabay',
    }));
}

/** Escolha estável: o mesmo item sempre cai na mesma foto da lista; itens diferentes espalham pela lista. */
export function escolher(candidatos, semente) {
  if (!candidatos.length) return null;
  return candidatos[hash(semente) % candidatos.length];
}

/** Texto do crédito, no mesmo estilo das notícias ("Foto: Fulano · Pexels"). */
export const creditoDaFoto = (f) => (f ? `Foto: ${f.autor} · ${f.fonte}` : '');

/** Chave do cache: termo normalizado + orientação. */
export const chaveDoCache = (termo, orientacao) => `${String(termo).toLowerCase().trim().replace(/\s+/g, ' ')}|${orientacao === 'portrait' ? 'v' : 'h'}`;

/** Cache de fotos por termo: cada termo guarda uma LISTA curta de fotos verificadas (itens diferentes usam fotos diferentes). */
export class CacheDeFotos {
  constructor(dados = {}, agora = () => Date.now()) { this.dados = dados; this.agora = agora; this.sujo = false; }
  obter(termo, orientacao) {
    const e = this.dados[chaveDoCache(termo, orientacao)];
    if (!Array.isArray(e?.fotos) || !e.fotos.length || !e.fotos.every((f) => f?.url)) return null;
    if (this.agora() - Date.parse(e.quando) > VALIDADE_DIAS * 86400e3) return null;
    return e.fotos;
  }
  guardar(termo, orientacao, fotos) {
    this.dados[chaveDoCache(termo, orientacao)] = { fotos, quando: new Date(this.agora()).toISOString() };
    this.sujo = true;
  }
  json() { return JSON.stringify(this.dados); }
  static de(texto, agora) { try { const d = JSON.parse(texto); return new CacheDeFotos(d && typeof d === 'object' && !Array.isArray(d) ? d : {}, agora); } catch { return new CacheDeFotos({}, agora); } }
}

async function pedir(url, cabecalhos) {
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(url, { headers: cabecalhos, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      if ([400, 401, 403].includes(r.status)) return null; // chave inválida: não adianta repetir
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 1500 * t));
  }
  return null;
}

/** A imagem abre mesmo? (arte nunca sai com foto quebrada). */
export async function imagemAbre(url) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-2048' }, signal: AbortSignal.timeout(20000) });
    return (r.ok || r.status === 206) && /^image\//.test(r.headers.get('content-type') ?? '');
  } catch { return false; }
}

/** Quantas fotos verificadas ficam guardadas por termo e orientação. */
export const FOTOS_POR_TERMO = 6;

/**
 * Foto para um termo e uma orientação: cache -> Pexels -> Pixabay. Devolve null se nada servir (a arte usa o degradê).
 * Na 1ª vez do termo busca e verifica até 6 fotos; depois, `semente` (a chave do item) escolhe uma delas — o mesmo item
 * sempre cai na mesma foto e itens diferentes do mesmo termo espalham pela lista.
 */
export async function buscarFoto({ pexels, pixabay }, cache, termo, orientacao, semente, { pedirJson = pedir, abre = imagemAbre } = {}) {
  let lista = cache.obter(termo, orientacao);
  if (!lista) {
    const candidatos = [];
    if (pexels) candidatos.push(...candidatosPexels(await pedirJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(termo)}&orientation=${orientacao}&size=large&per_page=30`, { Authorization: pexels }), orientacao));
    if (pixabay) candidatos.push(...candidatosPixabay(await pedirJson(`https://pixabay.com/api/?key=${encodeURIComponent(pixabay)}&q=${encodeURIComponent(termo)}&image_type=photo&orientation=${orientacao === 'landscape' ? 'horizontal' : 'vertical'}&safesearch=true&min_width=1000&per_page=30`, {}), orientacao));
    const boas = [];
    const vistos = new Set();
    for (const c of candidatos) {
      if (boas.length >= FOTOS_POR_TERMO) break;
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      if (await abre(c.url)) boas.push(c);
    }
    if (!boas.length) return null;
    cache.guardar(termo, orientacao, boas);
    lista = boas;
  }
  return escolher(lista, semente);
}
