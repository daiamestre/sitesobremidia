/**
 * Imagem das notícias do widget Esportes News (F-90). Código puro (Edge Function + testes).
 *
 * Regra do proprietário: notícia de esporte só vai para a tela COM a imagem da notícia.
 * Regra de direitos: só imagem que a fonte pode ceder.
 *   - `imagemDoItem` (rss.ts): fonte cuja licença cobre a imagem que vem no próprio feed (modo 'feed').
 *   - `fotoPropriaDoArtigo`: Agência Brasil (CC BY 4.0) — a licença NÃO cobre foto de terceiros publicada por ela
 *     (CBF, clubes, Reuters "Proibida reprodução"...). Só a foto principal com crédito do próprio veículo é aceita.
 */
import { decodificar, soHttps } from './rss.ts';

/** Crédito do próprio veículo (EBC): Agência Brasil, TV Brasil, Rádio Nacional, "Arte/EBC". */
export function creditoProprio(credito: string): boolean {
  if (/proibid|direitos\s+reser/i.test(credito)) return false;
  return /Ag[êe]ncia\s*Brasil|\bEBC\b|TV\s*Brasil|R[áa]dio\s*Nacional/i.test(credito);
}

/** "Marcello Casal JrAgência Brasil" -> "Marcello Casal Jr/Agência Brasil" (o site às vezes perde a barra). */
export function normalizarCredito(credito: string): string {
  return decodificar(credito).replace(/\s+/g, ' ').trim().replace(/([a-zà-ú.])(Ag[êe]ncia Brasil)/, '$1/$2');
}

/**
 * Foto principal da matéria da Agência Brasil (a 1ª imagem 1170x700 do corpo, com o crédito no atributo title),
 * SOMENTE se o crédito é do próprio veículo. Sem foto, ou foto de terceiros -> null (a notícia não entra no widget).
 */
export function fotoPropriaDoArtigo(html: string): { url: string; credito: string } | null {
  const tag = /<img\b[^>]*?(?:data-echo|src)="https:\/\/imagens\.ebc\.com\.br\/[^"]*1170x700[^"]*"[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const url = soHttps(/(?:data-echo|src)="(https:\/\/imagens\.ebc\.com\.br\/[^"]*1170x700[^"]*)"/i.exec(tag)?.[1]);
  const credito = normalizarCredito(/\btitle="([^"]*)"/i.exec(tag)?.[1] ?? '');
  if (!url || !credito || !creditoProprio(credito)) return null;
  return { url, credito };
}

/**
 * Decisão do proprietário (F-91, 27/09/2026): a notícia usa a FOTO DA PRÓPRIA NOTÍCIA mesmo quando é de terceiros
 * (CBF, clubes, agências), com o crédito original sempre na tela. O proprietário assumiu o risco de direito autoral.
 * A imagem nunca é alterada nem "disfarçada" — o crédito do fotógrafo/veículo acompanha a foto.
 *
 * Foto principal da matéria da Agência Brasil (1ª imagem 1170x700 do corpo), qualquer crédito. Sem foto -> null.
 */
export function fotoPrincipalDoArtigo(html: string): { url: string; credito: string | null } | null {
  const tag = /<img\b[^>]*?(?:data-echo|src)="https:\/\/imagens\.ebc\.com\.br\/[^"]*1170x700[^"]*"[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const url = soHttps(/(?:data-echo|src)="(https:\/\/imagens\.ebc\.com\.br\/[^"]*1170x700[^"]*)"/i.exec(tag)?.[1]);
  if (!url) return null;
  const credito = normalizarCredito(/\btitle="([^"]*)"/i.exec(tag)?.[1] ?? '');
  return { url, credito: credito || null };
}

/** og:image / twitter:image genérico (logo, marca, miniatura padrão do site) não é foto da notícia. */
export function imagemGenerica(url: string): boolean {
  return /logo|thumb_\d+x\d+_|placeholder|default[-_]?(share|image|og)|avatar|favicon|sprite|\.svg(\?|$)/i.test(url);
}

/**
 * Imagem da notícia a partir da página da matéria (qualquer site): foto principal da Agência Brasil; senão
 * og:image / twitter:image, desde que não seja a imagem genérica do site. Sem imagem -> null.
 */
export function imagemDaPagina(html: string): { url: string; credito: string | null } | null {
  const ab = fotoPrincipalDoArtigo(html);
  if (ab) return ab;
  for (const re of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ]) {
    const u = soHttps(decodificar(re.exec(html)?.[1] ?? ''));
    if (u && !imagemGenerica(u)) return { url: u, credito: null };
  }
  return null;
}
