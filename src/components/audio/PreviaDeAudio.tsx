import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { anunciarQueComecou, anunciarQueParou, formatarTempo, limitar } from '@/lib/previaDeAudio';

/**
 * F-162 — Prévia de áudio: tocar/pausar, barra para avançar ou voltar, tempo e volume (com silenciar).
 * Só um áudio toca por vez (começar um pausa o outro). Variante "mini": só o botão de tocar e o tempo, para listas.
 * `src` pode ser um endereço ou um arquivo escolhido no computador (File: a janela cuida do endereço temporário).
 */
export function PreviaDeAudio({ src, arquivo, titulo, variante = 'completa', duracaoMs, tocarAoAbrir = false }: {
  src?: string | null;
  arquivo?: File | null;
  titulo?: string;
  variante?: 'completa' | 'mini';
  /** Duração já conhecida (ms), mostrada até o áudio carregar. */
  duracaoMs?: number | null;
  /** Começa a tocar assim que carregar (janela de prévia aberta pela pessoa). O navegador pode recusar; então basta tocar no botão. */
  tocarAoAbrir?: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [endereco, setEndereco] = useState<string | null>(src ?? null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(duracaoMs && duracaoMs > 0 ? duracaoMs / 1000 : 0);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [erro, setErro] = useState(false);

  // arquivo do computador: endereço temporário só enquanto a prévia existe
  useEffect(() => {
    if (!arquivo) { setEndereco(src ?? null); return; }
    const url = URL.createObjectURL(arquivo);
    setEndereco(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo, src]);

  useEffect(() => { setErro(false); setAtual(0); setTocando(false); }, [endereco]);

  const pausar = useCallback(() => { audio.current?.pause(); }, []);
  useEffect(() => {
    if (!tocarAoAbrir || !endereco) return;
    anunciarQueComecou(pausar);
    audio.current?.play().catch(() => anunciarQueParou(pausar));
  }, [tocarAoAbrir, endereco, pausar]);
  useEffect(() => () => { audio.current?.pause(); anunciarQueParou(pausar); }, [pausar]);

  const alternar = async () => {
    const a = audio.current;
    if (!a || !endereco) return;
    if (a.paused) {
      anunciarQueComecou(pausar);
      try { await a.play(); } catch { setErro(true); anunciarQueParou(pausar); }
    } else a.pause();
  };

  const rotulo = titulo ? ` — ${titulo}` : '';
  const botao = (
    <button type="button" onClick={alternar} disabled={!endereco || erro} data-testid="previa-tocar"
      aria-label={`${tocando ? 'Pausar' : 'Tocar'}${rotulo}`} title={tocando ? 'Pausar' : 'Tocar'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
      {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
    </button>
  );

  const elemento = (
    <audio ref={audio} src={endereco ?? undefined} preload="metadata" data-testid="previa-audio"
      onPlay={() => setTocando(true)} onPause={() => { setTocando(false); anunciarQueParou(pausar); }}
      onEnded={() => { setTocando(false); setAtual(0); anunciarQueParou(pausar); }}
      onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuracao(e.currentTarget.duration); }}
      onError={() => { if (endereco) setErro(true); }} />
  );

  if (variante === 'mini') {
    return (
      <span className="inline-flex items-center gap-1.5" data-testid="previa-mini">
        {botao}{elemento}
        <span className="font-mono text-[11px] text-muted-foreground">{tocando || atual > 0 ? `${formatarTempo(atual)} / ` : ''}{formatarTempo(duracao)}</span>
        {erro && <span className="text-[11px] text-destructive">sem prévia</span>}
      </span>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/60 p-2" data-testid="previa-completa">
      {botao}{elemento}
      <input type="range" min={0} max={duracao || 0} step={0.1} value={limitar(atual, duracao)} disabled={!endereco || erro || !duracao}
        onChange={(e) => { const t = Number(e.target.value); if (audio.current) audio.current.currentTime = t; setAtual(t); }}
        aria-label="Posição do áudio" data-testid="previa-posicao" className="h-1.5 min-w-[7rem] flex-1 cursor-pointer accent-primary" />
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground" data-testid="previa-tempo">{formatarTempo(atual)} / {formatarTempo(duracao)}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => { const m = !mudo; setMudo(m); if (audio.current) audio.current.muted = m; }} aria-label={mudo ? 'Ativar o som' : 'Silenciar'} aria-pressed={mudo}
          data-testid="previa-mudo" className="text-muted-foreground hover:text-foreground">
          {mudo || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : volume}
          onChange={(e) => { const v = Number(e.target.value); setVolume(v); setMudo(false); if (audio.current) { audio.current.volume = v; audio.current.muted = false; } }}
          aria-label="Volume da prévia" data-testid="previa-volume" className="h-1.5 w-20 cursor-pointer accent-primary" />
      </span>
      {erro && <p className="w-full text-xs text-destructive">Não foi possível tocar este áudio.</p>}
    </div>
  );
}
