// SOBRE MÍDIA STUDIO — grava a arte ANIMADA em vídeo no próprio navegador (F-225), sem servidor e sem custo:
// o mesmo desenho do PNG (1920×1080 ou 1080×1920) é pintado quadro a quadro num canvas e o MediaRecorder grava.
// MP4 (H.264) quando o navegador sabe gravar; senão WebM. O Player toca os dois e a compressão do site converte.
import { TAMANHO_DOC, type Documento } from './documento';
import { desenharDocumento, prepararDocumento } from './desenhar';
import { duracaoDoVideo } from './animacao';

export interface VideoGravado { video: Blob; mime: string; ext: 'mp4' | 'webm'; largura: number; altura: number; duracaoMs: number; capa: Blob | null; quadros: Blob[] }

const OPCOES: [string, 'mp4' | 'webm'][] = [
  ['video/mp4;codecs=avc1.640028', 'mp4'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'],
];

export function formatoDeVideo(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
  const achado = OPCOES.find(([m]) => MediaRecorder.isTypeSupported(m));
  return achado ? { mime: achado[0], ext: achado[1] } : null;
}

const jpeg = (c: HTMLCanvasElement) => new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));

/** Grava o vídeo (leva o tempo do próprio vídeo: 8 s de vídeo = ~8 s gravando). Deixe a tela aberta durante a gravação. */
export async function documentoParaVideo(d: Documento, aoProgredir?: (fracao: number) => void): Promise<VideoGravado> {
  const formato = formatoDeVideo();
  if (!formato) throw new Error('Este navegador não grava vídeo. Use o Chrome atualizado (computador, tablet ou celular).');
  const { w, h } = TAMANHO_DOC[d.formato];
  const total = duracaoDoVideo(d);
  const imgs = await prepararDocumento(d);
  const tela = document.createElement('canvas');
  tela.width = w; tela.height = h;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue desenhar a arte.');
  desenharDocumento(ctx, d, imgs, 1, null, 0);

  // quadros para a análise de conteúdo (início, meio e fim) e a capa (último quadro, com tudo na tela)
  const quadros: Blob[] = [];
  for (const t of [total * 0.2, total * 0.55, total]) { desenharDocumento(ctx, d, imgs, 1, null, t); const b = await jpeg(tela); if (b) quadros.push(b); }
  const capa = quadros[quadros.length - 1] ?? null;
  desenharDocumento(ctx, d, imgs, 1, null, 0);

  const fluxo = (tela as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const gravador = new MediaRecorder(fluxo, { mimeType: formato.mime, videoBitsPerSecond: 8_000_000 });
  const pedacos: Blob[] = [];
  gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  const fim = new Promise<void>((ok) => { gravador.onstop = () => ok(); });
  gravador.start(250);
  const inicio = performance.now();
  await new Promise<void>((ok) => {
    const quadro = () => {
      const t = (performance.now() - inicio) / 1000;
      desenharDocumento(ctx, d, imgs, 1, null, Math.min(t, total));
      aoProgredir?.(Math.min(1, t / total));
      // relógio de 30 quadros por segundo (não para se o navegador economizar animação da página)
      if (t >= total + 0.15) ok(); else setTimeout(quadro, 1000 / 30);
    };
    quadro();
  });
  gravador.stop();
  await fim;
  fluxo.getTracks().forEach((t) => t.stop());
  const video = new Blob(pedacos, { type: formato.mime.split(';')[0] });
  if (!video.size) throw new Error('A gravação saiu vazia. Mantenha a tela do Studio aberta enquanto o vídeo é criado.');
  return { video, mime: formato.mime.split(';')[0], ext: formato.ext, largura: w, altura: h, duracaoMs: Math.round(total * 1000), capa, quadros };
}
