import { ClockWidget } from './ClockWidget';
import { WeatherWidget } from './WeatherWidget';
import { RssWidget } from './RssWidget';

export interface WidgetConfig {
  clock?: {
    enabled: boolean;
    showDate?: boolean;
    showSeconds?: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  weather?: {
    enabled: boolean;
    latitude?: number;
    longitude?: number;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  rss?: {
    enabled: boolean;
    feedUrl?: string;
    maxItems?: number;
    scrollSpeed?: number;
    position?: 'top' | 'bottom';
  };
}

interface PlayerWidgetsProps {
  config: WidgetConfig;
  visible: boolean;
  hideClockAndWeather?: boolean;
}

const positionClasses = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'top': 'top-4 left-4 right-4',
  'bottom': 'bottom-4 left-4 right-4',
};

export function PlayerWidgets({ config, visible, hideClockAndWeather = false }: PlayerWidgetsProps) {
  const baseOpacity = visible ? 'opacity-100' : 'opacity-0 hover:opacity-100';

  return (
    <>
      {/* Clock Widget - oculto para mídia 16:9 */}
      {config.clock?.enabled && !hideClockAndWeather && (
        <div 
          className={`absolute z-20 transition-opacity duration-300 ${baseOpacity} ${
            positionClasses[config.clock.position || 'bottom-left']
          }`}
        >
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-3">
            <ClockWidget 
              showDate={config.clock.showDate ?? true} 
              showSeconds={config.clock.showSeconds ?? false}
            />
          </div>
        </div>
      )}

      {/* Weather Widget - oculto para mídia 16:9 */}
      {config.weather?.enabled && !hideClockAndWeather && (
        <div 
          className={`absolute z-20 transition-opacity duration-300 ${baseOpacity} ${
            positionClasses[config.weather.position || 'bottom-right']
          }`}
        >
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-3">
            <WeatherWidget 
              latitude={config.weather.latitude} 
              longitude={config.weather.longitude}
            />
          </div>
        </div>
      )}

      {/* RSS Widget - spans the width */}
      {config.rss?.enabled && (
        <div 
          className={`absolute z-20 transition-opacity duration-300 ${baseOpacity} ${
            config.rss.position === 'top' ? 'top-16 left-4 right-4' : 'bottom-20 left-4 right-4'
          }`}
        >
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-3 max-w-2xl mx-auto">
            <RssWidget 
              feedUrl={config.rss.feedUrl}
              maxItems={config.rss.maxItems}
              scrollSpeed={config.rss.scrollSpeed}
            />
          </div>
        </div>
      )}
    </>
  );
}
