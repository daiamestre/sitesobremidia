// SOBRE MÍDIA STUDIO — miniaturas em imagem (F-224): cada modelo é desenhado UMA vez num canvas pequeno e vira uma
// imagem JPEG guardada em memória. F-226: os modelos do catálogo já vêm com miniatura PRONTA (public/studio/miniaturas,
// gerada por scripts/studio/gerar-miniaturas.mjs) — o aparelho só desenha os modelos novos criados pelo owner/ADM,
// em fila e só quando está livre. Nada de centenas de canvases vivos no tablet.
import { useEffect, useState } from 'react';
import { TAMANHO_DOC, modeloParaDocumento, type FormatoDoc } from './documento';
import { desenharDocumento, prepararDocumento } from './desenhar';
import type { ModeloDeArte } from './modelos';
import { MINIATURAS_PRONTAS } from './miniaturas-prontas';

/** Endereço da miniatura pronta (leve, em cache no navegador), ou null se o modelo ainda não tem. */
export function urlPronta(m: ModeloDeArte, formato: FormatoDoc): string | null {
  const p = !m.documentos ? MINIATURAS_PRONTAS[m.id] : undefined;
  const l = formato === '16:9' ? 'h' : 'v';
  return p ? `/studio/miniaturas/${m.id}-${l}.webp?v=${p[l]}` : null;
}

const prontas = new Map<string, string | null>();
const pedidos = new Map<string, Promise<string | null>>();
let fila: Promise<unknown> = Promise.resolve();

async function desenhar(m: ModeloDeArte, formato: FormatoDoc, largura: number): Promise<string | null> {
  const doc = modeloParaDocumento(m, formato);
  const { w, h } = TAMANHO_DOC[formato];
  const imgs = await prepararDocumento(doc);
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = Math.round((largura * h) / w);
  const ctx = tela.getContext('2d');
  if (!ctx) return null;
  desenharDocumento(ctx, doc, imgs, largura / w);
  try { return tela.toDataURL('image/jpeg', 0.84); } catch { return null; } // foto de outro site sem permissão: fica sem miniatura
}

export function miniaturaDoModelo(m: ModeloDeArte, formato: FormatoDoc, largura: number): Promise<string | null> {
  const pronta = urlPronta(m, formato);
  if (pronta) return Promise.resolve(pronta);
  const chave = `${m.id}|${formato}|${largura}`;
  const ja = pedidos.get(chave);
  if (ja) return ja;
  // desenha só quando o aparelho estiver livre (não trava a rolagem)
  const livre = () => new Promise<void>((ok) => { const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }; if (w.requestIdleCallback) w.requestIdleCallback(() => ok(), { timeout: 1500 }); else setTimeout(ok, 50); });
  const p = fila.then(livre).then(() => desenhar(m, formato, largura)).catch(() => null)
    .then((url) => { prontas.set(chave, url); return url; });
  fila = p;
  pedidos.set(chave, p);
  return p;
}

/** A miniatura já pronta (ou null enquanto desenha). */
export function useMiniatura(m: ModeloDeArte | null | undefined, formato: FormatoDoc, largura: number): string | null {
  const chave = m ? `${m.id}|${formato}|${largura}` : '';
  const pronta = m ? urlPronta(m, formato) : null;
  const [url, setUrl] = useState<string | null>(() => pronta ?? prontas.get(chave) ?? null);
  useEffect(() => {
    if (!m || pronta) return;
    let vivo = true;
    setUrl(prontas.get(chave) ?? null);
    void miniaturaDoModelo(m, formato, largura).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [m, chave, formato, largura, pronta]);
  return pronta ?? url;
}

/** Mistura os modelos por segmento (um de cada vez) para a vitrine não mostrar vários iguais em sequência. */
export function intercalarPorSegmento(lista: ModeloDeArte[]): ModeloDeArte[] {
  const grupos = new Map<string, ModeloDeArte[]>();
  for (const m of lista) grupos.set(m.segmento, [...(grupos.get(m.segmento) ?? []), m]);
  const filas = [...grupos.values()];
  const out: ModeloDeArte[] = [];
  for (let i = 0; out.length < lista.length; i++) for (const f of filas) if (f[i]) out.push(f[i]);
  return out;
}
