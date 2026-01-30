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

export function ClockWidget({ showDate = true, showSeconds = false, backgroundImage, className }: ClockWidgetProps) {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={cn("relative flex flex-col items-center justify-center p-4 text-white overflow-hidden", className)}>
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            )}
            <div className="relative z-10 flex flex-col items-center drop-shadow-lg">
                <h2 className="text-6xl font-bold tracking-tight">
                    {format(time, showSeconds ? 'HH:mm:ss' : 'HH:mm')}
                </h2>
                {showDate && (
                    <p className="text-2xl mt-2 font-light opacity-90">
                        {format(time, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </p>
                )}
            </div>
        </div>
    );
}
