// F-221 — Studio: pastas de modelos (capa + 5 variações), Black Friday, 16:9 e 9:16 e editor de camadas.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { BLACK_FRIDAY, CAPAS, PEDIDOS_DE_FOTO, VARIACOES, modelosDaPasta } from '@/lib/studio/pastas';
import { TAMANHO_DOC, alturaDoTexto, linhasDoTexto, modeloParaDocumento, texto, type CamadaImagem } from '@/lib/studio/documento';
import { redimensionar } from '@/components/studio/editor/Palco';
import { montarPastas } from '@/lib/studioai/modelos';
import type { ModeloDeArte } from '@/lib/studio/modelos';

describe('pastas de modelos', () => {
  it('toda pasta do catálogo tem 5 variações do mesmo segmento, com foto e textos próprios', () => {
    expect(CAPAS).toHaveLength(25);
    for (const capa of CAPAS) {
      const vs = VARIACOES[capa.id];
      expect(vs, capa.id).toHaveLength(5);
      const titulos = new Set([capa.textos.titulo.join(' '), ...vs.map((v) => v.textos.titulo.join(' ') + (v.textos.subtitulo ?? ''))]);
      expect(titulos.size, `${capa.id}: variações repetidas`).toBe(6);
    }
  });

  it('ids e fotos nunca se repetem (nenhuma arte igual a outra)', () => {
    const ids = [...CAPAS.map((c) => c.id), ...Object.values(VARIACOES).flat().map((v) => v.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const fotos = PEDIDOS_DE_FOTO.map((p) => p.foto);
    expect(new Set(fotos).size).toBe(fotos.length);
    expect(fotos).toHaveLength(126);
  });

  it('pedidos de foto são genéricos: sem marcas e sem texto na imagem', () => {
    for (const p of PEDIDOS_DE_FOTO) expect(p.prompt.toLowerCase()).not.toMatch(/\b(iphone|samsung|nike|adidas|coca|apple|brahma|heineken|ps5|xbox)\b/);
    const script = fs.readFileSync('scripts/studio/gerar-fotos-pastas.mjs', 'utf8');
    expect(script).toContain('No text');
    expect(script).toContain('no brand');
  });

  it('variação sem foto pronta não aparece (nunca mostra modelo quebrado)', () => {
    const capa = CAPAS.find((c) => c.id === 'acougue-selecionado')!;
    const lista = modelosDaPasta(capa);
    expect(lista[0].id).toBe('acougue-selecionado');
    for (const m of lista.slice(1)) expect(m.pasta).toBe(capa.id);
  });

  it('Black Friday é uma pasta da categoria Campanhas, com a composição de neon e 5 segmentos', () => {
    expect(BLACK_FRIDAY.layout).toBe('neon');
    expect(BLACK_FRIDAY.segmento).toBe('campanhas');
    expect(VARIACOES[BLACK_FRIDAY.id].map((v) => v.id)).toEqual(['bf-moda', 'bf-mercado', 'bf-celulares', 'bf-moveis', 'bf-beleza']);
    const d = modeloParaDocumento(BLACK_FRIDAY, '9:16');
    expect(d.camadas.find((c) => c.nome === 'Título 1')).toMatchObject({ tipo: 'texto', texto: 'BLACK' });
    expect(d.camadas.find((c) => c.nome === 'Moldura de neon')).toMatchObject({ tipo: 'forma' });
  });

  it('modelo do owner/ADM entra na pasta escolhida; sem pasta vira um card próprio', () => {
    const novo = { ...CAPAS[2], id: 'meu-modelo', nome: 'Meu', pasta: 'acougue-selecionado' } as ModeloDeArte;
    const solto = { ...CAPAS[2], id: 'solto', nome: 'Solto', pasta: undefined } as ModeloDeArte;
    const pastas = montarPastas([novo, solto]);
    expect(pastas.find((p) => p.capa.id === 'acougue-selecionado')!.modelos.map((m) => m.id)).toContain('meu-modelo');
    expect(pastas.some((p) => p.capa.id === 'solto')).toBe(true);
  });
});

describe('cada modelo em 16:9 e 9:16 sem perder qualidade', () => {
  it('todos os modelos montam nos dois formatos, com a foto numa área quadrada de 1080 px', () => {
    for (const capa of CAPAS) {
      for (const f of ['16:9', '9:16'] as const) {
        const d = modeloParaDocumento(capa, f);
        expect(d.formato).toBe(f);
        const foto = d.camadas.find((c): c is CamadaImagem => c.tipo === 'imagem')!;
        expect(foto, `${capa.id} ${f}`).toBeTruthy();
        expect([foto.w, foto.h]).toEqual([1080, 1080]);
        const { w, h } = TAMANHO_DOC[f];
        for (const c of d.camadas.filter((x) => x.tipo === 'texto' || x.tipo === 'itens' || x.tipo === 'selo')) {
          expect(c.x, `${capa.id} ${f} ${c.nome}`).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w, `${capa.id} ${f} ${c.nome}`).toBeLessThanOrEqual(w + 1);
          expect(c.y + c.h, `${capa.id} ${f} ${c.nome}`).toBeLessThanOrEqual(h + 1);
        }
      }
    }
  });

  it('o documento guardado pelo owner/ADM tem prioridade sobre o layout', () => {
    const d = modeloParaDocumento(CAPAS[1], '16:9');
    d.fundo = '#123456';
    expect(modeloParaDocumento({ ...CAPAS[1], documentos: { '16:9': d } }, '16:9').fundo).toBe('#123456');
  });
});

describe('editor de camadas', () => {
  it('texto quebra em linhas e a caixa cresce com o conteúdo', () => {
    const t = texto('T', 'uma frase bem comprida para quebrar em várias linhas', 0, 0, 300, { tamanho: 40 });
    expect(linhasDoTexto(t).length).toBeGreaterThan(1);
    expect(t.h).toBe(Math.round(alturaDoTexto(t)));
  });

  it('alça do canto aumenta sem mexer no canto oposto; com a camada girada também', () => {
    const c = { x: 100, y: 100, w: 200, h: 100, rot: 0 };
    expect(redimensionar(c, 1, 1, 50, 20, false)).toEqual({ x: 100, y: 100, w: 250, h: 120 });
    expect(redimensionar(c, -1, -1, -50, -20, false)).toEqual({ x: 50, y: 80, w: 250, h: 120 });
    const r = redimensionar({ ...c, rot: 90 }, 1, 0, 0, 40, false);
    expect(r.w).toBe(240);
    expect(r.h).toBe(100);
    expect(redimensionar(c, 1, 1, 100, 0, true)).toMatchObject({ w: 300, h: 150 });
  });
});
