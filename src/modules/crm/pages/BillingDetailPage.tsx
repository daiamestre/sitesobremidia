import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Ban, CalendarClock, CheckCircle2, Copy, CreditCard, Loader2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import {
  financeiroService,
  deriveCobrancaSituacao,
  formatarNomeCliente,
  type CobrancaSituacao,
} from '../services/financeiro.service';

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

const MEIOS_PAGAMENTO = ['PIX', 'BOLETO', 'CARTÃO', 'TRANSFERÊNCIA', 'TED', 'DOC', 'DINHEIRO'] as const;

export default function BillingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, empresaOperadoraId } = useAuth();
  const { isOwner, isAdmin } = useRbac();
  const { toast } = useToast();

  const [baixaOpen, setBaixaOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [meioPagamento, setMeioPagamento] = useState<string>('PIX');
  const [valorPago, setValorPago] = useState<string>('');
  const [processando, setProcessando] = useState(false);

  const podeAcessar = isOwner || isAdmin;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['central-cobranca', id],
    queryFn: () => financeiroService.getCobranca(id!),
    enabled: !!id && podeAcessar,
  });

  const cobranca = data?.data ?? null;
  const situacao: CobrancaSituacao | null = cobranca
    ? deriveCobrancaSituacao(cobranca.status, cobranca.data_vencimento)
    : null;

  const timeline = useMemo(() => {
    if (!cobranca) return [];
    const eventos: { titulo: string; descricao: string; data: string; done: boolean }[] = [
      {
        titulo: 'Cobrança registrada',
        descricao: `Título criado em contas a receber${cobranca.contrato?.numero_contrato ? ` — contrato ${cobranca.contrato.numero_contrato}` : ''}`,
        data: fmtData(cobranca.created_at),
        done: true,
      },
      {
        titulo: 'Vencimento',
        descricao: `Vencimento da parcela ${cobranca.numero_parcela}/${cobranca.total_parcelas}`,
        data: fmtData(cobranca.data_vencimento),
        done: ['PAGA'].includes(situacao!) || Boolean(cobranca.data_recebimento),
      },
    ];
    if (situacao === 'PAGA' || cobranca.data_recebimento) {
      eventos.push({
        titulo: 'Baixa realizada',
        descricao: `Cobrança liquidada (${brl(cobranca.valor)})`,
        data: fmtData(cobranca.data_recebimento),
        done: true,
      });
    }
    if (situacao === 'CANCELADA') {
      eventos.push({
        titulo: 'Cobrança cancelada',
        descricao: 'Título cancelado e sem valor a receber',
        data: fmtData(cobranca.updated_at),
        done: true,
      });
    }
    if (situacao === 'ATRASADA') {
      eventos.push({
        titulo: 'Em atraso',
        descricao: 'Vencimento ultrapassado sem liquidação',
        data: fmtData(cobranca.data_vencimento),
        done: false,
      });
    }
    return eventos;
  }, [cobranca, situacao]);

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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-slate-400">Carregando detalhes da cobrança...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-xl mx-auto py-16 animate-fade-in">
        <Card className="border border-rose-500/20 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardContent className="py-10 text-center space-y-2">
            <p className="text-sm text-rose-300">Erro ao carregar cobrança: {error?.message}</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/financeiro/cobrancas')}>
              Voltar para a Central
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!cobranca) {
    return (
      <div className="max-w-xl mx-auto py-16 animate-fade-in">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardContent className="py-10 text-center space-y-3">
            <h3 className="text-lg font-semibold text-white">Cobrança não encontrada</h3>
            <p className="text-sm text-slate-400">O título solicitado não existe ou não pertence à sua operadora.</p>
            <Button variant="outline" onClick={() => navigate('/financeiro/cobrancas')}>
              Voltar para a Central
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const podeDarBaixa = situacao !== 'PAGA' && situacao !== 'CANCELADA';
  const podeCancelar = situacao !== 'PAGA' && situacao !== 'CANCELADA';
  const podeReabrir = situacao === 'CANCELADA';

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['central-cobranca', id] });
    queryClient.invalidateQueries({ queryKey: ['central-cobrancas'] });
  };

  const handleBaixa = async () => {
    if (!cobranca) return;
    setProcessando(true);
    try {
      const resultado = await financeiroService.marcarComoPaga(
        {
          id: cobranca.id,
          valor: cobranca.valor,
          contrato_id: cobranca.contrato_id,
          empresa_operadora_id: cobranca.empresa_operadora_id,
        },
        {
          meioPagamento: meioPagamento as typeof MEIOS_PAGAMENTO[number],
          valorPago: valorPago ? Number(valorPago.replace(',', '.')) : undefined,
          usuarioId: usuario?.id,
        }
      );
      if (!resultado.success) {
        toast({ title: 'Erro na baixa', description: resultado.error, variant: 'destructive' });
        return;
      }
      setBaixaOpen(false);
      setValorPago('');
      toast({ title: 'Cobrança paga', description: 'Baixa registrada em pagamentos.' });
      invalidar();
    } finally {
      setProcessando(false);
    }
  };

  const handleCancelar = async () => {
    if (!cobranca) return;
    setProcessando(true);
    try {
      const resultado = await financeiroService.cancelarCobranca(cobranca.id);
      if (!resultado.success) {
        toast({ title: 'Erro ao cancelar', description: resultado.error, variant: 'destructive' });
        return;
      }
      setCancelarOpen(false);
      toast({ title: 'Cobrança cancelada' });
      invalidar();
    } finally {
      setProcessando(false);
    }
  };

  const handleReabrir = async () => {
    if (!cobranca) return;
    setProcessando(true);
    try {
      const resultado = await financeiroService.reabrirCobranca(cobranca.id);
      if (!resultado.success) {
        toast({ title: 'Erro ao reabrir', description: resultado.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Cobrança reaberta', description: 'Status retornado para pendente.' });
      invalidar();
    } finally {
      setProcessando(false);
    }
  };

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(cobranca.id);
      toast({ title: 'Identificador copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const dadosGerais: { label: string; valor: string }[] = [
    { label: 'Cliente', valor: formatarNomeCliente(cobranca) },
    { label: 'Contrato', valor: cobranca.contrato?.numero_contrato || '—' },
    { label: 'Parcela', valor: `${cobranca.numero_parcela} de ${cobranca.total_parcelas}` },
    { label: 'Valor', valor: brl(cobranca.valor) },
    { label: 'Vencimento', valor: fmtData(cobranca.data_vencimento) },
    { label: 'Data de pagamento', valor: fmtData(cobranca.data_recebimento) },
    { label: 'Status no banco', valor: cobranca.status },
    { label: 'Criada em', valor: fmtData(cobranca.created_at) },
    { label: 'Atualizada em', valor: fmtData(cobranca.updated_at) },
    { label: 'Tenant', valor: cobranca.empresa_operadora_id ? `${cobranca.empresa_operadora_id.slice(0, 8)}…` : '—' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <Button variant="outline" size="sm" onClick={() => navigate('/financeiro/cobrancas')} className="gap-2 border-slate-700 text-slate-300 mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para a Central
          </Button>
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-3">
            Detalhes da Cobrança
            {situacao && <Badge className={`${SITUACAO_BADGE[situacao]} border text-[11px]`}>{SITUACAO_LABEL[situacao]}</Badge>}
          </h2>
          <button
            type="button"
            onClick={copiarId}
            className="text-[11px] text-slate-500 hover:text-primary inline-flex items-center gap-1"
          >
            ID {cobranca.id.slice(0, 8)}… <Copy className="h-3 w-3" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {podeDarBaixa && (
            <Button
              onClick={() => {
                setValorPago(String(cobranca.valor));
                setBaixaOpen(true);
              }}
              disabled={processando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs"
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar como paga
            </Button>
          )}
          {podeReabrir && (
            <Button
              variant="outline"
              onClick={handleReabrir}
              disabled={processando}
              className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 gap-2 text-xs"
            >
              <RotateCcw className="h-4 w-4" /> Reabrir
            </Button>
          )}
          {podeCancelar && (
            <Button
              variant="outline"
              onClick={() => setCancelarOpen(true)}
              disabled={processando}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 gap-2 text-xs"
            >
              <Ban className="h-4 w-4" /> Cancelar cobrança
            </Button>
          )}
          {situacao === 'PAGA' && (
            <span className="inline-flex items-center gap-2 text-xs text-emerald-400">
              <BadgeCheck className="h-4 w-4" /> Liquidada
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">Dados da cobrança</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {dadosGerais.map((d) => (
              <div key={d.label} className="space-y-0.5">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">{d.label}</span>
                <p className="text-sm text-slate-200">{d.valor}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ol className="space-y-4">
              {timeline.map((ev, idx) => (
                <li key={`${ev.titulo}-${idx}`} className="flex gap-3">
                  <span
                    className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                      ev.done ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-slate-200">{ev.titulo}</p>
                    <p className="text-xs text-slate-400">{ev.descricao}</p>
                    <p className="text-[11px] text-slate-500">{ev.data}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
        <CardHeader className="border-b border-white/10 pb-3">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" /> Pagamentos vinculados ({cobranca.pagamentos?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!cobranca.pagamentos || cobranca.pagamentos.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <CalendarClock className="h-7 w-7 mx-auto text-slate-600" />
              <p className="text-sm text-slate-400">Nenhum pagamento registrado para esta cobrança.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-slate-300">Meio</TableHead>
                    <TableHead className="text-slate-300">Valor pago</TableHead>
                    <TableHead className="text-slate-300">Liquidação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobranca.pagamentos.map((pg) => (
                    <TableRow key={pg.id} className="border-white/10">
                      <TableCell className="text-xs text-slate-200">{pg.meio_pagamento || '—'}</TableCell>
                      <TableCell className="text-xs text-slate-100 font-semibold">{brl(pg.valor_pago)}</TableCell>
                      <TableCell className="text-xs text-slate-300">{fmtData(pg.data_liquidacao)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={baixaOpen} onOpenChange={setBaixaOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Registrar baixa da cobrança</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Meio de pagamento *</Label>
              <Select value={meioPagamento} onValueChange={setMeioPagamento}>
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700">
                  {MEIOS_PAGAMENTO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Valor pago (R$)</Label>
              <Input
                inputMode="decimal"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                className="bg-slate-950 border-slate-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaOpen(false)} className="border-slate-700 text-slate-300">
              Cancelar
            </Button>
            <Button
              onClick={handleBaixa}
              disabled={processando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            >
              {processando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <AlertDialogContent className="bg-slate-900 border-white/10 text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Cancelar esta cobrança?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              O título ficará com status CANCELADO e deixará de contar como valor a receber. Esta ação pode ser revertida
              pela opção Reabrir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 bg-transparent hover:bg-slate-800">
              Manter
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelar();
              }}
              disabled={processando}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {processando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Cancelar cobrança
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
