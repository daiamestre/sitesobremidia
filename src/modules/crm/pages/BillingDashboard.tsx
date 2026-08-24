import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarClock, CheckCircle2, Clock, Loader2, PlusCircle, RefreshCw, SearchX, ShieldAlert, TrendingUp, AlertTriangle } from 'lucide-react';
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
  const [dialogOpen, setDialogOpen] = useState(false);

  const podeAcessar = isOwner || isAdmin;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['central-cobrancas', empresaOperadoraId],
    queryFn: () => financeiroService.listCobrancas(empresaOperadoraId || undefined),
    enabled: podeAcessar,
  });

  const cobrancas = data?.data ?? [];

  const enriquecidas = useMemo(
    () =>
      cobrancas.map((c) => ({
        ...c,
        situacao: deriveCobrancaSituacao(c.status, c.data_vencimento),
        nomeCliente: formatarNomeCliente(c),
      })),
    [cobrancas]
  );

  const clientesFiltro = useMemo(() => {
    const mapa = new Map<string, string>();
    enriquecidas.forEach((c) => mapa.set(c.cliente_id || '', c.nomeCliente));
    return Array.from(mapa.entries()).filter(([id]) => id);
  }, [enriquecidas]);

  const hojeZero = new Date(new Date().toDateString()).getTime();
  const diffDiasVenc = (iso: string) => {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();
    return Math.round((d - hojeZero) / 86400000);
  };

  const filtradas = useMemo(() => {
    let lista = [...enriquecidas];
    if (filtroSituacao !== 'all') lista = lista.filter((c) => c.situacao === filtroSituacao);
    if (filtroCliente !== 'all') lista = lista.filter((c) => c.cliente_id === filtroCliente);
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
          c.pagamentos?.length ? String(c.pagamentos[0].meio_pagamento) : '',
        ]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(q))
      );
    }
    return lista;
  }, [enriquecidas, filtroSituacao, filtroCliente, filtroPeriodo, busca]);

  const kpis = useMemo(() => {
    const soma = (sit: CobrancaSituacao[]) =>
      enriquecidas.filter((c) => sit.includes(c.situacao)).reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const qtd = (sit: CobrancaSituacao[]) => enriquecidas.filter((c) => sit.includes(c.situacao)).length;
    const aberto = soma(['ABERTA', 'VENCENDO_HOJE']);
    const atrasado = soma(['ATRASADA']);
    const parcial = soma(['PARCIAL']);
    const recebido = soma(['PAGA']);
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
    };
  }, [enriquecidas]);

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
            Gestão de cobranças a receber: acompanhamento de vencimentos, baixas e situações por cliente.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => setDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white rounded-xl gap-2 text-xs font-semibold"
          >
            <PlusCircle className="h-4 w-4" />
            Nova cobrança
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { titulo: 'Total a Receber', valor: brl(kpis.totalAReceber), sub: 'em aberto + parcial', icon: TrendingUp, cor: 'text-emerald-400' },
          { titulo: 'Em Aberto', valor: brl(kpis.totalAberto), sub: `${kpis.qtdAberto} cobrança(s)`, icon: Clock, cor: 'text-blue-400' },
          { titulo: 'Vencendo Hoje', valor: String(kpis.qtdVencHoje), sub: 'cobrança(s)', icon: CalendarClock, cor: 'text-amber-400' },
          { titulo: 'Em Atraso', valor: brl(kpis.totalAtrasado), sub: `${kpis.qtdAtrasado} cobrança(s)`, icon: AlertTriangle, cor: 'text-rose-400' },
          { titulo: 'Recebido', valor: brl(kpis.totalRecebido), sub: `${kpis.qtdPago} baixa(s)`, icon: CheckCircle2, cor: 'text-emerald-400' },
          { titulo: 'Parciais', valor: String(kpis.qtdParcial), sub: 'pagamento parcial', icon: Banknote, cor: 'text-indigo-400' },
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

      <div className="card bg-slate-900/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm mb-6 border border-white/10">
        <h3 className="font-semibold text-white mb-4">Filtros</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Busca</Label>
            <Input
              placeholder="Cliente, contrato..."
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
                  <SelectItem key={id} value={id}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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
                  <TableHead className="text-slate-300">Parcela</TableHead>
                  <TableHead className="text-slate-300">Valor</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Pagamento</TableHead>
                  <TableHead className="text-slate-300">Situação</TableHead>
                  <TableHead className="text-right text-slate-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-white/10 hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(`/financeiro/cobrancas/${c.id}`)}
                  >
                    <TableCell>
                      <strong className="text-white block text-xs">{c.nomeCliente}</strong>
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 font-mono">
                      {c.contrato?.numero_contrato || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">
                      {c.numero_parcela}/{c.total_parcelas}
                    </TableCell>
                    <TableCell className="text-xs text-slate-100 font-semibold">{brl(c.valor)}</TableCell>
                    <TableCell className="text-xs text-slate-300">{fmtData(c.data_vencimento)}</TableCell>
                    <TableCell className="text-xs text-slate-300">{fmtData(c.data_recebimento)}</TableCell>
                    <TableCell>
                      <Badge className={`${SITUACAO_BADGE[c.situacao]} border text-[11px]`}>
                        {SITUACAO_LABEL[c.situacao]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/financeiro/cobrancas/${c.id}`)}
                        className="border-primary/30 text-primary hover:bg-primary/10 text-xs gap-1 h-8"
                      >
                        Detalhes
                      </Button>
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
        onCriada={() => {
          queryClient.invalidateQueries({ queryKey: ['central-cobrancas'] });
          toast({ title: 'Cobrança criada', description: 'A cobrança foi registrada em contas a receber.' });
        }}
      />
    </div>
  );
}

function NovaCobrancaDialog({
  open,
  onOpenChange,
  empresaOperadoraId,
  onCriada,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaOperadoraId: string | null;
  onCriada: () => void;
}) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>('');
  const [contratoId, setContratoId] = useState<string>('');
  const [valor, setValor] = useState<string>('');
  const [vencimento, setVencimento] = useState<string>('');
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

  const contratosDoCliente = (contratos || []).filter((ct: ContratoResumo) => ct.cliente_id === clienteId);
  const clientesLista: ClienteResumo[] = clientes || [];

  const reset = () => {
    setClienteId('');
    setContratoId('');
    setValor('');
    setVencimento('');
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSalvando(true);
    try {
      const valorNum = Number(valor.replace(',', '.'));
      const resultado = await financeiroService.createCobranca({
        empresaOperadoraId: empresaOperadoraId || '',
        clienteId,
        contratoId,
        valor: valorNum,
        dataVencimento: vencimento,
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
      <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Nova cobrança</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Cliente *</Label>
            <Select
              value={clienteId}
              onValueChange={(v) => {
                setClienteId(v);
                setContratoId('');
              }}
              disabled={loadingClientes}
            >
              <SelectTrigger className="bg-slate-950 border-slate-700">
                <SelectValue placeholder={loadingClientes ? 'Carregando...' : 'Selecione o cliente'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                {clientesLista.map((cli) => (
                  <SelectItem key={cli.id} value={cli.id}>
                    {cli.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Contrato vinculado *</Label>
            <Select value={contratoId} onValueChange={setContratoId} disabled={!clienteId}>
              <SelectTrigger className="bg-slate-950 border-slate-700">
                <SelectValue placeholder={clienteId ? 'Selecione o contrato' : 'Escolha um cliente primeiro'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-700 max-h-64">
                {contratosDoCliente.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.numero_contrato || ct.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Valor (R$) *</Label>
              <Input
                inputMode="decimal"
                placeholder="1500,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="bg-slate-950 border-slate-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Vencimento *</Label>
              <Input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className="bg-slate-950 border-slate-700"
              />
            </div>
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
