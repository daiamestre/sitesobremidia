import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { buscarNoticias, type DadosNoticias } from '@/lib/esportes';

interface RssWidgetProps {
    feedUrl?: string;
    maxItems?: number;
    scrollSpeed?: number;
    variant?: 'full' | 'compact';
    backgroundImage?: string | null;
    className?: string;
    /** Notícias automáticas (motor de notícias): manchetes guardadas pelo servidor, sem ler o feed. */
    origem?: 'agencia-brasil';
    categoria?: string;
    /** Já resolvidas pelo servidor (Player web). */
    noticias?: DadosNoticias | null;
}

interface RssItem { title: string; description?: string }

const stripHtml = (html = '') =>
    html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** Notícias reais do feed (Edge Function fetch-rss), com rotação a cada `scrollSpeed` segundos. Mesmo desenho do Player. */
export function RssWidget({ feedUrl, maxItems = 5, scrollSpeed = 8, variant = 'full', backgroundImage, className, origem, categoria, noticias }: RssWidgetProps) {
    const [items, setItems] = useState<RssItem[]>([]);
    const [index, setIndex] = useState(0);
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
    const automatico = origem === 'agencia-brasil';

    // Notícias automáticas: vêm do servidor (título + resumo, crédito Agência Brasil), sem ler o feed no aparelho.
    useEffect(() => {
        if (!automatico) return;
        const aplicar = (d: DadosNoticias) => { setItems(d.itens.map((n) => ({ title: n.titulo, description: n.resumo ?? '' }))); setIndex(0); setState('idle'); };
        if (noticias) { aplicar(noticias); return; }
        let cancelled = false;
        setState('loading');
        buscarNoticias({ categoria, maxItems })
            .then((d) => { if (!cancelled) aplicar(d); })
            .catch(() => { if (!cancelled) { setItems([]); setState('error'); } });
        return () => { cancelled = true; };
    }, [automatico, categoria, maxItems, noticias]);

    useEffect(() => {
        if (automatico) return;
        const url = (feedUrl || '').trim();
        if (!/^https:\/\//i.test(url)) { setItems([]); setState('idle'); return; }
        let cancelled = false;
        setState('loading');
        const timer = setTimeout(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('fetch-rss', { body: { feedUrl: url, maxItems: Math.min(Math.max(maxItems || 5, 1), 20) } });
                if (cancelled) return;
                if (error || !Array.isArray(data?.items)) throw new Error(error?.message || 'feed inválido');
                setItems(data.items as RssItem[]);
                setIndex(0);
                setState('idle');
            } catch {
                if (!cancelled) { setItems([]); setState('error'); }
            }
        }, 400); // debounce enquanto o usuário digita a URL
        return () => { cancelled = true; clearTimeout(timer); };
    }, [automatico, feedUrl, maxItems]);

    useEffect(() => {
        if (items.length < 2) return;
        const t = setInterval(() => setIndex(i => (i + 1) % items.length), Math.max(scrollSpeed || 8, 3) * 1000);
        return () => clearInterval(t);
    }, [items, scrollSpeed]);

    const item = items[index];
    const compact = variant === 'compact';
    const source = automatico ? 'Agência Brasil' : (feedUrl || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');

    return (
        <div className={cn("relative flex p-4 text-white overflow-hidden", compact ? "items-end" : "items-center justify-center", className)}>
            <div className="absolute inset-0 z-0">
                {backgroundImage
                    ? <img src={backgroundImage} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950" />}
                <div className={cn("absolute inset-0", compact ? "bg-black/25" : "bg-black/45")} />
            </div>
            <div className="relative z-10 w-full text-center drop-shadow-lg">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest">{automatico && (categoria ?? 'esportes') === 'esportes' ? 'ESPORTES' : 'NOTÍCIAS'}</span>
                    {!compact && source && <span className="text-[10px] opacity-75">{source}</span>}
                </div>
                {item ? (
                    <>
                        <p className={cn("font-bold leading-tight", compact ? "text-sm" : "text-lg")}>{item.title}</p>
                        {!compact && stripHtml(item.description) && (
                            <p className="text-xs mt-2 opacity-85 line-clamp-4">{stripHtml(item.description)}</p>
                        )}
                        {items.length > 1 && <p className="text-[10px] mt-2 opacity-70">{index + 1} / {items.length}</p>}
                    </>
                ) : (
                    <p className="text-sm opacity-80">
                        {!automatico && !/^https:\/\//i.test((feedUrl || '').trim()) ? 'Informe a URL do feed RSS (https://)' : state === 'loading' ? 'Carregando notícias…' : 'Sem notícias no momento'}
                    </p>
                )}
            </div>
        </div>
    );
}
