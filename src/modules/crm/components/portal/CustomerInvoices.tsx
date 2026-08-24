import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { financeiroService, ContaReceberCompleta } from '@/modules/crm/services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function CustomerInvoices() {
  const { clienteId } = useAuth();
  const [contas, setContas] = useState<ContaReceberCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (clienteId) {
      const fetchContas = async () => {
        const data = await financeiroService.listReceivables(clienteId);
        setContas(data);
        setLoading(false);
      };
      fetchContas();
    } else {
      setLoading(false);
    }
  }, [clienteId]);

  const formatValor = (valor: number) => `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" /> Faturamento, Boletos & Notas Fiscais
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {loading ? (
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin me-2" />
            <span className="text-slate-400">Carregando...</span>
          </div>
        ) : contas.length === 0 ? (
          <div className="p-6 text-center text-slate-400 space-y-2">
            <FileText className="h-8 w-8 mx-auto opacity-30" />
            <p>Nenhuma fatura disponível no momento.</p>
            <p className="text-[10px] text-slate-500">Os documentos financeiros serão exibidos aqui quando gerados.</p>
          </div>
        ) : (
          <CardContent className="pt-4 space-y-2 text-xs">
            {contas.map((conta) => {
              const valor = Number(conta.valor_recebido || conta.saldo || conta.valor_original || 0);
              const dataVenc = conta.vencimento ? new Date(conta.vencimento).toLocaleDateString() : 'N/A';
              const status = conta.status || 'PENDENTE';
              return (
                <div key={conta.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <strong className="text-white block font-mono">{conta.numero_documento || '—'}</strong>
                    <span className="text-[10px] text-slate-400">Vencimento: {dataVenc} — {formatValor(valor)}</span>
                  </div>
                  <Badge
                    className={
                      status === 'PAGO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      status === 'VENCIDO' || status === 'ATRASADA' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                      status === 'PARCIAL_PAGA' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                        'bg-slate-500 text-slate-300'
                    }
                  >
                    {status}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        )}
      </CardContent>
    </Card>
  );
}