import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BadgeCheck, Ban, Banknote, CalendarClock, CheckCircle2, Copy, CreditCard,
  Loader2, Mail, RotateCcw, Send, ShieldAlert, ShieldBan,
} from 'lucide-react';
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
  codigoOperacionalCobranca,
  isUuid,
  type CobrancaSituacao,
} from '../services/financeiro.service';

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const fmtDataHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
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

const REGUA_LABEL: Record<string, string> = {
  NENHUMA: '—',
  EM_COBRANCA: 'Em cobrança (lembretes)',
  CONTATO_1: '1º contato realizado',
  CONTATO_2: '2º contato realizado',
  CONTATO_3: '3º contato realizado',
  INADIMPLENTE: 'Inadimplente',
};

const EVENTO_LABEL: Record<string, string> = {
  COBRANCA_CRIADA: 'Cobrança criada manualmente',
  COBRANCA_GERADA_AUTOMATICA: 'Cobrança gerada automaticamente (recorrência)',
  PAGAMENTO_CONFIRMADO: 'Pagamento confirmado e conciliado',
  CLIENTE_REATIVADO: 'Cliente reativado (bloqueio removido)',
  CLIENTE_BLOQUEADO: 'Cliente bloqueado por inadimplência',
  CLIENTE_DESBLOQUEADO: 'Cliente desbloqueado manualmente',
  INADIMPLENCIA_REGISTRADA: 'Inadimplência registrada (após 3º contato)',
  SITUACAO_EM_COBRANCA: 'Entrou na régua de cobrança',
  SITUACAO_CONTATO_1: '1º contato programado',
  SITUACAO_CONTATO_2: '2º contato programado',
  SITUACAO_CONTATO_3: '3º contato programado',
  SITUACAO_INADIMPLENTE: 'Movido para inadimplência',
  COBRANCA_ENVIADA: 'Comunicação enviada ao cliente',
  COBRANCA_FALHA_ENVIO: 'Falha no envio de comunicação',
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
  const [desbloquearOpen, setDesbloquearOpen] = useState(false);
  const [meioPagamento, setMeioPagamento] = useState<string>('PIX');
  const [valorPago, setValorPago] = useState<string>('');
  const [processando, setProcessando] = useState(false);

  const podeAcessar = isOwner || isAdmin;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['central-cobranca', id],
    queryFn: () => financeiroService.getCobranca(id!),
    enabled: !!id && podeAcessar,
  });

  const { data: historico } = useQuery({
    queryKey: ['central-cobranca-historico', id],
    queryFn: () => financeiroService.getHistoricoCobranca(id!),
    enabled: !!id && podeAcessar,
  });

  const { data: contatosFin } = useQuery({
    queryKey: ['central-contatos-financeiros', id],
    queryFn: () =>
      data?.data?.cliente_id
        ? financeiroService.listarContatosFinanceiros(data.data.cliente_id)
        : Promise.resolve([]),
    enabled: podeAcessar && !!data?.data?.cliente_id,
  });

  const cobranca = data?.data ?? null;
  const situacao: CobrancaSituacao | null = cobranca
    ? deriveCobrancaSituacao(cobranca.status, cobranca.data_vencimento)
    : null;

  const diasEmAtraso = useMemo(() => {
    if (!cobranca) return 0;
    const venc = new Date(`${String(cobranca.data_vencimento).slice(0, 10)}T00:00:00`).getTime();
    return Math.max(0, Math.round((new Date(new Date().toDateString()).getTime() - venc) / 86400000));
  }, [cobranca]);

  const { data: servicosContrato } = useQuery({
    queryKey: ['central-servicos-contrato', cobranca?.contrato_id],
    queryFn: () => financeiroService.listServicosDeContrato(cobranca!.contrato_id!),
    enabled: podeAcessar && !!cobranca?.contrato_id,
  });

  const timelineEventos = useMemo(() => {
    if (!cobranca) return [];
    const evs: { titulo: string; quando: string; quandoISO: number; origem: string; ok: boolean }[] = [];
    evs.push({
      titulo: EVENTO_LABEL['COBRANCA_CRIADA'],
      quando: fmtDataHora(cobranca.created_at),
      quandoISO: new Date(cobranca.created_at).getTime() || 0,
      origem: cobranca.gerada_automaticamente ? 'Recorrência automática' : 'Manual',
      ok: true,
    });
    for (const ev of historico?.eventos || []) {
      if (/COBRANCA_(CRIADA|GERADA)/.test(ev.evento)) continue;
      evs.push({
        titulo: EVENTO_LABEL[ev.evento] || ev.evento,
        quando: fmtDataHora(ev.criado_em),
        quandoISO: new Date(ev.criado_em).getTime() || 0,
        origem: Object.entries(ev.detalhes || {})
          .filter(([k]) => ['dias_atraso', 'meio', 'valor_pago', 'regra', 'motivo'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ') || '—',
        ok: !/FALHA|BLOQUEADO|INADIMPLENCIA/.test(ev.evento),
      });
    }
    for (const j of historico?.jobsCobranca || []) {
      evs.push({
        titulo: `Contato ${j.evento.replace('COLECTION_', '')} — ${j.status}`,
        quando: fmtDataHora(j.processado_em || j.criado_em),
        quandoISO: new Date(j.processado_em || j.criado_em).getTime() || 0,
        origem: j.tentativas > 0 ? `tentativa(s): ${j.tentativas}/${j.max_tentativas}${j.erro_ultimo ? ` · erro: ${j.erro_ultimo}` : ''}` : 'na fila',
        ok: j.status === 'COMPLETED',
      });
    }
    return evs.sort((a, b) => b.quandoISO - a.quandoISO).slice(0, 40);
  }, [cobranca, historico]);

  const codigoOperacional = codigoOperacionalCobranca(cobranca);

  // URL legada (UUID) → redireciona para a URL canônica do código operacional.
  // O UUID continua resolvendo a entidade internamente; apenas deixa de ser a URL principal.
  useEffect(() => {
    if (!cobranca || !id || !isUuid(id)) return;
    if (codigoOperacional && codigoOperacional !== id) {
      navigate(`/financeiro/cobrancas/${encodeURIComponent(codigoOperacional)}`, { replace: true });
    }
  }, [cobranca, id, codigoOperacional, navigate]);

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
    queryClient.invalidateQueries({ queryKey: ['central-cobranca-historico', id] });
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
      toast({ title: 'Cobrança paga', description: 'Baixa conciliada; fluxo de inadimplência cancelado.' });
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

  const handleDesbloquear = async () => {
    if (!cobranca?.cliente_id) return;
    setProcessando(true);
    try {
      const r = await financeiroService.desbloquearCliente(cobranca.cliente_id);
      if (!r.success) {
        toast({ title: 'Não foi possível desbloquear', description: r.error, variant: 'destructive' });
        return;
      }
      setDesbloquearOpen(false);
      toast({ title: 'Cliente desbloqueado', description: 'Reativação registrada em auditoria.' });
      invalidar();
    } finally {
      setProcessando(false);
    }
  };

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(cobranca.id);
      toast({ title: 'UUID técnico copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(codigoOperacional);
      toast({ title: 'Código da cobrança copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const dadosGerais: { label: string; valor: string }[] = [
    { label: 'Cliente', valor: formatarNomeCliente(cobranca) },
    { label: 'Contrato', valor: cobranca.contrato?.numero_contrato || '—' },
    { label: 'Tipo de contrato', valor: cobranca.contrato?.tipo_contrato || '—' },
    { label: 'Serviço faturado', valor: servicosContrato?.[0]?.nome || cobranca.notes || '—' },
    { label: 'Parcela', valor: `${cobranca.numero_parcela} de ${cobranca.total_parcelas}` },
    { label: 'Documento', valor: cobranca.numero_documento || '—' },
    { label: 'Valor original', valor: brl(cobranca.valor) },
    { label: 'Pago / Saldo', valor: `${brl(cobranca.valor_pago ?? 0)} / ${brl(cobranca.saldo ?? cobranca.valor)}` },
    { label: 'Competência', valor: cobranca.competencia_date ? fmtData(cobranca.competencia_date) : '—' },
    { label: 'Vencimento', valor: `${fmtData(cobranca.data_vencimento)}${diasEmAtraso > 0 ? ` (${diasEmAtraso}d atraso)` : ''}` },
    { label: 'Método', valor: cobranca.metodo_cobranca || '—' },
    { label: 'Recorrência', valor: cobranca.recorrencia || 'AVULSA' },
    { label: 'Status', valor: cobranca.status },
    { label: 'Observações', valor: cobranca.notes || '—' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Button variant="outline" size="sm" onClick={() => navigate('/financeiro/cobrancas')} className="gap-2 border-slate-700 text-slate-300 mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para a Central
          </Button>
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-3">
            {codigoOperacional ? (
              <span className="font-mono tracking-tight text-emerald-400">{codigoOperacional}</span>
            ) : (
              'Detalhes da Cobrança'
            )}
            {situacao && <Badge className={`${SITUACAO_BADGE[situacao]} border text-[11px]`}>{SITUACAO_LABEL[situacao]}</Badge>}
          </h2>
          <button type="button" onClick={copiarId} title="Identificador técnico interno" className="text-[10px] text-slate-600 hover:text-slate-400 inline-flex items-center gap-1 font-mono w-fit">
            {cobranca.numero_documento || cobranca.codigo_operacional || '—'}… <Copy className="h-2.5 w-2.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {podeDarBaixa && (
            <Button onClick={() => { setValorPago(String(cobranca.valor)); setBaixaOpen(true); }} disabled={processando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4" /> Marcar como paga
            </Button>
          )}
          {podeReabrir && (
            <Button variant="outline" onClick={handleReabrir} disabled={processando}
              className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10 gap-2 text-xs">
              <RotateCcw className="h-4 w-4" /> Reabrir
            </Button>
          )}
          {podeCancelar && (
            <Button variant="outline" onClick={() => setCancelarOpen(true)} disabled={processando}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 gap-2 text-xs">
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

      {/* RÉGUA / CONTATOS */}
      {(cobranca.situacao_cobranca && cobranca.situacao_cobranca !== 'NENHUMA') && (
        <Card className="border-amber-500/20 bg-amber-950/10 backdrop-blur-xl rounded-2xl">
          <CardContent className="py-4 px-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-white">{REGUA_LABEL[cobranca.situacao_cobranca]}</p>
                <p className="text-xs text-slate-400">Política padrão: lembretes antes do vencimento; contatos D+1, D+3 e D+5 após atraso.</p>
              </div>
            </div>
            <Badge className="border border-rose-500/30 bg-rose-500/10 text-rose-300 text-[11px]">
              {diasEmAtraso} dia(s) em atraso
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* CONTAS A RECEBER — a cobrança é a conta a receber (mesma linha, 1:1) */}
      <Card className="border border-emerald-500/20 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
        <CardHeader className="border-b border-white/10 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-400" /> Contas a Receber
          </CardTitle>
          {codigoOperacional && (
            <button type="button" onClick={copiarCodigo} className="text-[10px] text-slate-500 hover:text-primary inline-flex items-center gap-1 font-mono">
              CR · {codigoOperacional} <Copy className="h-3 w-3" />
            </button>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Valor original', valor: brl(cobranca.valor), cor: 'text-slate-100' },
              { label: 'Valor recebido', valor: brl(cobranca.valor_pago ?? 0), cor: 'text-emerald-400' },
              { label: 'Saldo em aberto', valor: brl(cobranca.saldo ?? cobranca.valor), cor: Number(cobranca.saldo ?? cobranca.valor) > 0 ? 'text-amber-400' : 'text-emerald-400' },
              { label: 'Vencimento', valor: fmtData(cobranca.data_vencimento), cor: 'text-slate-200' },
              { label: 'Status', valor: cobranca.status, cor: 'text-slate-200' },
              { label: 'Criada em', valor: fmtData(cobranca.created_at), cor: 'text-slate-400' },
            ].map((d) => (
              <div key={d.label} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{d.label}</span>
                <p className={`text-sm font-bold ${d.cor} break-words`}>{d.valor}</p>
              </div>
            ))}
          </div>
          {(cobranca.pagamentos?.length || historico?.pagamentos?.length) ? (
            <p className="text-[11px] text-slate-500">
              {Math.max(cobranca.pagamentos?.length || 0, historico?.pagamentos?.length || 0)} baixa(s) registrada(s) — detalhes na seção Pagamentos vinculados abaixo.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">Nenhuma baixa registrada até o momento.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">Dados da cobrança</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {dadosGerais.map((d) => (
              <div key={d.label} className="space-y-0.5">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">{d.label}</span>
                <p className="text-sm text-slate-200 break-words">{d.valor}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">Contato financeiro</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {(contatosFin || []).length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <Mail className="h-6 w-6 mx-auto text-slate-600" />
                <p className="text-xs text-slate-500">
                  Nenhum contato financeiro configurado. O fallback seguro (contato principal da empresa) será usado nos envios.
                </p>
              </div>
            ) : (
              (contatosFin || []).map((c, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-0.5">
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {c.nome}
                    {c.financeiro && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px]">financeiro</Badge>}
                    {c.principal && <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 text-[9px]">principal</Badge>}
                  </p>
                  <p className="text-[11px] text-slate-400">{c.email || 'sem e-mail'} · {c.cargo || '—'}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">Histórico completo</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 max-h-96 overflow-y-auto">
            {timelineEventos.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Sem eventos registrados ainda.</p>
            ) : (
              <ol className="space-y-4">
                {timelineEventos.map((ev, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${ev.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{ev.titulo}</p>
                      <p className="text-[11px] text-slate-500 break-words">{ev.origem}</p>
                      <p className="text-[11px] text-slate-600">{ev.quando}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
            <CardHeader className="border-b border-white/10 pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-400" /> Pagamentos vinculados ({(historico?.pagamentos || cobranca.pagamentos)?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {!(historico?.pagamentos || cobranca.pagamentos)?.length ? (
                <div className="text-center py-6 space-y-2">
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
                      {(historico?.pagamentos || cobranca.pagamentos || []).map((pg: any) => (
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

          {cobranca.situacao_cobranca === 'INADIMPLENTE' && (
            <Card className="border-rose-500/30 bg-rose-950/10 backdrop-blur-xl rounded-2xl">
              <CardContent className="pt-5 pb-5 px-5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <ShieldBan className="h-5 w-5 text-rose-400" />
                  <p className="text-xs text-slate-300 max-w-xs">
                    Cliente em inadimplência. Após regularizar todos os títulos, o bloqueio é removido automaticamente.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDesbloquearOpen(true)} disabled={processando}
                  className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 gap-2 text-xs">
                  <Send className="h-3.5 w-3.5" /> Desbloquear manualmente
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={baixaOpen} onOpenChange={setBaixaOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Registrar baixa da cobrança</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Meio de pagamento *</Label>
              <Select value={meioPagamento} onValueChange={setMeioPagamento}>
                <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-950 border-slate-700">
                  {MEIOS_PAGAMENTO.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Valor pago (R$)</Label>
              <Input inputMode="decimal" value={valorPago} onChange={(e) => setValorPago(e.target.value)} className="bg-slate-950 border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaOpen(false)} className="border-slate-700 text-slate-300">Cancelar</Button>
            <Button onClick={handleBaixa} disabled={processando} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
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
              O título ficará com status CANCELADO e deixará de contar como valor a receber.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 bg-transparent hover:bg-slate-800">Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCancelar(); }}
              disabled={processando}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {processando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Cancelar cobrança
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={desbloquearOpen} onOpenChange={setDesbloquearOpen}>
        <AlertDialogContent className="bg-slate-900 border-white/10 text-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Desbloquear o cliente?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              O desbloqueio manual fica registrado em auditoria com seu usuário e motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 bg-transparent hover:bg-slate-800">Manter bloqueio</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDesbloquear(); }}
              disabled={processando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Confirmar desbloqueio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
