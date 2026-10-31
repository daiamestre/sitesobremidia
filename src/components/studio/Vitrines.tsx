/**
 * SOBRE MÍDIA STUDIO — vitrines que giram sem parar (F-224).
 * - TvEmLoop: uma TV do banner (ou a capa de uma pasta) trocando as artes a cada 8 s, para sempre, como o Player (F-230).
 * - Carrossel: fileira infinita de modelos. Anda devagar sozinha; o dedo (ou o mouse) dá impulso: arrastar para um
 *   lado acelera e/ou inverte o sentido, e depois ela volta a andar devagar nesse sentido. Não é clicável.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { modeloParaDocumento } from '@/lib/studio/documento';
import type { Documento, FormatoDoc } from '@/lib/studio/documento';
import { temAnimacao } from '@/lib/studio/animacao';
import { CapaQueGira, ordemDaCapa, TEMPO_DE_CADA_MIDIA, type Slide } from '@/components/media/CapaQueGira';
import type { ModeloDeArte } from '@/lib/studio/modelos';
import { miniaturaDoModelo, urlPronta, useMiniatura } from '@/lib/studio/miniaturas';
import { CRUZEIRO, impulsoDoGesto, passoDoCarrossel } from '@/lib/studio/carrossel';
import { cn } from '@/lib/utils';

/** F-230: a arte do modelo que tem animação gravada (owner/ADM) toca animada nas capas. */
export function docAnimado(m: ModeloDeArte, formato: FormatoDoc): Documento | null {
  const d = m.documentos?.[formato];
  return d && temAnimacao(d) ? d : null;
}

/**
 * Uma TV (ou a capa de uma pasta) passando as artes como o Player: 8 s cada, para sempre; arte animada toca animada
 * e entra primeiro. Só baixa e troca quando está na tela (CapaQueGira).
 */
export function TvEmLoop({ modelos, formato, intervalo = TEMPO_DE_CADA_MIDIA, atraso = 0, className }: { modelos: ModeloDeArte[]; formato: FormatoDoc; intervalo?: number; atraso?: number; className?: string }) {
  const largura = formato === '16:9' ? 480 : 270;
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let vivo = true;
    // as miniaturas prontas (build) já têm endereço; só os modelos gravados no banco são desenhados (na fila ociosa)
    modelos.forEach((m) => {
      if (urlPronta(m, formato) || docAnimado(m, formato)) return;
      void miniaturaDoModelo(m, formato, largura).then((u) => { if (vivo) setUrls((l) => ({ ...l, [m.id]: u })); });
    });
    return () => { vivo = false; };
  }, [modelos, formato, largura]);
  const slides = useMemo(() => ordemDaCapa(modelos.map((m): Slide => {
    const d = docAnimado(m, formato);
    return d ? { chave: m.id, animada: () => <PreviaDocumento doc={d} animar sempre /> } : { chave: m.id, imagem: urlPronta(m, formato) ?? urls[m.id] ?? null };
  }).filter((x) => x.animada || x.imagem)), [modelos, formato, urls]);
  return <CapaQueGira slides={slides} tempo={intervalo} atraso={atraso} className={className} style={{ aspectRatio: formato === '16:9' ? '16 / 9' : '9 / 16' }} />;
}

function Item({ m, formato, largura }: { m: ModeloDeArte; formato: FormatoDoc; largura: number }) {
  const url = useMiniatura(m, formato, formato === '16:9' ? 320 : 180);
  const altura = formato === '16:9' ? (largura * 9) / 16 : (largura * 16) / 9;
  return (
    <div className="sm-carrossel-item relative shrink-0 overflow-hidden rounded-xl" style={{ width: largura, height: altura }} title={m.nome}>
      {url ? <img src={url} alt={m.nome} draggable={false} loading="lazy" decoding="async" width={largura} height={Math.round(altura)} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[#22004A]" />}
    </div>
  );
}

const GAP = 14;

export function Carrossel({ modelos, formato, direcao, largura, rotulo }: { modelos: ModeloDeArte[]; formato: FormatoDoc; direcao: -1 | 1; largura: number; rotulo: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const total = modelos.length * (largura + GAP);
  const estado = useRef({ x: 0, v: direcao * CRUZEIRO, arrastando: false, px: 0, pt: 0, vel: 0, id: -1 });

  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let t0 = performance.now();
    let visivel = true;
    // fora da tela (ou com o app em segundo plano) o carrossel para: nada de trabalho escondido
    const io = 'IntersectionObserver' in window && caixa.current ? new IntersectionObserver(([e]) => { visivel = e.isIntersecting; if (visivel && !raf) { t0 = performance.now(); raf = requestAnimationFrame(quadro); } }) : null;
    if (io && caixa.current) io.observe(caixa.current);
    const quadro = (t: number) => {
      if (!visivel || document.hidden) { raf = 0; return; }
      const dt = Math.min(64, t - t0);
      t0 = t;
      const e = estado.current;
      if (!e.arrastando) Object.assign(e, passoDoCarrossel(e, dt, direcao, total));
      else if (total > 0) e.x = (((e.x % total) + total) % total) - total;
      if (trilho.current) trilho.current.style.transform = `translate3d(${e.x}px,0,0)`;
      raf = requestAnimationFrame(quadro);
    };
    const voltar = () => { if (!document.hidden && visivel && !raf) { t0 = performance.now(); raf = requestAnimationFrame(quadro); } };
    document.addEventListener('visibilitychange', voltar);
    raf = requestAnimationFrame(quadro);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener('visibilitychange', voltar); };
  }, [total, direcao]);

  const pegar = (ev: React.PointerEvent) => {
    const e = estado.current;
    e.arrastando = true; e.px = ev.clientX; e.pt = performance.now(); e.vel = 0; e.id = ev.pointerId;
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* ponteiro já solto */ }
  };
  const mover = (ev: React.PointerEvent) => {
    const e = estado.current;
    if (!e.arrastando || ev.pointerId !== e.id) return;
    const agora = performance.now();
    const dx = ev.clientX - e.px;
    const dt = Math.max(1, agora - e.pt);
    e.x += dx;
    e.vel = e.vel * 0.6 + (dx / dt) * 0.4;
    e.px = ev.clientX; e.pt = agora;
  };
  const soltar = (ev: React.PointerEvent) => {
    const e = estado.current;
    if (!e.arrastando || ev.pointerId !== e.id) return;
    e.arrastando = false;
    // impulso do dedo: quanto mais rápido o gesto, mais rápido gira (e o sentido segue o dedo)
    e.v = impulsoDoGesto(e.v, e.vel);
  };

  if (!modelos.length) return null;
  return (
    <div ref={caixa} className="sm-carrossel relative cursor-grab select-none overflow-hidden py-2 active:cursor-grabbing" style={{ touchAction: 'pan-y' }} aria-label={rotulo} role="marquee"
      onPointerDown={pegar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} data-testid={`carrossel-${formato === '16:9' ? 'horizontal' : 'vertical'}`}>
      <div ref={trilho} className="flex w-max will-change-transform" style={{ gap: GAP }}>
        {[...modelos, ...modelos].map((m, k) => <Item key={`${m.id}-${k}`} m={m} formato={formato} largura={largura} />)}
      </div>
      {/* pontas que somem (gradiente parado: mais leve que máscara animada) */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0d0424] to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0d0424] to-transparent" />
    </div>
  );
}

/** Miniatura de um modelo: imagem pronta (instantânea) ou, para modelo novo do owner/ADM, o desenho no aparelho. */
export function MiniaturaDoModelo({ m, formato, className }: { m: ModeloDeArte; formato: FormatoDoc; className?: string }) {
  const url = urlPronta(m, formato);
  const doc = useMemo(() => (url ? null : modeloParaDocumento(m, formato)), [url, m, formato]);
  if (doc) return <PreviaDocumento doc={doc} className={className} />;
  return (
    <img src={url!} alt={m.nome} loading="lazy" decoding="async" draggable={false} width={formato === '16:9' ? 560 : 315} height={formato === '16:9' ? 315 : 560}
      className={cn('block h-auto w-full', className)} style={{ aspectRatio: formato === '16:9' ? '16 / 9' : '9 / 16' }} />
  );
}
