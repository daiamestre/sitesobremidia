import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClockWidgetProps {
    showDate?: boolean;
    showSeconds?: boolean;
    backgroundImage?: string | null;
    className?: string;
}

declare global {
    interface Window {
        configurarWidget: (cidade: string, estado: string, timezone: string) => void;
    }
}

export function ClockWidget({ showDate = true, showSeconds = false, backgroundImage, className }: ClockWidgetProps) {
    const [time, setTime] = useState(new Date());
    const [city, setCity] = useState("Local");
    const [state, setStateName] = useState("");
    const [timezone, setTimezone] = useState<string | null>(null);

    useEffect(() => {
        // [PUSH ARCHITECTURE] Native Android Bridge Callback
        window.configurarWidget = (injectedCity: string, injectedState: string, injectedTz: string) => {
            console.log(`[Pushed ConfigurarWidget] Relógio regionalizado para: ${injectedCity}-${injectedState}`);
            if (injectedCity) setCity(injectedCity);
            if (injectedState) setStateName(injectedState);
            if (injectedTz && injectedTz !== "UTC" && injectedTz !== "null") setTimezone(injectedTz);
        };

        // Fallback or previously stored check (optional, but good for Dev environments)
        const storedCity = localStorage.getItem('player_city');
        const storedState = localStorage.getItem('player_state');
        const storedTz = localStorage.getItem('player_timezone');

        if (storedCity && city === "Local") setCity(storedCity);
        if (storedState && state === "") setStateName(storedState);
        if (storedTz && storedTz !== "UTC" && timezone === null) setTimezone(storedTz);

        const timer = setInterval(() => {
            // Se tivermos timezone injetado, criamos a Data já ajustada (Simplificado sem date-fns-tz extra lib)
            if (timezone) {
                try {
                    const tzTime = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
                    setTime(tzTime);
                } catch (e) {
                    setTime(new Date());
                }
            } else {
                setTime(new Date());
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [timezone]);

    // Greeting logic
    const getGreeting = () => {
        const hour = time.getHours();
        if (hour >= 5 && hour < 12) return "Bom dia";
        if (hour >= 12 && hour < 18) return "Boa tarde";
        return "Boa noite";
    }

    return (
        <div className={cn("relative flex flex-col items-center justify-center p-4 text-white overflow-hidden", className)}>
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/40" />
                </div>
            )}
            <div className="relative z-10 flex flex-col items-center drop-shadow-2xl">
                <p className="text-3xl font-medium mb-4 text-white/90">
                    {getGreeting()}{city !== "Local" ? `, ${city} - ${state}` : ""}
                </p>
                <h2 className="text-8xl font-black tracking-tighter">
                    {format(time, showSeconds ? 'HH:mm:ss' : 'HH:mm')}
                </h2>
                {showDate && (
                    <p className="text-3xl mt-4 font-light opacity-80 uppercase tracking-widest">
                        {format(time, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </p>
                )}
            </div>
        </div>
    );
}
