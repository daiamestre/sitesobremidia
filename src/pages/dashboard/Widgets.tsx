import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Loader2, LayoutTemplate, Smartphone } from 'lucide-react';
import { Widget, WidgetType } from '@/types/models';
import { WidgetList } from '@/components/dashboard/widgets/WidgetList';
import { WidgetForm } from '@/components/dashboard/widgets/WidgetForm';
import { WidgetPreview } from '@/components/dashboard/widgets/WidgetPreview';
import { WidgetAssetsGallery } from '@/components/dashboard/widgets/WidgetAssetsGallery';
import { WidgetCatalog } from '@/components/dashboard/widgets/WidgetCatalog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copiaDoWidget, type WidgetTemplateDef } from '@/lib/widgetCatalog';

export default function Widgets() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [novoModelo, setNovoModelo] = useState<WidgetTemplateDef | null>(null);
  const [aba, setAba] = useState('widgets');
  const [previa, setPrevia] = useState<Widget | null>(null);
  const [previaOrientacao, setPreviaOrientacao] = useState<'landscape' | 'portrait'>('landscape');

  const fetchWidgets = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('widgets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setWidgets((data as unknown as Widget[]) || []);
    } catch (error) {
      console.error('Error fetching widgets:', error);
      toast.error('Erro ao carregar widgets');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const openDialog = (widget?: Widget, modelo?: WidgetTemplateDef) => {
    setEditingWidget(widget || null);
    setNovoModelo(modelo || null);
    setDialogOpen(true);
  };

  const handleSave = async (data: Partial<Widget>) => {
    if (!user) return;
    try {
      const dataToSave = { ...data, user_id: user.id };
      if (editingWidget) {
        const { error } = await supabase.from('widgets').update(dataToSave as never).eq('id', editingWidget.id);
        if (error) throw error;
        toast.success('Widget atualizado!');
      } else {
        const { error } = await supabase.from('widgets').insert(dataToSave as never);
        if (error) throw error;
        toast.success('Widget criado! Ele já está em Meus Widgets e pode ser adicionado a uma playlist.');
        setAba('widgets');
      }
      setDialogOpen(false);
      fetchWidgets();
    } catch (error) {
      console.error('Error saving widget:', error);
      toast.error('Erro ao salvar widget');
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este widget?')) return;
    try {
      const { error } = await supabase.from('widgets').delete().eq('id', id);
      if (error) throw error;
      toast.success('Widget excluído!');
      fetchWidgets();
    } catch (error) {
      console.error('Error deleting widget:', error);
      toast.error('Erro ao excluir widget');
    }
  };

  const handleDuplicate = async (w: Widget) => {
    if (!user) return;
    const { error } = await supabase.from('widgets').insert({ ...copiaDoWidget(w), user_id: user.id } as never);
    if (error) { toast.error('Não foi possível duplicar o widget'); return; }
    toast.success('Widget duplicado (mesmo fundo, sem copiar a imagem).');
    fetchWidgets();
  };

  const handleToggleActive = async (w: Widget, ativo: boolean) => {
    setWidgets((prev) => prev.map((x) => (x.id === w.id ? { ...x, is_active: ativo } : x)));
    const { error } = await supabase.from('widgets').update({ is_active: ativo } as never).eq('id', w.id);
    if (error) {
      toast.error('Não foi possível alterar o status');
      fetchWidgets();
      return;
    }
    toast.success(ativo ? 'Widget ativado: volta às telas na próxima sincronização.' : 'Widget desativado: sai das telas na próxima sincronização.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Widgets</h1>
          <p className="text-muted-foreground">Escolha um modelo, configure, dê o fundo que quiser e coloque na playlist</p>
        </div>
        <Button onClick={() => setAba('galeria-widgets')}>
          <Plus className="h-4 w-4 mr-2" /> Novo Widget
        </Button>
      </div>

      <Tabs value={aba} onValueChange={setAba} className="w-full">
        <TabsList className="mb-6 h-auto flex-wrap justify-start">
          <TabsTrigger value="widgets">Meus Widgets</TabsTrigger>
          <TabsTrigger value="galeria-widgets">Galeria de Widgets</TabsTrigger>
          <TabsTrigger value="gallery">Galeria de Fundo</TabsTrigger>
        </TabsList>

        <TabsContent value="widgets">
          {widgets.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              Você ainda não tem widgets. Escolha um modelo na <button className="font-semibold text-primary underline" onClick={() => setAba('galeria-widgets')}>Galeria de Widgets</button>.
            </div>
          ) : (
            <WidgetList
              widgets={widgets}
              onEdit={openDialog}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onPreview={(w) => { setPrevia(w); setPreviaOrientacao('landscape'); }}
              onToggleActive={handleToggleActive}
            />
          )}
        </TabsContent>

        <TabsContent value="galeria-widgets">
          <WidgetCatalog onUsar={(t) => openDialog(undefined, t)} />
        </TabsContent>

        <TabsContent value="gallery">
          <WidgetAssetsGallery />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden flex flex-col md:flex-row">
          <WidgetForm
            initialData={editingWidget}
            initialType={novoModelo?.tipo as WidgetType | undefined}
            initialTemplate={novoModelo?.id}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            renderPreview={(type, config, orientation) => (
              <WidgetPreview widgetType={type} config={config} editOrientation={orientation} />
            )}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prévia — {previa?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant={previaOrientacao === 'landscape' ? 'default' : 'outline'} onClick={() => setPreviaOrientacao('landscape')}><LayoutTemplate className="h-4 w-4 mr-1" /> Horizontal</Button>
            <Button size="sm" variant={previaOrientacao === 'portrait' ? 'default' : 'outline'} onClick={() => setPreviaOrientacao('portrait')}><Smartphone className="h-4 w-4 mr-1" /> Vertical</Button>
          </div>
          {previa && (
            <div className="flex justify-center rounded-xl overflow-hidden" data-testid="widget-previa">
              <WidgetPreview widgetType={previa.widget_type} config={previa.config || {}} editOrientation={previaOrientacao} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
