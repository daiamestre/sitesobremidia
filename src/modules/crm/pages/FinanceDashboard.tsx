import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroService, ContaReceberCompleta } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { FinanceList } from '../components/financeiro/FinanceList';
import { ReceivableDetails } from '../components/financeiro/ReceivableDetails';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Clock, CheckCircle2, Loader2, ArrowLeft, PieChart, Landmark } from 'lucide-react';

export default function FinanceDashboard() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [contas, setContas] = useState<ContaReceberCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConta, setSelectedConta] = useState<ContaReceberCompleta | null>(null);

  const fetchContas = useCallback(async () => {
    setLoading(true);
    const data = await financeiroService.listReceivables(empresaOperadoraId || undefined);
    setContas(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchContas();
  }, [fetchContas]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalOriginal = contas.reduce((acc, c) => acc + Number(c.valor_original), 0);
  const totalPago = contas.reduce((acc, c) => acc + Number(c.valor_pago), 0);
  const totalSaldo = contas.reduce((acc, c) => acc + Number(c.saldo), 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Módulo Financeiro Enterprise
            </h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.1</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Contas a Receber, Liquidação, Conciliação, Fluxo de Caixa e Extrato de Comissões
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/representantes/financeiro/comissoes')} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 rounded-xl text-xs gap-1.5">
            <PieChart className="h-4 w-4" /> Comissões
          </Button>
          <Button onClick={() => navigate('/representantes/financeiro/fluxo-caixa')} variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-xl text-xs gap-1.5">
            <Landmark className="h-4 w-4" /> Fluxo de Caixa
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total Faturado</span>
              <strong className="text-xl font-bold text-white">
                R$ {totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total Recebido / Baixado</span>
              <strong className="text-xl font-bold text-emerald-400">
                R$ {totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Saldo a Receber</span>
              <strong className="text-xl font-bold text-amber-400">
                R$ {totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedConta ? (
        <ReceivableDetails
          conta={selectedConta}
          onBack={() => setSelectedConta(null)}
          onPaymentSuccess={() => {
            setSelectedConta(null);
            fetchContas();
          }}
        />
      ) : (
        <FinanceList contas={contas} onSelectConta={setSelectedConta} />
      )}
    </div>
  );
}
