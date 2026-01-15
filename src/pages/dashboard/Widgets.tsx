import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { Widget } from '@/types/models';
import { WidgetList } from '@/components/dashboard/widgets/WidgetList';
import { WidgetForm } from '@/components/dashboard/widgets/WidgetForm';
import { WidgetPreview } from '@/components/dashboard/widgets/WidgetPreview';
import { WidgetAssetsGallery } from '@/components/dashboard/widgets/WidgetAssetsGallery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Widgets() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);

  const fetchWidgets = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('widgets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setWidgets((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching widgets:', error);
      toast.error('Erro ao carregar widgets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWidgets();
  }, [user]);

  const openDialog = (widget?: Widget) => {
    setEditingWidget(widget || null);
    setDialogOpen(true);
  };

  const handleSave = async (data: Partial<Widget>) => {
    if (!user) return;
    try {
      const dataToSave = {
        ...data,
        user_id: user.id
      };

      if (editingWidget) {
        const { error } = await supabase.from('widgets').update(dataToSave as any).eq('id', editingWidget.id);
        if (error) throw error;
        toast.success('Widget atualizado!');
      } else {
        const { error } = await supabase.from('widgets').insert(dataToSave as any);
        if (error) throw error;
        toast.success('Widget criado!');
      }

      setDialogOpen(false);
      fetchWidgets();
    } catch (error: any) {
      console.error('Error saving widget:', error);
      toast.error('Erro ao salvar widget');
      throw error; // Re-throw to be caught by form loading state if needed
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este widget?')) return;
    try {
      const { error } = await supabase.from('widgets').delete().eq('id', id);
      if (error) throw error;
      toast.success('Widget excluído!');
      fetchWidgets();
    } catch (error: any) {
      console.error('Error deleting widget:', error);
      toast.error('Erro ao excluir widget');
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Widgets</h1>
          <p className="text-muted-foreground">Crie e configure seus widgets</p>
        </div>
      </div>

      <Tabs defaultValue="widgets" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="widgets">Meus Widgets</TabsTrigger>
          <TabsTrigger value="gallery">Galeria de Fundo</TabsTrigger>
        </TabsList>

        <TabsContent value="widgets">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Novo Widget
            </Button>
          </div>
          <WidgetList
            widgets={widgets}
            onEdit={openDialog}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="gallery">
          <WidgetAssetsGallery />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden flex flex-col md:flex-row">
          <WidgetForm
            initialData={editingWidget}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            renderPreview={(type, config, orientation) => (
              <WidgetPreview
                widgetType={type}
                config={config}
                editOrientation={orientation}
              />
            )}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
