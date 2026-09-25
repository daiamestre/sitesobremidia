import { clampDuration, DEFAULT_DURATION_SECONDS } from '@/lib/playlistItems';

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
