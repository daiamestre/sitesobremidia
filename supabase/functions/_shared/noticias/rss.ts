/**
 * Leitor do RSS da Agência Brasil (CC BY 4.0) para o motor de notícias. Código puro (Edge Function + testes).
 * Título, resumo e (para fontes cuja licença cobre a imagem do feed) a imagem do item — ver fotos.ts (F-90).
 * Agência Brasil: a imagem do feed NÃO é usada (sem crédito; parte é de terceiros); a foto vem da matéria, só se própria.
 */
export interface NoticiaRss {
  guid: string;
  titulo: string;
  resumo: string;
  link: string;
  publicadoEm: string;       // ISO UTC
  autor: string | null;
  /** Imagem que veio no item do feed (https) — só usada por fonte com imagem = 'feed'. */
  imagem: string | null;
}

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#039;': "'", '&nbsp;': ' ', '&amp;': '&' };

export function decodificar(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, v: string) => {
      const n = v.startsWith('x') || v.startsWith('X') ? parseInt(v.slice(1), 16) : parseInt(v, 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&(lt|gt|quot|apos|#039|nbsp|amp);/g, (m) => ENTIDADES[m] ?? m);
}

// Tag removida vira espaço; espaço que sobra antes de pontuação ("São Paulo .") é retirado.
const semTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim();

/** Primeiro parágrafo de texto (sem logo, pixels de rastreio, links "relacionadas"), até ~240 caracteres. */
export function resumoDe(descricaoHtml: string, limite = 240): string {
  const html = decodificar(decodificar(descricaoHtml))
    .replace(/<h3[\s\S]*$/i, '')                 // "Notícias relacionadas" em diante
    .replace(/<img[^>]*>/gi, '')                  // logo e pixels de rastreio
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  const paragrafos = html.split(/<\/p>/i).map(semTags).filter((t) => t.length >= 40);
  const texto = (paragrafos[0] ?? semTags(html)).trim();
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const fimFrase = corte.lastIndexOf('. ');
  return (fimFrase > limite * 0.6 ? corte.slice(0, fimFrase + 1) : corte.slice(0, corte.lastIndexOf(' ')) + '…').trim();
}

/** URL https segura (sem espaço/aspas); "&amp;" do XML vira "&". */
export const soHttps = (u: string | null | undefined): string | null => {
  const v = (u ?? '').trim().replace(/&amp;/g, '&');
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
};

/** Imagem do item do feed: media:content/media:thumbnail/enclosure de imagem ou o primeiro <img> da descrição. */
export function imagemDoItem(bloco: string): string | null {
  for (const m of bloco.matchAll(/<media:content\b([^>]*)>/gi)) {
    const a = m[1];
    const url = /\burl="([^"]+)"/i.exec(a)?.[1];
    const tipo = /\btype="([^"]+)"/i.exec(a)?.[1] ?? '';
    const meio = /\bmedium="([^"]+)"/i.exec(a)?.[1] ?? '';
    if (meio === 'image' || tipo.startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(url ?? '')) {
      const ok = soHttps(url); if (ok) return ok;
    }
  }
  for (const m of bloco.matchAll(/<(?:media:thumbnail|enclosure)\b([^>]*)>/gi)) {
    const a = m[1];
    const tipo = /\btype="([^"]+)"/i.exec(a)?.[1] ?? '';
    if (/<enclosure/i.test(m[0]) && tipo && !tipo.startsWith('image/')) continue;
    const ok = soHttps(/\burl="([^"]+)"/i.exec(a)?.[1]); if (ok) return ok;
  }
  const desc = decodificar(/<description[^>]*>([\s\S]*?)<\/description>/i.exec(bloco)?.[1] ?? '');
  for (const m of desc.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
    // pixel de rastreio / logo não é imagem da notícia
    if (/width="1"|height="1"|width:\s*1px|height:\s*1px|pixel|logo|tracking|feedburner|\.svg(\?|"|$)/i.test(m[0])) continue;
    const ok = soHttps(m[1]); if (ok) return ok;
  }
  return null;
}

function campo(item: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(item);
  return m ? m[1].trim() : '';
}

/**
 * Itens válidos do feed. Recusa: sem título, link fora do domínio da fonte, data inválida, data no futuro (> 1 h)
 * ou mais antiga que `maxDias`.
 */
/**
 * Item de feed que não é notícia: página de jogo/tempo real ("Criciúma x Avaí - Série B 2026 - Ao vivo -
 * globoesporte.com"), enquete, ou link para a página inicial do site.
 */
export function naoENoticia(titulo: string, link: string): boolean {
  if (/\s-\s(?:ao vivo\s-\s)?globoesporte\.com\s*$/i.test(titulo) || /^enquete\b/i.test(titulo)) return true;
  try { return new URL(link).pathname.replace(/\/+$/, '') === ''; } catch { return true; }
}

export function parseRss(xml: string, dominio: string, agora: Date, maxDias = 30): { itens: NoticiaRss[]; recusados: Array<{ titulo: string; motivo: string }> } {
  const itens: NoticiaRss[] = [];
  const recusados: Array<{ titulo: string; motivo: string }> = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const bloco = m[0];
    // "▶️ Picos bate o Flamengo..." -> sem o emoji de vídeo no começo
    const titulo = semTags(decodificar(campo(bloco, 'title'))).replace(/^[\p{Extended_Pictographic}▶️\s]+/u, '').trim();
    const link = decodificar(campo(bloco, 'link')).trim();
    const guid = semTags(decodificar(campo(bloco, 'guid'))) || link;
    const data = Date.parse(campo(bloco, 'pubDate'));
    const recusar = (motivo: string) => recusados.push({ titulo: titulo.slice(0, 80), motivo });
    if (!titulo) { recusar('sem_titulo'); continue; }
    let host = '';
    try { host = new URL(link).hostname; } catch { /* inválido */ }
    if (!host || !(host === dominio || host.endsWith('.' + dominio))) { recusar('link_fora_da_fonte'); continue; }
    if (naoENoticia(titulo, link)) { recusar('nao_e_noticia'); continue; }
    if (!Number.isFinite(data)) { recusar('data_invalida'); continue; }
    if (data > agora.getTime() + 3600e3) { recusar('data_no_futuro'); continue; }
    if (data < agora.getTime() - maxDias * 86400e3) { recusar('antiga_demais'); continue; }
    itens.push({
      guid, titulo, link, publicadoEm: new Date(data).toISOString(),
      // atom:subtitle (linha fina) quando o feed traz; senão o 1º parágrafo da descrição
      resumo: resumoDe(campo(bloco, 'atom:subtitle')) || resumoDe(campo(bloco, 'description')),
      autor: semTags(decodificar(campo(bloco, 'dc:creator'))) || null,
      imagem: imagemDoItem(bloco),
    });
  }
  return { itens, recusados };
}
