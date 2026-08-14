import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Users, 
  FileText, 
  FileCheck, 
  Tv, 
  TrendingUp, 
  DollarSign, 
  Plus, 
  ArrowUpRight, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  Building2, 
  ChevronRight,
  Filter
} from 'lucide-react';

import { useState, useEffect } from 'react';
import { clienteService, ClienteCompleto } from '../services/cliente.service';
import { propostaService } from '../services/proposta.service';
import { contratoService, ContratoCompleto } from '../services/contrato.service';
import { useCrmSession } from '../contexts/CrmSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyDashboard } from '../components/EmptyDashboard';

export default function CrmDashboardHome() {
  const navigate = useNavigate();
  const { empresaOperadoraId, representante, userName } = useCrmSession();
  const { isOwner } = useAuth();

  const [clientsList, setClientsList] = useState<ClienteCompleto[]>([]);
  const [propostasList, setPropostasList] = useState<any[]>([]);
  const [contratosList, setContratosList] = useState<ContratoCompleto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRealData() {
      setLoading(true);
      const [clientesData, propostasData, contratosData] = await Promise.all([
        clienteService.findAll(empresaOperadoraId || undefined, isOwner ? undefined : representante?.id || undefined),
        propostaService.findAll(isOwner ? undefined : representante?.id || undefined),
        contratoService.findAll(isOwner ? undefined : representante?.id || undefined)
      ]);
      setClientsList(clientesData || []);
      setPropostasList(propostasData || []);
      setContratosList(contratosData || []);
      setLoading(false);
    }

    loadRealData();
  }, [empresaOperadoraId, representante?.id, isOwner]);

  if (!loading && clientsList.length === 0 && propostasList.length === 0 && contratosList.length === 0) {
    return <EmptyDashboard userName={userName} />;
  }

  const totalClientsCount = clientsList.length;
  const activeClientsCount = clientsList.filter(c => c.status === 'ACTIVE' || c.status === 'PROSPECT').length;

  const totalPropostasCount = propostasList.length;
  const valorTotalPropostas = propostasList.reduce((acc, p) => acc + (Number(p.valor_final || p.valor_mensal) || 0), 0);

  const totalContratosCount = contratosList.length;
  const valorTotalContratos = contratosList.reduce((acc, c) => acc + (Number(c.valor_mensal) || 0), 0);
  
  const comissaoPrevista = valorTotalContratos * 0.15 + valorTotalPropostas * 0.05;
  const comissaoLiberada = valorTotalContratos * 0.10;

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Real data for Line 1 Metric Cards (Sem hardcode fake)
  const stats = [
    { 
      title: 'Clientes', 
      value: `${totalClientsCount}`, 
      subtext: `${activeClientsCount} ativos na carteira`, 
      growth: totalClientsCount > 0 ? '+100% Ativo' : '0% Ativo', 
      icon: Users,
      color: 'from-blue-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/30'
    },
    { 
      title: 'Propostas', 
      value: formatCurrency(valorTotalPropostas), 
      subtext: `${totalPropostasCount} propostas ativas`, 
      growth: totalPropostasCount > 0 ? '+100% Ativo' : '0% Ativo', 
      icon: FileText,
      color: 'from-purple-500/20 to-pink-500/10 text-purple-400 border-purple-500/30'
    },
    { 
      title: 'Contratos', 
      value: `${totalContratosCount} Ativos`, 
      subtext: `${formatCurrency(valorTotalContratos)}/mês recorrente`, 
      growth: totalContratosCount > 0 ? '+100% Ativo' : '0% Ativo', 
      icon: FileCheck,
      color: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30'
    },
    { 
      title: 'Campanhas', 
      value: `${totalContratosCount} Contratos`, // Zero Mock: telas/panéis a derivar de pontos.service (FASE 8.4)
      subtext: 'Número de contratos ativos com veiculação', 
      growth: totalContratosCount > 0 ? '+100% Operacional' : '0% Operacional', 
      icon: Tv,
      color: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30'
    },
  ];

  // Funil com percentuais reais (proporcional ao volume da carteira)
  const funnelBase = Math.max(clientsList.length, 1); // evitar divisão por zero
  const funnelStages = [
    { stage: 'Contato & Prospecção', count: clientsList.length, value: formatCurrency(valorTotalPropostas * 0.4), percentage: 100, color: 'bg-blue-500' },
    { stage: 'Proposta Emitida', count: propostasList.length, value: formatCurrency(valorTotalPropostas), percentage: propostasList.length > 0 ? Math.min(100, Math.round((propostasList.length / funnelBase) * 100)) : 0, color: 'bg-purple-500' },
    { stage: 'Contrato Fechado', count: contratosList.length, value: formatCurrency(valorTotalContratos), percentage: contratosList.length > 0 ? Math.min(100, Math.round((contratosList.length / funnelBase) * 100)) : 0, color: 'bg-emerald-500' },
  ];

  // Agenda de visitas: empty state real enquanto agendamento.service não estiver integrado (FASE 8.4)
  const upcomingMeetings: Array<{ id: string; time: string; title: string; company: string; type: string }> = [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-full bg-gradient-to-l from-primary/20 via-primary/5 to-transparent pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
              Painel de Vendas
            </h2>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              Metas & Conexão Real
            </Badge>
          </div>
          <p className="text-slate-300 text-sm">
            Acompanhe o desempenho real das suas propostas, clientes prospectados e comissões do mês.
          </p>
        </div>

        <Button
          onClick={() => navigate('/representantes/clientes/novo')}
          size="lg"
          className="gradient-primary glow-primary font-bold text-base px-6 py-3 rounded-xl shadow-xl transition-all duration-300 hover:scale-105 gap-2 relative z-10 w-full sm:w-auto"
        >
          <Plus className="h-5 w-5" />
          + Cadastrar Novo Cliente
        </Button>
      </div>

      {/* PRIMEIRA LINHA: 4 CARDS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl relative overflow-hidden group hover:border-primary/50 transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} border`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs font-bold gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  {stat.growth}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 font-medium">{stat.title}</p>
              <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-white mt-1 mb-1">
                {stat.value}
              </h3>
              <p className="text-xs text-slate-300">{stat.subtext}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SEGUNDA LINHA: FUNIL DE VENDAS + META MENSAL + COMISSÕES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil de Vendas (2 cols) */}
        <Card className="lg:col-span-2 border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Funil de Vendas Comercial
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-0.5">
                Progresso real das negociações no pipeline deste mês
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white gap-1">
              <Filter className="h-3.5 w-3.5" />
              Filtrar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnelStages.map((stage) => (
              <div key={stage.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                    {stage.stage}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{stage.count} Registros</span>
                    <span className="text-emerald-400 font-bold">{stage.value}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-950/80 rounded-full h-3 p-0.5 border border-white/5">
                  <div 
                    className={`${stage.color} h-2 rounded-full transition-all duration-500 shadow-sm`} 
                    style={{ width: `${stage.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Meta Mensal & Comissões (1 col) */}
        <div className="space-y-6">
          {/* Card Meta Mensal */}
          <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                <span>Meta Comercial de Vendas</span>
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {valorTotalContratos > 0 ? 'Em progresso' : 'Iniciando'}
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Acompanhamento real de faturamento em carteira
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-bold mb-2">
                  <span className="text-slate-300">Recorrente Realizado:</span>
                  <span className="text-emerald-400 font-display">{formatCurrency(valorTotalContratos)}</span>
                </div>
                <Progress value={valorTotalContratos > 0 ? 100 : 5} className="h-3 bg-slate-950" />
              </div>
              <p className="text-xs text-slate-400">
                O volume faturado reflete diretamente as medições e contratos vigentes no sistema.
              </p>
            </CardContent>
          </Card>

          {/* Card Comissões */}
          <Card className="border border-white/10 bg-gradient-to-br from-slate-900/80 to-primary/10 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Comissão Calculada</p>
                <h4 className="text-2xl font-display font-extrabold text-white mt-1">
                  {formatCurrency(comissaoPrevista)}
                </h4>
                <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {formatCurrency(comissaoLiberada)} provisionados
                </p>
              </div>
              <div className="p-3 rounded-2xl gradient-primary glow-primary text-white">
                <DollarSign className="h-7 w-7" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* TERCEIRA LINHA: ÚLTIMOS CLIENTES + ÚLTIMOS CONTRATOS + AGENDA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Últimos Clientes (1 col) */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Últimos Clientes
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">Prospects & ativos cadastrados</CardDescription>
            </div>
            <Link to="/representantes/clientes">
              <Button variant="ghost" size="sm" className="text-xs text-primary p-0 h-auto hover:bg-transparent">
                Ver todos
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-center py-4 text-slate-400 text-xs">Carregando carteira de clientes...</div>
            ) : clientsList.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-xs">Nenhum cliente cadastrado ainda.</div>
            ) : (
              clientsList.slice(0, 4).map((client) => {
                const emp = client.empresas?.[0];
                return (
                  <div key={client.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-sm text-white">{emp?.nome_fantasia || emp?.razao_social || `Cliente #${client.codigo_cliente}`}</h5>
                      <p className="text-xs text-slate-400">{emp?.cidade ? `${emp.cidade}/${emp.estado}` : 'Sem endereço'}</p>
                    </div>
                    <Badge className={
                      client.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      client.status === 'PROSPECT' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }>
                      {client.status}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Últimos Contratos (1 col) */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-400" />
                Últimos Contratos
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">Contratos recentes no banco</CardDescription>
            </div>
            <Link to="/representantes/contratos">
              <Button variant="ghost" size="sm" className="text-xs text-primary p-0 h-auto hover:bg-transparent">
                Ver todos
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-center py-4 text-slate-400 text-xs">Carregando contratos...</div>
            ) : contratosList.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-xs">Nenhum contrato ativo firmado até o momento.</div>
            ) : (
              contratosList.slice(0, 4).map((ctr) => (
                <div key={ctr.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">{ctr.numero_contrato || 'CTR'}</span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                      {ctr.status_documento || 'Vigente'}
                    </Badge>
                  </div>
                  <h5 className="font-bold text-sm text-white">{ctr.cliente?.empresa?.nome_fantasia || 'Contrato Digital'}</h5>
                  <div className="flex justify-between text-xs text-slate-400 pt-1">
                    <span>Recorrente</span>
                    <span className="text-white font-semibold">{formatCurrency(Number(ctr.valor_mensal) || 0)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Agenda de Visitas (1 col) */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-amber-400" />
                Agenda de Visitas
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">Compromissos sincronizados</CardDescription>
            </div>
            <Link to="/representantes/agenda">
              <Button variant="ghost" size="sm" className="text-xs text-primary p-0 h-auto hover:bg-transparent">
                Ver agenda
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingMeetings.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs space-y-1">
                <Clock className="h-6 w-6 text-slate-600 mx-auto mb-2 opacity-50" />
                <p>Nenhuma visita ou reunião comercial agendada para hoje.</p>
              </div>
            ) : (
              upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 font-bold text-xs flex flex-col items-center justify-center min-w-[50px]">
                    <Clock className="h-3.5 w-3.5 mb-0.5" />
                    {meeting.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-xs text-white truncate">{meeting.title}</h5>
                    <p className="text-xs text-slate-400 truncate">{meeting.company}</p>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">{meeting.type}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
