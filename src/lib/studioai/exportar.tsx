/**
 * SOBRE MÍDIA STUDIO AI — fotografa um modelo de arte em tamanho real (1920×1080 ou 1080×1920) com html2canvas,
 * no mesmo molde do Cartaz Digital (src/lib/tabloide/exportar.tsx): desenho fora da tela, sem escala.
 */
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { ArteModelo } from '@/components/studio/ArteModelo';
import { carregarFonte } from '@/lib/tabloide/fontes';
import type { ModeloDeArte } from '@/lib/studio/modelos';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a foto de fundo da arte carregar (ela é background-image, não <img>). */
async function carregarFoto(url: string) {
  await new Promise<void>((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(); i.onerror = () => ok(); i.src = url; });
}

export async function renderizarArte(modelo: ModeloDeArte): Promise<{ png: Blob; largura: number; altura: number }> {
  const largura = modelo.formato === '16:9' ? 1920 : 1080;
  const altura = modelo.formato === '16:9' ? 1080 : 1920;
  const palco = document.createElement('div');
  palco.style.cssText = `position:fixed;left:-100000px;top:0;width:${largura}px;height:${altura}px;pointer-events:none;`;
  document.body.appendChild(palco);
  const raiz = createRoot(palco);
  try {
    await Promise.all([carregarFonte(modelo.fonte), carregarFoto(modelo.foto)]);
    raiz.render(<ArteModelo modelo={modelo} style={{ width: largura, height: altura }} />);
    await esperar(120);
    await document.fonts.ready;
    const opcoes = { useCORS: true, backgroundColor: null, scale: 1, width: largura, height: altura, logging: false } as unknown as Parameters<typeof html2canvas>[1];
    const canvas = await html2canvas(palco.firstElementChild as HTMLElement, opcoes);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!png) throw new Error('Não foi possível gerar a imagem da arte.');
    return { png, largura, altura };
  } finally {
    raiz.unmount();
    palco.remove();
  }
}

/** iPhone e iPad (o iPad novo se diz "Macintosh", mas tem toque) — lá o navegador não baixa arquivo pelo link */
const ehIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1));

/**
 * F-315 (pedido do dono): baixar em QUALQUER aparelho. Computador, Android e tablet: o arquivo vai para os Downloads/galeria
 * (o link fica na página e o endereço do arquivo vive 60 s — antes eram 2 s e o vídeo grande podia não terminar de sair no
 * celular). iPhone/iPad: abre o "Compartilhar", onde a pessoa toca em "Salvar vídeo"/"Salvar imagem".
 */
export function baixar(blob: Blob, nome: string) {
  if (ehIOS() && typeof File !== 'undefined' && navigator.canShare) {
    const arquivo = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [arquivo] })) {
      void navigator.share({ files: [arquivo], title: nome }).catch((e: Error) => { if (e?.name !== 'AbortError') baixarPeloLink(blob, nome); });
      return;
    }
  }
  baixarPeloLink(blob, nome);
}

function baixarPeloLink(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}

/** extensão certa do vídeo pelo tipo (o Studio grava MP4 e, em aparelho sem H.264, WebM) */
export const extensaoDoVideo = (tipo: string | null | undefined, url = '') => (/webm/i.test(tipo ?? '') || /\.webm(\?|$)/i.test(url) ? 'webm' : 'mp4');

export const nomeDoArquivo = (nome: string) => `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'arte'}.png`;
