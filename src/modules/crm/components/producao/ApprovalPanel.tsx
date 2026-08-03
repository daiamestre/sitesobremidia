import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, ShieldCheck, Loader2, Send } from 'lucide-react';
import { MidiaRecord, producaoService } from '../../services/producao.service';
import { useToast } from '@/hooks/use-toast';

interface ApprovalPanelProps {
  midia: MidiaRecord;
  onActionSuccess: () => void;
}

export function ApprovalPanel({ midia, onActionSuccess }: ApprovalPanelProps) {
  const { toast } = useToast();
  const [observacao, setObservacao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    const res = await producaoService.approveMedia(midia.id, observacao);
    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Mídia Aprovada!', description: 'Material liberado para publicação na rede.' });
      onActionSuccess();
    } else {
      toast({ title: 'Erro', description: res.error, variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    if (!motivo.trim()) {
      toast({ title: 'Motivo Obrigatório', description: 'Informe o motivo da reprovação.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    const res = await producaoService.rejectMedia(midia.id, motivo);
    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Mídia Reprovada', description: 'Notificação enviada ao responsável pela produção.' });
      onActionSuccess();
    } else {
      toast({ title: 'Erro', description: res.error, variant: 'destructive' });
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    const res = await producaoService.publishMedia(midia.id);
    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Mídia Publicada!', description: 'Material pronto para agendamento nas playlists da rede.' });
      onActionSuccess();
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Painel de Aprovação Formal da Mídia
          </span>
          <Badge className={
            midia.status === 'APROVADO' ? 'bg-emerald-500/20 text-emerald-400' :
            midia.status === 'REPROVADO' ? 'bg-rose-500/20 text-rose-400' :
            'bg-amber-500/20 text-amber-400'
          }>
            {midia.status}
          </Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Aprovação técnica e jurídica de materiais publicitários antes da transmissão no player.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Material:</span>
            <strong className="text-white font-bold">{midia.nome} (v{midia.versao_atual})</strong>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Duração / Resolução:</span>
            <strong className="text-slate-300">{midia.duracao}s • {midia.largura}x{midia.altura}</strong>
          </div>
        </div>

        {midia.status === 'EM_REVISAO' && (
          <div className="space-y-3">
            <Input
              placeholder="Observação da aprovação (opcional)..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="bg-slate-950/60 border-white/10 text-white rounded-xl text-xs h-9"
            />
            <Input
              placeholder="Motivo em caso de reprovação..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="bg-slate-950/60 border-white/10 text-white rounded-xl text-xs h-9"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isSubmitting}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-9 gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                <span>Reprovar</span>
              </Button>

              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 gap-1.5 shadow-lg"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Aprovar Formalmente</span>
              </Button>
            </div>
          </div>
        )}

        {midia.status === 'APROVADO' && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handlePublish}
              disabled={isSubmitting}
              className="gradient-primary glow-primary font-bold text-xs px-6 h-10 rounded-xl gap-2 shadow-xl"
            >
              <Send className="h-4 w-4" />
              <span>Publicar & Liberar para Agendamento (Fase 7.5-C)</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
