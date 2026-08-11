import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { piService, PICompleto, PIStatus } from '../services/pi.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Layers, Plus, Search, FileText, Clock, CheckCircle2,
  XCircle, ArrowRight, TrendingUp, AlertCircle,
  Calendar, Building2, FileCheck, Activity, Loader2,
  Eye, ChevronRight, Package
} from 'lucide-react';

// ── Status Config (10 estados do PI Master) ───────────────────────────────
const PI_STATUS_CONFIG: Record<PIStatus, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  EM_ELABORACAO:        { label: 'Em Elaboração',        color: 'text-slate-300',  bg: 'bg-slate-700/50',   border: 'border-slate-600/50', icon: FileText },
  AGUARDANDO_MATERIAL:  { label: 'Aguard. Material',     color: 'text-amber-300',  bg: 'bg-amber-900/30',   border: 'border-amber-600/30', icon: Clock },
  MATERIAL_RECEBIDO:    { label: 'Material Recebido',    color: 'text-blue-300',   bg: 'bg-blue-900/30',    border: 'border-blue-600/30',  icon: Package },
  EM_PRODUCAO:          { label: 'Em Produção',          color: 'text-violet-300', bg: 'bg-violet-900/30',  border: 'border-violet-600/30',icon: Activity },
  AGUARDANDO_APROVACAO: { label: 'Aguard. Aprovação',    color: 'text-orange-300', bg: 'bg-orange-900/30',  border: 'border-orange-600/30',icon: AlertCircle },
  APROVADO:             { label: 'Aprovado',             color: 'text-emerald-300',bg: 'bg-emerald-900/30', border: 'border-emerald-600/30',icon: CheckCircle2 },
  AGENDADO:             { label: 'Agendado',             color: 'text-cyan-300',   bg: 'bg-cyan-900/30',    border: 'border-cyan-600/30',  icon: Calendar },
  EM_EXIBICAO:          { label: '🔴 Em Exibição',       color: 'text-rose-300',   bg: 'bg-rose-900/40',    border: 'border-rose-500/40',  icon: TrendingUp },
  FINALIZADO:           { label: 'Finalizado',           color: 'text-green-300',  bg: 'bg-green-900/30',   border: 'border-green-600/30', icon: CheckCircle2 },
  CANCELADO:            { label: 'Cancelado',            color: 'text-red-400',    bg: 'bg-red-900/20',     border: 'border-red-700/30',   icon: XCircle },
};

// ── Priority Badge ────────────────────────────────────────────────────────
const PRIORIDADE_CONFIG = {
  BAIXA:   { label: 'Baixa',   class: 'bg-slate-700/60 text-slate-300 border-slate-600/40' },
  MEDIA:   { label: 'Média',   class: 'bg-blue-900/40 text-blue-300 border-blue-600/30' },
  ALTA:    { label: 'Alta',    class: 'bg-amber-900/40 text-amber-300 border-amber-600/40' },
  URGENTE: { label: '🔴 URGENTE', class: 'bg-rose-900/50 text-rose-300 border-rose-600/40' },
};

function StatusBadge({ status }: { status: PIStatus }) {
  const cfg = PI_STATUS_CONFIG[status] || PI_STATUS_CONFIG.EM_ELABORACAO;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function PIModal({ pi, onClose, onStatusChange }: { pi: PICompleto; onClose: () => void; onStatusChange: () => void }) {
  const { user } = useAuth();
  const [changing, setChanging] = useState(false);

  const handleStatus = async (next: PIStatus) => {
    setChanging(true);
    await piService.changeStatus(pi.id, next, `Transição manual para ${next}`, user?.id);
    setChanging(false);
    onStatusChange();
  };

  const cfg = PI_STATUS_CONFIG[pi.status] || PI_STATUS_CONFIG.EM_ELABORACAO;
  const pricfg = PRIORIDADE_CONFIG[pi.prioridade] || PRIORIDADE_CONFIG.MEDIA;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border border-white/10 text-white max-w-3xl rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-bold">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <span>{pi.numero_pi}</span>
            <StatusBadge status={pi.status} />
            <span className={`ml-auto text-xs px-2 py-1 rounded-lg border font-semibold ${pricfg.class}`}>{pricfg.label}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="mt-2">
          <TabsList className="bg-slate-800/60 border border-white/5 rounded-xl w-full grid grid-cols-4">
            <TabsTrigger value="geral"    className="rounded-lg data-[state=active]:bg-primary/20 text-xs">Geral</TabsTrigger>
            <TabsTrigger value="operacao" className="rounded-lg data-[state=active]:bg-primary/20 text-xs">Operação</TabsTrigger>
            <TabsTrigger value="workflow" className="rounded-lg data-[state=active]:bg-primary/20 text-xs">Workflow</TabsTrigger>
            <TabsTrigger value="historico"className="rounded-lg data-[state=active]:bg-primary/20 text-xs">Histórico</TabsTrigger>
          </TabsList>

          {/* ── ABA GERAL ─────────────────────────────────── */}
          <TabsContent value="geral" className="mt-4 space-y-4">
            <div className={`p-4 rounded-xl border ${cfg.border} ${cfg.bg}`}>
              <p className="text-xs text-slate-400 mb-1">Título da Campanha</p>
              <p className="font-bold text-white text-lg">{pi.titulo}</p>
              {pi.descricao && <p className="text-slate-300 text-xs mt-2">{pi.descricao}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5">
                <p className="text-xs text-slate-400">Cliente</p>
                <p className="font-semibold text-white text-sm mt-1 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  {pi.cliente?.nome_fantasia || pi.cliente?.razao_social || '—'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5">
                <p className="text-xs text-slate-400">Contrato Origem</p>
                <p className="font-semibold text-white text-sm mt-1 flex items-center gap-1">
                  <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {pi.contrato?.numero_contrato || '—'}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── ABA OPERAÇÃO ──────────────────────────────── */}
          <TabsContent value="operacao" className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5 text-center">
                <p className="text-xs text-slate-400">Início</p>
                <p className="font-bold text-white text-sm mt-1">{pi.inicio_veiculacao || '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5 text-center">
                <p className="text-xs text-slate-400">Fim</p>
                <p className="font-bold text-white text-sm mt-1">{pi.fim_veiculacao || '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5 text-center">
                <p className="text-xs text-slate-400">Peças</p>
                <p className="font-bold text-white text-2xl mt-1">{pi.quantidade_pecas || 1}</p>
              </div>
            </div>
            {pi.observacoes && (
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5">
                <p className="text-xs text-slate-400 mb-1">Briefing / Instruções</p>
                <p className="text-sm text-slate-200">{pi.observacoes}</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-white/5">
              <p className="text-xs text-slate-400 mb-1">Locais de Exibição</p>
              {pi.locais && pi.locais.length > 0 ? (
                <div className="space-y-1">
                  {pi.locais.map(loc => (
                    <div key={loc.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <ChevronRight className="h-3 w-3 text-primary" />
                      {loc.unidade?.nome || loc.tela_id || 'Local vinculado'}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Nenhum local vinculado ainda.</p>
              )}
            </div>
          </TabsContent>

          {/* ── ABA WORKFLOW ──────────────────────────────── */}
          <TabsContent value="workflow" className="mt-4">
            <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-600/30 mb-4">
              <p className="text-xs text-amber-300 font-semibold">⚠️ REGRA DE DOMÍNIO</p>
              <p className="text-xs text-amber-200 mt-1">Transições devem refletir eventos reais de negócio. Não cancele PIs sem motivo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PI_STATUS_CONFIG) as PIStatus[])
                .filter(s => s !== pi.status && s !== 'CANCELADO')
                .map(s => {
                  const c = PI_STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatus(s)}
                      disabled={changing}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all hover:scale-[1.02] ${c.bg} ${c.color} ${c.border}`}
                    >
                      <ArrowRight className="h-3 w-3 inline mr-1" />
                      {c.label}
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => handleStatus('CANCELADO')}
              disabled={changing}
              className="mt-3 w-full p-2.5 rounded-xl border border-red-700/40 bg-red-900/20 text-red-400 text-xs font-semibold hover:bg-red-900/40 transition-all"
            >
              <XCircle className="h-3.5 w-3.5 inline mr-1" />
              Cancelar PI
            </button>
            {changing && <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando...</div>}
          </TabsContent>

          {/* ── ABA HISTÓRICO ─────────────────────────────── */}
          <TabsContent value="historico" className="mt-4">
            {pi.historico && pi.historico.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {pi.historico.map(h => (
                  <div key={h.id} className="p-3 rounded-xl bg-slate-800/60 border border-white/5 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      {h.status_anterior && (
                        <>
                          <StatusBadge status={h.status_anterior as PIStatus} />
                          <ArrowRight className="h-3 w-3 text-slate-500" />
                        </>
                      )}
                      <StatusBadge status={h.status_novo as PIStatus} />
                    </div>
                    <p className="text-slate-300">{h.descricao}</p>
                    <p className="text-slate-500 mt-1">{new Date(h.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic text-center py-8">Nenhum evento registrado no histórico.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function PedidoInsercaoListPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();

  const [pis, setPIs]         = useState<PICompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [selectedPI, setSelectedPI]     = useState<PICompleto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await piService.listPI(empresaOperadoraId ?? undefined);
    setPIs(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ─────────────────────────────────────────────────
  const total        = pis.length;
  const emExibicao   = pis.filter(p => p.status === 'EM_EXIBICAO').length;
  const aguardando   = pis.filter(p => ['AGUARDANDO_MATERIAL','AGUARDANDO_APROVACAO'].includes(p.status)).length;
  const finalizados  = pis.filter(p => p.status === 'FINALIZADO').length;
  const emElaboracao = pis.filter(p => p.status === 'EM_ELABORACAO').length;

  // ── Filter ───────────────────────────────────────────────
  const filtered = pis
    .filter(p => {
      const q = search.toLowerCase();
      return (
        p.numero_pi?.toLowerCase().includes(q) ||
        p.titulo?.toLowerCase().includes(q) ||
        p.cliente?.nome_fantasia?.toLowerCase().includes(q) ||
        p.contrato?.numero_contrato?.toLowerCase().includes(q)
      );
    })
    .filter(p => filterStatus === 'TODOS' || p.status === filterStatus);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── HEADER ─────────────────────────────────────── */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/15 border border-primary/20">
              <Layers className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">Pedidos de Inserção</h1>
              <p className="text-slate-400 text-xs mt-0.5">PI Master — Documento operacional central do fluxo Contrato → Campanha</p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/representantes/contratos')}
            className="gradient-primary glow-primary rounded-xl gap-2 font-bold shadow-xl hover:scale-105 transition-all text-xs h-10"
          >
            <Plus className="h-4 w-4" />
            Novo PI (via Contrato)
          </Button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total de PIs',   value: total,        icon: FileText,    color: 'text-white',       bg: 'bg-slate-800/60',   border: 'border-white/10' },
          { label: 'Em Exibição',    value: emExibicao,   icon: TrendingUp,  color: 'text-rose-300',    bg: 'bg-rose-900/30',    border: 'border-rose-600/30' },
          { label: 'Aguardando',     value: aguardando,   icon: Clock,       color: 'text-amber-300',   bg: 'bg-amber-900/30',   border: 'border-amber-600/30' },
          { label: 'Em Elaboração',  value: emElaboracao, icon: Activity,    color: 'text-violet-300',  bg: 'bg-violet-900/30',  border: 'border-violet-600/30' },
          { label: 'Finalizados',    value: finalizados,  icon: CheckCircle2,color: 'text-emerald-300', bg: 'bg-emerald-900/30', border: 'border-emerald-600/30' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`p-4 rounded-2xl border ${k.bg} ${k.border} flex flex-col gap-1`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${k.color}`} />
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
              <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── REGRA OPERACIONAL ──────────────────────────── */}
      <div className="p-4 rounded-xl border border-emerald-600/30 bg-emerald-900/20 flex items-start gap-3">
        <FileCheck className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-emerald-300">REGRA DE DOMÍNIO — PI MASTER</p>
          <p className="text-xs text-emerald-200 mt-0.5">
            Todo PI deve ter origem em um <strong>Contrato aprovado</strong>. Campanhas sem PI são bloqueadas.
            Fluxo obrigatório: <strong>Contrato → PI → Campanha → Agendamento → Exibição → NOC</strong>
          </p>
        </div>
      </div>

      {/* ── FILTROS ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nº PI, campanha, cliente, contrato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-slate-900/60 border-white/10 text-white rounded-xl h-11"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['TODOS', 'EM_ELABORACAO', 'EM_EXIBICAO', 'AGUARDANDO_MATERIAL', 'APROVADO', 'FINALIZADO', 'CANCELADO'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                filterStatus === s
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-slate-800/60 text-slate-400 border-white/10 hover:border-white/20'
              }`}
            >
              {s === 'TODOS' ? 'Todos' : (PI_STATUS_CONFIG[s as PIStatus]?.label || s)}
            </button>
          ))}
        </div>
      </div>

      {/* ── LIST ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border border-white/10 bg-slate-900/60 rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="p-4 rounded-full bg-slate-800/80 border border-white/10">
              <Layers className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-white font-bold">Nenhum PI encontrado</p>
            <p className="text-slate-400 text-xs max-w-xs">
              Para emitir um PI, acesse a tela de Contratos, selecione um contrato ativo e clique em "Emitir PI".
            </p>
            <Button
              onClick={() => navigate('/representantes/contratos')}
              className="gradient-primary rounded-xl gap-2 text-xs mt-2"
            >
              <ArrowRight className="h-4 w-4" />
              Ir para Contratos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(pi => {
            const cfg  = PI_STATUS_CONFIG[pi.status] || PI_STATUS_CONFIG.EM_ELABORACAO;
            const pcfg = PRIORIDADE_CONFIG[pi.prioridade] || PRIORIDADE_CONFIG.MEDIA;
            const Icon = cfg.icon;

            return (
              <div
                key={pi.id}
                className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-sm hover:border-primary/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
                onClick={() => setSelectedPI(pi)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Nº PI */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-xl border shrink-0 ${cfg.bg} ${cfg.border}`}>
                      <Icon className={`h-5 w-5 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-white text-sm">{pi.numero_pi}</span>
                        <StatusBadge status={pi.status} />
                        <span className={`text-xs px-2 py-0.5 rounded-lg border font-semibold ${pcfg.class}`}>{pcfg.label}</span>
                      </div>
                      <p className="text-slate-300 text-xs mt-0.5 truncate">{pi.titulo}</p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
                    <div className="hidden sm:flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      <span className="max-w-[120px] truncate">{pi.cliente?.nome_fantasia || '—'}</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1">
                      <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-mono">{pi.contrato?.numero_contrato || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{pi.inicio_veiculacao || '—'} → {pi.fim_veiculacao || '—'}</span>
                    </div>
                    <Eye className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL 360º ─────────────────────────────────── */}
      {selectedPI && (
        <PIModal
          pi={selectedPI}
          onClose={() => setSelectedPI(null)}
          onStatusChange={() => { load(); setSelectedPI(null); }}
        />
      )}
    </div>
  );
}
