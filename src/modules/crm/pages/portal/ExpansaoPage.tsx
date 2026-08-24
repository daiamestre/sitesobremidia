import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, Loader2, MapPin, Monitor, CheckCircle2, XCircle, Clock,
  ArrowLeftRight, PackageOpen, Send, CircleDollarSign,
} from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';
import type { Expansao, EstabelecimentoDisponivel } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  SOLICITADA: { label: 'Solicitada', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  APROVADA: { label: 'Aprovada', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  REJEITADA: { label: 'Rejeitada', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: XCircle },
  CANCELADA: { label: 'Cancelada', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: XCircle },
};

export default function ExpansaoPage() {
  const { usuario } = useAuth();
  const { toast } = useToast();

  const [expansoes, setExpansoes] = useState<Expansao[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogAberta, setDialogAberta] = useState(false);
  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoDisponivel[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);

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

  const abrirDialog = async () => {
    setDialogAberta(true);
    setSelecionados(new Set());
    setJustificativa('');
    const data = await customerCommerceService.listarEstabelecimentosDisponiveis();
    setEstabelecimentos(data);
  };

  const alternarSelecao = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
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
            <TrendingUp className="h-6 w-6 text-primary" /> Expansão de Estabelecimentos
          </h2>
          <p className="text-slate-400 text-sm mt-1">Solicite novas unidades para a sua rede. O impacto financeiro é calculado pela plataforma.</p>
        </div>
        <Button onClick={abrirDialog} className="bg-gradient-to-r from-primary to-purple-500 text-white font-bold gap-2">
          <PackageOpen className="h-4 w-4" /> Solicitar expansão
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : expansoes.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <TrendingUp className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhuma solicitação de expansão.</p>
          <p className="text-sm mt-2">Quando você solicitar, o histórico aparecerá aqui com o status de aprovação.</p>
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
              <Label className="text-slate-300 text-xs block mb-2">Estabelecimentos disponíveis ({estabelecimentos.length})</Label>
              {estabelecimentos.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6 border border-dashed border-white/10 rounded-xl">
                  Nenhum estabelecimento disponível para expansão.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {estabelecimentos.map((est) => {
                    const ativo = selecionados.has(est.unidade_id);
                    return (
                      <button
                        key={est.unidade_id}
                        onClick={() => alternarSelecao(est.unidade_id)}
                        className={`text-left p-3 rounded-xl border transition-all ${ativo ? 'border-primary bg-primary/15' : 'border-white/10 bg-slate-900/50 hover:border-white/25'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white text-sm truncate">{est.nome}</span>
                          {ativo && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {est.cidade} — {est.estado}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{est.quantidade_telas} telas · <span className="text-emerald-400 font-bold">{formatCurrency(est.valor_unitario)}/mês</span></p>
                      </button>
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
            <Button variant="outline" onClick={() => setDialogAberta(false)} className="border-white/10 text-slate-300">Cancelar</Button>
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