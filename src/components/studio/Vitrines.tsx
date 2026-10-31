/**
 * SOBRE MÍDIA STUDIO — vitrines que giram sem parar (F-224).
 * - TvEmLoop: uma TV do banner trocando as artes em sequência, para sempre, como o Player nas telas.
 * - Carrossel: fileira infinita de modelos. Anda devagar sozinha; o dedo (ou o mouse) dá impulso: arrastar para um
 *   lado acelera e/ou inverte o sentido, e depois ela volta a andar devagar nesse sentido. Não é clicável.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { modeloParaDocumento } from '@/lib/studio/documento';
import type { FormatoDoc } from '@/lib/studio/documento';
import type { ModeloDeArte } from '@/lib/studio/modelos';
import { miniaturaDoModelo, urlPronta, useMiniatura } from '@/lib/studio/miniaturas';
import { CRUZEIRO, impulsoDoGesto, passoDoCarrossel } from '@/lib/studio/carrossel';
import { cn } from '@/lib/utils';

export function TvEmLoop({ modelos, formato, intervalo = 4500, atraso = 0, className }: { modelos: ModeloDeArte[]; formato: FormatoDoc; intervalo?: number; atraso?: number; className?: string }) {
  const largura = formato === '16:9' ? 480 : 270;
  const [i, setI] = useState(0);
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    let vivo = true;
    setUrls([]);
    modelos.forEach((m, k) => void miniaturaDoModelo(m, formato, largura).then((u) => { if (vivo) setUrls((l) => { const n = [...l]; n[k] = u; return n; }); }));
    return () => { vivo = false; };
  }, [modelos, formato, largura]);
  useEffect(() => {
    let relogio: ReturnType<typeof setInterval> | undefined;
    const inicio = setTimeout(() => { relogio = setInterval(() => setI((x) => x + 1), intervalo); }, atraso);
    return () => { clearTimeout(inicio); clearInterval(relogio); };
  }, [intervalo, atraso]);
  const prontas = urls.map((u, k) => ({ u, k })).filter((x) => x.u);
  const atual = prontas.length ? prontas[i % prontas.length].k : -1;
  return (
    <div className={cn('relative overflow-hidden bg-black', className)} style={{ aspectRatio: formato === '16:9' ? '16 / 9' : '9 / 16' }}>
      {urls.map((u, k) => {
        // só a arte da vez, a anterior (saindo) e a próxima (já baixando) ficam na página
        const perto = prontas.length && (k === atual || k === prontas[(i + 1) % prontas.length]?.k || k === prontas[(i + prontas.length - 1) % prontas.length]?.k);
        return u && perto ? <img key={k} src={u} alt="" draggable={false} decoding="async" className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700" style={{ opacity: k === atual ? 1 : 0 }} /> : null;
      })}
      {atual < 0 && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#22004A] to-[#0B0420]" />}
    </div>
  );
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
