import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Loader2 } from 'lucide-react';
import { useWidgetData } from '@/contexts/WidgetDataContext';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
}

interface WeatherWidgetProps {
  latitude?: number;
  longitude?: number;
  backgroundImage?: string;
  className?: string;
}

const getWeatherIcon = (code: number) => {
  // WMO Weather interpretation codes
  if (code === 0) return <Sun className="h-12 w-12 text-yellow-400 drop-shadow-lg" />;
  if (code >= 1 && code <= 3) return <Cloud className="h-12 w-12 text-gray-300 drop-shadow-lg" />;
  if (code >= 45 && code <= 48) return <Cloud className="h-12 w-12 text-gray-400 drop-shadow-lg" />;
  if (code >= 51 && code <= 67) return <CloudRain className="h-12 w-12 text-blue-400 drop-shadow-lg" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="h-12 w-12 text-blue-200 drop-shadow-lg" />;
  if (code >= 80 && code <= 82) return <CloudRain className="h-12 w-12 text-blue-500 drop-shadow-lg" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="h-12 w-12 text-white drop-shadow-lg" />;
  if (code >= 95 && code <= 99) return <CloudLightning className="h-12 w-12 text-yellow-300 drop-shadow-lg" />;
  return <Cloud className="h-12 w-12 text-gray-300 drop-shadow-lg" />;
};

const getWeatherDescription = (code: number): string => {
  // ... (keep existing implementation or simplify if needed, assuming existing is fine)
  if (code === 0) return 'Céu limpo';
  if (code >= 1 && code <= 3) return 'Parcialmente nublado';
  if (code >= 45 && code <= 48) return 'Neblina';
  if (code >= 51 && code <= 55) return 'Garoa';
  if (code >= 56 && code <= 57) return 'Garoa congelante';
  if (code >= 61 && code <= 65) return 'Chuva';
  if (code >= 66 && code <= 67) return 'Chuva congelante';
  if (code >= 71 && code <= 75) return 'Neve';
  if (code === 77) return 'Granizo';
  if (code >= 80 && code <= 82) return 'Pancadas de chuva';
  if (code >= 85 && code <= 86) return 'Pancadas de neve';
  if (code >= 95 && code <= 99) return 'Tempestade';
  return 'Desconhecido';
};

export function WeatherWidget({
  latitude = -23.5505, // São Paulo default
  longitude = -46.6333,
  backgroundImage,
  className = ''
}: WeatherWidgetProps) {
  const { weather, refreshWeather } = useWidgetData();

  // Trigger data fetch on mount (context handles deduplication/polling)
  useEffect(() => {
    refreshWeather(latitude, longitude);
  }, [latitude, longitude, refreshWeather]);

  if (!weather.loaded && !weather.error) {
    return (
      <div className={`text-white flex items-center justify-center h-full w-full ${className}`}>
        <Loader2 className="h-12 w-12 animate-spin text-white/50" />
      </div>
    );
  }

  if (weather.error) {
    // Silent fail or retry? Keep simple.
    if (!weather.loaded) return null;
  }

  return (
    <div className={`relative flex flex-col items-center justify-center text-white p-6 h-full w-full overflow-hidden ${className}`}>
      {backgroundImage && (
        <>
          <img
            src={backgroundImage}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover -z-10 transition-opacity duration-700 opacity-100"
            style={{ objectPosition: 'center', willChange: 'transform' }} // GPU Hint
          />
        </>
      )}

      {/* Content Container with Glassmorphism for Elite look */}
      <div className="z-10 flex flex-col items-center gap-6 drop-shadow-2xl animate-in fade-in duration-700 slide-in-from-bottom-4">
        <div className="scale-[2.5] mb-4 filter drop-shadow-lg">
          {getWeatherIcon(weather.weatherCode)}
        </div>
        <div className="text-center">
          <p className="text-[9rem] leading-none font-black tracking-tighter drop-shadow-xl">{weather.temperature}°</p>
          <p className="text-5xl text-white/95 font-bold capitalize mt-2 drop-shadow-lg">{getWeatherDescription(weather.weatherCode)}</p>
        </div>
        <div className="flex items-center gap-3 text-white/90 bg-white/10 px-8 py-3 rounded-full mt-8 backdrop-blur-md border border-white/20 shadow-xl">
          <Wind className="h-6 w-6" />
          <span className="text-2xl font-semibold">{weather.windSpeed} km/h</span>
        </div>
      </div>
    </div>
  );
}
