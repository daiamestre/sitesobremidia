// F-235 — Criador de Logos 3D do Studio: 12 estilos de encarte de mercado, desenho com volume/chanfro/brilho/enfeites,
// PNG transparente, e a logo salva indo para os encartes e o Palco de Ofertas.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ESTILOS_DE_LOGO, clonarConfig, estiloPorId } from '@/lib/studio/logo3d';
import { palcoDoProduto } from '@/lib/studio/palco';
import { ENCARTES, configDoEncarte } from '@/lib/tabloide/encartes';
import { configPadrao } from '@/lib/tabloide/cartaz';

describe('estilos de logo 3D', () => {
  it('12 estilos, cada um com texto, volume, contorno e chanfro em todas as linhas', () => {
    expect(ESTILOS_DE_LOGO).toHaveLength(12);
    for (const e of ESTILOS_DE_LOGO) {
      expect(e.config.linhas.length, e.id).toBeGreaterThan(0);
      expect(e.config.profundidade).toBeGreaterThan(0);
      for (const l of e.config.linhas) {
        expect(l.texto.trim().length).toBeGreaterThan(0);
        expect(l.pintura.face.length).toBeGreaterThanOrEqual(2);
        expect(l.pintura.volume).toHaveLength(2);
        expect(l.pintura.contorno).toMatch(/^#/);
      }
    }
    expect(estiloPorId('mega-oferta').config.linhas.map((l) => l.texto)).toEqual(['MEGA', 'OFERTA']);
    expect(estiloPorId('nao-existe').id).toBe(ESTILOS_DE_LOGO[0].id);
  });
  it('mexer numa cópia não estraga o estilo de fábrica', () => {
    const c = clonarConfig(estiloPorId('hortifruti').config);
    c.linhas[0].texto = 'FEIRA';
    expect(estiloPorId('hortifruti').config.linhas[0].texto).toBe('HORTI');
  });
});

describe('a logo salva vale nos encartes e no palco', () => {
  it('encarte com a logo usa a logo no cabeçalho (sem o título desenhado)', () => {
    const cfg = configDoEncarte({ ...ENCARTES[0], logoCabecalhoId: 'logo-1' }, configPadrao());
    expect(cfg).toMatchObject({ logoCabecalhoId: 'logo-1', cabecalhoEmTexto: false });
    expect(configDoEncarte(ENCARTES[0], configPadrao())).toMatchObject({ logoCabecalhoId: null, cabecalhoEmTexto: true });
  });
  it('no palco, a logo 3D ocupa o lugar do título, inteira e flutuando', () => {
    const d = palcoDoProduto({ nome: 'Arroz', preco: 5, precoDe: null, unidade: null, imagem: null }, '9:16', { logoTitulo: { url: 'https://x/logo.png', largura: 1600, altura: 700 } });
    const t = d.camadas.filter((c) => c.nome === 'Título');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ tipo: 'imagem', src: 'https://x/logo.png', ajuste: 'conter' });
  });
  it('a página do criador existe no menu e na rota do Studio', () => {
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toMatch(/path="logos" element=\{<StudioLogos \/>\}/);
    expect(fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8')).toMatch(/nome: 'Logos 3D', to: '\/studio\/logos'/);
    const pg = fs.readFileSync('src/pages/studioai/LogosPage.tsx', 'utf8');
    expect(pg).toMatch(/tipo: 'LOGO_CABECALHO'/);
    expect(pg).toMatch(/logoParaPng\(cfg\)/);
  });
});
