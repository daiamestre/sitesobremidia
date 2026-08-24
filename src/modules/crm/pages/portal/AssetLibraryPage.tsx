import React, { useState, useEffect } from 'react';
import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { customerCommerceService } from '@/modules/crm/services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, Image as ImageIcon, Video, FileText, Trash2, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/utils/formatters';

export default function AssetLibraryPage() {
  const { cliente, isLoading } = useClienteModalidade();
  const [assets, setAssets] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const fetchAssets = async () => {
    if (!cliente?.id) return;
    setIsLoadingAssets(true);
    try {
      const data = await customerCommerceService.listarAssets(cliente.id);
      setAssets(data);
    } catch (err) {
      toast.error('Erro ao carregar os assets.');
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [cliente]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !cliente?.id) return;

    if (file.size > 20 * 1024 * 1024) { // 20MB
      toast.error('O tamanho máximo permitido é 20MB.');
      return;
    }

    try {
      setIsUploading(true);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${cliente.id}/assets/${Date.now()}.${fileExt}`;
      const bucket = 'clientes_assets';

      // 1. Obter URL de upload
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('get-upload-url', {
        body: { bucket, fileName, contentType: file.type }
      });

      if (uploadError || !uploadData?.uploadUrl || !uploadData?.publicUrl) {
        throw new Error('Falha ao obter URL de upload do R2');
      }

      // 2. Upload binário para o R2
      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Erro no envio do arquivo para o R2');
      }

      // 3. Determinar o tipo
      let tipo = 'outro';
      if (file.type.startsWith('image/')) tipo = 'imagem';
      else if (file.type.startsWith('video/')) tipo = 'video';
      else if (file.type.includes('pdf')) tipo = 'documento';

      // 4. Registrar no banco
      const tenantId = (await supabase.rpc('get_user_tenant_id')).data;

      await customerCommerceService.registrarAsset({
        cliente_id: cliente.id,
        empresa_operadora_id: tenantId as string,
        nome: file.name,
        tipo,
        mime_type: file.type,
        object_url: uploadData.publicUrl,
        tamanho: file.size,
      });

      toast.success('Asset enviado com sucesso!');
      fetchAssets();
    } catch (error) {
      console.error(error);
      toast.error('Falha ao enviar arquivo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('Tem certeza que deseja remover este asset?')) return;
    
    try {
      const success = await customerCommerceService.deletarAsset(assetId);
      if (success) {
        toast.success('Asset removido com sucesso!');
        setAssets(prev => prev.filter(a => a.id !== assetId));
      } else {
        throw new Error('Falha na remoção');
      }
    } catch (error) {
      toast.error('Erro ao remover o asset.');
    }
  };

  if (isLoading || isLoadingAssets) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-[250px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asset Library</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie logos, imagens promocionais e vídeos para suas campanhas e encartes.
          </p>
        </div>

        <div className="relative">
          <input 
            type="file" 
            id="asset-upload" 
            className="hidden" 
            accept="image/*,video/*,application/pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <Button 
            onClick={() => document.getElementById('asset-upload')?.click()}
            disabled={isUploading}
            className="w-full md:w-auto"
          >
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isUploading ? 'Enviando...' : 'Fazer Upload'}
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Nenhum asset encontrado</h3>
            <p className="text-muted-foreground max-w-md">
              Sua biblioteca está vazia. Faça o upload de imagens ou vídeos para utilizá-los na criação de Campanhas e Encartes Digitais.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden group">
              <div className="relative aspect-video bg-muted flex items-center justify-center">
                {asset.tipo === 'imagem' ? (
                  <img src={asset.object_url} alt={asset.nome} className="object-cover w-full h-full" />
                ) : asset.tipo === 'video' ? (
                  <Video className="h-12 w-12 text-muted-foreground/50" />
                ) : (
                  <FileText className="h-12 w-12 text-muted-foreground/50" />
                )}
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-8 w-8 rounded-full shadow-md"
                    onClick={() => handleDelete(asset.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {asset.tipo === 'imagem' && <ImageIcon className="h-4 w-4 text-blue-500" />}
                  {asset.tipo === 'video' && <Video className="h-4 w-4 text-purple-500" />}
                  {asset.tipo === 'documento' && <FileText className="h-4 w-4 text-orange-500" />}
                  <h4 className="font-medium truncate text-sm" title={asset.nome}>{asset.nome}</h4>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                  <span>{formatBytes(asset.tamanho || 0)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
