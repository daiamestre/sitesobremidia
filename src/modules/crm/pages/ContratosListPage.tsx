import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { contratoService, ContratoCompleto } from '@/modules/crm/services/contrato.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  FileText, Search, Filter, Loader2, RefreshCw, Plus,
  Calendar, DollarSign, Building2, CheckCircle2, XCircle,
  Clock, Zap, BarChart3, TrendingUp, Eye, AlertTriangle
} from 'lucide-react';

// ─── Status Helpers ──────────────────────────────────────────────────────────

const STATUS_WORKFLOW_MAP: Record<string, { label: string; color: string }> = {
  PROSPECT:              { label: 'Prospecção',       color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  PROPOSTA_GERADA:       { label: 'Proposta Gerada',  color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  AGUARDANDO_ASSINATURA: { label: 'Ag. Assinatura',   color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  AGUARDANDO_PAGAMENTO:  { label: 'Ag. Pagamento',    color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  PAGAMENTO_CONFIRMADO:  { label: 'Pag. Confirmado',  color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  EM_PRODUCAO:           { label: 'Em Produção',      color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  AGUARDANDO_APROVACAO:  { label: 'Ag. Aprovação',    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  CAMPANHA_APROVADA:     { label: 'Campanha Aprov.',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  CAMPANHA_ATIVA:        { label: 'Campanha Ativa',   color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  CAMPANHA_FINALIZADA:   { label: 'Finalizada',       color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  CANCELADO:             { label: 'Cancelado',        color: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const STATUS_DOC_MAP: Record<string, { label: string; icon: React.ReactNode }> = {
  RASCUNHO: { label: 'Rascunho',  icon: <Clock className="h-3.5 w-3.5" /> },
  GERADO:   { label: 'Gerado',    icon: <FileText className="h-3.5 w-3.5" /> },
  ENVIADO:  { label: 'Enviado',   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ASSINADO: { label: 'Assinado',  icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> },
  CANCELADO:{ label: 'Cancelado', icon: <XCircle className="h-3.5 w-3.5 text-red-400" /> },
};

// ─── Contrato 360 Modal ───────────────────────────────────────────────────────

function Contrato360Modal({ contrato, onClose }: { contrato: ContratoCompleto; onClose: () => void }) {
  const navigate = useNavigate();
  const statusWf = STATUS_WORKFLOW_MAP[contrato.status_workflow] ?? { label: contrato.status_workflow, color: '' };
  const statusDoc = STATUS_DOC_MAP[contrato.status_documento] ?? { label: contrato.status_documento, icon: null };
  const empresaNome = (contrato as any).empresa?.nome_fantasia || (contrato as any).empresa?.razao_social || '—';

  const tabs = ['Visão Geral', 'Financeiro', 'Operacional', 'Auditoria'];
  const [tab, setTab] = useState(0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-900 border-white/10 text-white rounded-2xl p-0 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-white/10 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-xs font-mono text-primary font-bold uppercase tracking-widest">{contrato.numero_contrato}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusWf.color}`}>{statusWf.label}</span>
              </div>
              <DialogTitle className="text-xl font-bold text-white">{empresaNome}</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs mt-0.5">
                {contrato.tipo_contrato} · Doc: {statusDoc.label} · Vigência: {contrato.data_inicio} → {contrato.data_fim}
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-white text-xs"
              onClick={() => navigate(`/representantes/contratos/selecionar/${contrato.proposta_id}`)}
            >
              Editar Contrato
            </Button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b border-white/10 pb-0">
            {tabs.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-t-lg transition-all ${
                  tab === i
                    ? 'bg-primary/20 text-primary border-b-2 border-primary'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[480px] space-y-4">
          {tab === 0 && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Número do Contrato', value: contrato.numero_contrato, mono: true },
                { label: 'Tipo', value: contrato.tipo_contrato || '—' },
                { label: 'Status Workflow', value: statusWf.label },
                { label: 'Status Documento', value: statusDoc.label },
                { label: 'Cliente ID', value: contrato.cliente_id, mono: true },
                { label: 'Proposta de Origem', value: (contrato as any).proposta?.numero_proposta || contrato.proposta_id, mono: true },
                { label: 'Forma de Pagamento', value: contrato.forma_pagamento },
                { label: 'Data Início', value: contrato.data_inicio },
                { label: 'Data Fim', value: contrato.data_fim },
                { label: 'Template', value: (contrato as any).template_nome || '—' },
              ].map(({ label, value, mono }) => (
                <div key={label} className="bg-slate-950/60 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className={`text-sm font-semibold text-white ${mono ? 'font-mono' : ''}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 1 && (
            <div className="space-y-3">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-400">Valor Mensal Contratado</p>
                  <p className="text-2xl font-mono font-extrabold text-emerald-400 mt-1">
                    R$ {Number(contrato.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <DollarSign className="h-10 w-10 text-emerald-400/30" />
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-slate-400 mb-1">Proposta de Origem (valor aprovado)</p>
                <p className="text-lg font-mono font-bold text-cyan-400">
                  R$ {Number((contrato as any).proposta?.valor_final || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  Contas a receber serão geradas automaticamente quando o status passar para <strong>PAGAMENTO_CONFIRMADO</strong>. Nenhuma cobrança é emitida enquanto o contrato não estiver ativo.
                </p>
              </div>
            </div>
          )}

          {tab === 2 && (
            <div className="space-y-3">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5">
                <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Preparação do Pedido de Inserção (PI)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: 'Cliente', value: empresaNome },
                    { label: 'Período', value: `${contrato.data_inicio} → ${contrato.data_fim}` },
                    { label: 'Valor Mensal', value: `R$ ${Number(contrato.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
                    { label: 'Forma de Pagamento', value: contrato.forma_pagamento },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-900/80 p-2 rounded border border-white/5">
                      <span className="text-slate-400">{label}: </span>
                      <span className="text-white font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2 items-start">
                <BarChart3 className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-300">
                  O PI completo será criado na <strong>FASE 8.4-C (Campanhas + PI + Telas + NOC)</strong>. As informações de plano contratado, quantidade de telas e frequência serão adicionadas nessa etapa.
                </p>
              </div>
            </div>
          )}

          {tab === 3 && (
            <div className="space-y-2">
              {[
                { ev: 'CONTRATO_GERADO', desc: 'Conversão de proposta aprovada para contrato.', ts: contrato.data_selecao || contrato.data_inicio },
                { ev: 'STATUS_WORKFLOW', desc: `Workflow atual: ${statusWf.label}`, ts: contrato.data_inicio },
                { ev: 'DOCUMENTO_STATUS', desc: `Documento: ${statusDoc.label}`, ts: contrato.data_inicio },
              ].map(({ ev, desc, ts }) => (
                <div key={ev} className="bg-slate-950/60 p-3 rounded-lg border border-white/5 flex justify-between items-start">
                  <div>
                    <p className="text-xs font-mono text-primary font-bold">{ev}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0 ml-4">{ts ? new Date(ts).toLocaleDateString('pt-BR') : '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContratosListPage() {
  const navigate = useNavigate();
  const { representante } = useAuth();
  const { toast } = useToast();

  const [contratos, setContratos] = useState<ContratoCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [contrato360, setContrato360] = useState<ContratoCompleto | null>(null);

  const loadContratos = useCallback(async () => {
    setLoading(true);
    const data = await contratoService.findAll(representante?.id);
    setContratos(data);
    setLoading(false);
  }, [representante]);

  useEffect(() => {
    loadContratos();
  }, [loadContratos]);

  // KPIs
  const totalAtivos = contratos.filter(c => c.status_workflow === 'CAMPANHA_ATIVA').length;
  const totalValor = contratos
    .filter(c => !['CANCELADO'].includes(c.status_workflow))
    .reduce((s, c) => s + Number(c.valor_mensal || 0), 0);
  const totalAguardando = contratos.filter(c => ['AGUARDANDO_ASSINATURA', 'AGUARDANDO_PAGAMENTO'].includes(c.status_workflow)).length;

  const contratosFiltrados = contratos.filter(c => {
    const empresaNome = ((c as any).empresa?.nome_fantasia || (c as any).empresa?.razao_social || '').toLowerCase();
    const matchBusca = !busca || empresaNome.includes(busca.toLowerCase()) || c.numero_contrato.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === 'TODOS' || c.status_workflow === filtroStatus;
    return matchBusca && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-white flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Gestão de Contratos
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Ponte entre Comercial e Operacional · Pipeline: Proposta → Contrato → PI → Campanha
          </p>
        </div>
        <Button
          onClick={() => navigate('/representantes/propostas')}
          className="gradient-primary glow-primary font-bold shadow-lg gap-2"
        >
          <Plus className="h-4 w-4" />
          Novo Contrato via Proposta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total de Contratos', value: contratos.length, icon: <FileText className="h-5 w-5" />, color: 'text-white' },
          { label: 'Campanhas Ativas', value: totalAtivos, icon: <Zap className="h-5 w-5" />, color: 'text-emerald-400' },
          { label: 'Valor Mensal Total', value: `R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-cyan-400' },
          { label: 'Pendentes', value: totalAguardando, icon: <Clock className="h-5 w-5" />, color: 'text-amber-400' },
        ].map(({ label, value, icon, color }) => (
          <Card key={label} className="bg-slate-900/80 border-white/10 rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${color} opacity-60`}>{icon}</div>
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por número ou empresa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10 bg-slate-900/80 border-white/10 text-white rounded-xl h-10 text-sm"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-56 bg-slate-900/80 border-white/10 text-white rounded-xl h-10 text-xs">
            <Filter className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-white/10 text-white">
            <SelectItem value="TODOS">Todos os Status</SelectItem>
            {Object.entries(STATUS_WORKFLOW_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="border-white/10 text-white h-10"
          onClick={loadContratos}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Lista */}
      {contratosFiltrados.length === 0 ? (
        <Card className="bg-slate-900/60 border-white/10 text-center py-16">
          <CardContent>
            <FileText className="h-14 w-14 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-300 font-semibold text-lg">
              {contratos.length === 0 ? 'Nenhum contrato registrado' : 'Nenhum contrato corresponde ao filtro'}
            </p>
            <p className="text-slate-400 text-sm mt-2 mb-6 max-w-md mx-auto">
              Para criar um contrato, abra uma <strong>Proposta APROVADA</strong> em <code>/representantes/propostas</code> e clique em <em>Converter para Contrato</em>.
            </p>
            <Button
              variant="outline"
              className="border-white/10 text-white"
              onClick={() => navigate('/representantes/propostas')}
            >
              Ir para Propostas Comerciais
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {contratosFiltrados.map((c) => {
            const empresaNome = (c as any).empresa?.nome_fantasia || (c as any).empresa?.razao_social || 'Empresa';
            const statusWf = STATUS_WORKFLOW_MAP[c.status_workflow] ?? { label: c.status_workflow, color: 'bg-slate-500/15 text-slate-400' };
            const statusDoc = STATUS_DOC_MAP[c.status_documento] ?? { label: c.status_documento, icon: null };
            const propNome = (c as any).proposta?.numero_proposta || '—';
            const isActive = c.status_workflow === 'CAMPANHA_ATIVA';

            return (
              <Card
                key={c.id}
                className={`bg-slate-900/80 border-white/10 hover:border-primary/40 transition-all rounded-xl shadow-xl cursor-pointer ${isActive ? 'ring-1 ring-emerald-500/30' : ''}`}
                onClick={() => setContrato360(c)}
              >
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-primary font-bold">{c.numero_contrato}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${statusWf.color}`}>{statusWf.label}</span>
                        {isActive && <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold"><TrendingUp className="h-3 w-3" />Ativo</span>}
                      </div>
                      <CardTitle className="text-base font-bold text-white truncate">{empresaNome}</CardTitle>
                      <CardDescription className="text-xs text-slate-400">
                        Origem: {propNome} · Tipo: {c.tipo_contrato || 'N/D'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                      {statusDoc.icon}
                      <span>{statusDoc.label}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-between items-center bg-slate-950/60 p-3 rounded-lg border border-white/5">
                    <div>
                      <p className="text-xs text-slate-400">Valor Mensal</p>
                      <p className="text-lg font-mono font-extrabold text-emerald-400">
                        R$ {Number(c.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Vigência</p>
                      <p className="text-xs text-slate-300 font-mono">
                        {c.data_inicio} → {c.data_fim}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-white/10 text-white text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); setContrato360(c); }}
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver 360°
                    </Button>
                    <Button
                      size="sm"
                      className="w-full bg-primary/90 hover:bg-primary text-white text-xs gap-1 font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.proposta_id) {
                          navigate(`/representantes/contratos/selecionar/${c.proposta_id}`);
                        } else {
                          toast({ title: 'Sem proposta vinculada', variant: 'destructive' });
                        }
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" /> Editar / Gerar PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal 360° */}
      {contrato360 && (
        <Contrato360Modal
          contrato={contrato360}
          onClose={() => setContrato360(null)}
        />
      )}
    </div>
  );
}
