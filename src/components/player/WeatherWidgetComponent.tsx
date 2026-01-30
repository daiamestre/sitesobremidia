import { cn } from '@/lib/utils';
import { CloudSun } from 'lucide-react';

interface WeatherWidgetProps {
    latitude?: number;
    longitude?: number;
    backgroundImage?: string | null;
    className?: string;
}

export function WeatherWidget({ latitude, longitude, backgroundImage, className }: WeatherWidgetProps) {
    return (
        <div className={cn("relative flex flex-col items-center justify-center p-4 text-white overflow-hidden", className)}>
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            )}
            <div className="relative z-10 flex flex-col items-center drop-shadow-lg">
                <CloudSun className="h-24 w-24 mb-4" />
                <h2 className="text-5xl font-bold">28°C</h2>
                <p className="text-xl mt-2">São Paulo - Ensolarado</p>
            </div>
        </div>
    );
}
