/**
 * F-277/F-278 — encartes e palcos por SEGMENTO e a logo/redes como elementos editáveis.
 * - cada segmento novo tem encarte (7 tamanhos), palco, logo, pasta, cesta e as artes em public/studio;
 * - o encarte nasce com a vaga "SUA LOGO AQUI" (um objeto) e a linha das redes (um objeto); o fundo não tem mais os dois;
 * - adega leva a advertência de bebida; balões só de ESTILOS_DE_BALAO;
 * - as pastas novas abrem as mesmas telas do mercado, cada uma com a sua lista de produtos.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { SEGMENTOS_DE_OFERTA, AVISO_DE_BEBIDA, idDaArte, pastaDeEncartesDe, pastaDoPalcoDe } from '@/lib/studio/segmentosDeOferta';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, encartesDoSegmento, formatosDoEncarte } from '@/lib/studio/encartesOficiais';
import { ESTILOS_DE_BALAO, fundosDoSegmento, PASTAS_PALCO_DOS_SEGMENTOS } from '@/lib/studio/palco';
import { LOGOS_OFICIAIS } from '@/lib/studio/logos';
import { infoDaPasta, SEGMENTO_DA_PASTA } from '@/lib/studio/pastasDoSegmento';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { REDES_SOCIAIS, type CamadaRedes } from '@/lib/studio/documento';

const pub = (u: string) => fs.existsSync(`public${u}`);

describe('F-277 segmentos', () => {
  it('padaria, adega, açougue, suplementos, hortifrúti, pet, beleza, eletrônicos e moda', () => {
    expect(SEGMENTOS_DE_OFERTA.map((s) => s.id)).toEqual(['padaria', 'adega', 'acougue', 'suplementos', 'hortifruti', 'pet', 'beleza', 'eletronicos', 'moda']);
  });
  for (const sg of SEGMENTOS_DE_OFERTA) {
    it(`${sg.nome}: encarte, palco, logo, pastas e cesta`, () => {
      const [e] = encartesDoSegmento(sg.id);
      expect(e.id).toBe(idDaArte(sg.id));
      expect(formatosDoEncarte(e)).toEqual(['9:16', '16:9', '1:1', '4:5', 'a4', 'a4-h', 'a3']);
      for (const f of formatosDoEncarte(e)) expect(pub(e.formatos[f]!.fundoLimpo)).toBe(true);
      for (const c of e.formatos['9:16']!.colunas) expect(Object.values(ESTILOS_DE_BALAO)).toContain(c.etiqueta);
      const [p] = fundosDoSegmento(sg.id);
      expect(p.id).toBe(idDaArte(sg.id));
      for (const v of ['v', 'h', 'v-st', 'h-st']) expect(pub(`/studio/palco/${p.id}-${v}.webp`)).toBe(true);
      expect(LOGOS_OFICIAIS.some((l) => l.url === `/studio/logos/ofertas-${sg.id}.webp` && pub(l.url))).toBe(true);
      expect(PASTAS_PALCO_DOS_SEGMENTOS[pastaDoPalcoDe(sg.id)]).toBe(sg.id);
      expect(SEGMENTO_DA_PASTA[pastaDeEncartesDe(sg.id)]).toEqual({ segmento: sg.id, tipo: 'encartes' });
      expect(lerLista(infoDaPasta(sg.id).cestaDaCapa).length).toBeGreaterThanOrEqual(8);
      expect(infoDaPasta(sg.id).chave).toBe(`studio-encarte-produtos-${sg.id}`);
    });
  }
  it('adega: advertência de bebida no encarte e no palco; os outros sem aviso (farmácia mantém o dela)', () => {
    expect(encartesDoSegmento('adega')[0].aviso).toBe(AVISO_DE_BEBIDA);
    expect(fundosDoSegmento('adega')[0].aviso?.texto).toBe(AVISO_DE_BEBIDA);
    expect(encartesDoSegmento('padaria')[0].aviso).toBeUndefined();
    const doc = documentoDoEncarteOficial(encartesDoSegmento('adega')[0], lerLista(infoDaPasta('adega').cestaDaCapa));
    expect(JSON.stringify(doc.camadas)).toContain('BEBA COM MODERAÇÃO');
  });
});

describe('F-278 logo e redes como elementos', () => {
  it('todo encarte oficial nasce com a vaga "SUA LOGO AQUI" e a linha das redes, cada uma um objeto só', () => {
    for (const e of ENCARTES_OFICIAIS) for (const f of formatosDoEncarte(e)) {
      const doc = documentoDoEncarteOficial(e, [], {}, f);
      expect(doc.camadas.filter((c) => c.tipo === 'vaga')).toHaveLength(1);
      const redes = doc.camadas.filter((c): c is CamadaRedes => c.tipo === 'redes');
      expect(redes).toHaveLength(1);
      expect(redes[0].redes.map((r) => r.rede)).toEqual(['instagram', 'facebook', 'youtube', 'loja']);
      // o fundo é sempre o limpo (sem a caixa e sem os ícones gravados)
      expect((doc.camadas[0] as { src: string }).src).toBe(e.formatos[f]!.fundoLimpo);
    }
  });
  it('com a logo do cliente, a vaga não aparece', () => {
    const doc = documentoDoEncarteOficial(ENCARTES_OFICIAIS[0], [], { logo: { url: 'https://x/l.png', largura: 400, altura: 300, recortada: true } });
    expect(doc.camadas.some((c) => c.tipo === 'vaga')).toBe(false);
    expect(doc.camadas.some((c) => c.nome === 'Sua logo')).toBe(true);
  });
  it('o editor tem os cartões da logo e das redes, e a logo entra no lugar da vaga', () => {
    const paineis = fs.readFileSync('src/components/studio/editor/Paineis.tsx', 'utf8');
    expect(paineis).toContain("case 'vaga'");
    expect(paineis).toContain("case 'redes'");
    expect(paineis).toContain('data-testid="vaga-adicionar-logo"');
    expect(paineis).toContain('data-testid="cartao-redes"');
    const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(editor).toContain('colocarLogoNaVaga');
    expect(REDES_SOCIAIS.map((r) => r.rede)).toEqual(['instagram', 'facebook', 'youtube', 'loja', 'tiktok', 'whatsapp']);
    const desenho = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(desenho).toContain('desenharVaga');
    expect(desenho).toContain('desenharRedes');
  });
});
