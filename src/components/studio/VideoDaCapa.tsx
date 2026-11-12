/**
 * F-303 — a capa em VÍDEO de um modelo: MP4 leve em loop, sem som. A imagem fixa aparece na hora; o vídeo só toca
 * enquanto está na tela (fora dela pausa e libera o decodificador do aparelho).
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CapaEmVideo } from '@/lib/studio/capasEmVideo';

export function VideoDaCapa({ capa, className }: { capa: CapaEmVideo; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [naTela, setNaTela] = useState(false);
  useEffect(() => {
    const el = caixa.current;
    if (!el || !('IntersectionObserver' in window)) { setNaTela(true); return; }
    const io = new IntersectionObserver(([e]) => setNaTela(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (naTela) void v.play().catch(() => undefined); else v.pause();
  }, [naTela]);
  return (
    <div ref={caixa} className={cn('relative h-full w-full overflow-hidden bg-black', className)} data-testid="video-da-capa">
      <img src={capa.poster} alt="" draggable={false} decoding="async" className="absolute inset-0 h-full w-full object-contain" />
      {naTela && <video ref={video} src={capa.video} poster={capa.poster} muted playsInline autoPlay loop preload="auto" disablePictureInPicture className="video-inteiro absolute inset-0 h-full w-full object-contain" />}
    </div>
  );
}
