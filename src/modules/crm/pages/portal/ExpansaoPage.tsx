import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, Loader2, MapPin, Monitor, CheckCircle2, XCircle, Clock,
  ArrowLeftRight, PackageOpen, Send, CircleDollarSign, Search, Sparkles,
} from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';
import type { Expansao, EstabelecimentoDisponivel } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';
import { AIPointSearch } from '../../components/portal/AIPointSearch';

// ──────────────────────────────────────────────────────────────────────
// PONTOS PARA ANUNCIAR (missão §29–§34): marketplace real de pontos
// parceiros disponíveis no tenant, alimentado pela tabela `pontos`.
// Solicitação via RPC solicitar_novo_ponto → Central de Comunicação.
// ──────────────────────────────────────────────────────────────────────

interface PontoParaAnunciar {
  ponto_id: string;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  logradouro?: string | null;
  foto_url?: string | null;
  valor_anuncio?: number | null;
  periodicidade?: string | null;
  quantidade_telas: number;
  disponibilidade: string;
}

const PERIODICIDADE_LABELS: Record<string, string> = {
  MENSAL: '/mês',
  TRIMESTRAL: '/trimestre',
  SEMESTRAL: '/semestre',
  ANUAL: '/ano',
  UNICO: 'único',
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  SOLICITADA: { label: 'Solicitada', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  APROVADA: { label: 'Aprovada', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  REJEITADA: { label: 'Rejeitada', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: XCircle },
  CANCELADA: { label: 'Cancelada', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: XCircle },
};

// Status de `solicitacoes` (Central) mapeados para a UI do portal
const STATUS_SOLICITACAO_CONFIG: Record<string, { label: string; className: string }> = {
  PENDENTE: { label: 'Em análise', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  APROVADA: { label: 'Aprovada', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  REJEITADA: { label: 'Não aprovada', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  CANCELADA: { label: 'Cancelada', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  EXPIRADA: { label: 'Expirada', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

interface SolicitacaoNovoPonto {
  id: string;
  titulo: string;
  descricao?: string | null;
  status: string;
  decisao_motivo?: string | null;
  created_at: string;
}

export default function ExpansaoPage() {
  const { usuario, empresaOperadoraId } = useAuth();
  const { toast } = useToast();

  const [expansoes, setExpansoes] = useState<Expansao[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'encontrar' | 'historico'>('marketplace');

  const [dialogAberta, setDialogAberta] = useState(false);
  const [estabelecimentosDialog, setEstabelecimentosDialog] = useState<EstabelecimentoDisponivel[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Marketplace de pontos parceiros
  const [pontosMercado, setPontosMercado] = useState<PontoParaAnunciar[]>([]);
  const [loadingMercado, setLoadingMercado] = useState(true);
  const [buscaPonto, setBuscaPonto] = useState('');
  const [pontoSolicitado, setPontoSolicitado] = useState<PontoParaAnunciar | null>(null);
  const [justificativaNovoPonto, setJustificativaNovoPonto] = useState('');
  const [enviandoNovoPonto, setEnviandoNovoPonto] = useState(false);

  // Solicitações de NOVO PONTO do próprio anunciante (tabela `solicitacoes`,
  // mesma da Central de Comunicação — nenhuma fila paralela)
  const [solicitacoesPonto, setSolicitacoesPonto] = useState<SolicitacaoNovoPonto[]>([]);
  const [loadingSolicitacoes, setLoadingSolicitacoes] = useState(true);

  const carregarSolicitacoes = useCallback(async () => {
    setLoadingSolicitacoes(true);
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('id, titulo, descricao, status, decisao_motivo, created_at')
      .eq('tipo_solicitacao', 'NOVO_PONTO')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[Minhas Solicitações NOVO_PONTO]', error);
      setSolicitacoesPonto([]);
    } else {
      setSolicitacoesPonto((data ?? []) as unknown as SolicitacaoNovoPonto[]);
    }
    setLoadingSolicitacoes(false);
  }, []);

  useEffect(() => {
    carregarSolicitacoes();
  }, [carregarSolicitacoes]);

  const carregarMercado = useCallback(async () => {
    setLoadingMercado(true);
    const { data, error } = await supabase.rpc('listar_pontos_para_anunciar');
    if (error) {
      console.error('[Pontos para Anunciar]', error);
      setPontosMercado([]);
    } else {
      setPontosMercado((data ?? []) as unknown as PontoParaAnunciar[]);
    }
    setLoadingMercado(false);
  }, []);

  useEffect(() => {
    carregarMercado();
  }, [carregarMercado]);

  const solicitarNovoPonto = async () => {
    if (!pontoSolicitado) return;
    setEnviandoNovoPonto(true);
    try {
      const { error } = await supabase.rpc('solicitar_novo_ponto', {
        p_ponto_id: pontoSolicitado.ponto_id,
        p_justificativa: justificativaNovoPonto.trim() || null,
      });
      if (error) throw new Error(error.message);
      toast({
        title: 'Solicitação enviada!',
        description: `Seu interesse no ponto "${pontoSolicitado.nome}" foi encaminhado para análise.`,
      });
      setPontoSolicitado(null);
      setJustificativaNovoPonto('');
      setActiveTab('historico');
      carregarSolicitacoes();
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Falha ao solicitar ponto.', variant: 'destructive' });
    } finally {
      setEnviandoNovoPonto(false);
    }
  };

  const carregar = useCallback(async () => {
    if (!usuario?.cliente_id) {
      setExpansoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await customerCommerceService.listarExpansoes(usuario.cliente_id);
    setExpansoes(data);
    setLoading(false);
  }, [usuario?.cliente_id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handlePointSelect = (point: EstabelecimentoDisponivel) => {
    const novo = new Set(selecionados);
    if (novo.has(point.unidade_id)) novo.delete(point.unidade_id);
    else novo.add(point.unidade_id);
    setSelecionados(novo);
  };

  const enviar = async () => {
    if (!usuario?.cliente_id) return;
    if (selecionados.size === 0) {
      toast({ title: 'Nenhum estabelecimento', description: 'Selecione ao menos um estabelecimento.', variant: 'destructive' });
      return;
    }
    const contratoId = await obterContratoVigente();
    if (!contratoId) {
      toast({ title: 'Sem contrato vigente', description: 'Você precisa de um contrato ativo para solicitar expansão.', variant: 'destructive' });
      return;
    }
    setEnviando(true);
    const resultado = await customerCommerceService.solicitarExpansao(contratoId, Array.from(selecionados), justificativa);
    setEnviando(false);
    if (!resultado.success) {
      toast({ title: 'Erro', description: resultado.error || 'Falha ao solicitar expansão.', variant: 'destructive' });
      return;
    }
    toast({
      title: 'Expansão solicitada',
      description: `${resultado.total_telas_adicionais ?? 0} telas adicionais · +${formatCurrency(resultado.valor_adicional_mensal ?? 0)}/mês. Aguardando aprovação.`,
    });
    setDialogAberta(false);
    setSelecionados(new Set());
    setJustificativa('');
    await carregar();
  };

  const obterContratoVigente = async (): Promise<string | null> => {
    if (!usuario?.cliente_id) return null;
    try {
      const { data } = await supabase.from('contratos').select('id').eq('cliente_id', usuario.cliente_id).in('status_workflow', ['EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'CAMPANHA_APROVADA', 'CAMPANHA_ATIVA']).limit(1).maybeSingle();
      return data?.id || null;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Pontos para Anunciar
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Descubra pontos parceiros disponíveis, solicite novos pontos e acompanhe suas expansões.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="bg-slate-900/50 border border-white/10 rounded-xl p-1">
        <TabsList className="grid grid-cols-3 bg-transparent">
          <TabsTrigger value="marketplace" className="data-[state=active]:bg-white/10 data-[state=active]:text-white flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Pontos Disponíveis
          </TabsTrigger>
          <TabsTrigger value="encontrar" className="data-[state=active]:bg-white/10 data-[state=active]:text-white flex items-center gap-2">
            <Search className="h-4 w-4" /> Buscar na Rede
          </TabsTrigger>
          <TabsTrigger value="historico" className="data-[state=active]:bg-white/10 data-[state=active]:text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Minhas Solicitações
          </TabsTrigger>
        </TabsList>

        {/* MARKETPLACE — pontos parceiros disponíveis */}
        <TabsContent value="marketplace" className="mt-4 animate-fade-in space-y-4">
          <Input
            placeholder="Buscar por nome, categoria ou cidade…"
            value={buscaPonto}
            onChange={(e) => setBuscaPonto(e.target.value)}
            className="bg-slate-950 border-white/10"
          />
          {loadingMercado ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (() => {
            const q = buscaPonto.trim().toLowerCase();
            const filtrados = !q
              ? pontosMercado
              : pontosMercado.filter((p) =>
                  [p.nome, p.categoria, p.cidade, p.estado, p.bairro]
                    .some((v) => (v ?? '').toLowerCase().includes(q))
                );
            return filtrados.length === 0 ? (
              <div className="text-center py-16 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
                <MapPin className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <p className="text-lg font-medium">Nenhum ponto disponível no momento</p>
                <p className="text-sm mt-2">Novos pontos parceiros aparecem aqui assim que cadastrados pela nossa equipe.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtrados.map((p) => (
                  <Card key={p.ponto_id} className="border-white/10 bg-slate-900/80 overflow-hidden hover:border-primary/30 transition-all">
                    <div className="h-36 bg-gradient-to-br from-slate-800 to-slate-900 relative">
                      {p.foto_url ? (
                        <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin className="h-10 w-10 text-slate-600" />
                        </div>
                      )}
                      {p.categoria && (
                        <Badge className="absolute top-2 left-2 bg-black/60 backdrop-blur text-[10px]">{p.categoria}</Badge>
                      )}
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-bold truncate">{p.nome}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[p.bairro, p.cidade, p.estado].filter(Boolean).join(' — ') || 'Local não informado'}
                      </p>
                      {p.descricao && <p className="text-xs text-slate-400 line-clamp-2">{p.descricao}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-xs text-slate-500">Valor para anunciar</p>
                          <p className="font-bold text-emerald-400">
                            {p.valor_anuncio != null ? formatCurrency(p.valor_anuncio) : 'sob consulta'}
                            <span className="text-[10px] text-slate-500 font-normal">
                              {PERIODICIDADE_LABELS[p.periodicidade ?? ''] ?? ''}
                            </span>
                          </p>
                        </div>
                        <Button size="sm" onClick={() => { setPontoSolicitado(p); setJustificativaNovoPonto(''); }}>
                          Anunciar neste ponto
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="encontrar" className="mt-4 animate-fade-in space-y-6">
          <Card className="border border-white/10 bg-slate-900/80 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Buscar estabelecimentos da rede
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <AIPointSearch
                empresaOperadoraId={empresaOperadoraId}
                onSelectPoint={handlePointSelect}
              />
            </CardContent>
          </Card>

          {selecionados.size > 0 && (
            <Card className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-white flex items-center justify-between">
                  <span>Selecionados para Expansão</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    {selecionados.size} estabelecimento{selecionados.size !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <Button
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold"
                  onClick={async () => {
                    setDialogAberta(true);
                    setJustificativa('');
                    // Popula o resumo com dados reais das unidades selecionadas
                    const { data } = await (supabase as unknown as { rpc: (fn: 'listar_estabelecimentos_disponiveis') => Promise<{ data: unknown }> }).rpc('listar_estabelecimentos_disponiveis');
                    setEstabelecimentosDialog((data ?? []) as unknown as EstabelecimentoDisponivel[]);
                  }}
                >
                  <PackageOpen className="h-4 w-4 mr-2" /> Solicitar Expansão ({selecionados.size})
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 animate-fade-in space-y-6">
          {/* Solicitações de NOVO PONTO (marketplace → Central de Comunicação) */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Novos pontos solicitados
            </h3>
            {loadingSolicitacoes ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : solicitacoesPonto.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-900/50 border border-white/10 rounded-xl p-4">
                Nenhum ponto novo solicitado ainda. Use a aba "Pontos Disponíveis" para solicitar.
              </p>
            ) : (
              solicitacoesPonto.map((s) => {
                const cfg = STATUS_SOLICITACAO_CONFIG[s.status] ?? STATUS_SOLICITACAO_CONFIG.PENDENTE;
                return (
                  <Card key={s.id} className="border border-white/10 bg-slate-900/80">
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <Badge className={cfg.className}>{cfg.label}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{s.titulo}</p>
                        {s.descricao && <p className="text-xs text-slate-500 line-clamp-1">{s.descricao}</p>}
                        {s.decisao_motivo && <p className="text-xs text-rose-400">Motivo: {s.decisao_motivo}</p>}
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">
                        {new Date(s.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>

          {/* Expansões contratuais */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Expansões contratuais
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : expansoes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
                <TrendingUp className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="font-medium">Nenhuma expansão contratual.</p>
                <p className="text-sm mt-1">Quando você solicitar, o histórico aparecerá aqui com o status de aprovação.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-4">
              {expansoes.map((exp) => {
                const cfg = STATUS_CONFIG[exp.status] || STATUS_CONFIG.SOLICITADA;
                const Icon = cfg.icon;
                const valorAdicional = (exp.valor_novo_contrato || 0) - (exp.valor_contrato_atual || 0);
                return (
                  <Card key={exp.id} className="border border-white/10 bg-slate-900/80 hover:border-primary/30 transition-all">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cfg.className}><Icon className="h-3 w-3 mr-1" /> {cfg.label}</Badge>
                            <span className="text-xs text-slate-500">{new Date(exp.created_at).toLocaleString('pt-BR')}</span>
                          </div>
                          {exp.justificativa && <p className="text-sm text-slate-300 mt-2 italic">"{exp.justificativa}"</p>}
                          {exp.motivo_rejeicao && (
                            <p className="text-sm text-rose-400 mt-1">Motivo da rejeição: {exp.motivo_rejeicao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Contrato atual</p>
                            <p className="text-sm text-slate-400">{formatCurrency(exp.valor_contrato_atual)}/mês</p>
                          </div>
                          <ArrowLeftRight className="h-4 w-4 text-slate-600" />
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Novo valor</p>
                            <p className="text-sm font-bold text-white">{formatCurrency(exp.valor_novo_contrato)}/mês</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-sm flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-primary" />
                          <span><strong className="text-white">{(exp.itens || []).reduce((acc, i) => acc + i.quantidade_telas, 0)}</strong> telas adicionais</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-sm flex items-center gap-2">
                          <CircleDollarSign className="h-4 w-4 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">+{formatCurrency(valorAdicional)}/mês</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-sm flex items-center gap-2">
                          <Send className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-400">{exp.aprovado_por ? `Aprovada por ${exp.aprovado_por}` : 'Aguardando aprovação'}</span>
                        </div>
                      </div>

                      {(exp.itens || []).length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {(exp.itens || []).map((item) => (
                            <div key={item.id} className="p-3 rounded-xl bg-slate-950/50 border border-white/5 text-sm">
                              <p className="text-white font-medium truncate">{item.unidade?.nome || 'Unidade'}</p>
                              <p className="text-xs text-slate-500">{item.unidade?.cidade} — {item.unidade?.estado} · {item.quantidade_telas} telas</p>
                              <p className="text-emerald-400 font-bold mt-1">{formatCurrency(item.valor_total)}/mês</p>
                            </div>
                          ))}
                        </div>
                      )}
                     </CardContent>
                   </Card>
                 );
               })}
             </div>
           )}
          </section>
        </TabsContent>
       </Tabs>

      {/* Solicitação de NOVO PONTO (marketplace → Central de Comunicação) */}
      <Dialog open={!!pontoSolicitado} onOpenChange={(o) => !o && setPontoSolicitado(null)}>
        <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <MapPin className="h-5 w-5 text-primary" /> Anunciar neste ponto
            </DialogTitle>
            {pontoSolicitado && (
              <DialogDescription className="text-slate-400">
                <strong className="text-slate-200">{pontoSolicitado.nome}</strong>
                <br />
                {[pontoSolicitado.bairro, pontoSolicitado.cidade, pontoSolicitado.estado].filter(Boolean).join(' — ')}
                {pontoSolicitado.valor_anuncio != null && (
                  <>
                    <br />Valor: {formatCurrency(pontoSolicitado.valor_anuncio)}
                    <span className="text-[10px]">{PERIODICIDADE_LABELS[pontoSolicitado.periodicidade ?? ''] ?? ''}</span>
                  </>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-slate-400">
              Este ponto não está no seu contrato atual. Sua solicitação será analisada
              pela equipe SOBRE MÍDIA e você acompanhará o andamento em "Minhas Solicitações".
            </p>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Justificativa (opcional)</Label>
              <Textarea
                value={justificativaNovoPonto}
                onChange={(e) => setJustificativaNovoPonto(e.target.value)}
                rows={2}
                placeholder="Ex.: Ponto com alto fluxo na região do meu público."
                className="bg-slate-900 border-white/10 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPontoSolicitado(null)} className="border-white/10 text-slate-300">Cancelar</Button>
            <Button onClick={solicitarNovoPonto} disabled={enviandoNovoPonto}>
              {enviandoNovoPonto ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogAberta} onOpenChange={setDialogAberta}>
        <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <PackageOpen className="h-5 w-5 text-primary" /> Solicitar expansão
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              A plataforma recalcula o valor do contrato automaticamente. Expansões passam por aprovação interna.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-slate-300 text-xs block mb-2">Estabelecimentos selecionados ({selecionados.size})</Label>
              {selecionados.size === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6 border border-dashed border-white/10 rounded-xl">
                  Nenhum estabelecimento selecionado.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {Array.from(selecionados).map((id) => {
                    const est = estabelecimentosDialog.find(e => e.unidade_id === id);
                    if (!est) return null;
                    return (
                      <div key={est.unidade_id} className="p-3 rounded-xl border border-primary bg-primary/10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white text-sm truncate">{est.nome}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {est.cidade} — {est.estado}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{est.quantidade_telas} telas · <span className="text-emerald-400 font-bold">{formatCurrency(est.valor_unitario)}/mês</span></p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Justificativa (opcional)</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={2}
                placeholder="Ex.: Expansão para cobrir a região norte da cidade."
                className="bg-slate-900 border-white/10 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAberta(false); setSelecionados(new Set()); setJustificativa(''); }} className="border-white/10 text-slate-300">Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || selecionados.size === 0} className="bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}