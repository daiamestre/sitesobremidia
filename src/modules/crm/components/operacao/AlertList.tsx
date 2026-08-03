import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { operacaoService } from '../../services/operacao.service';
import { useToast } from '@/hooks/use-toast';

interface AlertListProps {
  alertas: any[];
  onResolveSuccess?: () => void;
}

export function AlertList({ alertas, onResolveSuccess }: AlertListProps) {
  const { toast } = useToast();

  const handleResolve = async (alertaId: string) => {
    const res = await operacaoService.resolveAlert(alertaId);
    if (res.success) {
      toast({ title: 'Alerta Resolvido', description: 'Status operacional restabelecido.' });
      if (onResolveSuccess) onResolveSuccess();
    }
  };

  const pendentes = alertas.filter((a) => !a.resolvido);

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          Central de Alertas Operacionais em Tempo Real ({pendentes.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Notificações automáticas de desconexão, sincronização e erros de mídia.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {pendentes.length === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-xs text-emerald-400 font-semibold">
            Nenhum alerta pendente. Todos os players operando normalmente.
          </div>
        ) : (
          <div className="space-y-2">
            {pendentes.map((a) => (
              <div key={a.id} className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge className={a.nivel === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}>
                      {a.tipo}
                    </Badge>
                    <span className="text-[10px] text-slate-500">{new Date(a.created_at).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <p className="text-slate-200 text-xs">{a.mensagem}</p>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleResolve(a.id)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Resolver</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
