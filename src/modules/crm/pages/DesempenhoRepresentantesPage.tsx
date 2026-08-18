import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { usePermissoesRepresentantes } from '@/hooks/usePermissoesRepresentantes';
import {
  representantesGerenciaService,
  DesempenhoRepresentante,
  DesempenhoDetalhe,
} from '@/services/representantesGerencia.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  Users,
  UserPlus,
  FileText,
  CheckCircle2,
  FileCheck,
  DollarSign,
  Award,
  ShieldAlert,
  Loader2,
  TrendingUp,
  Target,
  Percent,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

type Ordenacao = 'receita' | 'clientes' | 'contratos' | 'conversao' | 'propostas' | 'meta';

const PERIODOS: Record<string, { label: string; inicio?: string; fim?: string }> = {
  todos: { label: 'Todos' },
  '30d': { label: 'Últimos 30 dias', inicio: undefined },
  '90d': { label: 'Últimos 90 dias', inicio: undefined },
  mesAtual: { label: 'Mês atual', inicio: undefined },
};

function periodoLabel(chave: string): string {
  return PERIODOS[chave]?.label ?? chave;
}

function calcularPeriodo(chave: string): { inicio?: string; fim?: string } {
  const hoje = new Date();
  if (chave === '30d') {
    const ini = new Date(hoje);
    ini.setDate(ini.getDate() - 30);
    return { inicio: ini.toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
  }
  if (chave === '90d') {
    const ini = new Date(hoje);
    ini.setDate(ini.getDate() - 90);
    return { inicio: ini.toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
  }
  if (chave === 'mesAtual') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { inicio: ini.toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
  }
  return {};
}

function ordenar(lista: DesempenhoRepresentante[], chave: Ordenacao): DesempenhoRepresentante[] {
  const get = (r: DesempenhoRepresentante): number => {
    switch (chave) {
      case 'receita':
        return r.receita_mensal;
      case 'clientes':
        return r.total_clientes;
      case 'contratos':
        return r.contratos_ativos;
      case 'conversao':
        return r.propostas_criadas > 0 ? (r.propostas_aprovadas / r.propostas_criadas) * 100 : 0;
      case 'propostas':
        return r.propostas_criadas;
      case 'meta':
        return r.meta_mensal > 0 ? (r.meta_realizado / r.meta_mensal) * 100 : 0;
      default:
        return r.receita_mensal;
    }
  };
  return [...lista].sort((a, b) => get(b) - get(a));
}

export default function DesempenhoRepresentantesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissoes = usePermissoesRepresentantes();

  const [dados, setDados] = useState<DesempenhoRepresentante[]>([]);
  const [periodo, setPeriodo] = useState('30d');
  const [representanteFiltro, setRepresentanteFiltro] = useState('todos');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('receita');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [detalhe, setDetalhe] = useState<DesempenhoDetalhe | null>(null);
  const [detalheCarregando, setDetalheCarregando] = useState(false);
  const [detalheRepId, setDetalheRepId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const periodoCalc = calcularPeriodo(periodo);
      const lista = await representantesGerenciaService.obterDesempenho({
        periodoInicio: periodoCalc.inicio,
        periodoFim: periodoCalc.fim,
        representanteId: representanteFiltro === 'todos' ? undefined : representanteFiltro,
        ordenar: ordenacao,
      });
      setDados(lista);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar desempenho.';
      if (/permiss|Acesso Negado|42501/i.test(msg)) {
        setErro('Você não possui permissão para visualizar o desempenho dos representantes.');
      } else {
        setErro(`Erro ao carregar desempenho: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [periodo, representanteFiltro, ordenacao]);

  useEffect(() => {
    if (permissoes.carregado && permissoes.podeVerDesempenho) {
      carregar();
    } else if (permissoes.carregado) {
      setLoading(false);
      setErro('Você não possui permissão para visualizar o desempenho dos representantes.');
    }
  }, [permissoes.carregado, permissoes.podeVerDesempenho, carregar]);

  const abrirDetalhe = async (repId: string) => {
    setDetalheRepId(repId);
    setDetalheCarregando(true);
    setDetalhe(null);
    try {
      const periodoCalc = calcularPeriodo(periodo);
      const d = await representantesGerenciaService.obterDesempenhoDetalhe(
        repId,
        periodoCalc.inicio,
        periodoCalc.fim,
      );
      setDetalhe(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar detalhe.';
      toast({ title: 'Erro ao carregar desempenho individual', description: msg, variant: 'destructive' });
    } finally {
      setDetalheCarregando(false);
    }
  };

  const ordenados = ordenar(dados, ordenacao);

  // KPIs agregados (média/agregação sobre representantes)
  const totais = dados.reduce(
    (acc, r) => ({
      clientes: acc.clientes + r.total_clientes,
      novos: acc.novos + r.clientes_novos,
      ativos: acc.ativos + r.clientes_ativos,
      propostas: acc.propostas + r.propostas_criadas,
      aprovadas: acc.aprovadas + r.propostas_aprovadas,
      contratos: acc.contratos + r.contratos_ativos,
      receita: acc.receita + r.receita_mensal,
    }),
    { clientes: 0, novos: 0, ativos: 0, propostas: 0, aprovadas: 0, contratos: 0, receita: 0 },
  );
  const conversao = totais.propostas > 0 ? (totais.aprovadas / totais.propostas) * 100 : 0;
  const ticketMedio = totais.contratos > 0 ? totais.receita / totais.contratos : 0;

  const dadosGrafico = ordenados.slice(0, 8).map((r) => ({
    nome: r.nome.length > 18 ? `${r.nome.slice(0, 18)}...` : r.nome,
    receita: Number(r.receita_mensal.toFixed(0)),
  }));

  const semPermissao = permissoes.carregado && !permissoes.podeVerDesempenho;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* HEADER */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Desempenho dos Representantes
            </h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">DADOS REAIS</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Indicadores calculados sobre clientes, propostas, contratos e metas oficiais do ERP.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/workspace/representantes')}
            className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
          >
            Voltar à lista <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          </Button>
        </div>
      </div>

      {/* PERMISSÃO */}
      {semPermissao && (
        <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <ShieldAlert className="h-10 w-10 text-red-400" />
            <p className="text-red-300 font-semibold">
              Você não possui permissão para visualizar o desempenho dos representantes.
            </p>
            <p className="text-slate-400 text-xs">
              Solicite a permissão <code className="font-mono">representantes.view_performance</code> ao OWNER.
            </p>
          </CardContent>
        </Card>
      )}

      {!semPermissao && !permissoes.carregado && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!semPermissao && permissoes.carregado && (
        <>
          {/* FILTROS */}
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-full sm:w-44">
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-sm">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white">
                    <SelectItem value="todos">Todos os períodos</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="mesAtual">Mês atual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-52">
                <Select value={representanteFiltro} onValueChange={setRepresentanteFiltro}>
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-sm">
                    <SelectValue placeholder="Representante" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white max-h-72 overflow-y-auto">
                    <SelectItem value="todos">Todos os representantes</SelectItem>
                    {dados.map((r) => (
                      <SelectItem key={r.representante_id} value={r.representante_id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-10 text-sm">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-white/10 text-white">
                    <SelectItem value="receita">Ranking por Receita</SelectItem>
                    <SelectItem value="clientes">Ranking por Clientes</SelectItem>
                    <SelectItem value="contratos">Ranking por Contratos</SelectItem>
                    <SelectItem value="conversao">Ranking por Conversão</SelectItem>
                    <SelectItem value="propostas">Ranking por Propostas</SelectItem>
                    <SelectItem value="meta">Ranking por Meta (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={carregar}
                className="border-white/10 text-slate-300 rounded-xl h-10 text-xs"
              >
                Aplicar
              </Button>
            </CardContent>
          </Card>

          {/* ERRO */}
          {erro && !loading && (
            <Card className="border border-red-500/30 bg-red-500/5 rounded-2xl">
              <CardContent className="p-6 flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">{erro}</p>
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="flex items-center justify-center min-h-[40vh]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && !erro && (
            <>
              {/* KPIs AGREGADOS */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard
                  icon={<Users className="h-5 w-5" />}
                  label="Clientes"
                  valor={String(totais.clientes)}
                  sub={`${totais.ativos} ativos`}
                  cor="text-blue-400 bg-blue-500/20 border-blue-500/30"
                />
                <KpiCard
                  icon={<UserPlus className="h-5 w-5" />}
                  label="Novos clientes"
                  valor={String(totais.novos)}
                  sub={periodoLabel(periodo)}
                  cor="text-cyan-400 bg-cyan-500/20 border-cyan-500/30"
                />
                <KpiCard
                  icon={<FileText className="h-5 w-5" />}
                  label="Propostas"
                  valor={String(totais.propostas)}
                  sub={`${totais.aprovadas} aprovadas`}
                  cor="text-amber-400 bg-amber-500/20 border-amber-500/30"
                />
                <KpiCard
                  icon={<Percent className="h-5 w-5" />}
                  label="Conversão"
                  valor={`${conversao.toFixed(1)}%`}
                  sub="aprovadas / criadas"
                  cor="text-purple-400 bg-purple-500/20 border-purple-500/30"
                />
                <KpiCard
                  icon={<FileCheck className="h-5 w-5" />}
                  label="Contratos"
                  valor={String(totais.contratos)}
                  sub="ativos"
                  cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30"
                />
                <KpiCard
                  icon={<DollarSign className="h-5 w-5" />}
                  label="Receita mensal"
                  valor={formatCurrency(totais.receita)}
                  sub={`Ticket médio ${formatCurrency(ticketMedio)}`}
                  cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30"
                />
              </div>

              {/* RANKING + GRÁFICO */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* RANKING */}
                <Card className="lg:col-span-3 border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-amber-400" /> Ranking ({periodoLabel(periodo)})
                      </span>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                        Ordenado por {ordenacao}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 p-0">
                    {ordenados.length === 0 ? (
                      <div className="p-10 text-center">
                        <Award className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm">Nenhum representante com dados no período.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {ordenados.map((r, idx) => {
                          const pctMeta =
                            r.meta_mensal > 0
                              ? Number(((r.meta_realizado / r.meta_mensal) * 100).toFixed(0))
                              : null;
                          const conversaoRep =
                            r.propostas_criadas > 0
                              ? ((r.propostas_aprovadas / r.propostas_criadas) * 100).toFixed(1)
                              : '0.0';
                          return (
                            <button
                              key={r.representante_id}
                              onClick={() => abrirDetalhe(r.representante_id)}
                              className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${
                                    idx === 0
                                      ? 'bg-amber-400 text-slate-950 shadow-md'
                                      : idx === 1
                                        ? 'bg-slate-300 text-slate-900'
                                        : idx === 2
                                          ? 'bg-orange-700 text-white'
                                          : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  #{idx + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{r.nome}</p>
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    {r.total_clientes} clientes · {r.propostas_criadas} propostas ·{' '}
                                    {conversaoRep}% conversão
                                    {pctMeta !== null && ` · ${pctMeta}% meta`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-mono font-extrabold text-emerald-400 text-sm">
                                  {formatCurrency(r.receita_mensal)}
                                </p>
                                <p className="text-[10px] text-slate-500">/mês</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* GRÁFICO RECEITA TOP 8 */}
                <Card className="lg:col-span-2 border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-base font-bold text-white">
                      Receita mensal por representante
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {dadosGrafico.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        Sem dados para exibir no período.
                      </div>
                    ) : (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis
                              dataKey="nome"
                              stroke="#64748b"
                              tick={{ fontSize: 10 }}
                              angle={-35}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                            <Tooltip
                              formatter={(value: number | string) => formatCurrency(Number(value))}
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                            />
                            <Bar dataKey="receita" fill="#10b981" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {/* DRILL-DOWN: DESEMPENHO INDIVIDUAL */}
      <Dialog open={!!detalheRepId} onOpenChange={(o) => !o && setDetalheRepId(null)}>
        <DialogContent className="bg-slate-950 border-white/10 text-white sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-400" />
              Desempenho individual — {detalhe?.representante.nome ?? 'Carregando...'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Período: {periodoLabel(periodo)}. Dados reais do ERP — clique em um cliente, proposta ou contrato para
              abrir o registro oficial.
            </DialogDescription>
          </DialogHeader>

          {detalheCarregando && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!detalheCarregando && detalhe && (
            <div className="space-y-5">
              {/* RESUMO */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  icon={<Users className="h-4 w-4" />}
                  label="Clientes"
                  valor={String(detalhe.resumo.total_clientes)}
                  sub={`${detalhe.resumo.clientes_ativos} ativos`}
                  cor="text-blue-400 bg-blue-500/20 border-blue-500/30"
                  compact
                />
                <KpiCard
                  icon={<UserPlus className="h-4 w-4" />}
                  label="Novos"
                  valor={String(detalhe.resumo.clientes_novos)}
                  sub="no período"
                  cor="text-cyan-400 bg-cyan-500/20 border-cyan-500/30"
                  compact
                />
                <KpiCard
                  icon={<FileText className="h-4 w-4" />}
                  label="Propostas"
                  valor={`${detalhe.resumo.propostas_criadas}`}
                  sub={`${detalhe.resumo.propostas_aprovadas} aprovadas`}
                  cor="text-amber-400 bg-amber-500/20 border-amber-500/30"
                  compact
                />
                <KpiCard
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Receita mensal"
                  valor={formatCurrency(detalhe.resumo.receita_mensal)}
                  sub={`Ticket ${formatCurrency(detalhe.resumo.ticket_medio)}`}
                  cor="text-emerald-400 bg-emerald-500/20 border-emerald-500/30"
                  compact
                />
              </div>

              {/* META */}
              {detalhe.resumo.meta_mensal > 0 && (
                <Card className="border border-white/10 bg-slate-900/80 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-purple-400" /> Meta mensal
                      </span>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {detalhe.resumo.meta_mensal > 0
                          ? `${((detalhe.resumo.meta_realizado / detalhe.resumo.meta_mensal) * 100).toFixed(1)}%`
                          : '0%'}
                      </Badge>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min((detalhe.resumo.meta_realizado / detalhe.resumo.meta_mensal) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-mono pt-1 text-slate-400">
                      <span>
                        Realizado:{' '}
                        <strong className="text-emerald-400">
                          {formatCurrency(detalhe.resumo.meta_realizado)}
                        </strong>
                      </span>
                      <span>
                        Meta: <strong className="text-slate-200">{formatCurrency(detalhe.resumo.meta_mensal)}</strong>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* EVOLUÇÃO */}
              {detalhe.evolucao.length > 0 && (
                <Card className="border border-white/10 bg-slate-900/80 rounded-2xl">
                  <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                    <CardTitle className="text-sm font-bold text-white">Evolução por período</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={detalhe.evolucao}
                          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="mes" stroke="#64748b" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10 }} />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="#10b981"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v: number) => formatCurrency(v).replace(',00', '')}
                          />
                          <Tooltip
                            formatter={(value: number | string, name: string) =>
                              name === 'receita' ? formatCurrency(Number(value)) : value
                            }
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="propostas"
                            stroke="#f59e0b"
                            name="Propostas"
                            strokeWidth={2}
                          />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="contratos"
                            stroke="#a855f7"
                            name="Contratos"
                            strokeWidth={2}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="receita"
                            stroke="#10b981"
                            name="receita"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* CLIENTES */}
              <Card className="border border-white/10 bg-slate-900/80 rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-white/10 bg-slate-950/60 pb-3">
                  <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                    <span>Clientes da carteira</span>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      {detalhe.clientes.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-4">Cliente</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-center">Propostas</th>
                          <th className="py-2.5 px-4 text-center">Contratos</th>
                          <th className="py-2.5 px-4">Criado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-200">
                        {detalhe.clientes.slice(0, 8).map((c) => (
                          <tr key={c.id} className="hover:bg-white/5">
                            <td className="py-2.5 px-4 font-semibold text-white">{c.razao_social}</td>
                            <td className="py-2.5 px-4 text-center">
                              <Badge
                                className={
                                  c.status === 'ACTIVE'
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]'
                                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px]'
                                }
                              >
                                {c.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 text-center font-mono">{c.propostas}</td>
                            <td className="py-2.5 px-4 text-center font-mono">{c.contratos}</td>
                            <td className="py-2.5 px-4 text-slate-400">{formatDate(c.criado_em)}</td>
                          </tr>
                        ))}
                        {detalhe.clientes.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500">
                              Sem clientes na carteira.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* NAVEGAÇÃO RÁPIDA */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => navigate(`/workspace/representantes/${detalhe.representante.id}`)}
                >
                  Perfil completo <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => navigate(`/workspace/clientes?representante=${detalhe.representante.id}`)}
                >
                  Clientes do representante
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => navigate(`/workspace/propostas?representante=${detalhe.representante.id}`)}
                >
                  Propostas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 rounded-xl text-xs gap-1"
                  onClick={() => navigate(`/workspace/contratos?representante=${detalhe.representante.id}`)}
                >
                  Contratos
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  valor,
  sub,
  cor,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub?: string;
  cor: string;
  compact?: boolean;
}) {
  return (
    <Card className={`border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl ${compact ? '' : ''}`}>
      <CardContent className={`${compact ? 'p-3' : 'p-4'} flex items-center justify-between gap-2`}>
        <div className="min-w-0">
          <span className="text-slate-400 text-[11px] block font-semibold truncate">{label}</span>
          <strong className={`font-extrabold text-white ${compact ? 'text-lg' : 'text-xl'} block truncate`}>
            {valor}
          </strong>
          {sub && <span className="text-[10px] text-slate-500 block font-mono truncate">{sub}</span>}
        </div>
        <div className={`p-2.5 rounded-xl border flex-shrink-0 ${cor}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}