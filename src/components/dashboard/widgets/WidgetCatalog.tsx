import { Clock, Cloud, Newspaper, Building2, Tag, Megaphone, MessageSquareQuote, Youtube, Instagram, Image as ImageIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TIPO_LABEL, WIDGET_TEMPLATES, type WidgetTemplateDef, type WidgetTypeId } from '@/lib/widgetCatalog';
import { CapaWidget } from './CapaWidget';

export const ICONE_TIPO: Record<WidgetTypeId, LucideIcon> = {
  clock: Clock, weather: Cloud, rss: Newspaper, institutional: Building2, offer: Tag, advertising: Megaphone,
  social: MessageSquareQuote, youtube: Youtube, instagram: Instagram,
};

/** Galeria de Widgets: os MODELOS disponíveis. Escolher um abre o formulário já no tipo/modelo certo. */
export function WidgetCatalog({ onUsar }: { onUsar: (t: WidgetTemplateDef) => void }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]" data-testid="widget-catalog">
      {WIDGET_TEMPLATES.map((t) => {
        const Icon = ICONE_TIPO[t.tipo];
        return (
          <div
            key={t.id}
            data-testid={`template-${t.id}`}
            className={cn('flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card/80 p-4', !t.noPlayer && 'opacity-70')}
          >
            {(t.tipo === 'clock' || t.tipo === 'weather') && (
              <div className="-mx-4 -mt-4 mb-3 aspect-video overflow-hidden rounded-t-2xl border-b border-border/60" data-testid={`capa-${t.id}`}>
                <CapaWidget widgetType={t.tipo} config={{}} nome={t.nome} />
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5D1BFF] to-[#B04DFF] text-white shadow-lg shadow-[#5D1BFF]/30">
                <Icon className="h-5 w-5" />
              </span>
              {t.noPlayer ? (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">Disponível</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Em breve</Badge>
              )}
            </div>
            <p className="mt-3 font-semibold text-foreground">{t.nome}</p>
            <p className="text-xs text-muted-foreground">{TIPO_LABEL[t.tipo]}</p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{t.descricao}</p>
            {t.suportaFundo && (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" /> Aceita imagem de fundo da Galeria</p>
            )}
            <Button className="mt-4" size="sm" disabled={!t.noPlayer} onClick={() => onUsar(t)}>
              {t.noPlayer ? 'Usar este modelo' : 'Em construção'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
