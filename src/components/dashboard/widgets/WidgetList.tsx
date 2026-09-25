import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Pencil, Trash2, Copy, Eye, Clock } from 'lucide-react';
import { Widget } from '@/types/models';
import { TIPO_LABEL, templateDoWidget, type WidgetTypeId } from '@/lib/widgetCatalog';
import { ICONE_TIPO } from './WidgetCatalog';

interface WidgetListProps {
    widgets: Widget[];
    onEdit: (widget: Widget) => void;
    onDelete: (id: string) => void;
    onDuplicate?: (widget: Widget) => void;
    onPreview?: (widget: Widget) => void;
    onToggleActive?: (widget: Widget, ativo: boolean) => void;
}

/** Meus Widgets: as instâncias salvas (editar, duplicar, prévia, ativar/desativar, excluir). */
export function WidgetList({ widgets, onEdit, onDelete, onDuplicate, onPreview, onToggleActive }: WidgetListProps) {
    return (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]" data-testid="meus-widgets">
            {widgets.map(widget => {
                const Icon = ICONE_TIPO[widget.widget_type as WidgetTypeId] || Clock;
                const label = TIPO_LABEL[widget.widget_type as WidgetTypeId] || widget.widget_type;
                const modelo = templateDoWidget(widget.widget_type, widget.config);

                return (
                    <Card key={widget.id} data-testid={`widget-${widget.id}`} className={`min-w-0 overflow-hidden transition-all hover:shadow-md ${!widget.is_active ? 'opacity-60' : ''}`}>
                        <button type="button" className="aspect-video w-full bg-muted relative overflow-hidden border-b block" onClick={() => onPreview?.(widget)} aria-label={`Prévia de ${widget.name}`}>
                            {widget.thumbnail_url ? (
                                <img src={widget.thumbnail_url} alt={widget.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-primary/5">
                                    <Icon className="h-12 w-12 text-primary/20" />
                                </div>
                            )}
                            {!widget.is_active && (
                                <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-background/80 px-2 py-1 rounded">Inativo — não aparece nas telas</span>
                                </div>
                            )}
                        </button>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                                <CardTitle className="text-lg flex min-w-0 items-center gap-2">
                                    <Icon className="h-5 w-5 flex-shrink-0 text-primary" /> <span className="truncate">{widget.name}</span>
                                </CardTitle>
                                <div className="flex flex-shrink-0 gap-0.5">
                                    {onPreview && <Button variant="ghost" size="icon" onClick={() => onPreview(widget)} aria-label="Prévia" title="Prévia"><Eye className="h-4 w-4" /></Button>}
                                    <Button variant="ghost" size="icon" onClick={() => onEdit(widget)} aria-label="Editar" title="Editar"><Pencil className="h-4 w-4" /></Button>
                                    {onDuplicate && <Button variant="ghost" size="icon" onClick={() => onDuplicate(widget)} aria-label="Duplicar" title="Duplicar"><Copy className="h-4 w-4" /></Button>}
                                    <Button variant="ghost" size="icon" onClick={() => onDelete(widget.id)} aria-label="Excluir" title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tipo:</span><span className="truncate">{label}</span></div>
                            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Modelo:</span><span className="truncate">{modelo?.nome ?? '—'}</span></div>
                            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Fundo:</span><span>{widget.config?.backgroundImageLandscape || widget.config?.backgroundImagePortrait ? 'Imagem da galeria' : 'Padrão do modelo'}</span></div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Ativo nas telas:</span>
                                {onToggleActive ? (
                                    <Switch checked={widget.is_active} onCheckedChange={(v) => onToggleActive(widget, v)} aria-label={widget.is_active ? 'Desativar' : 'Ativar'} />
                                ) : (
                                    <span className={widget.is_active ? 'text-green-500' : 'text-red-500'}>{widget.is_active ? 'Ativo' : 'Inativo'}</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
