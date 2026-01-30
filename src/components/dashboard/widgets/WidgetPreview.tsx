import { WidgetType, WidgetConfig } from '@/types/models';
import { ClockWidget } from '../../player/ClockWidget';
import { WeatherWidget } from '../../player/WeatherWidgetComponent';
import { RssWidget } from '../../player/RssWidget';

interface WidgetPreviewProps {
    widgetType: WidgetType;
    config: WidgetConfig;
    editOrientation: 'landscape' | 'portrait';
}

export function WidgetPreview({ widgetType, config, editOrientation }: WidgetPreviewProps) {
    const getBackgroundImage = () => {
        if (editOrientation === 'landscape') return config.backgroundImageLandscape;
        if (editOrientation === 'portrait') return config.backgroundImagePortrait;
        return config.backgroundImage;
    };

    const bgImage = getBackgroundImage();

    return (
        <div className="w-full md:w-1/2 bg-zinc-900 relative flex items-center justify-center p-8 overflow-hidden">
            {/* Dynamic Container based on editOrientation */}
            <div
                className={`relative bg-black shadow-2xl transition-all duration-500 ease-in-out border border-white/10 w-[320px] max-w-full ${editOrientation === 'portrait'
                    ? 'aspect-[9/16]' // 9:16 Portrait
                    : 'aspect-video' // 16:9 Landscape (Same width, shorter height)
                    }`}
            >
                <div className="absolute inset-0 overflow-hidden">
                    <div className="w-full h-full relative">
                        {/* Background Layer for Preview */}
                        {(widgetType === 'clock' || widgetType === 'weather') && (
                            <div className="absolute inset-0 w-full h-full">
                                {bgImage ? (
                                    <img
                                        src={bgImage}
                                        className="w-full h-full object-cover"
                                        alt="Background"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950" />
                                )}
                                <div className="absolute inset-0 bg-black/20" />
                            </div>
                        )}

                        <div className="relative z-10 w-full h-full flex items-center justify-center">
                            {widgetType === 'clock' && (
                                <ClockWidget
                                    showDate={config.showDate}
                                    showSeconds={config.showSeconds}
                                    backgroundImage={null} // BG handled by parent wrapper for preview
                                    className="w-full h-full"
                                />
                            )}
                            {widgetType === 'weather' && (
                                <WeatherWidget
                                    latitude={config.latitude}
                                    longitude={config.longitude}
                                    backgroundImage={null} // BG handled by parent wrapper for preview
                                    className="w-full h-full"
                                />
                            )}
                            {widgetType === 'rss' && (
                                <RssWidget
                                    feedUrl={config.feedUrl}
                                    maxItems={config.maxItems}
                                    scrollSpeed={config.scrollSpeed}
                                    variant={config.variant}
                                    backgroundImage={bgImage}
                                    className="w-full h-full"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <p className="absolute bottom-4 text-white/30 text-xs">
                Exibindo modo: {editOrientation === 'landscape' ? 'Paisagem (16:9)' : 'Retrato (9:16)'}
            </p>
        </div>
    );
}
