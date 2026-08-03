import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Eye, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { customerPortalService } from '../../services/customerPortal.service';

export function ArtworkApproval({ producaoId, empresaOperadoraId }: { producaoId: string; empresaOperadoraId: string }) {
  const { toast } = useToast();
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDecision = async (status: 'APROVADO' | 'REJEITADO') => {
    setSubmitting(true);
    const res = await customerPortalService.submitArtworkApproval({
      empresaOperadoraId,
      producaoId,
      versao: 1,
      status,
      comentario,
    });
    setSubmitting(false);

    if (res.success) {
      toast({
        title: status === 'APROVADO' ? 'Arte Aprovada com Sucesso!' : 'Solicitação de Alteração Enviada!',
        description: 'A equipe de produção foi notificada.',
      });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-400" /> Central de Aprovação de Peça Publicitária
          </span>
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Versão 1</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Examine o criativo e aprove para veiculação nos painéis LED.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        <div className="aspect-video w-full bg-slate-950 rounded-xl border border-white/10 flex items-center justify-center text-slate-500 font-mono">
          [ Pré-visualização do Vídeo / Mídia HD 1920x1080 ]
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Comentários / Observações de Ajuste:
          </label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Digite aqui caso deseje solicitar alteração na arte..."
            className="w-full p-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 text-xs"
            rows={2}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={() => handleDecision('REJEITADO')}
            className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 rounded-xl text-xs gap-1.5"
          >
            <XCircle className="h-4 w-4" /> Solicitado Ajuste
          </Button>

          <Button
            size="sm"
            disabled={submitting}
            onClick={() => handleDecision('APROVADO')}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" /> Aprovar Arte para Exibição
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
