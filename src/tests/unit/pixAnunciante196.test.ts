/**
 * F-196 — Pix do vídeo adicional do anunciante: QR Code e copia e cola OFICIAIS do Banco Inter (antes um texto montado
 * no navegador, sem chave e sem CRC, que nenhum banco aceitava).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const ler = (p: string) => readFileSync(p, 'utf8');

describe('F-196 · Pix do anunciante', () => {
  it('a cobrança do vídeo adicional mostra o Pix do banco e confere o pagamento no banco', () => {
    const pg = ler('src/modules/crm/pages/portal/PlaylistsClientePage.tsx');
    expect(pg).toContain('<PixDaCobranca cobrancaId={cobrancaPendente.cobrancaId}');
    expect(pg).toContain('await playlistClienteService.conferirPix(cobrancaPendente.cobrancaId);');
    expect(pg).not.toContain('gerarBrcodePix');
    const pix = ler('src/components/pagamento/PixDaCobranca.tsx');
    expect(pix).toContain('emitirPixDaCobranca(cobrancaId)');
    expect(pix).toContain('QRCode.toDataURL(copiaECola');
  });

  it('o Pix falso não existe mais em lugar nenhum', () => {
    expect(ler('src/modules/gestor/telaPago.service.ts')).not.toContain('gerarBrcodePix');
    expect(ler('src/modules/crm/services/playlistCliente.service.ts')).not.toContain('gerarBrcodePix');
  });

  it('a função do Banco Inter: quem vê a cobrança com o próprio login pode gerar o Pix (gravação pela chave do servidor)', () => {
    const f = ler('supabase/functions/inter-pix-engine/index.ts');
    const i = f.indexOf("if (action === 'issue')");
    const bloco = f.slice(i, f.indexOf("if (action === 'consult')"));
    const ver = bloco.indexOf("await supabase.from('contas_receber').select('id').eq('id', cobranca_id).maybeSingle()");
    expect(ver).toBeGreaterThan(0);
    expect(bloco.indexOf('TENANT_DENIED')).toBeGreaterThan(ver);
    expect(bloco.indexOf('await srv\n        .from(\'contas_receber\')')).toBeGreaterThan(ver);
    expect(bloco).not.toContain("await supabase.from('contas_receber').update(");
    expect(existsSync('src/components/pagamento/PixDaCobranca.tsx')).toBe(true);
  });
});
