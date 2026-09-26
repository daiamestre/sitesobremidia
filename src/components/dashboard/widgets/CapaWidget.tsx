import { useEffect, useRef, useState } from 'react';
import { Play, Youtube } from 'lucide-react';
import type { WidgetConfig } from '@/types/models';
import { coresDoConfig } from '@/lib/widgetPaletas';
import { lerYoutube } from '@/lib/youtube';
import type { OfertaWidgetDados } from '@/lib/ofertaWidget';
import { ClockFuturista } from '../../player/ClockFuturista';
import { WeatherFuturista } from '../../player/WeatherFuturista';
import { SportsWidget } from '../../player/SportsWidget';
import { RssWidget } from '../../player/RssWidget';
import { InstitutionalWidget } from '../../player/InstitutionalWidget';
import { OfferWidget, OfferWidgetView, Moldura, Cabecalho } from '../../player/OfferWidget';
import { AdvertisingWidget, AdvertisingWidgetView } from '../../player/AdvertisingWidget';
import type { CampanhaWidgetDados } from '@/lib/campanhaWidget';

/**
 * Notícias usa texto de tamanho fixo (pensado para a tela inteira): na capa, é desenhado em 640x360 e a imagem inteira
 * é reduzida para caber no cartão (miniatura fiel, sem texto estourando). Os demais já se ajustam ao quadro (cqmin).
 */
const BASE_W = 640;
const BASE_H = 360;
function Miniatura({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => { const w = el.clientWidth; if (w > 0) setEscala(w / BASE_W); };
    medir();
    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(medir); ro.observe(el); } catch { ro = null; }
    return () => ro?.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: BASE_W, height: BASE_H, transform: `scale(${escala})` }}>
        {children}
      </div>
    </div>
  );
}

/** Widget de Publicidade ainda sem campanha: a capa é o estado real "Anuncie aqui". */
const SEM_CAMPANHA: CampanhaWidgetDados = { id: 'sem-campanha', titulo: '', status: 'DRAFT', data_inicio: '2000-01-01', data_fim: '2000-01-01', vigente: false, criativos: [] };
import { SocialWidget } from '../../player/SocialWidget';

/**
 * Capa do widget (Galeria e Meus Widgets) — TODOS os tipos têm capa:
 * 1) a imagem de fundo escolhida, quando há;
 * 2) senão, o próprio widget desenhado com a configuração dele (Relógio, Clima, Esportes, Notícias, Institucional,
 *    Oferta, Publicidade, Social/Instagram), só para ver — sem clique;
 * 3) YouTube: a miniatura oficial do vídeo (i.ytimg.com) — nunca abre o player na lista.
 * `exemplo`: capa da Galeria com conteúdo de exemplo -> selo "EXEMPLO".
 */
export function CapaWidget({ widgetType, config, thumbnailUrl, nome, oferta, exemplo = false }: {
  widgetType: string; config: WidgetConfig | null | undefined; thumbnailUrl?: string | null; nome: string;
  oferta?: OfertaWidgetDados; exemplo?: boolean;
}) {
  const c = config ?? {};
  const fundo = thumbnailUrl || c.backgroundImageLandscape || c.backgroundImagePortrait || null;
  if (fundo) return <img src={fundo} alt={nome} className="h-full w-full object-cover" data-testid="capa-imagem" />;

  const ao = (testId: string, filho: React.ReactNode) => (
    <div className="pointer-events-none relative h-full w-full" data-testid={testId} aria-hidden>
      {filho}
      {exemplo && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white ring-1 ring-white/30" data-testid="capa-exemplo">EXEMPLO</span>
      )}
    </div>
  );

  switch (widgetType) {
    case 'clock':
      return ao('capa-relogio', <ClockFuturista showDate={c.showDate !== false} showSeconds={false} cores={coresDoConfig(c)} className="h-full w-full" />);
    case 'weather':
      return ao('capa-clima', <WeatherFuturista latitude={c.latitude} longitude={c.longitude} locationName={c.locationName} cores={coresDoConfig(c)} className="h-full w-full" />);
    case 'sports':
      return ao('capa-esportes', <SportsWidget config={c} cores={coresDoConfig(c)} className="h-full w-full" />);
    case 'rss':
      return ao('capa-noticias', <Miniatura><RssWidget feedUrl={c.feedUrl} maxItems={c.maxItems} scrollSpeed={c.scrollSpeed} variant={c.variant} origem={c.origem} categoria={c.categoria} className="h-full w-full" /></Miniatura>);
    case 'institutional':
      return ao('capa-institucional', <InstitutionalWidget config={c} className="h-full w-full" />);
    case 'offer':
      return ao('capa-oferta', oferta ? <OfferWidgetView dados={oferta} config={c} className="h-full w-full" /> : <OfferWidget config={c} className="h-full w-full" />);
    case 'advertising':
      return ao('capa-publicidade', c.campanhaId
        ? <AdvertisingWidget config={c} className="h-full w-full" />
        : <AdvertisingWidgetView dados={SEM_CAMPANHA} config={c} className="h-full w-full" />);
    case 'social':
    case 'instagram':
      return ao('capa-social', <SocialWidget widgetType={widgetType} config={c} className="h-full w-full" />);
    case 'youtube': {
      const ref = lerYoutube(c.youtubeUrl);
      if (ref?.tipo === 'video') {
        return ao('capa-youtube', (
          <div className="relative h-full w-full bg-black">
            <img src={`https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg`} alt={nome} className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-16 items-center justify-center rounded-2xl bg-[#FF0000] shadow-lg"><Play className="h-6 w-6 fill-white text-white" /></span>
            </span>
          </div>
        ));
      }
      return ao('capa-youtube', (
        <Moldura className="h-full w-full">
          <Cabecalho selo="YOUTUBE" />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[2cqmin] text-center">
            <Youtube className="h-[16cqmin] w-[16cqmin] text-[#FF0000]" />
            <span className="text-[clamp(10px,5.4cqmin,40px)] font-black">{ref?.tipo === 'playlist' ? 'Playlist do YouTube' : 'Vídeo do YouTube'}</span>
          </div>
        </Moldura>
      ));
    }
    default:
      return null;
  }
}
