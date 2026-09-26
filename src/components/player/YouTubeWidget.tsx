import { useEffect, useState } from 'react';
import { Youtube } from 'lucide-react';
import type { WidgetConfig } from '@/types/models';
import { lerYoutube, youtubeEmbedUrl } from '@/lib/youtube';
import { Cabecalho, Moldura } from './OfferWidget';

/** YouTube pelo player oficial (embed). Estados: carregando / pronto / link inválido / sem internet. */
export function YouTubeWidget({ config, className }: { config: WidgetConfig; className?: string }) {
  const ref = lerYoutube(config.youtubeUrl);
  const [carregado, setCarregado] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => setCarregado(false), [ref?.id]);

  if (!ref || !online) {
    return (
      <Moldura className={className} testId={!ref ? 'youtube-widget-invalido' : 'youtube-widget-offline'}>
        <Cabecalho selo="YOUTUBE" />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[2cqmin] text-center">
          <Youtube className="h-[14cqmin] w-[14cqmin] text-[#FFD400]" />
          <span className="text-[clamp(10px,5.4cqmin,40px)] font-black">{!ref ? 'Link do YouTube inválido' : 'Vídeo indisponível sem internet'}</span>
        </div>
      </Moldura>
    );
  }
  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className ?? ''}`} data-testid="youtube-widget">
      <iframe
        key={ref.id}
        src={youtubeEmbedUrl(ref)}
        title="YouTube"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setCarregado(true)}
      />
      {!carregado && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold text-white/80" data-testid="youtube-widget-carregando">
          Carregando vídeo…
        </div>
      )}
    </div>
  );
}
