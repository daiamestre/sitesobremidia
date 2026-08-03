import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileUp, Loader2, CheckCircle2, Film, Image as ImageIcon, FileCode, Archive, FileText } from 'lucide-react';
import { producaoService, TipoMidia } from '../../services/producao.service';

interface MediaUploaderProps {
  producaoId: string;
  onUploadSuccess: () => void;
}

export function MediaUploader({ producaoId, onUploadSuccess }: MediaUploaderProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [duracao, setDuracao] = useState(15);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validation = producaoService.validateMediaFile(file);

      if (!validation.valid) {
        toast({ title: 'Arquivo Inválido', description: validation.error, variant: 'destructive' });
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      if (!nome) setNome(file.name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const validation = producaoService.validateMediaFile(selectedFile);
    if (!validation.valid || !validation.tipo) return;

    setIsUploading(true);

    const res = await producaoService.uploadMedia({
      producaoId,
      tipo: validation.tipo,
      nome: nome || selectedFile.name,
      descricao,
      mimeType: selectedFile.type || 'application/octet-stream',
      tamanho: selectedFile.size,
      duracao: Number(duracao),
      fileBuffer: selectedFile,
    });

    setIsUploading(false);

    if (res.success) {
      toast({
        title: 'Material Enviado com Sucesso!',
        description: `Arquivo salvo no Cloudflare R2 Storage (v1).`,
      });
      setSelectedFile(null);
      setNome('');
      setDescricao('');
      onUploadSuccess();
    } else {
      toast({ title: 'Erro no Upload', description: res.error || 'Falha ao salvar no R2.', variant: 'destructive' });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Envio de Peças Publicitárias & Vídeos (Cloudflare R2)
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Suporte a Imagens (PNG/JPG), Vídeos (MP4/MOV), HTML5, ZIP e PDF com validação automática de dimensões.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="p-4 rounded-xl bg-slate-950/80 border border-dashed border-white/10 text-center space-y-2">
          <input type="file" id="media-file-input" onChange={handleFileChange} className="hidden" accept="image/*,video/*,.html,.zip,.pdf" />
          <label htmlFor="media-file-input" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
            <div className="p-3 rounded-full bg-primary/10 text-primary border border-primary/20">
              <FileUp className="h-6 w-6" />
            </div>
            <span className="text-xs font-bold text-white">Clique para selecionar o arquivo de mídia</span>
            <span className="text-[11px] text-slate-400">Resolução recomendada: 1920x1080 Full HD (Até 100MB)</span>
          </label>

          {selectedFile && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-400">
              <span>{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
              <CheckCircle2 className="h-4 w-4" />
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-200">Nome do Material *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-200">Duração Prevista (Segundos)</Label>
              <Input
                type="number"
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value))}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-slate-200">Descrição / Observações Técnicas</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Arte em alta resolução para telas verticais..."
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-xs"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="gradient-primary glow-primary font-bold text-xs px-6 h-10 rounded-xl gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Transmitindo ao R2 Storage...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Salvar Material no Cloudflare R2</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
