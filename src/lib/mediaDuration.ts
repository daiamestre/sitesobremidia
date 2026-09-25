import { clampDuration, DEFAULT_DURATION_SECONDS } from '@/lib/playlistItems';
import { mp4DurationMs } from '@/lib/mp4Duration';

/**
 * Duração de um vídeo lida dos metadados (sem baixar o arquivo). A tabela `media` não guarda duração, então antes todo
 * vídeo entrava na playlist com 10 s — e o Player usa a duração do item como TETO (vídeo de 60 s era cortado aos 10 s).
 * Falha/timeout = null (o chamador mantém o padrão de 10 s).
 */
export function probeVideoDuration(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !url) return resolve(null);
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d > 0 ? Math.ceil(d) : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}


export type UploadFileKind = 'image' | 'video' | 'audio' | 'other';

/**
 * Tempo com que uma mídia ENTRA na tela de Upload ("Tempo de Mídia"): vídeo/áudio = duração real do arquivo;
 * imagem (sem duração própria) = 10 s; sem leitura possível = 10 s (nunca 0). Limitado a 24 h.
 */
export function defaultDurationForFile(kind: UploadFileKind, probedSeconds: number | null | undefined): number {
  if ((kind === 'video' || kind === 'audio') && probedSeconds && probedSeconds > 0) return clampDuration(probedSeconds);
  return DEFAULT_DURATION_SECONDS;
}

/**
 * Tempo que cada arquivo leva para a playlist ao enviar: se o usuário editou o campo, vale o digitado (todos);
 * senão cada arquivo usa o SEU tempo detectado (num lote, cada mídia mantém o tempo dela).
 */
export function durationForUpload(opts: { touched: boolean; typed: number; detected: number | null | undefined }): number {
  if (opts.touched) return clampDuration(opts.typed);
  return clampDuration(opts.detected ?? opts.typed);
}

/** Duração (s, arredondada para cima) lida dos metadados do ARQUIVO LOCAL (nada é enviado); null se não der. */
export async function probeFileDuration(file: File, timeoutMs = 8000): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    return await probeVideoDuration(url, timeoutMs);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------------ duração exata (ms)

/** "17,764 s" — duração exata com milésimos (padrão brasileiro). */
export function formatDurationMs(ms: number): string {
  return `${(ms / 1000).toFixed(3).replace('.', ',')} s`;
}

/**
 * Tempo de Mídia (segundos inteiros, é o que o banco/Player guardam) para tocar o vídeo INTEIRO: segundo cheio para cima.
 * O Player toca min(configurado, real) = exatamente a duração real — nem corta o final nem sobra tempo na tela.
 */
export function secondsForRealMs(ms: number | null | undefined): number | null {
  if (!ms || ms <= 0) return null;
  return clampDuration(Math.ceil(ms / 1000));
}

/** O que a tela faz com esse Tempo de Mídia: toca o vídeo inteiro (real) ou corta antes do fim. */
export function playbackOf(configuredSeconds: number, realMs: number | null | undefined): { playsMs: number; cut: boolean } | null {
  if (!realMs || realMs <= 0) return null;
  const cfgMs = configuredSeconds * 1000;
  return cfgMs >= realMs ? { playsMs: realMs, cut: false } : { playsMs: cfgMs, cut: true };
}

/** Duração exata (ms) de um vídeo por URL pelo `<video>` (fallback quando não há duração gravada). */
export function probeVideoDurationMs(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !url) return resolve(null);
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/**
 * Duração exata (ms) do ARQUIVO LOCAL: lê as caixas do MP4 (mesma régua do Player, funciona com MP4 fragmentado);
 * se não for MP4, usa o `<video>` do navegador. Nada é enviado.
 */
export async function probeFileDurationMs(file: File, timeoutMs = 8000): Promise<number | null> {
  try {
    const exact = mp4DurationMs(await file.arrayBuffer());
    if (exact) return exact;
  } catch {
    // arquivo ilegível: tenta pelo <video>
  }
  const url = URL.createObjectURL(file);
  try {
    return await probeVideoDurationMs(url, timeoutMs);
  } finally {
    URL.revokeObjectURL(url);
  }
}
