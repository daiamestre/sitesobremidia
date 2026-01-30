
import { useEffect } from "react";

interface SplashProps {
    onComplete: () => void;
}

export const Splash = ({ onComplete }: SplashProps) => {
    useEffect(() => {
        // Branding Display Duration: 2 Seconds (Matches Android)
        const timer = setTimeout(() => {
            onComplete();
        }, 2000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0F172A] animate-in fade-in duration-500">
            {/* Logo Container */}
            <div className="relative flex flex-col items-center justify-center">
                {/* Main Logo Image */}
                <img
                    src="/logo.png"
                    alt="Sobre Mídia Player"
                    className="w-48 h-48 object-contain mb-8 drop-shadow-2xl"
                />

                {/* Loading Spinner (Optional, adds life) */}
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>

                <p className="mt-4 text-slate-400 font-medium text-sm tracking-wider animate-pulse">
                    INICIALIZANDO PLAYER...
                </p>
            </div>
        </div>
    );
};
