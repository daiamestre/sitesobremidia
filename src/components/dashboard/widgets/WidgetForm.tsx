import { useState, useEffect } from 'react';
// Force Vercel rebuild
import { Widget, WidgetConfig, WidgetType } from '@/types/models';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, LayoutTemplate, Smartphone, Clock, Cloud, Newspaper, Image as ImageIcon, Building2, Plus, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { conteudoQrValido } from '@/lib/qrCode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { WidgetAssetsGallery } from './WidgetAssetsGallery';
import { uploadToR2 } from '@/lib/r2Upload';
import { compressImage } from '@/utils/imageCompression';
import { WIDGET_TEMPLATES } from '@/lib/widgetCatalog';

interface WidgetFormProps {
    initialData: Widget | null;
    /** Tipo escolhido na Galeria de Widgets (novo widget). */
    initialType?: WidgetType;
    /** Modelo escolhido na Galeria de Widgets (novo widget). */
    initialTemplate?: string;
    onSave: (data: Partial<Widget>) => Promise<void>;
    onCancel: () => void;
    renderPreview: (type: WidgetType, config: WidgetConfig, orientation: 'landscape' | 'portrait') => React.ReactNode;
}

const WIDGET_TYPES_OPTS = [
    { value: 'clock', label: 'Relógio', icon: Clock },
    { value: 'weather', label: 'Clima', icon: Cloud },
    { value: 'rss', label: 'Notícias (RSS)', icon: Newspaper },
    { value: 'institutional', label: 'Institucional', icon: Building2 },
];

const getDefaultConfig = (type: string): WidgetConfig => {
    switch (type) {
        case 'clock':
            return { showDate: true, showSeconds: false, position: 'center', backgroundImageLandscape: null, backgroundImagePortrait: null };
        case 'weather':
            return { latitude: -23.5505, longitude: -46.6333, position: 'center', backgroundImageLandscape: null, backgroundImagePortrait: null };
        case 'rss':
            return { feedUrl: 'https://g1.globo.com/rss/g1/', maxItems: 5, scrollSpeed: 8, position: 'center', variant: 'full', backgroundImageLandscape: null, backgroundImagePortrait: null };
        case 'institutional':
            return {
                selo: 'INFORMAÇÃO', titulo: 'Horário de funcionamento', texto: '',
                linhas: [{ rotulo: 'Segunda a sexta', valor: '06:00 — 22:00' }, { rotulo: 'Sábado', valor: '08:00 — 18:00' }],
                contato: '', endereco: '', site: '', cta: '', qrConteudo: '', qrLegenda: '',
                backgroundImageLandscape: null, backgroundImagePortrait: null,
            };
        default:
            return {};
    }
};

export function WidgetForm({ initialData, initialType, initialTemplate, onSave, onCancel, renderPreview }: WidgetFormProps) {
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
            const tipo = initialType ?? 'clock';
            setName('');
            setWidgetType(tipo);
            setConfig({ ...getDefaultConfig(tipo), ...(initialTemplate ? { template: initialTemplate } : {}) });
            setIsActive(true);
        }
    }, [initialData, initialType, initialTemplate]);

    const handleTypeChange = (type: WidgetType) => {
        setWidgetType(type);
        setConfig(getDefaultConfig(type));
    };

    const updateConfig = (key: keyof WidgetConfig, value: string | number | boolean | null) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, imageType: 'landscape' | 'portrait') => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Apenas arquivos de imagem são permitidos.');
            event.target.value = '';
            return;
        }

        setUploading(true);
        try {
            // Mesma rotina da Galeria: reduz para no máx. 1920px (TV Box fraca não aguenta foto de 12 MP) e grava como JPG.
            const blob = await compressImage(file, 1920, 0.85);
            const sanitizedName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `widget_${Date.now()}_${sanitizedName}.jpg`;
            const { publicUrl } = await uploadToR2(
                blob,
                `${user.id}/widgets/${fileName}`,
                'image/jpeg',
                user.id
            );

            if (imageType === 'landscape') {
                updateConfig('backgroundImageLandscape', publicUrl);
            } else {
                updateConfig('backgroundImagePortrait', publicUrl);
            }

            toast.success('Imagem carregada! Clique em "Salvar Alterações" para aplicar ao widget.');
        } catch (error: unknown) {
            console.error('Upload error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Falha no upload';
            toast.error(`Erro: ${errorMessage}`);
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Nome é obrigatório');
            return;
        }

        if (widgetType === 'rss' && !/^https:\/\//i.test((config.feedUrl || '').trim())) {
            toast.error('Informe a URL do feed RSS (começando com https://).');
            return;
        }

        if (widgetType === 'institutional') {
            if (!config.titulo?.trim()) { toast.error('Informe o título do comunicado.'); return; }
            if (config.qrConteudo?.trim() && !conteudoQrValido(config.qrConteudo)) {
                toast.error('QR Code: use um link (https://...), telefone (tel:) ou e-mail (mailto:).');
                return;
            }
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
                // Sem modelo escolhido = modelo clássico do tipo (a Galeria de Widgets sabe qual é)
                config: { ...config, template: config.template || `${widgetType}-classic` },
                is_active: isActive,
                thumbnail_url: config.backgroundImageLandscape || config.backgroundImagePortrait || null
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
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

                        {/* MODELO (Galeria de Widgets) */}
                        {WIDGET_TEMPLATES.filter((t) => t.tipo === widgetType && t.noPlayer).length > 1 && (
                            <div className="space-y-2">
                                <Label>Modelo</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {WIDGET_TEMPLATES.filter((t) => t.tipo === widgetType && t.noPlayer).map((t) => {
                                        const ativo = (config.template || `${widgetType}-classic`) === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => updateConfig('template', t.id)}
                                                data-testid={`modelo-${t.id}`}
                                                className={`rounded-lg border p-3 text-left transition-all ${ativo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                                            >
                                                <span className="block text-sm font-medium">{t.nome}</span>
                                                <span className="block text-xs text-muted-foreground">{t.descricao}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ORIENTATION & BG */}
                        {(widgetType === 'clock' || widgetType === 'weather' || widgetType === 'rss' || widgetType === 'institutional') && (
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
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><Label>Latitude</Label><Input type="number" value={config.latitude} onChange={(e) => updateConfig('latitude', parseFloat(e.target.value))} /></div>
                                        <div><Label>Longitude</Label><Input type="number" value={config.longitude} onChange={(e) => updateConfig('longitude', parseFloat(e.target.value))} /></div>
                                    </div>
                                    <div><Label>Nome do local (opcional)</Label><Input value={config.locationName || ''} placeholder="Ex: Manaus" onChange={(e) => updateConfig('locationName', e.target.value)} /></div>
                                </div>
                            )}

                            {widgetType === 'institutional' && (
                                <div className="space-y-3" data-testid="form-institucional">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-1"><Label>Selo</Label><Input value={config.selo || ''} placeholder="AVISO" onChange={(e) => updateConfig('selo', e.target.value)} /></div>
                                        <div className="col-span-2"><Label>Título</Label><Input value={config.titulo || ''} placeholder="Horário de funcionamento" onChange={(e) => updateConfig('titulo', e.target.value)} /></div>
                                    </div>
                                    <div><Label>Texto</Label><Textarea rows={3} value={config.texto || ''} placeholder="Ex.: Manutenção programada neste sábado." onChange={(e) => updateConfig('texto', e.target.value)} /></div>
                                    <div className="space-y-2">
                                        <Label>Linhas (ex.: dias e horários)</Label>
                                        {(config.linhas || []).map((l, i) => (
                                            <div key={i} className="flex gap-2">
                                                <Input value={l.rotulo} placeholder="Segunda a sexta" onChange={(e) => setConfig((prev) => ({ ...prev, linhas: (prev.linhas || []).map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)) }))} />
                                                <Input value={l.valor} placeholder="06:00 — 22:00" onChange={(e) => setConfig((prev) => ({ ...prev, linhas: (prev.linhas || []).map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) }))} />
                                                <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => setConfig((prev) => ({ ...prev, linhas: (prev.linhas || []).filter((_, j) => j !== i) }))}><X className="h-4 w-4" /></Button>
                                            </div>
                                        ))}
                                        {(config.linhas || []).length < 6 && (
                                            <Button type="button" variant="outline" size="sm" onClick={() => setConfig((prev) => ({ ...prev, linhas: [...(prev.linhas || []), { rotulo: '', valor: '' }] }))}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha</Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><Label>Contato</Label><Input value={config.contato || ''} placeholder="(81) 99999-0000" onChange={(e) => updateConfig('contato', e.target.value)} /></div>
                                        <div><Label>Site</Label><Input value={config.site || ''} placeholder="loja.com.br" onChange={(e) => updateConfig('site', e.target.value)} /></div>
                                    </div>
                                    <div><Label>Endereço</Label><Input value={config.endereco || ''} placeholder="Av. Principal, 100 — Centro" onChange={(e) => updateConfig('endereco', e.target.value)} /></div>
                                    <div><Label>Chamada (botão)</Label><Input value={config.cta || ''} placeholder="Fale com a gente" onChange={(e) => updateConfig('cta', e.target.value)} /></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><Label>QR Code — link</Label><Input value={config.qrConteudo || ''} placeholder="https://..." onChange={(e) => updateConfig('qrConteudo', e.target.value)} /></div>
                                        <div><Label>Legenda do QR</Label><Input value={config.qrLegenda || ''} placeholder="Aponte a câmera" onChange={(e) => updateConfig('qrLegenda', e.target.value)} /></div>
                                    </div>
                                </div>
                            )}

                            {widgetType === 'rss' && (
                                <div className="space-y-3">
                                    <div><Label>URL do Feed</Label><Input value={config.feedUrl} onChange={(e) => updateConfig('feedUrl', e.target.value)} /></div>
                                    <div className="flex items-center justify-between">
                                        <Label>Faixa compacta (rodapé)</Label>
                                        <Switch checked={config.variant === 'compact'} onCheckedChange={(v) => updateConfig('variant', v ? 'compact' : 'full')} />
                                    </div>
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
