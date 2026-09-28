import React, { useState, useEffect } from 'react';
import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { customerCommerceService } from '@/modules/crm/services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, Loader2, Image as ImageIcon, Video, FileText, Trash2, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/utils/formatters';
import { DiretrizesConteudo, DURACAO_MAXIMA_VIDEO } from '@/components/portal/DiretrizesConteudo';
import { cn } from '@/lib/utils';

/** Envia um arquivo para o R2 (mesmo caminho do site) e devolve o endereço público. */
async function enviarParaR2(arquivo: Blob, caminho: string, tipo: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-upload-url', { body: { fileName: caminho, contentType: tipo } });
  // F-110: a função devolve signedUrl (antes o código esperava uploadUrl e TODO envio falhava)
  if (error || !data?.signedUrl || !data?.publicUrl) throw new Error('Falha ao autorizar o envio do arquivo.');
  const put = await fetch(data.signedUrl, { method: 'PUT', body: arquivo, headers: { 'Content-Type': tipo } });
  if (!put.ok) throw new Error('Erro no envio do arquivo.');
  return data.publicUrl as string;
}

/** Duração do vídeo (segundos) e 3 quadros (início, meio, fim) para o robô de análise. */
async function lerVideo(arquivo: File): Promise<{ duracao: number; quadros: Blob[] }> {
  const url = URL.createObjectURL(arquivo);
  try {
    const video = document.createElement('video');
    video.preload = 'auto'; video.muted = true; video.playsInline = true; video.src = url;
    await new Promise<void>((ok, erro) => { video.onloadedmetadata = () => ok(); video.onerror = () => erro(new Error('Vídeo inválido.')); });
    const duracao = video.duration;
    const quadros: Blob[] = [];
    const canvas = document.createElement('canvas');
    const escala = Math.min(1, 640 / (video.videoWidth || 640));
    canvas.width = Math.round((video.videoWidth || 640) * escala);
    canvas.height = Math.round((video.videoHeight || 360) * escala);
    for (const p of [0.1, 0.5, 0.9]) {
      video.currentTime = Math.max(0, Math.min(duracao - 0.1, duracao * p));
      await new Promise<void>((ok) => { video.onseeked = () => ok(); });
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const b = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8));
      if (b) quadros.push(b);
    }
    return { duracao, quadros };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SITUACAO: Record<string, { texto: string; cor: string; icone: React.ComponentType<{ className?: string }> }> = {
  APROVADA: { texto: 'Aprovada', cor: 'bg-emerald-500/15 text-emerald-400', icone: ShieldCheck },
  RECUSADA: { texto: 'Recusada', cor: 'bg-red-500/15 text-red-400', icone: ShieldAlert },
  PENDENTE: { texto: 'Em análise', cor: 'bg-sky-500/15 text-sky-400', icone: Clock },
  EM_ANALISE_MANUAL: { texto: 'Em análise', cor: 'bg-sky-500/15 text-sky-400', icone: Clock },
};

export default function AssetLibraryPage() {
  const { cliente, isLoading } = useClienteModalidade();
  const [assets, setAssets] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const fetchAssets = async () => {
    if (!cliente?.id) return;
    setIsLoadingAssets(true);
    try {
      setAssets(await customerCommerceService.listarAssets(cliente.id));
    } catch {
      toast.error('Erro ao carregar as mídias.');
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => { fetchAssets(); }, [cliente]);

  // enquanto houver mídia em análise, atualiza a lista a cada 15 s
  useEffect(() => {
    if (!assets.some((a) => a.moderacao_status === 'PENDENTE')) return;
    const t = setInterval(fetchAssets, 15_000);
    return () => clearInterval(t);
  }, [assets]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !cliente?.id) return;
    if (file.size > 50 * 1024 * 1024) { toast.error('O tamanho máximo permitido é 50 MB.'); return; }

    let tipo = 'outro';
    if (file.type.startsWith('image/')) tipo = 'imagem';
    else if (file.type.startsWith('video/')) tipo = 'video';
    else if (file.type.includes('pdf')) tipo = 'documento';

    try {
      setIsUploading(true);
      let duracao: number | undefined;
      let quadrosBlobs: Blob[] = [];
      if (tipo === 'video') {
        const v = await lerVideo(file);
        if (v.duracao > DURACAO_MAXIMA_VIDEO + 0.5) {
          toast.error(`Vídeo com ${Math.round(v.duracao)} segundos. O máximo aceito é ${DURACAO_MAXIMA_VIDEO} segundos.`);
          return;
        }
        duracao = Math.round(v.duracao);
        quadrosBlobs = v.quadros;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Sessão expirada. Entre novamente.');
      const base = `${uid}/portal/${Date.now()}`;
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const objectUrl = await enviarParaR2(file, `${base}.${ext}`, file.type);
      const quadros: string[] = [];
      for (let i = 0; i < quadrosBlobs.length; i++) quadros.push(await enviarParaR2(quadrosBlobs[i], `${base}-quadro${i + 1}.jpg`, 'image/jpeg'));

      const tenantId = (await supabase.rpc('get_user_tenant_id')).data;
      const registrado = await customerCommerceService.registrarAsset({
        cliente_id: cliente.id,
        empresa_operadora_id: tenantId as string,
        nome: file.name,
        tipo,
        mime_type: file.type,
        object_url: objectUrl,
        tamanho: file.size,
        ...(duracao !== undefined ? { duracao } : {}),
        ...(quadros.length ? { quadros } : {}),
        usuario_id: uid,
      } as any);
      if (!registrado) throw new Error('Não foi possível registrar a mídia.');

      if (tipo === 'imagem' || tipo === 'video') {
        // robô de análise (sem esperar: a varredura de 10 em 10 min também cobre)
        supabase.functions.invoke('analisar-midia', { body: { asset_id: registrado.id } }).then(() => fetchAssets());
        toast.success('Mídia enviada! Ela passa por análise antes de ir para as telas.');
      } else {
        toast.success('Arquivo enviado.');
      }
      fetchAssets();
    } catch (error) {
      console.error(error);
      toast.error((error as Error)?.message || 'Falha ao enviar arquivo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm('Tem certeza que deseja remover esta mídia?')) return;
    const ok = await customerCommerceService.deletarAsset(assetId);
    if (ok) { toast.success('Mídia removida.'); setAssets((prev) => prev.filter((a) => a.id !== assetId)); }
    else toast.error('Erro ao remover a mídia.');
  };

  if (isLoading || isLoadingAssets) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-[250px]" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Skeleton className="h-[200px]" /><Skeleton className="h-[200px]" /><Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas Mídias</h1>
          <p className="text-muted-foreground mt-1">Imagens e vídeos para anunciar nas telas dos pontos parceiros.</p>
        </div>
        <div>
          <input type="file" id="asset-upload" className="hidden" accept="image/*,video/*,application/pdf" onChange={handleFileUpload} disabled={isUploading} />
          <Button onClick={() => document.getElementById('asset-upload')?.click()} disabled={isUploading} className="w-full md:w-auto">
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isUploading ? 'Enviando...' : 'Enviar mídia'}
          </Button>
        </div>
      </div>

      <DiretrizesConteudo />

      {assets.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center h-56 text-center">
            <div className="bg-primary/10 p-4 rounded-full mb-4"><Upload className="h-8 w-8 text-primary" /></div>
            <h3 className="text-xl font-semibold mb-2">Nenhuma mídia ainda</h3>
            <p className="text-muted-foreground max-w-md">Envie uma imagem ou um vídeo de até {DURACAO_MAXIMA_VIDEO} segundos para anunciar nos pontos parceiros.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="lista-midias">
          {assets.map((asset) => {
            const sit = SITUACAO[asset.moderacao_status];
            return (
              <Card key={asset.id} className="overflow-hidden group">
                <div className="relative aspect-video bg-muted flex items-center justify-center">
                  {asset.tipo === 'imagem' ? (
                    <img src={asset.object_url} alt={asset.nome} className="object-cover w-full h-full" />
                  ) : asset.tipo === 'video' ? (
                    <video src={asset.object_url} className="object-cover w-full h-full bg-black" muted preload="metadata" />
                  ) : (
                    <FileText className="h-12 w-12 text-muted-foreground/50" />
                  )}
                  {sit && (
                    <span className={cn('absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur', sit.cor)} data-testid="situacao-midia">
                      <sit.icone className="h-3 w-3" /> {sit.texto}
                    </span>
                  )}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-md" onClick={() => handleDelete(asset.id)}>
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
                    <span>{new Date(asset.created_at).toLocaleDateString('pt-BR')}{asset.duracao ? ` · ${asset.duracao}s` : ''}</span>
                    <span>{formatBytes(asset.tamanho || 0)}</span>
                  </div>
                  {asset.moderacao_status === 'RECUSADA' && asset.moderacao_motivo && (
                    <p className="mt-2 text-xs text-red-400">{asset.moderacao_motivo}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
