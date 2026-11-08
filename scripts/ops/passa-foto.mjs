// F-272 — endereço do passa-foto e formato do link (o mesmo de src/lib/tabloide/fotoPorLink.ts). Sem efeitos ao importar.
export const PASSA_FOTO = 'https://sobremidia-tabloide-ia.sobremidia.workers.dev/foto';

/** Link do passa-foto (o mesmo formato que o site monta em src/lib/tabloide/fotoPorLink.ts). */
export const linkDaFoto = (url, caixa, semFundo = false) =>
  `${PASSA_FOTO}?u=${encodeURIComponent(url)}${semFundo ? '&s=1' : ''}${caixa ? `&c=${caixa.left},${caixa.top},${caixa.width},${caixa.height}` : ''}`;
