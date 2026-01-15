import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
    message?: string;
    className?: string;
}

export function LoadingState({ message = 'Carregando...', className = '' }: LoadingStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center py-24 space-y-4 animate-fade-in ${className}`}>
            <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse-glow" />
                <Loader2 className="h-10 w-10 text-primary animate-spin relative z-10" />
            </div>
            <p className="text-muted-foreground font-medium animate-pulse">
                {message}
            </p>
        </div>
    );
}
