import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroService, ContaReceberCompleta } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { FinanceList } from '../components/financeiro/FinanceList';
import { ReceivableDetails } from '../components/financeiro/ReceivableDetails';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, DollarSign } from 'lucide-react';

export default function ContasReceberPage() {
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-400" />
            Gestão de Contas a Receber
          </h2>
          <p className="text-xs text-slate-300">Títulos, Baixas, Liquidação e Conciliação</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Dashboard
        </Button>
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
