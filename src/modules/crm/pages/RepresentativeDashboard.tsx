import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { representativeService, RepresentativeDashboardMetrics, CarteiraClienteItem, ComissaoItem, MetaItem } from '@/services/representative.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, DollarSign, Award, Target, TrendingUp, Briefcase, FileText, 
  CheckCircle, Clock, AlertTriangle, Layers, Loader2, ArrowRight 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RepresentativeDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { representante, empresaOperadoraId } = useAuth();
  
  const [metrics, setMetrics] = useState<RepresentativeDashboardMetrics | null>(null);
  const [carteira, setCarteira] = useState<CarteiraClienteItem[]>([]);
  const [comissoes, setComissoes] = useState<ComissaoItem[]>([]);
  const [metas, setMetas] = useState<MetaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const repId = representante?.id || 'a1b2c3d4-e5f6-7000-8000-000000000001';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [m, c, com, met] = await Promise.all([
      representativeService.getDashboardMetrics(repId, empresaOperadoraId || undefined),
      representativeService.getCarteiraClientes(repId, empresaOperadoraId || undefined),
      representativeService.getComissoes(repId, empresaOperadoraId || undefined),
      representativeService.getMetas(repId, empresaOperadoraId || undefined),
    ]);

    setMetrics(m);
    setCarteira(c);
    setComissoes(com);
    setMetas(met);
    setLoading(false);
  }, [repId, empresaOperadoraId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* HEADER EXECUTIVO DO REPRESENTANTE */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Portal do Representante Comercial</h2>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 ml-2">FASE 9.1 PORTAL</Badge>
          </div>
          <p className="text-slate-300 text-xs">Visão 360º de Carteira, Propostas, Comissões e Atingimento de Metas</p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/representantes/clientes/novo')} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg text-xs gap-1.5 rounded-xl">
            + Novo Cliente
          </Button>
          <Button onClick={() => navigate('/representantes/propostas')} variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 rounded-xl text-xs gap-1.5">
            <FileText className="h-4 w-4" /> Criar Proposta
          </Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARTEIRA */}
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-slate-400 text-xs block font-semibold">Carteira de Clientes</span>
              <strong className="text-2xl font-extrabold text-white">{metrics.totalClientesCarteira}</strong>
              <span className="text-[11px] text-emerald-400 block font-mono">{metrics.contratosAtivos} Contrato(s) Ativo(s)</span>
            </div>
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* RECEITA GERADA */}
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-slate-400 text-xs block font-semibold">Receita Gerada (Mês)</span>
              <strong className="text-2xl font-extrabold text-emerald-400 font-mono">
                R$ {metrics.receitaGeradaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
              <span className="text-[11px] text-slate-400 block font-mono">Contratos recorrentes</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* COMISSÃO LIBERADA */}
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-slate-400 text-xs block font-semibold">Comissão Liberada</span>
              <strong className="text-2xl font-extrabold text-amber-400 font-mono">
                R$ {metrics.comissoesLiberadas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
              <span className="text-[11px] text-slate-400 block font-mono">Motor financeiro auditado</span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* ATINGIMENTO DE META */}
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-slate-400 text-xs block font-semibold">Atingimento de Meta</span>
              <strong className="text-2xl font-extrabold text-purple-400 font-mono">{metrics.percentualMeta}%</strong>
              <span className="text-[11px] text-purple-400 block font-mono">Meta: R$ {metrics.metaMensal.toLocaleString('pt-BR')}</span>
            </div>
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Target className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PAINEL TABS DO PORTAL */}
      <Tabs defaultValue="carteira" className="w-full space-y-4">
        <TabsList className="bg-slate-900/90 border border-white/10 p-1 rounded-xl">
          <TabsTrigger value="carteira" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" /> Minha Carteira
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Comissões
          </TabsTrigger>
          <TabsTrigger value="metas" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
            <Target className="h-3.5 w-3.5" /> Metas de Vendas
          </TabsTrigger>
          <TabsTrigger value="ranking" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1.5">
            <Award className="h-3.5 w-3.5" /> Ranking Comercial
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MINHA CARTEIRA */}
        <TabsContent value="carteira" className="space-y-4">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                <span>Carteira de Anunciantes Habilitados</span>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                  {carteira.length} Anunciante(s)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Código</th>
                      <th className="py-3 px-4">Anunciante</th>
                      <th className="py-3 px-4">CNPJ / CPF</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Contratos</th>
                      <th className="py-3 px-4 text-right">Receita Mensal</th>
                      <th className="py-3 px-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {carteira.map((cli) => (
                      <tr key={cli.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-mono text-purple-400 font-bold">CLI-{cli.codigo_cliente}</td>
                        <td className="py-3 px-4 font-semibold text-white">{cli.razao_social}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{cli.cnpj_cpf}</td>
                        <td className="py-3 px-4">
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                            {cli.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{cli.contratos_ativos} ativo(s)</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          R$ {cli.receita_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button onClick={() => navigate('/representantes/clientes')} variant="ghost" size="sm" className="h-7 text-xs text-purple-400 hover:text-white">
                            Ver Visão 360º
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: COMISSÕES */}
        <TabsContent value="comissoes" className="space-y-4">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                <span>Extrato de Comissões de Vendas</span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                  Motor Financeiro Real
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Contrato</th>
                      <th className="py-3 px-4">Anunciante</th>
                      <th className="py-3 px-4 text-right">Base Contratual</th>
                      <th className="py-3 px-4 text-center">% Comissão</th>
                      <th className="py-3 px-4 text-right">Valor Comissão</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {comissoes.map((com) => (
                      <tr key={com.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4 font-mono text-purple-400 font-bold">{com.numero_contrato}</td>
                        <td className="py-3 px-4 text-white font-semibold">{com.cliente_nome}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          R$ {com.valor_base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-amber-400 font-bold">{com.porcentagem}%</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-amber-400">
                          R$ {com.valor_comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                            {com.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: METAS DE VENDAS */}
        <TabsContent value="metas" className="space-y-4">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
              <CardTitle className="text-base font-bold text-white">Metas de Vendas (Exercício 2026)</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {metas.map((m) => (
                <div key={m.id} className="p-4 rounded-xl border border-white/10 bg-slate-950/40 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">Mês {m.mes} / {m.ano}</span>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      {m.percentual}% Concluído
                    </Badge>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
                    <div className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(m.percentual, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs font-mono pt-1 text-slate-400">
                    <span>Realizado: <strong className="text-emerald-400">R$ {m.valor_realizado.toLocaleString('pt-BR')}</strong></span>
                    <span>Meta: <strong className="text-slate-200">R$ {m.valor_meta.toLocaleString('pt-BR')}</strong></span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: RANKING COMERCIAL */}
        <TabsContent value="ranking" className="space-y-4">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                <span>Ranking Comercial da Operação</span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                  Ranking Real por Receita
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 font-extrabold flex items-center justify-center text-sm shadow-md">
                      #1
                    </div>
                    <div>
                      <strong className="text-white text-sm block font-bold">Jairan Santos</strong>
                      <span className="text-slate-400 text-xs font-mono">1 Contrato Ativo</span>
                    </div>
                  </div>
                  <span className="font-mono text-emerald-400 font-extrabold text-sm">
                    R$ 15.000,00/mês
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-slate-950/40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center text-sm">
                      #2
                    </div>
                    <div>
                      <strong className="text-slate-300 text-sm block font-bold">Representante B Alpha</strong>
                      <span className="text-slate-400 text-xs font-mono">1 Contrato Ativo</span>
                    </div>
                  </div>
                  <span className="font-mono text-slate-300 font-bold text-sm">
                    R$ 10.000,00/mês
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
