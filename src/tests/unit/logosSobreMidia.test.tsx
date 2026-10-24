// F-217 — pasta "Logos Sobre Mídia" da galeria de mídias: as 9 logos da marca com download e o ZIP com todas
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { PastaLogosSobreMidia } from '@/components/media/PastaLogosSobreMidia';
import { LOGOS_SOBRE_MIDIA, PASTA_DAS_LOGOS, ZIP_DAS_LOGOS, veLogosDaMarca } from '@/lib/logosSobreMidia';

const publico = path.resolve(__dirname, '../../../public');

describe('F-217 — Logos Sobre Mídia na galeria', () => {
  it('as 9 logos existem com os mesmos nomes das originais e o tamanho declarado', () => {
    expect(LOGOS_SOBRE_MIDIA).toHaveLength(9);
    for (const l of LOGOS_SOBRE_MIDIA) {
      const b = fs.readFileSync(path.join(publico, PASTA_DAS_LOGOS, l.arquivo));
      if (l.arquivo.endsWith('.png')) expect([b.readUInt32BE(16), b.readUInt32BE(20)], l.arquivo).toEqual([l.largura, l.altura]);
      else expect(b.toString('latin1', 8, 12), l.arquivo).toBe('WEBP');
    }
  });

  it('o ZIP do "Baixar todas" tem as 9 logos, iguais às da pasta', () => {
    const zip = fs.readFileSync(path.join(publico, ZIP_DAS_LOGOS));
    const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(zip.readUInt16LE(fim + 10)).toBe(9);
    for (const l of LOGOS_SOBRE_MIDIA) {
      const arquivo = fs.readFileSync(path.join(publico, PASTA_DAS_LOGOS, l.arquivo));
      expect(zip.includes(Buffer.from(`logos-sobre-midia/${l.arquivo}`)), l.arquivo).toBe(true);
      expect(zip.includes(arquivo), `${l.arquivo} igual ao da pasta`).toBe(true);
    }
  });

  it('a pasta mostra as 9 logos, cada uma com "Baixar", e o "Baixar todas (ZIP)"', () => {
    render(<PastaLogosSobreMidia />);
    expect(screen.getAllByTestId('logo-sobre-midia')).toHaveLength(9);
    for (const l of LOGOS_SOBRE_MIDIA) {
      const a = screen.getByTestId(`baixar-${l.arquivo}`);
      expect(a.getAttribute('href')).toBe(`${PASTA_DAS_LOGOS}/${l.arquivo}`);
      expect(a.getAttribute('download')).toBe(l.arquivo);
    }
    expect(screen.getByTestId('baixar-todas-logos').getAttribute('href')).toBe(ZIP_DAS_LOGOS);
  });

  it('a pasta é exclusiva do owner e do ADM', () => {
    expect(veLogosDaMarca(true, null)).toBe(true);
    expect(veLogosDaMarca(false, 'OWNER')).toBe(true);
    expect(veLogosDaMarca(false, 'admin')).toBe(true);
    for (const p of ['GESTOR', 'GESTOR_MIDIAS', 'ANUNCIANTE', 'CLIENTE', 'DESIGNER', 'FINANCEIRO', 'REPRESENTANTE', null, undefined, ''])
      expect(veLogosDaMarca(false, p), String(p)).toBe(false);
  });
});
