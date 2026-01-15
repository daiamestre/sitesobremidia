import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Loader2 } from 'lucide-react';

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
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Using Open-Meteo API (free, no API key required)
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`
        );

        if (!response.ok) throw new Error('Failed to fetch weather');

        const data = await response.json();

        setWeather({
          temperature: Math.round(data.current.temperature_2m),
          weatherCode: data.current.weather_code,
          windSpeed: Math.round(data.current.wind_speed_10m),
        });
        setError(null);
      } catch (err) {
        console.error('Weather fetch error:', err);
        setError('Erro ao carregar clima');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();

    // Refresh every 30 minutes
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className={`text-white flex items-center justify-center ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !weather) {
    return null;
  }

  return (
    <div className={`relative flex flex-col items-center justify-center text-white p-6 h-full w-full overflow-hidden ${className}`}>
      {backgroundImage && (
        <>
          {/* <div className="absolute inset-0 bg-black/40 z-0" /> Removed for 100% visibility */}
          <img
            src={backgroundImage}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover -z-10"
            style={{ objectPosition: 'center' }}
          />
        </>
      )}
      <div className="z-10 flex flex-col items-center gap-6 drop-shadow-md">
        <div className="scale-[2.5] mb-4">
          {getWeatherIcon(weather.weatherCode)}
        </div>
        <div className="text-center">
          <p className="text-[8rem] leading-none font-black tracking-tighter">{weather.temperature}°</p>
          <p className="text-4xl text-white/90 font-bold capitalize mt-2">{getWeatherDescription(weather.weatherCode)}</p>
        </div>
        <div className="flex items-center gap-3 text-white/90 bg-black/30 px-6 py-2 rounded-full mt-6 backdrop-blur-sm">
          <Wind className="h-6 w-6" />
          <span className="text-2xl font-semibold">{weather.windSpeed} km/h</span>
        </div>
      </div>
    </div>
  );
}
