/**
 * Leitor de RSS do robô (F-95) — mesma regra de imagem do motor de notícias (supabase/functions/_shared/noticias):
 * imagem do item (media:content/enclosure/<img>, sem logo/SVG/pixel) ou, sem ela, a foto da página da matéria
 * (foto principal da Agência Brasil ou og:image que não seja a genérica do site). Notícia sem imagem não entra.
 */
const ENT = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#039;': "'", '&nbsp;': ' ', '&amp;': '&' };
export function decodificar(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, v) => { const n = /^x/i.test(v) ? parseInt(v.slice(1), 16) : parseInt(v, 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; })
    .replace(/&(lt|gt|quot|apos|#039|nbsp|amp);/g, (m) => ENT[m] ?? m);
}
const semTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').trim();
const soHttps = (u) => { const v = String(u ?? '').trim().replace(/&amp;/g, '&'); return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null; };
const campo = (b, tag) => (new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(b)?.[1] ?? '').trim();

export function imagemDoItem(b) {
  for (const m of b.matchAll(/<media:content\b([^>]*)>/gi)) {
    const url = /\burl="([^"]+)"/i.exec(m[1])?.[1]; const tipo = /\btype="([^"]+)"/i.exec(m[1])?.[1] ?? ''; const meio = /\bmedium="([^"]+)"/i.exec(m[1])?.[1] ?? '';
    if (meio === 'image' || tipo.startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(url ?? '')) { const ok = soHttps(url); if (ok) return ok; }
  }
  for (const m of b.matchAll(/<(media:thumbnail|enclosure)\b([^>]*)>/gi)) {
    const tipo = /\btype="([^"]+)"/i.exec(m[2])?.[1] ?? '';
    if (m[1].toLowerCase() === 'enclosure' && tipo && !tipo.startsWith('image/')) continue;
    const ok = soHttps(/\burl="([^"]+)"/i.exec(m[2])?.[1]); if (ok) return ok;
  }
  const desc = decodificar(campo(b, 'description') + campo(b, 'content:encoded'));
  for (const m of desc.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
    if (/width="1"|height="1"|width:\s*1px|height:\s*1px|pixel|logo|tracking|feedburner|\.svg(\?|"|$)/i.test(m[0])) continue;
    const ok = soHttps(m[1]); if (ok) return ok;
  }
  return null;
}

export function imagemDaPagina(html) {
  const ab = /<img\b[^>]*?(?:data-echo|src)="(https:\/\/imagens\.ebc\.com\.br\/[^"]*1170x700[^"]*)"[^>]*>/i.exec(html);
  if (ab) { const u = soHttps(ab[1]); if (u) return { url: u, credito: /\btitle="([^"]*)"/i.exec(ab[0])?.[1]?.trim() || null }; }
  for (const re of [/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i]) {
    const u = soHttps(decodificar(re.exec(html)?.[1] ?? ''));
    if (u && !/logo|thumb_\d+x\d+_|placeholder|default[-_]?(share|image|og)|avatar|favicon|sprite|\.svg(\?|$)/i.test(u)) return { url: u, credito: null };
  }
  return null;
}

/** Resumo: linha fina (atom:subtitle) ou o 1º parágrafo de texto da descrição (até ~220 caracteres). */
function resumo(b) {
  const sub = semTags(decodificar(campo(b, 'atom:subtitle')));
  if (sub) return sub;
  const html = decodificar(decodificar(campo(b, 'description'))).replace(/<h3[\s\S]*$/i, '').replace(/<img[^>]*>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  const p = html.split(/<\/p>/i).map(semTags).find((t) => t.length >= 40) ?? semTags(html);
  return p.length > 220 ? p.slice(0, p.lastIndexOf(' ', 220)) + '…' : p;
}

/** Itens do feed (mais novos primeiro), sem páginas de jogo ao vivo, enquetes ou link da página inicial. */
export function lerFeed(xml, fonte) {
  const itens = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const titulo = semTags(decodificar(campo(b, 'title'))).replace(/^[\p{Extended_Pictographic}▶️\s]+/u, '').trim();
    const link = decodificar(campo(b, 'link')).trim();
    const data = Date.parse(campo(b, 'pubDate'));
    if (!titulo || !/^https:\/\//i.test(link)) continue;
    if (/\s-\s(?:ao vivo\s-\s)?globoesporte\.com\s*$/i.test(titulo) || /^enquete\b/i.test(titulo)) continue;
    try { if (new URL(link).pathname.replace(/\/+$/, '') === '') continue; } catch { continue; }
    itens.push({ titulo, link, resumo: resumo(b), imagem: imagemDoItem(b), credito: null, fonte, data: Number.isFinite(data) ? data : 0 });
  }
  return itens.sort((a, b) => b.data - a.data);
}

/** Completa a imagem pela página da matéria (só quem veio sem imagem no feed). */
export async function completarImagens(itens, limite = 15) {
  let abertas = 0;
  for (const it of itens) {
    if (it.imagem || abertas >= limite) continue;
    abertas++;
    try {
      const r = await fetch(it.link, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SobreMidiaConteudo/1.0)' }, signal: AbortSignal.timeout(12000) });
      if (r.ok) { const f = imagemDaPagina(await r.text()); if (f) { it.imagem = f.url; it.credito = f.credito; } }
    } catch { /* sem imagem: a notícia fica de fora */ }
  }
  return itens;
}
