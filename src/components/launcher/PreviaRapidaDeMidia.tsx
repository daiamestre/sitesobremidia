import { useEffect, useRef, useState } from 'react';
import { Film, Pause, Play, Volume2, VolumeX } from 'lucide-react';

/**
 * F-213 — prévia rápida de uma mídia (seletor da launcher e cartões dos Destaques): a foto inteira, sem cortar; o vídeo
 * toca ali mesmo com tocar/pausar e volume. Só um vídeo toca por vez (quem usa controla com [tocando]/[onTocar]).
 */
export interface MidiaDaPrevia { id: string; name: string; file_url: string | null; file_type: string | null; thumbnail_url: string | null }

export const ehVideo = (t?: string | null) => (t ?? '').startsWith('video');

export function PreviaRapidaDeMidia({ midia, tocando, onTocar, className }: {
  midia: MidiaDaPrevia | null | undefined;
  tocando: boolean;
  onTocar: (tocar: boolean) => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [pausado, setPausado] = useState(true);
  const [volume, setVolume] = useState(0.6);
  const [mudo, setMudo] = useState(false);
  useEffect(() => { if (!tocando) setPausado(true); }, [tocando]);
  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = mudo; } }, [volume, mudo, tocando]);
  // o navegador pode recusar tocar com som sem um clique "de verdade": tenta de novo sem som, e o botão mostra o real
  useEffect(() => {
    const v = video.current;
    if (!tocando || !v) return;
    const tocar = () => { try { return Promise.resolve(v.play()); } catch (e) { return Promise.reject(e); } };
    tocar().then(() => setPausado(v.paused)).catch(() => {
      v.muted = true; setMudo(true);
      tocar().then(() => setPausado(v.paused)).catch(() => setPausado(true));
    });
  }, [tocando]);

  if (!midia) return <div className={`flex items-center justify-center bg-black/40 ${className ?? ''}`}><Film className="h-6 w-6 text-muted-foreground" /></div>;
  const capa = midia.thumbnail_url || (!ehVideo(midia.file_type) ? midia.file_url : null);
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  if (ehVideo(midia.file_type) && tocando && midia.file_url) {
    return (
      <div className={`relative bg-black ${className ?? ''}`} onClick={parar} data-testid="previa-tocando">
        <video ref={video} src={midia.file_url} playsInline loop className="absolute inset-0 h-full w-full object-contain"
          onPlay={() => setPausado(false)} onPause={() => setPausado(true)} />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-4">
          <button type="button" aria-label={pausado ? 'Tocar' : 'Pausar'} className="rounded-full bg-white/15 p-1 text-white hover:bg-white/30"
            onClick={(e) => { parar(e); const v = video.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); }}>
            {pausado ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button type="button" aria-label={mudo ? 'Ligar o som' : 'Tirar o som'} className="rounded-full bg-white/15 p-1 text-white hover:bg-white/30"
            onClick={(e) => { parar(e); setMudo(!mudo); }}>
            {mudo || volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : volume} aria-label="Volume" onClick={parar}
            onChange={(e) => { setVolume(Number(e.target.value)); setMudo(Number(e.target.value) === 0); }}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-cyan-400" />
          <button type="button" aria-label="Fechar a prévia" className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold text-white hover:bg-white/30"
            onClick={(e) => { parar(e); onTocar(false); }}>✕</button>
        </div>
      </div>
    );
  }
  return (
    <div className={`relative bg-black/50 ${className ?? ''}`}>
      {capa
        ? <img src={capa} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
        : <div className="absolute inset-0 flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground" /></div>}
      {ehVideo(midia.file_type) && midia.file_url && (
        <button type="button" aria-label={`Prévia de ${midia.name}`} data-testid="previa-tocar"
          className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-300/70 bg-black/60 text-white shadow-[0_0_12px_rgba(34,211,238,0.5)] transition hover:scale-110"
          onClick={(e) => { parar(e); onTocar(true); }}>
          <Play className="ml-0.5 h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** "1:05" a partir de milissegundos (vídeo) ou segundos. */
export function tempoCurto(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
