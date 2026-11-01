// F-246 — o MESMO encarte em todos os tamanhos (telas, redes sociais e impressão), sem deformar a arte nem a grade.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { OPCOES_DE_FORMATO, TAMANHO_DOC, adaptarDocumento, modeloParaDocumento, telaDoFormato, type FormatoArte } from '@/lib/studio/documento';
import { MODELOS } from '@/lib/studio/modelos';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, formatosDoEncarte, layoutDoEncarte } from '@/lib/studio/encartesOficiais';
import { ENCARTES, arranjoDoEncarte } from '@/lib/tabloide/encartes';
import { montarPaginas } from '@/lib/tabloide/grade';
import { FORMATOS } from '@/lib/tabloide/temas';
import { QUANTIDADES } from '@/lib/studio/gradeInteligente';

const FORMATOS_ARTE: FormatoArte[] = ['16:9', '9:16', '1:1', '4:5', 'a4', 'a4-h', 'a3'];
const produto = (i: number) => ({ nome: `Produto ${i} 1kg`, preco: 2 + i, precoDe: null, unidade: null, imagem: null });
const dentro = (c: { x: number; y: number; w: number; h: number }, f: FormatoArte) => c.x >= -1 && c.y >= -1 && c.x + c.w <= TAMANHO_DOC[f].w + 1 && c.y + c.h <= TAMANHO_DOC[f].h + 1;

describe('as opções', () => {
  it('são as 8 do Cartaz Digital, com as mesmas medidas', () => {
    const itens = OPCOES_DE_FORMATO.flatMap((g) => g.itens);
    expect(itens.map((o) => o.nome)).toEqual(FORMATOS.map((f) => f.nome));
    itens.forEach((o, i) => expect(TAMANHO_DOC[o.formato], o.nome).toEqual({ w: FORMATOS[i].largura, h: FORMATOS[i].altura }));
  });
  it('ao publicar, cada formato vai para a tela mais próxima', () => {
    expect(telaDoFormato('a4')).toBe('9:16');
    expect(telaDoFormato('a4-h')).toBe('16:9');
    expect(telaDoFormato('1:1')).toBe('9:16');
    expect(telaDoFormato('16:9')).toBe('16:9');
  });
});

describe.each(ENCARTES_OFICIAIS)('encarte oficial $id', (e) => {
  it('existe em todos os tamanhos, com o próprio fundo adaptado', () => {
    expect(formatosDoEncarte(e)).toEqual(['9:16', '16:9', '1:1', '4:5', 'a4', 'a4-h', 'a3']);
    for (const f of FORMATOS_ARTE) {
      const l = layoutDoEncarte(e, f);
      expect(fs.existsSync(`public${l.fundo}`), `${f} ${l.fundo}`).toBe(true);
      expect(fs.existsSync(`public${l.fundoLimpo}`), `${f} ${l.fundoLimpo}`).toBe(true);
      expect(dentro(l.logo, f), `${f} logo`).toBe(true);
      expect(dentro(l.rodape, f), `${f} rodapé`).toBe(true);
      for (const c of l.colunas) {
        expect(dentro(c, f), `${f} área`).toBe(true);
        expect(c.y + c.h, `${f} área e rodapé`).toBeLessThanOrEqual(Math.max(l.rodape.y, c.y + c.h));
      }
    }
  });
  it('a grade fica dentro da arte em todo tamanho e quantidade, com cartões proporcionais', () => {
    for (const f of FORMATOS_ARTE) for (const q of QUANTIDADES) {
      const d = documentoDoEncarteOficial(e, Array.from({ length: 24 }, (_, i) => produto(i)), { quantos: q, telefone: '(11) 99999-1234', endereco: 'Avenida Brasil, 1500 – Centro' }, f);
      expect(d.formato).toBe(f);
      const placas = d.camadas.filter((c) => c.nome.startsWith('Placa '));
      expect(placas, `${f} ${q}`).toHaveLength(q);
      for (const p of placas) {
        expect(dentro(p, f), `${f} ${q} ${p.nome}`).toBe(true);
        expect(p.w / p.h, `${f} ${q} ${p.nome}`).toBeGreaterThan(0.3);
        expect(p.w / p.h, `${f} ${q} ${p.nome}`).toBeLessThan(4.2);
      }
    }
  });
  it('o fundo da arte tem a medida exata do formato (nada de esticar a imagem inteira)', async () => {
    const sharp = (await import('sharp')).default;
    for (const f of FORMATOS_ARTE) {
      const m = await sharp(`public${layoutDoEncarte(e, f).fundo}`).metadata();
      expect({ w: m.width, h: m.height }, f).toEqual(TAMANHO_DOC[f]);
    }
  });
});

describe('encartes A4 nos outros tamanhos', () => {
  it('a grade exata é refeita para o tamanho escolhido, com fileiras completas', () => {
    for (const fm of FORMATOS) for (const e of ENCARTES) for (const q of QUANTIDADES) {
      const { grade, destaques } = arranjoDoEncarte(e.layout, q, fm.id);
      const ps = Array.from({ length: q }, (_, i) => ({ id: String(i), nome: `P ${i}`, preco: 1, precoDe: null, unidade: null, obs: null, imagem: null }));
      const [pagina, ...resto] = montarPaginas(ps, fm, grade, destaques, 1, { layout: e.layout, cabecalho: fm.altura * 0.21 });
      expect(resto, `${fm.id} ${e.id} ${q}`).toHaveLength(0);
      const fileiras = new Map<number, number>();
      for (const c of pagina.celulas) fileiras.set(Math.round(c.y), (fileiras.get(Math.round(c.y)) ?? 0) + 1);
      expect(new Set(fileiras.values()).size, `${fm.id} ${e.id} ${q}`).toBe(1);
    }
  });
});

describe('modelos do Studio nos outros tamanhos', () => {
  it('fundo e foto continuam cobrindo; nada sai da tela nem muda de proporção', () => {
    for (const m of MODELOS) for (const f of ['1:1', '4:5', 'a4', 'a4-h', 'a3'] as const) {
      const tela = telaDoFormato(f);
      const o = modeloParaDocumento(m, tela);
      const d = adaptarDocumento(o, f);
      expect(d.formato).toBe(f);
      d.camadas.forEach((c, i) => {
        const base = o.camadas[i];
        if (c.tipo === 'selo') expect(c.w / c.h, `${m.id} ${f} ${c.nome}`).toBeCloseTo(base.w / base.h, 3);
        expect(c.x + c.w / 2, `${m.id} ${f} ${c.nome}`).toBeGreaterThanOrEqual(-TAMANHO_DOC[f].w * 0.2);
        expect(c.x + c.w / 2, `${m.id} ${f} ${c.nome}`).toBeLessThanOrEqual(TAMANHO_DOC[f].w * 1.2);
      });
    }
  });
});

describe('as telas', () => {
  it('o cartão e o editor oferecem os tamanhos; só as telas recebem ao publicar', () => {
    expect(fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8')).toContain('encarte-oficial-formato');
    const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(editor).toContain('studio-formato');
    expect(editor).toMatch(/formatos=\{publicando === 'video' \? undefined : formatosDeTela\}/);
    expect(editor).toMatch(/formato: telaDoFormato\(formato\), dados:/);
  });
});
