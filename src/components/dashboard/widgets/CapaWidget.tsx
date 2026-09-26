import type { WidgetConfig } from '@/types/models';
import { coresDoConfig } from '@/lib/widgetPaletas';
import { ClockFuturista } from '../../player/ClockFuturista';
import { WeatherFuturista } from '../../player/WeatherFuturista';
import { SportsWidget } from '../../player/SportsWidget';

/**
 * Capa do widget nos cards: a imagem de fundo escolhida; sem imagem, o próprio Relógio/Clima Futurista
 * desenhado nas cores do widget (nunca um card vazio). Devolve null para os tipos sem capa viva.
 */
export function CapaWidget({ widgetType, config, thumbnailUrl, nome }: {
  widgetType: string; config: WidgetConfig | null | undefined; thumbnailUrl?: string | null; nome: string;
}) {
  const c = config ?? {};
  const fundo = thumbnailUrl || c.backgroundImageLandscape || c.backgroundImagePortrait || null;
  if (fundo) return <img src={fundo} alt={nome} className="h-full w-full object-cover" data-testid="capa-imagem" />;
  if (widgetType === 'clock') {
    return (
      <div className="pointer-events-none h-full w-full" data-testid="capa-relogio" aria-hidden>
        <ClockFuturista showDate={c.showDate !== false} showSeconds={false} cores={coresDoConfig(c)} className="h-full w-full" />
      </div>
    );
  }
  if (widgetType === 'sports') {
    return (
      <div className="pointer-events-none h-full w-full" data-testid="capa-esportes" aria-hidden>
        <SportsWidget config={c} cores={coresDoConfig(c)} className="h-full w-full" />
      </div>
    );
  }
  if (widgetType === 'weather') {
    return (
      <div className="pointer-events-none h-full w-full" data-testid="capa-clima" aria-hidden>
        <WeatherFuturista latitude={c.latitude} longitude={c.longitude} locationName={c.locationName} cores={coresDoConfig(c)} className="h-full w-full" />
      </div>
    );
  }
  return null;
}
