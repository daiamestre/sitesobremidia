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
