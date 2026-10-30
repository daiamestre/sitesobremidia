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

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const nomeDoArquivo = (nome: string) => `${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'arte'}.png`;
