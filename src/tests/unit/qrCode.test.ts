import { describe, it, expect } from 'vitest';
import { conteudoQrValido, qrSvg } from '@/lib/qrCode';

describe('QR Code dos widgets (gerado na hora, sem salvar imagem)', () => {
  it('aceita http(s), telefone, e-mail, WhatsApp e domínio sem esquema', () => {
    expect(conteudoQrValido('https://sobremidia.com.br')).toBe('https://sobremidia.com.br');
    expect(conteudoQrValido('loja.com.br/promo')).toBe('https://loja.com.br/promo');
    expect(conteudoQrValido('tel:+5581999990000')).toBe('tel:+5581999990000');
    expect(conteudoQrValido('mailto:contato@loja.com')).toBe('mailto:contato@loja.com');
  });

  it('recusa esquemas perigosos e vazio', () => {
    expect(conteudoQrValido('javascript:alert(1)')).toBeNull();
    expect(conteudoQrValido('file:///etc/passwd')).toBeNull();
    expect(conteudoQrValido('')).toBeNull();
    expect(conteudoQrValido(undefined)).toBeNull();
  });

  it('gera SVG determinístico (mesmo conteúdo = mesmo código) e nada para conteúdo inválido', async () => {
    const a = await qrSvg('https://sobremidia.com.br/oferta?id=1');
    const b = await qrSvg('https://sobremidia.com.br/oferta?id=1');
    const c = await qrSvg('https://sobremidia.com.br/oferta?id=2');
    expect(a).toContain('<svg');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(await qrSvg('javascript:alert(1)')).toBeNull();
  });
});
