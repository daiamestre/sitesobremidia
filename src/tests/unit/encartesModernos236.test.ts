// F-236 — encartes MODERNOS nas estruturas das referências de mercado: título em logo 3D, coluna de destaques à direita,
// tela dividida em duas cores, fundos com diagonal/raios/retícula.
import { describe, it, expect } from 'vitest';
import { ENCARTES, ENCARTES_MODERNOS, ENCARTE_FORMATO, configDoEncarte, gradeDoEncarte } from '@/lib/tabloide/encartes';
import { configPadrao, normalizarConfig, propsDasPaginas } from '@/lib/tabloide/cartaz';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { estiloPorId, logoDoTitulo } from '@/lib/studio/logo3d';
import { TEMAS } from '@/lib/tabloide/temas';

const montar = (id: string) => {
  const e = ENCARTES_MODERNOS.find((x) => x.id === id)!;
  return { e, props: propsDasPaginas({ formatoId: ENCARTE_FORMATO, temaId: e.temaId, segmentoId: e.segmento, grade: gradeDoEncarte(e), produtos: lerLista(e.produtos), config: configDoEncarte(e, configPadrao()) }, []) };
};

describe('encartes modernos', () => {
  it('12 modelos novos, na frente da pasta, cada um com título em logo 3D de um estilo que existe', () => {
    expect(ENCARTES_MODERNOS).toHaveLength(12);
    expect(ENCARTES.slice(0, 12).map((e) => e.id)).toEqual(ENCARTES_MODERNOS.map((e) => e.id));
    for (const e of ENCARTES_MODERNOS) {
      expect(estiloPorId(e.estiloTitulo!).id, e.id).toBe(e.estiloTitulo);
      expect(TEMAS.some((t) => t.id === e.temaId)).toBe(true);
      expect(e.fundoCss).toMatch(/gradient/);
      expect(e.fundoCss).not.toMatch(/url\(/);
    }
  });
  it('coluna de destaques à direita (Show de Ofertas): os destaques empilhados num painel e a grade 2×2 à esquerda, tudo numa página', () => {
    const { props } = montar('moderno-show-de-ofertas');
    expect(props).toHaveLength(1);
    const p = props[0];
    expect(p.pagina.paineis).toEqual([expect.objectContaining({ tipo: 'coluna' })]);
    const dest = p.pagina.celulas.filter((c) => c.destaque);
    expect(dest).toHaveLength(3);
    expect(new Set(dest.map((c) => Math.round(c.x))).size).toBe(1); // a mesma coluna
    const grade = p.pagina.celulas.filter((c) => !c.destaque);
    expect(grade).toHaveLength(4);
    expect(Math.max(...grade.map((c) => c.x + c.w))).toBeLessThan(dest[0].x);
    expect(p).toMatchObject({ estiloTitulo: 'show-de-ofertas', corPainel: '#b30d20' });
  });
  it('tela dividida (Mega Oferta): metade esquerda e metade direita, 4 produtos em cada', () => {
    const { props } = montar('moderno-mega-oferta');
    const p = props[0];
    expect(p.pagina.paineis).toEqual([expect.objectContaining({ tipo: 'metade' })]);
    const meio = p.formato.largura / 2;
    expect(p.pagina.celulas.filter((c) => c.x + c.w <= meio)).toHaveLength(4);
    expect(p.pagina.celulas.filter((c) => c.x >= meio)).toHaveLength(4);
  });
  it('o título vira logo 3D: a palavra pequena fica na pílula ("SHOW" + "DE"·"OFERTAS")', () => {
    const l = logoDoTitulo('SHOW DE OFERTAS', 'show-de-ofertas');
    expect(l.linhas.map((x) => [x.pilula?.texto ?? null, x.texto])).toEqual([[null, 'SHOW'], ['DE', 'OFERTAS']]);
    expect(logoDoTitulo('HORTIFRUTI', 'hortifruti').linhas.map((x) => x.texto)).toEqual(['HORTIFRUTI']);
  });
  it('rascunho guarda layout, estilo do título, fundo e cor do painel; fundo com url() é recusado', () => {
    const c = normalizarConfig({ layout: 'lateral', estiloTitulo: 'mega-oferta', fundoCss: 'linear-gradient(#000,#fff)', corPainel: '#b30d20' });
    expect(c).toMatchObject({ layout: 'lateral', estiloTitulo: 'mega-oferta', fundoCss: 'linear-gradient(#000,#fff)', corPainel: '#b30d20' });
    expect(normalizarConfig({ fundoCss: 'url(https://x/y.png)' }).fundoCss).toBeNull();
    expect(normalizarConfig({ layout: 'outro' }).layout).toBe('padrao');
  });
});
