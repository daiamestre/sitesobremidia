// F-226 — a página do Studio não desenha artes no aparelho: todo modelo do catálogo tem miniatura PRONTA e leve.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { CAPAS, modelosDaPasta } from '@/lib/studio/pastas';
import { MINIATURAS_PRONTAS } from '@/lib/studio/miniaturas-prontas';
import { urlPronta } from '@/lib/studio/miniaturas';

const modelos = CAPAS.flatMap((c) => modelosDaPasta(c));

describe('miniaturas prontas do Studio', () => {
  it('todo modelo do catálogo tem miniatura 16:9 e 9:16 (rode scripts/studio/gerar-miniaturas.mjs se mudar modelo ou foto)', () => {
    const faltam = modelos.filter((m) => !MINIATURAS_PRONTAS[m.id]).map((m) => m.id);
    expect(faltam).toEqual([]);
    for (const m of modelos) {
      for (const l of ['h', 'v']) {
        const arq = `public/studio/miniaturas/${m.id}-${l}.webp`;
        expect(fs.existsSync(arq), arq).toBe(true);
        expect(fs.statSync(arq).size).toBeLessThan(90 * 1024); // leve: carrega na hora no tablet
      }
    }
  });
  it('o endereço leva a impressão do arquivo (cache certo quando a arte muda)', () => {
    const m = modelos[0];
    expect(urlPronta(m, '16:9')).toBe(`/studio/miniaturas/${m.id}-h.webp?v=${MINIATURAS_PRONTAS[m.id].h}`);
    expect(urlPronta({ ...m, documentos: {} } as typeof m, '9:16')).toBeNull(); // modelo editado pelo owner/ADM: desenha no aparelho
  });
  it('sem efeitos pesados: nada de desfoque animado, máscara ou borda girando na página', () => {
    const css = fs.readFileSync('src/components/studio/studio-efeitos.css', 'utf8');
    expect(css).not.toMatch(/filter:\s*blur/);
    expect(css).not.toMatch(/mask-image/);
    expect(css).not.toMatch(/sm-girar|@property/);
    const v = fs.readFileSync('src/components/studio/Vitrines.tsx', 'utf8');
    expect(v).toContain('IntersectionObserver'); // carrossel para quando sai da tela
  });
});
