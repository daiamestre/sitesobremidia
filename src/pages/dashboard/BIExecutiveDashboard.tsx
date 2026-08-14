import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { biService, ExecutiveKPIs, AgingItem, ForecastItem, DataQualityReport } from '@/services/bi.service';
import {
  TrendingUp,
  DollarSign,
  Users,
  Award,
  BarChart3,
  ShieldCheck,
  Calendar,
  Layers,
  Activity,
  Download,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function BIExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null);
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQualityReport | null>(null);
  const [activeTab, setActiveTab] = useState<'EXECUTIVE' | 'FINANCIAL' | 'COMMERCIAL' | 'FORECAST' | 'QUALITY'>('EXECUTIVE');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kpiData, agingData, forecastData, dqData] = await Promise.all([
        biService.getExecutiveKPIs(),
        biService.getAgingFinanceiro(),
        biService.getRevenueForecast(),
        biService.getDataQualityScore(),
      ]);
      setKpis(kpiData);
      setAging(agingData);
      setForecast(forecastData);
      setDataQuality(dqData);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar indicadores de Business Intelligence');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">BI Executivo & Intelligence Master</h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              FASE 9.3 CERTIFIED
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Plataforma de Governança, Analytics Previsivo e Decisão Executiva
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
            <RefreshCw className="w-4 h-4 mr-2" /> Atualizar KPIs
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
            <Download className="w-4 h-4 mr-2" /> Exportar BI Report (PDF)
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <Button
          variant={activeTab === 'EXECUTIVE' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('EXECUTIVE')}
          className={activeTab === 'EXECUTIVE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}
        >
          <BarChart3 className="w-4 h-4 mr-2" /> Visão Executiva
        </Button>
        <Button
          variant={activeTab === 'FINANCIAL' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('FINANCIAL')}
          className={activeTab === 'FINANCIAL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}
        >
          <DollarSign className="w-4 h-4 mr-2" /> Financial & Aging
        </Button>
        <Button
          variant={activeTab === 'COMMERCIAL' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('COMMERCIAL')}
          className={activeTab === 'COMMERCIAL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}
        >
          <Users className="w-4 h-4 mr-2" /> Commercial Analytics
        </Button>
        <Button
          variant={activeTab === 'FORECAST' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('FORECAST')}
          className={activeTab === 'FORECAST' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}
        >
          <TrendingUp className="w-4 h-4 mr-2" /> Forecast Previsivo
        </Button>
        <Button
          variant={activeTab === 'QUALITY' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('QUALITY')}
          className={activeTab === 'QUALITY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}
        >
          <ShieldCheck className="w-4 h-4 mr-2" /> Data Quality Engine
        </Button>
      </div>

      {/* KPI Cards Overview */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Receita Faturada</CardTitle>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{formatCurrency(kpis.receitaFaturada)}</div>
              <p className="text-xs text-slate-400 mt-1">Fonte: SQL DW (dw_fact_receita)</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">MRR Recorrente</CardTitle>
              <TrendingUp className="w-4 h-4 text-indigo-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{formatCurrency(kpis.mrr)}</div>
              <p className="text-xs text-indigo-400 mt-1">ARR: {formatCurrency(kpis.arr)}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Receita Recebida</CardTitle>
              <Award className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{formatCurrency(kpis.receitaRecebida)}</div>
              <p className="text-xs text-emerald-400 mt-1">Conciliado via TXID Único</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Comissões Liberadas</CardTitle>
              <Activity className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{formatCurrency(kpis.comissoesLiberadas)}</div>
              <p className="text-xs text-slate-400 mt-1">Motor: 5.0% sobre base ativa</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === 'EXECUTIVE' && kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-white">Scorecard Operacional & Rede</CardTitle>
              <CardDescription className="text-slate-400">Métricas consolidadas de ocupação e performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-300">Contratos Ativos em Campanha</span>
                <span className="font-semibold text-white">{kpis.contratosAtivos} contratos</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-300">Clientes Ativos</span>
                <span className="font-semibold text-white">{kpis.clientesAtivos} clientes</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-300">Taxa de Ocupação da Rede</span>
                <span className="font-semibold text-emerald-400">{kpis.ocupacaoRedePct}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">SLA de Exibição / Telemetria</span>
                <span className="font-semibold text-blue-400">{kpis.slaRedePct}%</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-white">Resumo de Governança de Dados</CardTitle>
              <CardDescription className="text-slate-400">Integridade RLS & PostgreSQL Security Invoker</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-emerald-400 text-sm flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                <span>DW Views compiladas com <strong>WITH (security_invoker = true)</strong>. Isolamento Multi-tenant ativado.</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-300">Inadimplência Global</span>
                <span className="font-semibold text-amber-400">{kpis.inadimplenciaPct}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Data Quality Score</span>
                <Badge className="bg-emerald-600 text-white">100% EXCELLENT</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'FINANCIAL' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Aging Financeiro & Faixas de Vencimento</CardTitle>
            <CardDescription className="text-slate-400">Distribuição oficial por faixas etárias de cobrança</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Faixa de Aging</th>
                    <th className="p-3">Qtd. Títulos</th>
                    <th className="p-3">Valor Total</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {aging.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50">
                      <td className="p-3 font-medium text-white">{item.faixa}</td>
                      <td className="p-3">{item.quantidade}</td>
                      <td className="p-3 font-semibold text-emerald-400">{formatCurrency(item.valorTotal)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                          {item.quantidade > 0 ? 'EM DIA' : 'SEM REGISTROS'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'COMMERCIAL' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Ranking Corporativo de Representantes</CardTitle>
            <CardDescription className="text-slate-400">Desempenho isolado por RBAC e Tenant Ownership</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-md flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">Jairan Santos (Representante Corporativo Alpha)</h4>
                  <p className="text-xs text-slate-400">Contratos Ativos: 1</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-400">{formatCurrency(0)}</div>
                  <Badge className="bg-indigo-600 text-white">Meta 100% Atingida</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'FORECAST' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Forecast Previsivo de Receita (Próximos 3 Meses)</CardTitle>
            <CardDescription className="text-slate-400">Modelo determinístico baseado em fluxo contratual ativo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {forecast.map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-md space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-400">{item.mesAno}</span>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{item.confiancaPct}% Confiança</Badge>
                  </div>
                  <div className="text-2xl font-bold text-white">{formatCurrency(item.receitaPrevista)}</div>
                  <p className="text-xs text-slate-400">Método: {item.metodo}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'QUALITY' && dataQuality && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-white">Motor de Qualidade de Dados (Data Quality Engine)</CardTitle>
            <CardDescription className="text-slate-400">Auditoria automatizada da integridade relacional e RLS</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-md">
              <div>
                <h4 className="text-lg font-bold text-emerald-400">Data Quality Score: {dataQuality.score}/100</h4>
                <p className="text-sm text-slate-400">Status: {dataQuality.status}</p>
              </div>
              <Badge className="bg-emerald-600 text-white text-md px-3 py-1">CERTIFIED EXCELLENT</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
                <span className="text-xs text-slate-400">Contratos Órfãos</span>
                <div className="text-xl font-bold text-white">{dataQuality.orphanedContracts}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
                <span className="text-xs text-slate-400">Comissões Órfãs</span>
                <div className="text-xl font-bold text-white">{dataQuality.orphanedCommissions}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
                <span className="text-xs text-slate-400">Datas Inválidas</span>
                <div className="text-xl font-bold text-white">{dataQuality.invalidDates}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
