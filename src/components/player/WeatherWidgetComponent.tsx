import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
    CloudSun, Sun, Moon, CloudRain, CloudLightning,
    CloudSnow, Cloud, Droplets, Wind, ThermometerSun
} from 'lucide-react';

interface WeatherWidgetProps {
    latitude?: number;
    longitude?: number;
    backgroundImage?: string | null;
    className?: string;
}

declare global {
    interface Window {
        configurarWidget: (cidade: string, estado: string, timezone: string) => void;
    }
}

interface WeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    description: string;
    isDay: boolean;
    weatherCode: number;
}

// WMO Weather interpretation codes
const getWeatherDetails = (code: number, isDay: boolean) => {
    switch (true) {
        case (code === 0):
            return { icon: isDay ? Sun : Moon, text: "Céu Limpo" };
        case (code >= 1 && code <= 3):
            return { icon: isDay ? CloudSun : Cloud, text: "Parcialmente Nublado" };
        case (code >= 45 && code <= 48):
            return { icon: Cloud, text: "Nevoeiro" };
        case (code >= 51 && code <= 67):
            return { icon: CloudRain, text: "Chuva" };
        case (code >= 71 && code <= 77):
            return { icon: CloudSnow, text: "Neve" };
        case (code >= 80 && code <= 82):
            return { icon: CloudRain, text: "Pancadas de Chuva" };
        case (code >= 95 && code <= 99):
            return { icon: CloudLightning, text: "Tempestade" };
        default:
            return { icon: Cloud, text: "Indisponível" };
    }
};

export function WeatherWidget({ latitude, longitude, backgroundImage, className }: WeatherWidgetProps) {
    const [city, setCity] = useState("Local");
    const [state, setStateName] = useState("");
    const [weather, setWeather] = useState<WeatherData | null>(null);

    useEffect(() => {
        const fetchWeather = async (targetCity: string, lat?: number, lon?: number) => {
            let fetchLat = lat;
            let fetchLon = lon;

            try {
                // Se as props não contiverem lat/lon explícitas, buscamos pela Cidade injetada
                if (!fetchLat || !fetchLon) {
                    const query = targetCity ? `${targetCity}` : "Sao Paulo";
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=pt`);
                    const geoData = await geoRes.json();

                    if (geoData.results && geoData.results.length > 0) {
                        fetchLat = geoData.results[0].latitude;
                        fetchLon = geoData.results[0].longitude;
                    } else {
                        throw new Error("Localização não encontrada");
                    }
                }

                // Busca o clima atual
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${fetchLat}&longitude=${fetchLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m`);
                const weatherData = await weatherRes.json();
                const current = weatherData.current;

                setWeather({
                    temp: Math.round(current.temperature_2m),
                    feelsLike: Math.round(current.apparent_temperature),
                    humidity: current.relative_humidity_2m,
                    windSpeed: Math.round(current.wind_speed_10m),
                    isDay: current.is_day === 1,
                    weatherCode: current.weather_code,
                    description: getWeatherDetails(current.weather_code, current.is_day === 1).text
                });

            } catch (error) {
                console.error("Erro ao carregar clima:", error);
            }
        };

        // [PUSH ARCHITECTURE] Native Android Bridge Callback
        window.configurarWidget = (injectedCity: string, injectedState: string, injectedTz: string) => {
            console.log(`[Pushed ConfigurarWidget] Clima regionalizado para: ${injectedCity}-${injectedState}`);
            if (injectedCity) setCity(injectedCity);
            if (injectedState) setStateName(injectedState);

            // Trigger fetch only after receiving the active push from Android
            fetchWeather(injectedCity, latitude, longitude);
        };

        // Fallback for standalone dev environments
        const storedCity = localStorage.getItem('player_city');
        const storedState = localStorage.getItem('player_state');
        if (storedCity && city === "Local") {
            setCity(storedCity);
            if (storedState) setStateName(storedState);
            fetchWeather(storedCity, latitude, longitude);
        }

        // Atualiza a cada 30 minutos (usando a cidade stateada localmente)
        const interval = setInterval(() => fetchWeather(city, latitude, longitude), 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [latitude, longitude, city]);

    const displayCity = city !== "Local" ? `${city} - ${state}` : "Sua Região";
    const bgGradient = weather?.isDay
        ? "bg-gradient-to-br from-blue-400 to-blue-600"
        : "bg-gradient-to-br from-slate-800 to-slate-950";

    const WeatherIcon = weather ? getWeatherDetails(weather.weatherCode, weather.isDay).icon : CloudSun;

    return (
        <div className={cn("relative flex flex-col items-center justify-center p-8 text-white overflow-hidden w-full h-full",
            !backgroundImage && bgGradient,
            className
        )}>
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/50" />
                </div>
            )}

            {weather ? (
                <div className="relative z-10 flex flex-col items-center drop-shadow-2xl w-full max-w-4xl">
                    <p className="text-4xl font-medium mb-8 text-white/90 tracking-wide uppercase">
                        Previsão para {displayCity}
                    </p>

                    <div className="flex items-center justify-center gap-12 mb-12">
                        <WeatherIcon className="h-40 w-40 drop-shadow-lg" strokeWidth={1.5} />
                        <div className="flex flex-col">
                            <h2 className="text-9xl font-black tracking-tighter leading-none">
                                {weather.temp}°
                            </h2>
                            <p className="text-4xl font-light mt-2 tracking-wide">
                                {weather.description}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-8 mt-4 bg-black/20 backdrop-blur-md rounded-2xl p-6 w-full justify-around border border-white/10">
                        <div className="flex items-center gap-3">
                            <ThermometerSun className="h-8 w-8 opacity-80" />
                            <div className="flex flex-col">
                                <span className="text-sm opacity-70 uppercase tracking-wider">Sensação</span>
                                <span className="text-2xl font-bold">{weather.feelsLike}°C</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Droplets className="h-8 w-8 opacity-80" />
                            <div className="flex flex-col">
                                <span className="text-sm opacity-70 uppercase tracking-wider">Umidade</span>
                                <span className="text-2xl font-bold">{weather.humidity}%</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Wind className="h-8 w-8 opacity-80" />
                            <div className="flex flex-col">
                                <span className="text-sm opacity-70 uppercase tracking-wider">Vento</span>
                                <span className="text-2xl font-bold">{weather.windSpeed} km/h</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative z-10 animate-pulse flex flex-col items-center">
                    <CloudSun className="h-24 w-24 mb-4 opacity-50" />
                    <p className="text-2xl opacity-70">Aferindo estação meteorológica...</p>
                </div>
            )}
        </div>
    );
}
