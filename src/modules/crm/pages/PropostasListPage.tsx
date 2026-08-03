import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { propostaService } from '@/modules/crm/services/proposta.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText, Send, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PropostasListPage() {
  const { representante } = useAuth();
  const [propostas, setPropostas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function loadPropostas() {
      setLoading(true);
      const res = await propostaService.findAll(representante?.id);
      setPropostas(res);
      setLoading(false);
    }
    loadPropostas();
  }, [representante]);

  const handleSendProposal = async (propostaId: string) => {
    setSendingId(propostaId);
    const res = await propostaService.sendProposalEmail(propostaId);
    setSendingId(null);
    if (res.success) {
      toast({
        title: 'Proposta Enviada com Sucesso!',
        description: 'O cliente recebeu o PDF e link para visualização interativa por e-mail.',
      });
      setPropostas(prev => prev.map(p => p.id === propostaId ? { ...p, status: 'SENT' } : p));
    } else {
      toast({
        title: 'Erro no Envio',
        description: res.error || 'Não foi possível disparar a proposta via e-mail.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-white flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Propostas Comerciais (Real-Time)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gerencie orçamentos com cálculo dinâmico e envio por e-mail.
          </p>
        </div>
        <Link to="/representantes/contratos">
          <Button className="gradient-primary glow-primary font-bold shadow-lg gap-2">
            <Plus className="h-4 w-4" />
            Gerar Novo Contrato / PI
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {propostas.length === 0 ? (
          <Card className="col-span-2 bg-slate-900/60 border-white/10 text-center py-12">
            <CardContent>
              <AlertCircle className="h-12 w-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-semibold text-lg">Nenhuma proposta registrada</p>
              <p className="text-slate-400 text-sm mt-1">Crie negociações com seus clientes para visualizá-las aqui.</p>
            </CardContent>
          </Card>
        ) : (
          propostas.map((prop) => {
            const empresaNome = prop.cliente?.empresas?.[0]?.nome_fantasia || prop.cliente?.empresas?.[0]?.razao_social || 'Cliente Corporativo';
            const isSent = prop.status === 'SENT' || prop.status === 'ACCEPTED';

            return (
              <Card key={prop.id} className="bg-slate-900/80 border-white/10 hover:border-primary/40 transition-all rounded-xl shadow-xl">
                <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-start justify-between">
                  <div>
                    <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider">{prop.numero_proposta}</span>
                    <CardTitle className="text-lg font-bold text-white mt-1">{empresaNome}</CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Emitida em: {new Date(prop.created_at).toLocaleDateString('pt-BR')}
                    </CardDescription>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    isSent ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {prop.status}
                  </span>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex justify-between items-center bg-slate-950/60 p-3 rounded-lg border border-white/5">
                    <span className="text-xs text-slate-400 font-medium">Valor Total Estimado</span>
                    <span className="text-lg font-mono font-extrabold text-emerald-400">
                      R$ {Number(prop.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="w-full bg-slate-800 hover:bg-slate-700 text-white border-white/10 text-xs"
                      onClick={() => toast({ title: 'Visualização de PDF', description: 'Abrindo prévia gerada em tempo real no servidor...' })}
                    >
                      Ver PDF / Prévia
                    </Button>
                    <Button 
                      disabled={sendingId === prop.id || isSent}
                      onClick={() => handleSendProposal(prop.id)}
                      className="w-full bg-primary hover:bg-primary/90 font-bold text-xs gap-1.5"
                    >
                      {sendingId === prop.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isSent ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Enviada
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Disparar por E-mail
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
