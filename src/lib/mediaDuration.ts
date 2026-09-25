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
