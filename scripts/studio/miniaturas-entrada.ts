// F-226 — página de trabalho do gerador de miniaturas (scripts/studio/gerar-miniaturas.mjs): usa EXATAMENTE o
// mesmo desenho do site (documento.ts + desenhar.ts) dentro de um Chrome automático e devolve cada miniatura em WebP.
import { CAPAS, modelosDaPasta } from '../../src/lib/studio/pastas';
import { modeloParaDocumento, TAMANHO_DOC, type FormatoDoc } from '../../src/lib/studio/documento';
import { desenharDocumento, prepararDocumento } from '../../src/lib/studio/desenhar';

const modelos = CAPAS.flatMap((c) => modelosDaPasta(c));

Object.assign(window as unknown as Record<string, unknown>, {
  listarModelos: () => modelos.map((m) => m.id),
  desenharModelo: async (id: string, formato: FormatoDoc, largura: number) => {
    const m = modelos.find((x) => x.id === id);
    if (!m) return null;
    const doc = modeloParaDocumento(m, formato);
    const { w, h } = TAMANHO_DOC[formato];
    const imgs = await prepararDocumento(doc);
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = Math.round((largura * h) / w);
    const ctx = tela.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    desenharDocumento(ctx, doc, imgs, largura / w);
    return tela.toDataURL('image/webp', 0.82);
  },
});
