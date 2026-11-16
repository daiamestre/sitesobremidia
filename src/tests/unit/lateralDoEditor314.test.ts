/**
 * F-314 (regressão relatada pelo dono, 16/11/2026): na edição do encarte em pé, no tablet, a lateral (botões de criação e
 * ferramentas) sumia — a linha do tempo do vídeo embaixo da arte alargava a coluna "auto" da arte até a lateral ficar com 0 px.
 * O que fica embaixo da arte em pé segue a largura da arte (w-0 + min-w-full) e não empurra mais a lateral.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('F-314: a lateral do editor de encarte não some no tablet', () => {
  const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
  it('a barra de movimento e a linha do tempo seguem a largura da arte em pé', () => {
    expect(editor).toContain("const larguraDaArte = vertical ? 'min-[540px]:w-0 min-[540px]:min-w-full' : undefined;");
    expect(editor).toMatch(/cn\("space-y-2 rounded-2xl border border-\[#8A2EFF\]\/40 bg-\[#14062f\] p-3", larguraDaArte\)\} data-testid="studio-barra-movimento"/);
    expect(editor).toMatch(/cn\("space-y-2 rounded-2xl border border-\[#25D366\]\/30 bg-\[#0b1f14\]\/30 p-2", larguraDaArte\)\} data-testid="studio-editor-video"/);
  });
  it('a lateral com os botões de criação continua ao lado da arte', () => {
    expect(editor).toContain("min-[540px]:grid-cols-[auto_minmax(0,1fr)]");
    expect(editor).toContain('data-testid="studio-lateral"');
    expect(editor).toContain('{vertical && barraAdicionar}');
  });
});
