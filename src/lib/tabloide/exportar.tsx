/**
 * Tabloide Digital (F-172) — exporta o cartaz em PNG no tamanho real do formato (ex.: 1920×1080).
 * O cartaz é desenhado fora da tela, sem escala, e fotografado com html2canvas.
 */
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { TabloideCanvas, type TabloideCanvasProps } from '@/components/tabloide/TabloideCanvas';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function aguardarImagens(raiz: HTMLElement, limiteMs = 12000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const imgs = [...raiz.querySelectorAll('img')];
    if (imgs.every((i) => i.complete)) break;
    await esperar(150);
  }
  await esperar(150); // dá tempo de uma foto que falhou ser trocada pelo desenho
}

export async function renderizarPaginaEmPng(props: TabloideCanvasProps): Promise<Blob> {
  const palco = document.createElement('div');
  palco.style.cssText = `position:fixed;left:-100000px;top:0;width:${props.formato.largura}px;height:${props.formato.altura}px;pointer-events:none;`;
  document.body.appendChild(palco);
  const raiz = createRoot(palco);
  try {
    raiz.render(<TabloideCanvas {...props} />);
    await esperar(60);
    await aguardarImagens(palco);
    // os tipos antigos instalados (@types/html2canvas 0.5) não conhecem as opções da versão 1.4
    const opcoes = {
      useCORS: true,
      backgroundColor: null,
      scale: 1,
      width: props.formato.largura,
      height: props.formato.altura,
      logging: false,
    } as unknown as Parameters<typeof html2canvas>[1];
    const canvas = await html2canvas(palco.firstElementChild as HTMLElement, opcoes);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('Não foi possível gerar a imagem do cartaz.');
    return blob;
  } finally {
    raiz.unmount();
    palco.remove();
  }
}

export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function nomeDeArquivo(base: string, pagina: number, total: number): string {
  const limpo = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tabloide';
  return total > 1 ? `${limpo}-pagina-${pagina}.png` : `${limpo}.png`;
}
