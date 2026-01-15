import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Clock, Cloud, Newspaper } from 'lucide-react';
import { Widget } from '@/types/models';

interface WidgetListProps {
    widgets: Widget[];
    onEdit: (widget: Widget) => void;
    onDelete: (id: string) => void;
}

const WIDGET_ICONS = {
    clock: Clock,
    weather: Cloud,
    rss: Newspaper,
};

const WIDGET_LABELS = {
    clock: 'Relógio',
    weather: 'Clima',
    rss: 'Notícias (RSS)',
};

export function WidgetList({ widgets, onEdit, onDelete }: WidgetListProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {widgets.map(widget => {
                const Icon = WIDGET_ICONS[widget.widget_type as keyof typeof WIDGET_ICONS] || Clock;
                const label = WIDGET_LABELS[widget.widget_type as keyof typeof WIDGET_LABELS] || widget.widget_type;

                return (
                    <Card key={widget.id} className={!widget.is_active ? 'opacity-50' : ''}>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Icon className="h-5 w-5 text-primary" /> {widget.name}
                                </CardTitle>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => onEdit(widget)}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => onDelete(widget.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span>{label}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className={widget.is_active ? 'text-green-500' : 'text-red-500'}>{widget.is_active ? 'Ativo' : 'Inativo'}</span></div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
