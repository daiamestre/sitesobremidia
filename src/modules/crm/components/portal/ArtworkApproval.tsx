import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Eye, MessageSquare, Clock3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { customerPortalService } from '../../services/customerPortal.service';

interface PendingApproval {
  producaoId: string;
  titulo: string;
}

export function ArtworkApproval({ empresaOperadoraId }: { empresaOperadoraId: string }) {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [pendente, setPendente] = useState<PendingApproval | null>(null);
  const [loading, setLoading] = useState(true);
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ativo = true;
    customerPortalService.getAprovacaoPendente(empresaOperadoraId).then((p) => {
      if (!ativo) return;
      setPendente(p);
      setLoading(false);
    });
    return () => {
      ativo = false;
    };
  }, [empresaOperadoraId]);

  const handleDecision = async (status: 'APROVADO' | 'REPROVADO_COM_AJUSTES') => {
    if (!pendente) return;
    setSubmitting(true);
    const res = await customerPortalService.submitArtworkApproval({
      empresaOperadoraId,
      producaoId: pendente.producaoId,
      status,
      comentarios: comentario || undefined,
      decididoPor: usuario?.id || '',
    });
    setSubmitting(false);

    if (res.success) {
      toast({
        title: status === 'APROVADO' ? 'Arte Aprovada com Sucesso!' : 'Solicitação de Alteração Enviada!',
        description: 'A equipe de produção foi notificada.',
      });
      setPendente(null);
      setComentario('');
    } else {
      toast({
        title: 'Erro ao registrar decisão',
        description: 'Não foi possível salvar a aprovação. Tente novamente.',
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
          {pendente && <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Aguardando</Badge>}
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Examine o criativo e aprove para veiculação nos painéis LED.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-xs">
        {loading ? (
          <p className="text-slate-400">Carregando aprovações pendentes...</p>
        ) : pendente ? (
          <>
            <div className="rounded-xl border border-white/10 bg-slate-950 p-4 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Produção aguardando aprovação</span>
              <p className="text-white font-semibold">{pendente.titulo}</p>
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
                onClick={() => handleDecision('REPROVADO_COM_AJUSTES')}
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
          </>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 py-2">
            <Clock3 className="h-4 w-4" /> Nenhuma peça aguardando aprovação no momento.
          </div>
        )}
      </CardContent>
    </Card>
  );
}