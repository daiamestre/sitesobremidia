/**
 * Leitor do RSS da Agência Brasil (CC BY 4.0) para o motor de notícias. Código puro (Edge Function + testes).
 * Só texto: título e resumo. Fotos NÃO são usadas — o feed não informa o crédito e parte delas é de terceiros.
 */
export interface NoticiaRss {
  guid: string;
  titulo: string;
  resumo: string;
  link: string;
  publicadoEm: string;       // ISO UTC
  autor: string | null;
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

function campo(item: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(item);
  return m ? m[1].trim() : '';
}

/**
 * Itens válidos do feed. Recusa: sem título, link fora do domínio da fonte, data inválida, data no futuro (> 1 h)
 * ou mais antiga que `maxDias`.
 */
export function parseRss(xml: string, dominio: string, agora: Date, maxDias = 30): { itens: NoticiaRss[]; recusados: Array<{ titulo: string; motivo: string }> } {
  const itens: NoticiaRss[] = [];
  const recusados: Array<{ titulo: string; motivo: string }> = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const bloco = m[0];
    const titulo = semTags(decodificar(campo(bloco, 'title')));
    const link = decodificar(campo(bloco, 'link')).trim();
    const guid = semTags(decodificar(campo(bloco, 'guid'))) || link;
    const data = Date.parse(campo(bloco, 'pubDate'));
    const recusar = (motivo: string) => recusados.push({ titulo: titulo.slice(0, 80), motivo });
    if (!titulo) { recusar('sem_titulo'); continue; }
    let host = '';
    try { host = new URL(link).hostname; } catch { /* inválido */ }
    if (!host || !(host === dominio || host.endsWith('.' + dominio))) { recusar('link_fora_da_fonte'); continue; }
    if (!Number.isFinite(data)) { recusar('data_invalida'); continue; }
    if (data > agora.getTime() + 3600e3) { recusar('data_no_futuro'); continue; }
    if (data < agora.getTime() - maxDias * 86400e3) { recusar('antiga_demais'); continue; }
    itens.push({
      guid, titulo, link, publicadoEm: new Date(data).toISOString(),
      resumo: resumoDe(campo(bloco, 'description')),
      autor: semTags(decodificar(campo(bloco, 'dc:creator'))) || null,
    });
  }
  return { itens, recusados };
}
