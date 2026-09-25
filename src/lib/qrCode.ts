import QRCode from 'qrcode';

/**
 * QR Code dos widgets: gerado na hora (determinístico) a partir do texto/URL configurado — nenhuma imagem é salva.
 * Só aceita http(s), telefone, e-mail ou WhatsApp: evita apontar a câmera do cliente para esquemas perigosos.
 */
const PERMITIDOS = /^(https?:\/\/|tel:|mailto:|https:\/\/wa\.me\/)/i;

export function conteudoQrValido(conteudo: string | null | undefined): string | null {
  const c = (conteudo || '').trim();
  if (!c || c.length > 1000) return null;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(c)) return `https://${c}`; // "loja.com.br/oferta" -> https://
  return PERMITIDOS.test(c) ? c : null;
}

/** SVG do QR (vetorial: nítido em qualquer tamanho de TV). null se o conteúdo não for permitido. */
export async function qrSvg(conteudo: string, cor = '#22004A', fundo = '#FFFFFF'): Promise<string | null> {
  const c = conteudoQrValido(conteudo);
  if (!c) return null;
  return QRCode.toString(c, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: cor, light: fundo } });
}
