import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { BillingService, EligibleCharge } from '../services/billing.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Calendar, Clock, TrendingUp, AlertCircle, CheckCircle, XCircle, Clock6, Mail, MessageCircle, Phone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface AcoesCentraisState {
  hoje: EligibleCharge[];
  amanha: EligibleCharge[];
  proximos3Dias: EligibleCharge[];
  proximos7Dias: EligibleCharge[];
  atrasadas: EligibleCharge[];
}

const diffDays = (later: Date, earlier: Date) => {
  return Math.ceil((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
};

const getStatusPriority = (status: string) => {
  const priorities: Record<string, number> = {
    'VENCENDO_HOJE': 1,
    'ATRASADA': 2,
    'PARCIAL_PAGA': 3,
    'ABERTA': 4,
    'AGENDADA': 5,
    'RASCUNHO': 6,
    'PAGA': 7,
    'CANCELADA': 8,
    'EM_DISPUTA': 9,
    'CONCILIADA': 10,
  };
  return priorities[status] || 99;
};

export default function AcoesCentraisPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const { toast } = useToast();

  // Query todas as cobranças elegíveis
  const { data: allCharges, isLoading } = useQuery({
    queryKey: ['billing-all-charges', empresaOperadoraId],
    queryFn: async () => {
      if (!empresaOperadoraId) return [];
      const service = new BillingService();
      return await service.discoverEligibleCharges(empresaOperadoraId);
    },
    enabled: !!empresaOperadoraId,
  });

  // State for the "Próximas Cobranças" view
  const [state, setState] = useState<AcoesCentraisState>({
    hoje: [],
    amanha: [],
    proximos3Dias: [],
    proximos7Dias: [],
    atrasadas: [],
  });

  useEffect(() => {
    if (allCharges) {
      const hoje = new Date();
      const state: AcoesCentraisState = {
        hoje: [],
        amanha: [],
        proximos3Dias: [],
        proximos7Dias: [],
        atrasadas: [],
      };

      allCharges.forEach((c) => {
        const vencimento = new Date(c.data_vencimento);
        const dias = diffDays(vencimento, hoje);
        const statusPriority = getStatusPriority(c.status);

        // Ordenar por prioridade (vencendo primeiro) e depois por dias
        const key = Math.round(dias * 1000 + statusPriority);

        // Classificar para a bucket correta
        if (dias === 0) {
          state.hoje.push(c);
        } else if (dias === 1) {
          state.amanha.push(c);
        } else if (dias > 0 && dias <= 3) {
          state.proximos3Dias.push(c);
        } else if (dias > 0 && dias <= 7) {
          state.proximos7Dias.push(c);
        } else if (dias < 0) {
          state.atrasadas.push(c);
        }
      });

      // Ordenar cada bucket por prioridade (menor = mais urgente)
      const sortByPriority = (arr: EligibleCharge[]) => {
        return arr.sort((a, b) => getStatusPriority(a.status) - getStatusPriority(b.status));
      };

      setState({
        ...state,
        hoje: sortByPriority(state.hoje),
        amanha: sortByPriority(state.amanha),
        proximos3Dias: sortByPriority(state.proximos3Dias),
        proximos7Dias: sortByPriority(state.proximos7Dias),
        atrasadas: sortByPriority(state.atrasadas),
      });
    }
  }, [allCharges]);

  // Indicadores de aging
  const agingData = useMemo(() => {
    if (!allCharges) return [];

    const hoje = new Date();
    const faixas: Record<string, { count: number; total: number }> = {
      '0-7 dias': { count: 0, total: 0 },
      '8-15 dias': { count: 0, total: 0 },
      '16-30 dias': { count: 0, total: 0 },
      '31-60 dias': { count: 0, total: 0 },
      '61-90 dias': { count: 0, total: 0 },
      '90+ dias': { count: 0, total: 0 },
    };

    allCharges.forEach((c) => {
      const vencimento = new Date(c.data_vencimento);
      const dias = diffDays(hoje, vencimento); // positivo = em atraso, negativo = ainda não venceu

      if (dias >= -7 && dias <= 0) {
        faixas['0-7 dias'].count++;
        faixas['0-7 dias'].total += c.valor_original;
      } else if (dias >= -15 && dias <= -8) {
        faixas['8-15 dias'].count++;
        faixas['8-15 dias'].total += c.valor_original;
      } else if (dias >= -30 && dias <= -16) {
        faixas['16-30 dias'].count++;
        faixas['16-30 dias'].total += c.valor_original;
      } else if (dias >= -60 && dias <= -31) {
        faixas['31-60 dias'].count++;
        faixas['31-60 dias'].total += c.valor_original;
      } else if (dias >= -90 && dias <= -61) {
        faixas['61-90 dias'].count++;
        faixas['61-90 dias'].total += c.valor_original;
      } else if (dias < -90) {
        faixas['90+ dias'].count++;
        faixas['90+ dias'].total += c.valor_original;
      }
    });

    return Object.entries(faixas).map(([faixa, { count, total }]) => ({
      faixa,
      count,
      total: total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }));
  }, [allCharges]);

  const indicadores = useMemo(() => {
    if (!allCharges) {
      return {
        total: 0,
        totalValor: '0,00',
        valorPago: '0,00',
        valorVencido: '0,00',
        valorVencer: '0,00',
        taxaPagamento: '0.00',
        taxaInadimplencia: '0.00',
        aging: [] as { faixa: string; count: number; total: string }[],
      };
    }

    const hoje = new Date();
    const total = allCharges.length;
    const totalValor = allCharges.reduce((sum, c) => sum + c.valor_original, 0);
    const valorPago = allCharges
      .filter(c => c.status === 'PAGA' || c.status === 'CONCILIADA')
      .reduce((sum, c) => sum + c.valor_original, 0);
    const valorVencido = allCharges
      .filter(c => c.status === 'ATRASADA')
      .reduce((sum, c) => sum + c.valor_original, 0);
    const valorVencer = allCharges
      .filter(c => c.status !== 'PAGA' && c.status !== 'CONCILIADA' && c.status !== 'CANCELADA')
      .reduce((sum, c) => sum + c.valor_original, 0);

    const taxaPagamento = total > 0 ? (valorPago / totalValor) * 100 : 0;
    const taxaInadimplencia = total > 0 ? (valorVencido / totalValor) * 100 : 0;

    return {
      total: total,
      totalValor: totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      valorPago: valorPago.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      valorVencido: valorVencido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      valorVencer: valorVencer.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      taxaPagamento: taxaPagamento.toFixed(2),
      taxaInadimplencia: taxaInadimplencia.toFixed(2),
      aging: agingData,
    };
  }, [allCharges]);

  // Lógica de retry/idempotência demonstration
  const handleRetry = async (chargeId: string) => {
    const service = new BillingService();
    const result = await service.generateBillingEvent(
      chargeId,
      'COLECTION_OVERDUE',
      empresaOperadoraId!
    );
    if (result.success) {
      toast({
        title: 'Retry agendado',
        description: 'Nova ação de cobrança agendada na fila',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* Central de Ações - Próximas Cobranças */}
      <div className="card bg-slate-900/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm mb-6">
        <h3 className="text-font-semibold text-white mb-4">Próximas Cobranças</h3>

        {/* Hoje */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Clock6 className="h-5 w-5 text-red-400" />
              <span className="text-sm font-medium text-red-300">Hoje ({state.hoje.length})</span>
            </div>
            {state.hoje.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {state.hoje.slice(0, 3).map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                    <span>{c.numero_documento || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Amanhã */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-orange-500/20 border border-orange-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-400" />
              <span className="text-sm font-medium text-orange-300">Amanhã ({state.amanha.length})</span>
            </div>
            {state.amanha.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {state.amanha.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                    <span>{c.numero_documento || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Próximos 3 dias */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-300">Próximos 3 dias ({state.proximos3Dias.length})</span>
            </div>
            {state.proximos3Dias.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {state.proximos3Dias.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                    <span>{c.numero_documento || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Próximos 7 dias */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <span className="text-sm font-medium text-green-300">Próximos 7 dias ({state.proximos7Dias.length})</span>
            </div>
            {state.proximos7Dias.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {state.proximos7Dias.slice(0, 7).map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    <span>{c.numero_documento || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Atrasadas */}
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <span className="text-sm font-medium text-red-300">Atrasadas ({state.atrasadas.length})</span>
            </div>
            {state.atrasadas.length > 0 && (
              <ul className="mt-2 text-sm text-slate-300">
                {state.atrasadas.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                    <span>{c.numero_documento || '—'} ({diffDays(new Date(), new Date(c.data_vencimento))} dias)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Indicadores de Aging */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {indicadores.aging.map((item) => (
          <Card key={item.faixa} className="border-0">
            <CardContent className="py-2">
              <div className="flex justify-between items-start">
                <span className="text-sm text-slate-300">{item.faixa}</span>
                <span className="text-sm font-medium text-white">{item.total}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden" style={{ width: `${(item.count / (indicadores.total || 1)) * 100}%` }}>
                <div className="h-full bg-success/40 rounded-full transition-width" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{item.count} título(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Painel de Indicadores Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">{indicadores.total}</div>
            <div className="text-sm text-slate-400">Total de Cobranças</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-success">{indicadores.totalValor}</div>
            <div className="text-sm text-slate-400">Valor Total</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-error">{indicadores.valorVencido}</div>
            <div className="text-sm text-slate-400">Valor Vencido</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">{indicadores.valorVencer}</div>
            <div className="text-sm text-slate-400">Valor a Vencer</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">{indicadores.taxaPagamento}%</div>
            <div className="text-sm text-slate-400">Taxa de Pagamento</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-error">{indicadores.taxaInadimplencia}%</div>
            <div className="text-sm text-slate-400">Inadimplência</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRetry(state.atrasadas[0]?.id || '')}
              disabled={isLoading}
            >
              {isLoading ? 'Processando...' : 'Retry Ação'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}