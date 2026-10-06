/**
 * F-148 — Desenha um widget ocupando todo o quadro que recebe (tela inteira ou uma zona).
 * Mesmos componentes e mesmas propriedades da página de widget em tela cheia (src/pages/WidgetPlayer.tsx); como todos
 * usam medidas relativas ao próprio quadro (cqmin), cabem em qualquer tamanho de zona.
 */
import type { WidgetConfig } from '@/types/models';
import { RssWidget } from './RssWidget';
import { WeatherFuturista } from './WeatherFuturista';
import { ClockFuturista } from './ClockFuturista';
import { InstitutionalWidget } from './InstitutionalWidget';
import { OfferWidget } from './OfferWidget';
import { AdvertisingWidget } from './AdvertisingWidget';
import { SocialWidget } from './SocialWidget';
import { YouTubeWidget } from './YouTubeWidget';
import { SportsWidget } from './SportsWidget';
import { SportsNewsWidget } from './SportsNewsWidget';
import { coresDoConfig } from '@/lib/widgetPaletas';

export const TIPOS_DE_WIDGET_NA_TELA = ['social', 'instagram', 'youtube', 'advertising', 'offer', 'institutional', 'clock', 'weather', 'sports', 'sports_news', 'rss'] as const;
export const widgetDesenhavel = (tipo: string) => (TIPOS_DE_WIDGET_NA_TELA as readonly string[]).includes(tipo);

export function WidgetNaTela({ id, tipo, config, emPe = false }: { id: string; tipo: string; config: Record<string, unknown> | null | undefined; emPe?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (config ?? {}) as any as WidgetConfig & Record<string, any>;
  const fundo: string | null = (emPe ? c.backgroundImagePortrait || c.backgroundImageLandscape : c.backgroundImageLandscape || c.backgroundImagePortrait) || null;
  const comum = { className: 'w-full h-full', backgroundImage: fundo };
  const cheio = 'w-full h-full';

  const desenho = () => {
    switch (tipo) {
      case 'social':
      case 'instagram':
        return <SocialWidget widgetType={tipo} config={c} backgroundImage={fundo} className={cheio} />;
      case 'youtube':
        return <YouTubeWidget config={c} backgroundImage={fundo} className={cheio} />;
      case 'advertising':
        return <AdvertisingWidget config={c} backgroundImage={fundo} className={cheio} />;
      case 'offer':
        return <OfferWidget config={c} backgroundImage={fundo} className={cheio} />;
      case 'institutional':
        return <InstitutionalWidget config={c} backgroundImage={fundo} className={cheio} />;
      case 'clock':
        return <ClockFuturista {...comum} cores={coresDoConfig(c)} showDate={c.showDate !== false} showSeconds={c.showSeconds === true} />;
      case 'weather':
        return <WeatherFuturista {...comum} cores={coresDoConfig(c)} latitude={c.latitude} longitude={c.longitude} locationName={c.locationName} />;
      case 'sports':
        return <SportsWidget {...comum} config={c} cores={coresDoConfig(c)} dados={c.esportes ?? null} widgetId={id} modo={c.esportes ? 'player' : 'previa'} />;
      case 'sports_news':
        return <SportsNewsWidget config={c} cores={coresDoConfig(c)} dados={c.esportesNews ?? null} widgetId={id} modo={c.esportesNews ? 'player' : 'previa'} className={cheio} />;
      case 'rss':
        return <RssWidget {...comum} feedUrl={c.feedUrl ?? c.url} maxItems={c.maxItems ?? c.itemsCount} origem={c.origem} categoria={c.categoria} noticias={c.noticias ?? null} />;
      default:
        return null;
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ containerType: 'size' }} data-testid="widget-na-tela" data-tipo={tipo}>
      {fundo && <img src={fundo} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ maxWidth: 'none', maxHeight: 'none' }} />}
      <div className="relative z-10 h-full w-full">{desenho()}</div>
    </div>
  );
}
