import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, CheckCircle2 } from 'lucide-react';
import { cameraService } from '../../services/camera.service';
import { useToast } from '@/hooks/use-toast';

export function FieldDashboard({ empresaOperadoraId }: { empresaOperadoraId: string }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleCapturePhoto = async () => {
    setUploading(true);
    const res = await cameraService.captureAndUploadPhoto(empresaOperadoraId);
    setUploading(false);

    if (res.success) {
      toast({
        title: 'Foto de Manutenção Salva!',
        description: `Armazenada no R2: ${res.photoKey}`,
      });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Camera className="h-4 w-4 text-purple-400" /> Operações & Manutenção Técnica
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 text-xs">
        <Button
          size="sm"
          disabled={uploading}
          onClick={handleCapturePhoto}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl text-xs gap-1.5"
        >
          <Camera className="h-4 w-4" /> Capturar Foto de Instalação/Vistoria
        </Button>
      </CardContent>
    </Card>
  );
}
