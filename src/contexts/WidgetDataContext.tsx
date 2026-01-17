import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// TYPES
interface WeatherState {
    temperature: number;
    weatherCode: number;
    windSpeed: number;
    loaded: boolean;
    error: string | null;
}

interface RssState {
    items: Array<{ title: string; description: string; }>;
    loaded: boolean;
    error: string | null;
}

interface WidgetDataContextType {
    weather: WeatherState;
    rss: RssState;
    refreshWeather: (lat: number, lon: number) => void;
    refreshRss: (url: string) => void;
}

const WidgetDataContext = createContext<WidgetDataContextType | null>(null);

export const useWidgetData = () => {
    const context = useContext(WidgetDataContext);
    if (!context) throw new Error('useWidgetData must be used within a WidgetDataProvider');
    return context;
};

export const WidgetDataProvider = ({ children }: { children: React.ReactNode }) => {
    // WEATHER STATE
    const [weather, setWeather] = useState<WeatherState>({
        temperature: 0,
        weatherCode: 0,
        windSpeed: 0,
        loaded: false,
        error: null
    });

    // RSS STATE
    const [rss, setRss] = useState<RssState>({
        items: [],
        loaded: false,
        error: null
    });

    // Keep track of current config to poll
    const [weatherConfig, setWeatherConfig] = useState<{ lat: number, lon: number } | null>(null);
    const [rssUrl, setRssUrl] = useState<string | null>(null);

    // FETCH WEATHER
    const fetchWeather = async (lat: number, lon: number) => {
        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`
            );
            if (!response.ok) throw new Error('Failed to fetch weather');
            const data = await response.json();
            setWeather({
                temperature: Math.round(data.current.temperature_2m),
                weatherCode: data.current.weather_code,
                windSpeed: Math.round(data.current.wind_speed_10m),
                loaded: true,
                error: null
            });
        } catch (err) {
            console.error('Weather Context Error:', err);
            setWeather(prev => ({ ...prev, error: 'Erro ao atualizar clima' }));
        }
    };

    // POLLING WEATHER (Every 30m)
    useEffect(() => {
        if (!weatherConfig) return;
        fetchWeather(weatherConfig.lat, weatherConfig.lon); // Initial
        const interval = setInterval(() => {
            fetchWeather(weatherConfig.lat, weatherConfig.lon);
        }, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [weatherConfig]);


    // CONFIG UPDATERS
    const refreshWeather = (lat: number, lon: number) => {
        // Only update if changed drastically (simple check)
        if (!weatherConfig || Math.abs(weatherConfig.lat - lat) > 0.1 || Math.abs(weatherConfig.lon - lon) > 0.1) {
            setWeatherConfig({ lat, lon });
        }
    };

    const refreshRss = (url: string) => {
        if (url !== rssUrl) setRssUrl(url);
    };

    return (
        <WidgetDataContext.Provider value={{ weather, rss, refreshWeather, refreshRss }}>
            {children}
        </WidgetDataContext.Provider>
    );
};
