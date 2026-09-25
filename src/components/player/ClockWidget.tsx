import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { brasiliaDateLong, brasiliaHour, brasiliaTime, useBrasiliaClock } from '@/lib/brasiliaTime';

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

const saudacao = (hora: number) => (hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite');

/**
 * Relógio + data SEMPRE no Horário de Brasília (America/Sao_Paulo), com o relógio corrigido pela hora do servidor.
 * O fuso injetado pela ponte nativa/localStorage é ignorado de propósito: só a cidade/estado são usados na saudação.
 */
export function ClockWidget({ showDate = true, showSeconds = false, backgroundImage, className }: ClockWidgetProps) {
    const agora = useBrasiliaClock(showSeconds);
    const [city, setCity] = useState('Local');
    const [state, setStateName] = useState('');

    useEffect(() => {
        window.configurarWidget = (injectedCity: string, injectedState: string) => {
            if (injectedCity) setCity(injectedCity);
            if (injectedState) setStateName(injectedState);
        };
        try {
            const storedCity = localStorage.getItem('player_city');
            const storedState = localStorage.getItem('player_state');
            if (storedCity) setCity(storedCity);
            if (storedState) setStateName(storedState);
        } catch {
            // armazenamento indisponível: sem cidade na saudação
        }
    }, []);

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
                    {saudacao(brasiliaHour(agora))}{city !== 'Local' ? `, ${city} - ${state}` : ''}
                </p>
                <h2 className="text-8xl font-black tracking-tighter tabular-nums" data-testid="clock-time">
                    {brasiliaTime(agora, showSeconds)}
                </h2>
                {showDate && (
                    <p className="text-3xl mt-4 font-light opacity-80 tracking-widest" data-testid="clock-date">
                        {brasiliaDateLong(agora)}
                    </p>
                )}
                <p className="text-xs mt-3 tracking-[0.3em] text-white/60">HORÁRIO DE BRASÍLIA</p>
            </div>
        </div>
    );
}
