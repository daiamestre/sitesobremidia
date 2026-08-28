import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, CalendarClock, CheckCircle2, Clock, Loader2,
  PlusCircle, RefreshCw, SearchX, ShieldAlert, ShieldBan, TrendingUp, Zap,
  Edit, Eye, Link as LinkIcon, MessageCircle, MoreVertical
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditReceivableModal } from '../components/financeiro/EditReceivableModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import {
  financeiroService,
  deriveCobrancaSituacao,
  formatarNomeCliente,
  rotaCobranca,
  type Cobranca,
  type CobrancaSituacao,
  type ClienteResumo,
  type ContratoResumo,
} from '../services/financeiro.service';

const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const SITUACAO_LABEL: Record<CobrancaSituacao, string> = {
  ABERTA: 'Em aberto',
  VENCENDO_HOJE: 'Vence hoje',
  ATRASADA: 'Atrasada',
  PAGA: 'Paga',
  PARCIAL: 'Parcial',
  CANCELADA: 'Cancelada',
};

const SITUACAO_BADGE: Record<CobrancaSituacao, string> = {
  ABERTA: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  VENCENDO_HOJE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ATRASADA: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  PAGA: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  PARCIAL: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  CANCELADA: 'bg-slate-700/60 text-slate-300 border-slate-600/40',
};

const SITUACAO_COBRANCA_LABEL: Record<string, string> = {
  NENHUMA: '',
  EM_COBRANCA: 'Em cobrança',
  CONTATO_1: '1º contato',
  CONTATO_2: '2º contato',
  CONTATO_3: '3º contato',
  INADIMPLENTE: 'Inadimplente',
  BLOQUEADO: 'Bloqueado',
};

export default function BillingDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaOperadoraId } = useAuth();
  const { isOwner, isAdmin } = useRbac();
  const { toast } = useToast();

  const [busca, setBusca] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<string>('all');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('all');
  const [filtroCliente, setFiltroCliente] = useState<string>('all');
  const [filtroTipo, setFiltroTipo] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processandoRegua, setProcessandoRegua] = useState(false);
  const [cobrancaEditando, setCobrancaEditando] = useState<any | null>(null);

  const podeAcessar = isOwner || isAdmin;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['central-cobrancas', empresaOperadoraId],
    queryFn: () => financeiroService.listCobrancas(empresaOperadoraId || undefined),
    enabled: podeAcessar,
  });

  const { data: bloqueadosCount } = useQuery({
    queryKey: ['central-bloqueados', empresaOperadoraId],
    queryFn: () => financeiroService.contarBloqueados(empresaOperadoraId || undefined),
    enabled: podeAcessar,
  });

  const { data: tiposContrato } = useQuery({
    queryKey: ['central-tipos-contrato', empresaOperadoraId],
    queryFn: () => financeiroService.listTiposContrato(empresaOperadoraId || undefined),
    enabled: podeAcessar,
  });

  const { data: contratosResumo } = useQuery({
    queryKey: ['central-contratos-tipo', empresaOperadoraId],
    queryFn: () => financeiroService.listContratosResumo(empresaOperadoraId || undefined),
    enabled: podeAcessar,
  });

  const cobrancas = data?.data ?? [];

  const enriquecidas = useMemo(
    () =>
      cobrancas.map((c) => ({
        ...c,
        situacao: deriveCobrancaSituacao(c.status, c.data_vencimento),
        nomeCliente: formatarNomeCliente(c),
        diasAtraso: (() => {
          const d = new Date(`${String(c.data_vencimento).slice(0, 10)}T00:00:00`).getTime();
          return Math.max(0, Math.round((new Date(new Date().toDateString()).getTime() - d) / 86400000));
        })(),
      })),
    [cobrancas]
  );

  const clientesFiltro = useMemo(() => {
    const mapa = new Map<string, string>();
    enriquecidas.forEach((c) => mapa.set(c.cliente_id || '', c.nomeCliente));
    return Array.from(mapa.entries()).filter(([id]) => id);
  }, [enriquecidas]);

  const diffDiasVenc = (iso: string) => {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
    return Math.round((d - new Date(new Date().toDateString()).getTime()) / 86400000);
  };

  const generateWhatsAppLink = (conta: any) => {
    const numDoc = conta.numero_documento || conta.codigo_operacional;
    const urlPublica = `${window.location.origin}/cobranca/${numDoc}/${conta.public_token}`;
    const text = `Olá, ${conta.cliente?.empresas?.[0]?.nome_fantasia || conta.cliente?.empresas?.[0]?.razao_social || 'Cliente'}!\nSua cobrança da SOBRE MÍDIA${conta.competencia_date ? ` referente à competência ${String(conta.competencia_date).slice(0, 7)}` : ''} está disponível.\n\nValor: R$ ${Number(conta.saldo ?? conta.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nVencimento: ${new Date(conta.data_vencimento).toLocaleDateString('pt-BR')}\n\nAcesse sua cobrança:\n${urlPublica}\n\nEm caso de dúvidas, estamos à disposição.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const filtradas = useMemo(() => {
    let lista = [...enriquecidas];
    if (filtroSituacao !== 'all') lista = lista.filter((c) => c.situacao === filtroSituacao);
    if (filtroCliente !== 'all') lista = lista.filter((c) => c.cliente_id === filtroCliente);
    if (filtroTipo !== 'all') {
      const idsDoTipo = new Set(
        (contratosResumo || []).filter((ct) => ct.tipo_contrato === filtroTipo).map((ct) => ct.id)
      );
      lista = lista.filter((c) => c.contrato_id && idsDoTipo.has(c.contrato_id));
    }
    if (filtroPeriodo !== 'all') {
      lista = lista.filter((c) => {
        const diff = diffDiasVenc(c.data_vencimento);
        switch (filtroPeriodo) {
          case 'vencidas':
            return diff < 0 && c.situacao !== 'PAGA' && c.situacao !== 'CANCELADA';
          case 'hoje':
            return diff === 0;
          case '7d':
            return diff >= 0 && diff <= 7;
          case '30d':
            return diff >= 0 && diff <= 30;
          default:
            return true;
        }
      });
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter((c) =>
        [
          c.nomeCliente,
          c.contrato?.numero_contrato,
          c.numero_documento,
          c.metodo_cobranca,
        ]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(q))
      );
    }
    return lista.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  }, [enriquecidas, filtroSituacao, filtroCliente, filtroPeriodo, filtroTipo, contratosResumo, busca]);

  const kpis = useMemo(() => {
    const soma = (sit: CobrancaSituacao[]) =>
      enriquecidas.filter((c) => sit.includes(c.situacao)).reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const qtd = (sit: CobrancaSituacao[]) => enriquecidas.filter((c) => sit.includes(c.situacao)).length;
    const aberto = soma(['ABERTA', 'VENCENDO_HOJE']);
    const atrasado = soma(['ATRASADA']);
    const parcial = soma(['PARCIAL']);
    const recebido = soma(['PAGA']);
    const emCobranca = enriquecidas.filter((c) =>
      ['EM_COBRANCA', 'CONTATO_1', 'CONTATO_2', 'CONTATO_3'].includes(c.situacao_cobranca || '')
    );
    return {
      totalAReceber: aberto + atrasado + parcial,
      totalAberto: aberto,
      qtdAberto: qtd(['ABERTA', 'VENCENDO_HOJE']),
      qtdVencHoje: qtd(['VENCENDO_HOJE']),
      totalAtrasado: atrasado,
      qtdAtrasado: qtd(['ATRASADA']),
      totalRecebido: recebido,
      qtdPago: qtd(['PAGA']),
      qtdParcial: qtd(['PARCIAL']),
      qtdEmCobranca: emCobranca.length,
      valorEmCobranca: emCobranca.reduce((acc, c) => acc + Number(c.valor || 0), 0),
      qtdInadimplentes: enriquecidas.filter((c) => c.situacao_cobranca === 'INADIMPLENTE').length,
      bloqueados: bloqueadosCount ?? 0,
    };
  }, [enriquecidas, bloqueadosCount]);

  // AGENDA FINANCEIRA — próximas e vencidas com estágio da política
  const agenda = useMemo(() => {
    const abertas = enriquecidas.filter((c) => !['PAGA', 'CANCELADA'].includes(c.situacao));
    const proximas = abertas
      .filter((c) => diffDiasVenc(c.data_vencimento) >= 0 && diffDiasVenc(c.data_vencimento) <= 15)
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
      .slice(0, 6);
    const vencidas = abertas
      .filter((c) => c.diasAtraso > 0)
      .sort((a, b) => b.diasAtraso - a.diasAtraso)
      .slice(0, 6);
    return { proximas, vencidas };
  }, [enriquecidas]);

  const handleProcessarRegua = async () => {
    setProcessandoRegua(true);
    try {
      const r = await financeiroService.processarReguaCobranca(empresaOperadoraId || undefined);
      if (!r.success) {
        toast({ title: 'Erro na régua', description: r.error, variant: 'destructive' });
        return;
      }
      const d = r.data || {};
      toast({
        title: 'Régua processada',
        description: `Recorrentes geradas: ${d?.recorrencia?.cobrancas_geradas ?? 0} · Estágios: ${d.estagios_avancados ?? 0} · Inadimplências: ${d.inadimplencias_registradas ?? 0} · Bloqueios: ${d.clientes_bloqueados ?? 0}`,
      });
      refetch();
    } finally {
      setProcessandoRegua(false);
    }
  };

  if (!podeAcessar) {
    return (
      <div className="max-w-xl mx-auto py-16 animate-fade-in">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ShieldAlert className="h-10 w-10 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Acesso restrito</h2>
            <p className="text-sm text-slate-400">
              A Central de Cobranças é exclusiva para usuários ADMIN ou OWNER da operadora.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2">
            <Banknote className="h-6 w-6 text-emerald-400" />
            Central de Cobranças
          </h2>
          <p className="text-xs text-slate-300">
            Ciclo completo: contratos recorrentes, régua de contatos, inadimplência, bloqueio e conciliação.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs"
          >
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={handleProcessarRegua}
            disabled={processandoRegua}
            className="border-primary/40 text-primary hover:bg-primary/10 rounded-xl gap-2 text-xs"
          >
            {processandoRegua ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Processar régua
          </Button>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white rounded-xl gap-2 text-xs font-semibold"
          >
            <PlusCircle className="h-4 w-4" />
            Nova cobrança
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { titulo: 'Total a Receber', valor: brl(kpis.totalAReceber), sub: 'em aberto + parcial', icon: TrendingUp, cor: 'text-emerald-400' },
          { titulo: 'Em Aberto', valor: brl(kpis.totalAberto), sub: `${kpis.qtdAberto} cobrança(s)`, icon: Clock, cor: 'text-blue-400' },
          { titulo: 'Em Cobrança', valor: brl(kpis.valorEmCobranca), sub: `${kpis.qtdEmCobranca} na régua`, icon: CalendarClock, cor: 'text-amber-400' },
          { titulo: 'Inadimplentes', valor: String(kpis.qtdInadimplentes), sub: 'após 3º contato', icon: AlertTriangle, cor: 'text-rose-400' },
          { titulo: 'Bloqueados', valor: String(kpis.bloqueados), sub: 'clientes suspensos', icon: ShieldBan, cor: 'text-rose-400' },
          { titulo: 'Recebido', valor: brl(kpis.totalRecebido), sub: `${kpis.qtdPago} baixa(s)`, icon: CheckCircle2, cor: 'text-emerald-400' },
        ].map((kpi) => (
          <Card key={kpi.titulo} className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
            <CardContent className="pt-5 pb-4 px-5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{kpi.titulo}</span>
                <kpi.icon className={`h-4 w-4 ${kpi.cor}`} />
              </div>
              <div className={`text-xl font-bold ${kpi.cor}`}>{kpi.valor}</div>
              <div className="text-[11px] text-slate-500">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AGENDA FINANCEIRA */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-400" /> Próximos vencimentos (15 dias)
              </h3>
              {agenda.proximas.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Nenhum vencimento nos próximos 15 dias.</p>
              ) : (
                agenda.proximas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(rotaCobranca(c))}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/5 hover:border-white/15 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{c.nomeCliente}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {c.contrato?.numero_contrato || c.numero_documento || '—'}
                        {c.metodo_cobranca ? ` · ${c.metodo_cobranca}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs font-bold text-white">{brl(c.valor)}</p>
                      <p className={`text-[10px] ${diffDiasVenc(c.data_vencimento) <= 5 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {fmtData(c.data_vencimento)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" /> Cobranças vencidas
              </h3>
              {agenda.vencidas.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Nenhuma cobrança vencida. Excelente!</p>
              ) : (
                agenda.vencidas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(rotaCobranca(c))}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/5 hover:border-white/15 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{c.nomeCliente}</p>
                      <p className="text-[10px] text-slate-500">
                        {c.diasAtraso} dia(s) de atraso
                        {c.situacao_cobranca && c.situacao_cobranca !== 'NENHUMA'
                          ? ` · ${SITUACAO_COBRANCA_LABEL[c.situacao_cobranca] || c.situacao_cobranca}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs font-bold text-rose-300">{brl(c.valor)}</p>
                      <Badge className={`${SITUACAO_BADGE[c.situacao]} border text-[9px]`}>{SITUACAO_LABEL[c.situacao]}</Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* FILTROS */}
      <div className="card bg-slate-900/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm mb-6 border border-white/10">
        <h3 className="font-semibold text-white mb-4">Filtros</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Busca</Label>
            <Input
              placeholder="Cliente, contrato, documento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="bg-slate-950 border-slate-700 text-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Situação</Label>
            <Select value={filtroSituacao} onValueChange={setFiltroSituacao}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ABERTA">Em aberto</SelectItem>
                <SelectItem value="VENCENDO_HOJE">Vencendo hoje</SelectItem>
                <SelectItem value="ATRASADA">Atrasadas</SelectItem>
                <SelectItem value="PARCIAL">Parciais</SelectItem>
                <SelectItem value="PAGA">Pagas</SelectItem>
                <SelectItem value="CANCELADA">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Vencimento</Label>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="vencidas">Vencidas</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7d">Próximos 7 dias</SelectItem>
                <SelectItem value="30d">Próximos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Cliente</Label>
            <Select value={filtroCliente} onValueChange={setFiltroCliente}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                <SelectItem value="all">Todos</SelectItem>
                {clientesFiltro.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Tipo de contrato</Label>
            <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v); }}>
              <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-200">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                <SelectItem value="all">Todos</SelectItem>
                {(tiposContrato || []).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* LISTAGEM */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-3 text-sm text-slate-400">Carregando cobranças...</p>
        </div>
      ) : isError ? (
        <Card className="border border-rose-500/20 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardContent className="py-10 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 mx-auto text-rose-400" />
            <p className="text-sm text-rose-300">Erro ao carregar cobranças: {error?.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
          <div className="rounded-xl overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-300">Cliente</TableHead>
                  <TableHead className="text-slate-300">Referência</TableHead>
                  <TableHead className="text-slate-300">Método</TableHead>
                  <TableHead className="text-slate-300">Valor</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Situação</TableHead>
                  <TableHead className="text-slate-300">Régua</TableHead>
                  <TableHead className="text-right text-slate-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-white/10 hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(rotaCobranca(c))}
                  >
                    <TableCell>
                      <strong className="text-white block text-xs">{c.nomeCliente}</strong>
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 font-mono">
                      {c.codigo_operacional || c.numero_documento || c.contrato?.numero_contrato || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">{c.metodo_cobranca || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-100 font-semibold">{brl(c.valor)}</TableCell>
                    <TableCell className="text-xs text-slate-300">{fmtData(c.data_vencimento)}</TableCell>
                    <TableCell>
                      <Badge className={`${SITUACAO_BADGE[c.situacao]} border text-[11px]`}>
                        {SITUACAO_LABEL[c.situacao]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {c.situacao_cobranca && c.situacao_cobranca !== 'NENHUMA' ? (
                        <span className={c.situacao_cobranca === 'INADIMPLENTE' ? 'text-rose-400 font-semibold' : 'text-amber-400'}>
                          {SITUACAO_COBRANCA_LABEL[c.situacao_cobranca]}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Detalhes da Cobrança"
                          onClick={() => navigate(rotaCobranca(c))}
                          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-white/10 hidden sm:flex"
                        >
                          <Eye className="h-4 w-4 sm:mr-1" />
                          <span className="hidden xl:inline text-xs">Visualizar</span>
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10">
                              <span className="sr-only">Abrir menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-900 border-white/10 text-slate-300 w-48">
                            <DropdownMenuItem onClick={() => navigate(rotaCobranca(c))} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer sm:hidden">
                              <Eye className="mr-2 h-4 w-4" /> Detalhes
                            </DropdownMenuItem>
                            {c.status !== 'CANCELADO' && c.status !== 'PAGO' && (
                              <DropdownMenuItem onClick={() => setCobrancaEditando(c as any)} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer text-blue-400 focus:text-blue-300">
                                <Edit className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                            )}
                            {c.public_token && c.public_enabled && (
                              <>
                                <DropdownMenuItem onClick={() => window.open(`${window.location.origin}/cobranca/${c.numero_documento || c.codigo_operacional}/${c.public_token}`, '_blank')} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer text-primary focus:text-primary">
                                  <LinkIcon className="mr-2 h-4 w-4" /> Pré-visualizar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(generateWhatsAppLink(c), '_blank')} className="hover:bg-white/10 focus:bg-white/10 cursor-pointer text-emerald-400 focus:text-emerald-300">
                                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <SearchX className="h-8 w-8 mx-auto text-slate-600" />
                      <p className="mt-3 text-sm text-slate-400">
                        {cobrancas.length === 0
                          ? 'Nenhuma cobrança cadastrada para esta operadora.'
                          : 'Nenhuma cobrança encontrada com os filtros aplicados.'}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <NovaCobrancaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        empresaOperadoraId={empresaOperadoraId}
        tiposContrato={tiposContrato || []}
        onCriada={() => {
          queryClient.invalidateQueries({ queryKey: ['central-cobrancas'] });
          toast({ title: 'Cobrança criada', description: 'A cobrança foi registrada em contas a receber.' });
        }}
      />

      {cobrancaEditando && (
        <EditReceivableModal
          isOpen={true}
          onClose={() => setCobrancaEditando(null)}
          cobranca={cobrancaEditando}
          onSuccess={() => {
            setCobrancaEditando(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

type Periodicidade = 'AVULSA' | 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

function NovaCobrancaDialog({
  open,
  onOpenChange,
  empresaOperadoraId,
  tiposContrato,
  onCriada,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaOperadoraId: string | null;
  tiposContrato: string[];
  onCriada: () => void;
}) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>('');
  const [tipoContrato, setTipoContrato] = useState<string>('');
  const [contratoId, setContratoId] = useState<string>('');
  const [servicoId, setServicoId] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [valor, setValor] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [vencimento, setVencimento] = useState<string>('');
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('AVULSA');
  const [metodo, setMetodo] = useState<string>('PIX');
  const [salvando, setSalvando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: clientes, isLoading: loadingClientes } = useQuery({
    queryKey: ['central-clientes-resumo', empresaOperadoraId],
    queryFn: () => financeiroService.listClientesResumo(empresaOperadoraId || undefined),
    enabled: open,
  });

  const { data: contratos } = useQuery({
    queryKey: ['central-contratos-resumo', empresaOperadoraId],
    queryFn: () => financeiroService.listContratosResumo(empresaOperadoraId || undefined),
    enabled: open,
  });

  const { data: servicos } = useQuery({
    queryKey: ['central-servicos-contrato', contratoId],
    queryFn: () => financeiroService.listServicosDeContrato(contratoId),
    enabled: open && !!contratoId,
  });

  const contratosDoCliente = (contratos || []).filter(
    (ct: any) => ct.cliente_id === clienteId && (!tipoContrato || (ct as any).tipo_contrato === tipoContrato)
  );

  const reset = () => {
    setClienteId(''); setTipoContrato(''); setContratoId(''); setServicoId('');
    setDescricao(''); setValor(''); setVencimento(''); setPeriodicidade('AVULSA'); setMetodo('PIX');
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSalvando(true);
    try {
      const valorNum = Number(valor.replace(',', '.'));
      const servicoSel = (servicos || []).find((s) => s.servico_id === servicoId);
      const resultado = await financeiroService.createCobranca({
        empresaOperadoraId: empresaOperadoraId || '',
        clienteId,
        contratoId,
        valor: valorNum,
        dataVencimento: vencimento,
        competenciaDate: competencia ? `${competencia}-01` : undefined,
        metodoCobranca: metodo,
        recorrencia: periodicidade,
        descricao: descricao || (servicoSel ? `Referente a ${servicoSel.nome}` : undefined),
      });
      if (!resultado.success) {
        setFormError(resultado.error || 'Falha ao criar cobrança.');
        toast({ title: 'Erro ao criar cobrança', description: resultado.error, variant: 'destructive' });
        return;
      }
      reset();
      onOpenChange(false);
      onCriada();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Nova cobrança</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Cliente *</Label>
              <Select
                value={clienteId}
                onValueChange={(v) => { setClienteId(v); setContratoId(''); setServicoId(''); }}
                disabled={loadingClientes}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione'} />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                  {(clientes as ClienteResumo[] || []).map((cli) => (
                    <SelectItem key={cli.id} value={cli.id}>{cli.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Tipo de contrato</Label>
              <Select value={tipoContrato} onValueChange={(v) => { setTipoContrato(v); setContratoId(''); }}>
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tiposContrato.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Contrato vinculado *</Label>
            <Select value={contratoId} onValueChange={(v) => { setContratoId(v); setServicoId(''); }} disabled={!clienteId}>
              <SelectTrigger className="bg-slate-950 border-slate-700">
                <SelectValue placeholder={clienteId ? 'Selecione o contrato' : 'Escolha um cliente primeiro'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                {contratosDoCliente.map((ct: any) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.numero_contrato || '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Serviço faturado</Label>
            <Select
              value={servicoId}
              onValueChange={(v) => {
                setServicoId(v);
                const s = (servicos || []).find((sv) => sv.servico_id === v);
                if (s && s.valor_total > 0) setValor(String(s.valor_total).replace('.', ','));
              }}
              disabled={!contratoId}
            >
              <SelectTrigger className="bg-slate-950 border-slate-700">
                <SelectValue placeholder={contratoId ? (servicos?.length ? 'Selecione o serviço' : 'Sem itens vinculados') : 'Escolha um contrato primeiro'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                {(servicos || []).map((s) => (
                  <SelectItem key={s.servico_id} value={s.servico_id}>
                    {s.nome} ({brl(s.valor_unitario)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Valor (R$) *</Label>
              <Input inputMode="decimal" placeholder="1500,00" value={valor} onChange={(e) => setValor(e.target.value)} className="bg-slate-950 border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Vencimento *</Label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="bg-slate-950 border-slate-700" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Competência</Label>
              <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="bg-slate-950 border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Periodicidade</Label>
              <Select value={periodicidade} onValueChange={(v) => setPeriodicidade(v as Periodicidade)}>
                <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700">
                  <SelectItem value="AVULSA">Avulsa</SelectItem>
                  <SelectItem value="MENSAL">Mensal</SelectItem>
                  <SelectItem value="BIMESTRAL">Bimestral</SelectItem>
                  <SelectItem value="TRIMESTRAL">Trimestral</SelectItem>
                  <SelectItem value="SEMESTRAL">Semestral</SelectItem>
                  <SelectItem value="ANUAL">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Método</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700">
                  {['PIX', 'BOLETO', 'TRANSFERÊNCIA', 'TED', 'DINHEIRO'].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Descrição / referência</Label>
            <Input placeholder="Ex.: Plano de mídia mensal" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="bg-slate-950 border-slate-700" />
          </div>

          {formError && <p className="text-xs text-rose-400">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={salvando || !clienteId || !contratoId || !valor || !vencimento}
            className="bg-primary hover:bg-primary/90 text-white gap-2"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar cobrança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
