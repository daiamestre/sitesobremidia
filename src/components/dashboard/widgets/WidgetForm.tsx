import { useState, useEffect } from 'react';
import { Widget, WidgetConfig, WidgetType } from '@/types/models';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, LayoutTemplate, Smartphone, Clock, Cloud, Newspaper, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { WidgetAssetsGallery } from './WidgetAssetsGallery';

interface WidgetFormProps {
    initialData: Widget | null;
    onSave: (data: Partial<Widget>) => Promise<void>;
    onCancel: () => void;
    renderPreview: (type: WidgetType, config: WidgetConfig, orientation: 'landscape' | 'portrait') => React.ReactNode;
}

const WIDGET_TYPES_OPTS = [
    { value: 'clock', label: 'Relógio', icon: Clock },
    { value: 'weather', label: 'Clima', icon: Cloud },
    { value: 'rss', label: 'Notícias (RSS)', icon: Newspaper },
];

const getDefaultConfig = (type: string): WidgetConfig => {
    switch (type) {
        case 'clock':
            return { showDate: true, showSeconds: false, position: 'center', backgroundImageLandscape: null, backgroundImagePortrait: null };
        case 'weather':
            return { latitude: -23.5505, longitude: -46.6333, position: 'center', backgroundImageLandscape: null, backgroundImagePortrait: null };
        case 'rss':
            return { feedUrl: 'https://g1.globo.com/rss/g1/', maxItems: 5, scrollSpeed: 8, position: 'center', variant: 'full', backgroundImageLandscape: null, backgroundImagePortrait: null };
        default:
            return {};
    }
};

export function WidgetForm({ initialData, onSave, onCancel, renderPreview }: WidgetFormProps) {
    const { user } = useAuth();

    // State
    const [name, setName] = useState('');
    const [widgetType, setWidgetType] = useState<WidgetType>('clock');
    const [config, setConfig] = useState<WidgetConfig>({});
    const [isActive, setIsActive] = useState(true);
    const [editOrientation, setEditOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Gallery State
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryTarget, setGalleryTarget] = useState<'landscape' | 'portrait'>('landscape');

    // Load initial data
    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setWidgetType(initialData.widget_type);
            setConfig(initialData.config || {});
            setIsActive(initialData.is_active);
        } else {
            setName('');
            setWidgetType('clock');
            setConfig(getDefaultConfig('clock'));
            setIsActive(true);
        }
    }, [initialData]);

    const handleTypeChange = (type: WidgetType) => {
        setWidgetType(type);
        setConfig(getDefaultConfig(type));
    };

    const updateConfig = (key: keyof WidgetConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, imageType: 'landscape' | 'portrait') => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `widget_${Date.now()}_${sanitizedName}.${fileExt}`;
            // Organize widget assets in a specific folder
            const filePath = `${user.id}/widgets/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('media')
                .getPublicUrl(filePath);

            if (imageType === 'landscape') {
                updateConfig('backgroundImageLandscape', publicUrl);
            } else {
                updateConfig('backgroundImagePortrait', publicUrl);
            }

            toast.success('Imagem carregada com sucesso!');
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(`Erro: ${error.message || 'Falha no upload'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Nome é obrigatório');
            return;
        }

        if (widgetType === 'rss' && !config.backgroundImageLandscape && !config.backgroundImagePortrait) {
            toast.error('RSS requer imagem de fundo (Horizontal ou Vertical).');
            return;
        }

        if (widgetType === 'weather') {
            if (config.latitude! < -90 || config.latitude! > 90) {
                toast.error('Latitude inválida (-90 a 90)');
                return;
            }
            if (config.longitude! < -180 || config.longitude! > 180) {
                toast.error('Longitude inválida (-180 a 180)');
                return;
            }
        }

        setSaving(true);
        try {
            await onSave({
                name,
                widget_type: widgetType,
                config,
                is_active: isActive,
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-full">
            {/* LEFT COLUMN: FORM */}
            <div className="w-full md:w-1/2 flex flex-col h-full border-r bg-background overflow-hidden relative">
                <div className="p-6 border-b shrink-0 bg-background/95 backdrop-blur z-10">
                    <DialogHeader>
                        <DialogTitle>{initialData ? 'Editar Widget' : 'Novo Widget'}</DialogTitle>
                    </DialogHeader>
                </div>

                <div className="flex-1 w-full overflow-y-auto custom-scrollbar">
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <Label>Nome do Widget</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Relógio Recepção" />
                        </div>

                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {WIDGET_TYPES_OPTS.map(type => {
                                    const Icon = type.icon;
                                    const isSelected = widgetType === type.value;
                                    return (
                                        <button
                                            key={type.value}
                                            onClick={() => handleTypeChange(type.value as WidgetType)}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                                        >
                                            <Icon className="h-5 w-5" />
                                            <span className="text-xs font-medium">{type.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ORIENTATION & BG */}
                        {(widgetType === 'clock' || widgetType === 'weather' || widgetType === 'rss') && (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                                <Label className="text-sm font-semibold">Configuração de Fundo</Label>
                                <div className="flex bg-muted rounded-lg p-1">
                                    <button onClick={() => setEditOrientation('landscape')} className={`flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-md transition-all ${editOrientation === 'landscape' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}>
                                        <LayoutTemplate className="h-4 w-4" /> Horizontal (16:9)
                                    </button>
                                    <button onClick={() => setEditOrientation('portrait')} className={`flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-md transition-all ${editOrientation === 'portrait' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}>
                                        <Smartphone className="h-4 w-4" /> Vertical (9:16)
                                    </button>
                                </div>

                                <div className="pt-2">
                                    {editOrientation === 'landscape' ? (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Imagem de Fundo (Horizontal)</Label>
                                            <div className="flex items-center gap-3">
                                                {config.backgroundImageLandscape ? (
                                                    <div className="relative w-32 h-20 rounded overflow-hidden border bg-black shrink-0">
                                                        <img src={config.backgroundImageLandscape} className="w-full h-full object-cover" alt="Land" />
                                                        <button onClick={() => updateConfig('backgroundImageLandscape', null)} className="absolute top-0 right-0 p-1 bg-red-500 text-white"><Trash2 className="h-3 w-3" /></button>
                                                    </div>
                                                ) : (
                                                    <div className="w-32 h-20 rounded bg-muted flex items-center justify-center border border-dashed text-xs text-muted-foreground shrink-0">1920x1080</div>
                                                )}
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'landscape')} disabled={uploading} className="text-xs" />
                                                    <Button variant="outline" size="sm" onClick={() => { setGalleryTarget('landscape'); setGalleryOpen(true); }} className="w-full text-xs">
                                                        <ImageIcon className="h-3 w-3 mr-2" />
                                                        Abrir Galeria
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Imagem de Fundo (Vertical)</Label>
                                            <div className="flex items-center gap-3">
                                                {config.backgroundImagePortrait ? (
                                                    <div className="relative w-20 h-32 rounded overflow-hidden border bg-black shrink-0">
                                                        <img src={config.backgroundImagePortrait} className="w-full h-full object-cover" alt="Port" />
                                                        <button onClick={() => updateConfig('backgroundImagePortrait', null)} className="absolute top-0 right-0 p-1 bg-red-500 text-white"><Trash2 className="h-3 w-3" /></button>
                                                    </div>
                                                ) : (
                                                    <div className="w-20 h-32 rounded bg-muted flex items-center justify-center border border-dashed text-xs text-muted-foreground shrink-0">1080x1920</div>
                                                )}
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'portrait')} disabled={uploading} className="text-xs" />
                                                    <Button variant="outline" size="sm" onClick={() => { setGalleryTarget('portrait'); setGalleryOpen(true); }} className="w-full text-xs">
                                                        <ImageIcon className="h-3 w-3 mr-2" />
                                                        Abrir Galeria
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* SPECIFIC CONFIGS */}
                        <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                            {widgetType === 'clock' && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <Label>Mostrar Data</Label>
                                        <Switch checked={config.showDate} onCheckedChange={(v) => updateConfig('showDate', v)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label>Mostrar Segundos</Label>
                                        <Switch checked={config.showSeconds} onCheckedChange={(v) => updateConfig('showSeconds', v)} />
                                    </div>
                                </>
                            )}

                            {widgetType === 'weather' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><Label>Latitude</Label><Input type="number" value={config.latitude} onChange={(e) => updateConfig('latitude', parseFloat(e.target.value))} /></div>
                                    <div><Label>Longitude</Label><Input type="number" value={config.longitude} onChange={(e) => updateConfig('longitude', parseFloat(e.target.value))} /></div>
                                </div>
                            )}

                            {widgetType === 'rss' && (
                                <div className="space-y-3">
                                    <div><Label>URL do Feed</Label><Input value={config.feedUrl} onChange={(e) => updateConfig('feedUrl', e.target.value)} /></div>
                                    <div className="flex gap-2">
                                        <div className="flex-1"><Label>Máx. Itens</Label><Input type="number" value={config.maxItems} onChange={(e) => updateConfig('maxItems', parseInt(e.target.value))} /></div>
                                        <div className="flex-1"><Label>Segundos/Item</Label><Input type="number" value={config.scrollSpeed} onChange={(e) => updateConfig('scrollSpeed', parseInt(e.target.value))} /></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Widget Ativo</Label>
                            <Switch checked={isActive} onCheckedChange={setIsActive} />
                        </div>

                        <div className="h-4"></div>
                    </div>
                </div>

                <div className="p-4 border-t shrink-0 bg-background flex justify-end gap-2">
                    <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Alterações'}</Button>
                </div>
            </div>

            {/* RIGHT COLUMN: PREVIEW */}
            {renderPreview(widgetType, config, editOrientation)}

            {/* GALLERY SELECTION DIALOG */}
            <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
                <DialogContent className="max-w-4xl h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Selecionar Imagem da Galeria</DialogTitle>
                    </DialogHeader>
                    <WidgetAssetsGallery onSelect={(url) => {
                        if (galleryTarget === 'landscape') updateConfig('backgroundImageLandscape', url);
                        else updateConfig('backgroundImagePortrait', url);
                        setGalleryOpen(false);
                        toast.success('Imagem selecionada!');
                    }} />
                </DialogContent>
            </Dialog>
        </div>
    );
}
