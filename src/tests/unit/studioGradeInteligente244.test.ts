// F-244 — GRADE INTELIGENTE: o cliente escolhe quantos produtos mostrar (padrão 16, até 20); toda fileira completa, nunca um
// produto sozinho; a grade preenche o encarte (poucos produtos grandes, muitos menores), em qualquer encarte.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MAX_DE_PRODUTOS, QUANTIDADES, QUANTIDADE_PADRAO, dividirPorCotas, planejarAreas, quantidadeCompleta } from '@/lib/studio/gradeInteligente';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, ehModeloComplementar, layoutDoEncarte } from '@/lib/studio/encartesOficiais';
import { CESTA_PADRAO, ENCARTES, ENCARTE_FORMATO, arranjoDoEncarte, encarteComQuantidade } from '@/lib/tabloide/encartes';
import { montarPaginas } from '@/lib/tabloide/grade';
import { formatoPorId } from '@/lib/tabloide/temas';
import { lerLista } from '@/lib/tabloide/parseProdutos';

const produto = (i: number) => ({ nome: `Produto ${i} 1kg`, preco: 2 + i, precoDe: null, unidade: null, imagem: { url: `https://x/${i}.png`, fonte: 'OPENFOODFACTS' as const } });
const fileiras = (cs: Array<{ y: number; x: number }>) => {
  const m = new Map<number, number>();
  for (const c of cs) m.set(Math.round(c.y), (m.get(Math.round(c.y)) ?? 0) + 1);
  return [...m.values()];
};

describe('quantidade de produtos', () => {
  it('padrão 16, até 20, e só quantidades que formam grade completa', () => {
    expect(QUANTIDADE_PADRAO).toBe(16);
    expect(MAX_DE_PRODUTOS).toBe(20);
    expect(QUANTIDADES).toContain(16);
    expect(Math.max(...QUANTIDADES)).toBe(20);
    for (const q of QUANTIDADES) expect(q % 2, `${q}`).toBe(0);
  });
  it('com menos produtos na lista, vale a maior grade completa; nunca passa do pedido', () => {
    expect(quantidadeCompleta(16, 15)).toBe(12);
    expect(quantidadeCompleta(16, 13)).toBe(12);
    expect(quantidadeCompleta(16, 30)).toBe(16);
    expect(quantidadeCompleta(20, 30)).toBe(20);
    expect(quantidadeCompleta(4, 30)).toBe(4);
    expect(quantidadeCompleta(16, 5)).toBe(4);
    expect(quantidadeCompleta(16, 3)).toBe(2);
    expect(quantidadeCompleta(16, 1)).toBe(1);
    expect(quantidadeCompleta(16, 0)).toBe(0);
  });
  it('as cotas mantêm a ordem da lista e alternam na proporção de cada área', () => {
    expect(dividirPorCotas([1, 2, 3, 4], [2, 2])).toEqual([[1, 3], [2, 4]]);
    expect(dividirPorCotas([1, 2, 3, 4], [3, 1]).map((l) => l.length)).toEqual([3, 1]);
  });
});

describe.each(ENCARTES_OFICIAIS)('grade do encarte oficial $id', (e) => {
  it('em toda quantidade, cada área fica com todas as fileiras completas', () => {
    for (const f of ['9:16', '16:9'] as const) {
      const l = layoutDoEncarte(e, f);
      for (const q of QUANTIDADES) {
        const plano = planejarAreas(l.colunas, q, l.cartao);
        expect(plano.reduce((t, g) => t + g.n, 0), `${f} ${q}`).toBe(q);
        for (const g of plano) expect(g.cols * g.rows, `${f} ${q}`).toBe(g.n);
        const d = documentoDoEncarteOficial(e, Array.from({ length: 24 }, (_, i) => produto(i)), { quantos: q }, f);
        const placas = d.camadas.filter((c) => c.nome.startsWith('Placa '));
        expect(placas, `${f} ${q}`).toHaveLength(q);
        l.colunas.forEach((col, k) => {
          const daArea = placas.filter((p) => p.x >= col.x - 1 && p.x + p.w <= col.x + col.w + 1 && p.y >= col.y - 1 && p.y + p.h <= col.y + col.h + 1);
          expect(new Set(fileiras(daArea)).size, `${f} ${q} área ${k}`).toBeLessThanOrEqual(1);
          if (daArea.length) {
            // a grade preenche a área inteira, de cima a baixo
            expect(Math.min(...daArea.map((p) => p.y))).toBeCloseTo(col.y, 0);
            expect(Math.max(...daArea.map((p) => p.y + p.h))).toBeCloseTo(col.y + col.h, 0);
          }
        });
      }
    }
  });
  // os dois lados lado a lado dos modelos de antes (os complementares do F-296 têm a sua própria divisão)
  it.skipIf(ehModeloComplementar(e))('16 produtos em pé: 4 na horizontal e 4 na vertical', () => {
    const l = layoutDoEncarte(e, '9:16');
    const plano = planejarAreas(l.colunas, 16, l.cartao);
    expect(plano.reduce((t, g) => t + g.cols, 0)).toBe(4);
    expect(plano.map((g) => g.rows)).toEqual([4, 4]);
  });
  it('poucos produtos ficam maiores; os cartões diminuem conforme a quantidade cresce', () => {
    const area = (q: number) => {
      const d = documentoDoEncarteOficial(e, Array.from({ length: 24 }, (_, i) => produto(i)), { quantos: q }, '9:16');
      const p = d.camadas.filter((c) => c.nome.startsWith('Placa '));
      return p.reduce((t, c) => t + c.w * c.h, 0) / p.length;
    };
    expect(area(4)).toBeGreaterThan(area(8));
    expect(area(8)).toBeGreaterThan(area(16));
    expect(area(16)).toBeGreaterThan(area(20));
  });
});

describe('grade dos encartes A4', () => {
  const formato = formatoPorId(ENCARTE_FORMATO);
  it('todo modelo, em toda quantidade: uma página só, com fileiras completas', () => {
    for (const e of ENCARTES) for (const q of QUANTIDADES) {
      const { grade, destaques } = arranjoDoEncarte(e.layout, q);
      const ps = Array.from({ length: q }, (_, i) => ({ id: String(i), nome: `P ${i}`, preco: 1, precoDe: null, unidade: null, obs: null, imagem: null }));
      const paginas = montarPaginas(ps, formato, grade, destaques, 1, { layout: e.layout, cabecalho: formato.altura * 0.21 });
      expect(paginas, `${e.id} ${q}`).toHaveLength(1);
      expect(paginas[0].celulas, `${e.id} ${q}`).toHaveLength(q);
      const contagens = fileiras(paginas[0].celulas);
      expect(new Set(contagens).size, `${e.id} ${q}: ${contagens}`).toBe(1);
      expect(contagens[0], `${e.id} ${q}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('o editor abre com a quantidade e a grade certas', () => {
    const e = ENCARTES.find((x) => x.segmento === 'mercado')!;
    const c = encarteComQuantidade({ ...e, produtos: CESTA_PADRAO }, 8);
    expect(lerLista(c.produtos)).toHaveLength(8);
    expect(c.grade).toBeTruthy();
  });
});

describe('as telas', () => {
  it('a escolha fica à vista no painel e vale nos encartes, no palco e no editor', () => {
    const painel = fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8');
    expect(painel).toContain('produtos-quantidade');
    expect(painel).toContain('produtos-aviso-quantidade');
    expect(fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8')).toMatch(/\.slice\(0, s\.quantos\)/);
    const pasta = fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8');
    expect(pasta.match(/quantos=\{s\.quantos\}/g)?.length).toBeGreaterThanOrEqual(2); // F-306: o passo a passo usa o mesmo cartão
    expect(fs.readFileSync('src/pages/studioai/EncartePage.tsx', 'utf8')).toMatch(/encarteComQuantidade\(naPasta, lerQuantidade\(\)\)/);
  });
});
