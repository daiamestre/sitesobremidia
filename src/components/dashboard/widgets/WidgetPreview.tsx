import { WidgetType, WidgetConfig } from '@/types/models';
import { RssWidget } from '../../player/RssWidget';
import { WeatherFuturista } from '../../player/WeatherFuturista';
import { ClockFuturista } from '../../player/ClockFuturista';
import { InstitutionalWidget } from '../../player/InstitutionalWidget';
import { OfferWidget } from '../../player/OfferWidget';
import { AdvertisingWidget } from '../../player/AdvertisingWidget';
import { SocialWidget } from '../../player/SocialWidget';
import { YouTubeWidget } from '../../player/YouTubeWidget';
import { SportsWidget } from '../../player/SportsWidget';
import { coresDoConfig } from '@/lib/widgetPaletas';
import { TIPOS_COM_CORES } from '@/lib/widgetCatalog';
import { PaletaPicker } from './PaletaPicker';

interface WidgetPreviewProps {
    widgetType: WidgetType;
    config: WidgetConfig;
    editOrientation: 'landscape' | 'portrait';
    /** Formulário aberto: mostra as cores (Relógio/Clima/Esportes) na lateral direita da prévia. */
    onConfigChange?: (patch: Partial<WidgetConfig>) => void;
}

export function WidgetPreview({ widgetType, config, editOrientation, onConfigChange }: WidgetPreviewProps) {
    const getBackgroundImage = () => {
        if (editOrientation === 'landscape') return config.backgroundImageLandscape;
        if (editOrientation === 'portrait') return config.backgroundImagePortrait;
        return config.backgroundImage;
    };

    const bgImage = getBackgroundImage();
    // Relógio e Clima têm um único modelo: o Futurista (widgets antigos "clássicos" também aparecem assim)
    const futurista = widgetType === 'weather';
    const relogioFuturista = widgetType === 'clock';
    const cores = coresDoConfig(config);
    const comPaleta = !!onConfigChange && TIPOS_COM_CORES.includes(widgetType);

    return (
        <div className="w-full md:w-1/2 bg-zinc-900 relative flex items-center justify-center gap-4 p-8 overflow-hidden">
            {/* Dynamic Container based on editOrientation */}
            <div
                className={`relative bg-black shadow-2xl transition-all duration-500 ease-in-out border border-white/10 w-[320px] max-w-full ${editOrientation === 'portrait'
                    ? 'aspect-[9/16]' // 9:16 Portrait
                    : 'aspect-video' // 16:9 Landscape (Same width, shorter height)
                    }`}
            >
                <div className="absolute inset-0 overflow-hidden">
                    <div className="w-full h-full relative">
                        <div className="relative z-10 w-full h-full flex items-center justify-center">
                            {(widgetType === 'social' || widgetType === 'instagram') && (
                                <SocialWidget widgetType={widgetType} config={config} backgroundImage={bgImage} className="w-full h-full" />
                            )}
                            {widgetType === 'youtube' && (
                                <YouTubeWidget config={config} backgroundImage={bgImage} className="w-full h-full" />
                            )}
                            {widgetType === 'advertising' && (
                                <AdvertisingWidget config={config} backgroundImage={bgImage} className="w-full h-full" />
                            )}
                            {widgetType === 'offer' && (
                                <OfferWidget config={config} backgroundImage={bgImage} className="w-full h-full" />
                            )}
                            {widgetType === 'institutional' && (
                                <InstitutionalWidget config={config} backgroundImage={bgImage} className="w-full h-full" />
                            )}
                            {relogioFuturista && (
                                <ClockFuturista showDate={config.showDate} showSeconds={config.showSeconds} backgroundImage={bgImage} cores={cores} className="w-full h-full" />
                            )}
                            {futurista && (
                                <WeatherFuturista
                                    latitude={config.latitude}
                                    longitude={config.longitude}
                                    locationName={config.locationName}
                                    backgroundImage={bgImage}
                                    cores={cores}
                                    className="w-full h-full"
                                />
                            )}
                            {widgetType === 'sports' && (
                                <SportsWidget config={config} backgroundImage={bgImage} cores={cores} className="w-full h-full" />
                            )}
                            {widgetType === 'rss' && (
                                <RssWidget
                                    feedUrl={config.feedUrl}
                                    maxItems={config.maxItems}
                                    scrollSpeed={config.scrollSpeed}
                                    variant={config.variant}
                                    origem={config.origem}
                                    categoria={config.categoria}
                                    backgroundImage={bgImage}
                                    className="w-full h-full"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {comPaleta && <PaletaPicker config={config} onChange={onConfigChange!} className="flex-shrink-0" />}
            <p className="absolute bottom-4 text-white/30 text-xs">
                Exibindo modo: {editOrientation === 'landscape' ? 'Paisagem (16:9)' : 'Retrato (9:16)'}
            </p>
        </div>
    );
}
