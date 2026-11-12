/**
 * F-303 (pedido do dono, 12/11/2026) — GRAVADOR das capas em vídeo. NÃO entra no app: só o script
 * `scripts/studio/gravar-capas.mjs` importa este módulo (pelo servidor de desenvolvimento) para desenhar, quadro a quadro,
 * cada modelo de encarte e de palco com os produtos e as fotos de exemplo do segmento. O script junta os quadros num MP4
 * leve (ffmpeg) que o Studio toca em loop como capa — o tablet só decodifica vídeo, nada é desenhado ao vivo.
 */
import { desenharDocumento, prepararDocumento } from './desenhar';
import { documentoDoEncarteOficial, encartesDoSegmento } from './encartesOficiais';
import { fundosDoSegmento, palcoDoProduto, type SegmentoDoStudio } from './palco';
import { SEGMENTOS_COM_OFERTAS, infoDaPasta } from './pastasDoSegmento';
import { coreografia, duracaoDoVideo, temAnimacao } from './animacao';
import { TAMANHO_DOC, type Documento } from './documento';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { buscarNoCatalogo } from '@/lib/tabloide/imagens';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { nomeSemMedida } from '@/components/studio/EncartesDoStudio';

export interface CapaParaGravar { id: string; tipo: 'encarte' | 'palco'; segmento: SegmentoDoStudio; nome: string }

/** todos os modelos de encarte e de palco de todos os segmentos */
export function listaDeCapas(): CapaParaGravar[] {
  return SEGMENTOS_COM_OFERTAS.flatMap((s) => [
    ...encartesDoSegmento(s).map((o) => ({ id: `encarte-${o.id}`, tipo: 'encarte' as const, segmento: s, nome: o.nome })),
    ...fundosDoSegmento(s).map((f) => ({ id: `palco-${f.id}`, tipo: 'palco' as const, segmento: s, nome: f.nome })),
  ]);
}

async function cestaComFotos(s: SegmentoDoStudio) {
  const lista = lerLista(infoDaPasta(s).cestaDaCapa);
  const fotos = await buscarNoCatalogo(lista.flatMap((p) => [p.nome, nomeSemMedida(p.nome)]));
  return lista.map((p) => ({ ...p, imagem: fotos.get(chaveCanonica(p.nome)) ?? fotos.get(chaveCanonica(nomeSemMedida(p.nome))) ?? null }));
}

/** cenas da capa: [documento, segundos] — encarte: o encarte animado; palco: 3 produtos no palco, um de cada vez */
async function cenas(c: CapaParaGravar): Promise<Array<[Documento, number]>> {
  const cesta = await cestaComFotos(c.segmento);
  if (c.tipo === 'encarte') {
    const o = encartesDoSegmento(c.segmento).find((x) => `encarte-${x.id}` === c.id)!;
    const d0 = documentoDoEncarteOficial(o, cesta, {}, c.segmento === 'mercado' ? undefined : '9:16');
    const d = temAnimacao(d0) ? d0 : coreografia(d0);
    return [[d, Math.min(6, duracaoDoVideo(d)) + 1.2]];
  }
  const f = fundosDoSegmento(c.segmento).find((x) => `palco-${x.id}` === c.id)!;
  return cesta.slice(0, 3).map((p) => [palcoDoProduto(p, '9:16', { fundo: f, textoBotao: f.botoes[0], segundos: 4 }), 3.6] as [Documento, number]);
}

/**
 * Desenha a capa quadro a quadro. Devolve as imagens (JPEG em data URL) de cada quadro, já no tamanho do vídeo.
 * `largura` (px) é a largura do vídeo; a altura sai da proporção do modelo (sempre par, como o H.264 pede).
 */
export async function quadrosDaCapa(id: string, largura = 360, fps = 20): Promise<{ largura: number; altura: number; fps: number; quadros: string[] }> {
  const c = listaDeCapas().find((x) => x.id === id);
  if (!c) throw new Error(`capa desconhecida: ${id}`);
  const lista = await cenas(c);
  const { w, h } = TAMANHO_DOC[lista[0][0].formato];
  const W = Math.round(largura / 2) * 2, H = Math.round((largura * h) / w / 2) * 2;
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  const ctx = tela.getContext('2d')!;
  const quadros: string[] = [];
  for (const [doc, seg] of lista) {
    const imgs = await prepararDocumento(doc);
    const k = W / TAMANHO_DOC[doc.formato].w;
    const n = Math.round(seg * fps);
    for (let i = 0; i < n; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      desenharDocumento(ctx, doc, imgs, k, null, i / fps, true);
      quadros.push(tela.toDataURL('image/jpeg', 0.9));
    }
  }
  return { largura: W, altura: H, fps, quadros };
}
