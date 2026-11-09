/**
 * F-272 — FOTO POR LINK: a foto do produto que já vem sem fundo do site da marca (ou de um banco de imagens) NÃO é copiada
 * para o nosso armazenamento. O catálogo guarda só o link do passa-foto (Worker `sobremidia-tabloide-ia`, rota /foto), que
 * busca a foto na hora, corta a sobra transparente e entrega com permissão de uso (o encarte exporta normalmente).
 * Se o passa-foto não responder, o sistema volta ao caminho de antes (cópia no R2): o encarte nunca fica sem foto.
 * O mesmo formato de link é montado em scripts/ops/catalogo-por-link.mjs.
 */
import { caixaOpaca, carregar } from './recorte';

export const PASSA_FOTO = 'https://sobremidia-tabloide-ia.sobremidia.workers.dev/foto';
export interface CaixaDaFoto { left: number; top: number; width: number; height: number }

export function linkDaFoto(url: string, caixa?: CaixaDaFoto | null, semFundo = false): string {
  return `${PASSA_FOTO}?u=${encodeURIComponent(url)}${semFundo ? '&s=1' : ''}${caixa ? `&c=${caixa.left},${caixa.top},${caixa.width},${caixa.height}` : ''}`;
}
export const ehFotoPorLink = (url: string) => url.startsWith(`${PASSA_FOTO}?`);
/** Endereço original (site da marca) de uma foto por link; a própria url se não for link. */
export function origemDaFoto(url: string): string {
  if (!ehFotoPorLink(url)) return url;
  try { return new URL(url).searchParams.get('u') ?? url; } catch { return url; }
}

let noAr: Promise<boolean> | null = null;
/**
 * O passa-foto está publicado? Pergunta UMA vez por sessão: sem endereço ele responde 400 com permissão de uso (CORS);
 * a versão antiga do Worker responde 405 e, aí, o sistema segue guardando a cópia como antes.
 */
export function passaFotoNoAr(): Promise<boolean> {
  noAr ??= fetch(PASSA_FOTO, { signal: AbortSignal.timeout(6000) })
    .then((r) => r.status === 400)
    .catch(() => false);
  return noAr;
}
/** Só para os testes. */
export const esquecerPassaFoto = () => { noAr = null; };

/** Foto já sem fundo: a caixa do produto (sem a sobra transparente), em pixels da foto original; null se ela tem fundo. */
export async function caixaSemSobras(url: string): Promise<CaixaDaFoto | null> {
  const img = await carregar(url);
  const escala = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const tela = document.createElement('canvas');
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const caixa = caixaOpaca(ctx.getImageData(0, 0, w, h).data, w, h);
  if (!caixa) return null;
  const left = Math.max(0, Math.floor(caixa.x / escala));
  const top = Math.max(0, Math.floor(caixa.y / escala));
  return {
    left, top,
    width: Math.min(img.naturalWidth - left, Math.ceil(caixa.w / escala)),
    height: Math.min(img.naturalHeight - top, Math.ceil(caixa.h / escala)),
  };
}

/**
 * Tenta usar a foto SEM guardar cópia: só para foto de fora (site da marca ou banco de imagens) que já vem sem fundo.
 * Devolve o link do passa-foto (já cortado) ou null para o sistema seguir pelo caminho de antes.
 */
export async function fotoSemFundoPorLink(url: string, carrega: (u: string) => Promise<boolean>): Promise<string | null> {
  if (!/^https:\/\//.test(url) || ehFotoPorLink(url) || /\.r2\.dev\/|supabase\.co\/storage/.test(url)) return null;
  if (!(await passaFotoNoAr())) return null;
  try {
    const caixa = await caixaSemSobras(linkDaFoto(url));
    if (!caixa) return null;
    const link = linkDaFoto(url, caixa);
    return (await carrega(link)) ? link : null;
  } catch {
    return null;
  }
}

/** F-275: link do passa-foto que pede a foto SEM FUNDO (s=1, feito pela Cloudflare Images na hora). */
export function pedeSemFundo(url: string): boolean {
  if (!ehFotoPorLink(url)) return false;
  try { return new URL(url).searchParams.get('s') === '1'; } catch { return false; }
}
/** F-275: o mesmo link, sem nenhuma transformação (a foto como está no site, com permissão de uso para o navegador). */
export const linkSemTransformacao = (url: string) => linkDaFoto(origemDaFoto(url));
/** F-275: a caixa de corte (c=left,top,width,height) do link, na escala de até 1400 px; null se não tem. */
export function caixaDoLink(url: string): CaixaDaFoto | null {
  if (!ehFotoPorLink(url)) return null;
  try {
    const n = (new URL(url).searchParams.get('c') ?? '').split(',').map(Number);
    return n.length === 4 && n.every((v) => Number.isFinite(v) && v >= 0) && n[2] > 0 && n[3] > 0 ? { left: n[0], top: n[1], width: n[2], height: n[3] } : null;
  } catch { return null; }
}
