import { cn } from '@/lib/utils';

interface RssWidgetProps {
    feedUrl?: string;
    maxItems?: number;
    scrollSpeed?: number;
    variant?: 'full' | 'compact';
    backgroundImage?: string | null;
    className?: string;
}

export function RssWidget({ feedUrl, variant, backgroundImage, className }: RssWidgetProps) {
    return (
        <div className={cn("relative flex items-center p-4 text-white overflow-hidden", className)}>
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/50" />
                </div>
            )}
            <div className="relative z-10 w-full">
                <div className="flex items-center gap-4 animate-marquee whitespace-nowrap">
                    <span className="bg-primary px-3 py-1 rounded text-sm font-bold">NOTÍCIA</span>
                    <span className="text-xl font-medium">Bem-vindo ao sistema de Digital Signage. Configure seu feed RSS para exibir notícias aqui.</span>
                </div>
            </div>
        </div>
    );
}
