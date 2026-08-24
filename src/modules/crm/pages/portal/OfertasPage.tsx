import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  BadgePercent, Plus, Loader2, Megaphone, TrendingDown, CalendarRange,
  CheckCircle2, Clock, Send, Archive, Eye, Sparkles,
} from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import type { Oferta, OfertaStatus } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';
import { NovaOfertaDialog } from '../../components/portal/NovaOfertaDialog';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Rascunho', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  GENERATING: { label: 'Gerando', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  GENERATED: { label: 'Gerada', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  REVIEW: { label: 'Em revisão', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  APPROVED: { label: 'Aprovada', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  REJECTED: { label: 'Rejeitada', className: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  SCHEDULED: { label: 'Agendada', className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  PUBLISHED: { label: 'Publicada', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  ARCHIVED: { label: 'Arquivada', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

export default function OfertasPage() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogNova, setDialogNova] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('TODAS');

  const carregar = useCallback(async () => {
    if (!usuario?.cliente_id) {
      setOfertas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await customerCommerceService.listarOfertas(usuario.cliente_id);
    setOfertas(data);
    setLoading(false);
  }, [usuario?.cliente_id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudarStatus = async (oferta: Oferta, status: OfertaStatus) => {
    const ok = await customerCommerceService.atualizarStatusOferta(oferta.id, status);
    if (ok) {
      toast({ title: 'Status atualizado', description: `Oferta "${oferta.titulo}" → ${STATUS_CONFIG[status]?.label || status}` });
      await carregar();
    } else {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o status.', variant: 'destructive' });
    }
  };

  const filtradas = ofertas.filter((o) => filtroStatus === 'TODAS' || o.status === filtroStatus);
  const ativas = ofertas.filter((o) => o.status === 'APPROVED' || o.status === 'SCHEDULED' || o.status === 'PUBLISHED');

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BadgePercent className="h-6 w-6 text-amber-400" /> Offer Center
          </h2>
          <p className="text-slate-400 text-sm mt-1">Crie, revise, aprove e publique ofertas a partir do catálogo oficial.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Megaphone className="h-3 w-3 mr-1" /> {ativas.length} ativas
          </Badge>
          <Button onClick={() => setDialogNova(true)} className="bg-gradient-to-r from-primary to-purple-500 text-white font-bold gap-2">
            <Plus className="h-4 w-4" /> Nova Oferta
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['TODAS', 'DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'].map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            onClick={() => setFiltroStatus(s)}
            className={filtroStatus === s ? 'bg-primary/20 text-primary border-primary/30' : 'border-white/10 text-slate-400'}
          >
            {s === 'TODAS' ? 'Todas' : STATUS_CONFIG[s]?.label || s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <BadgePercent className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhuma oferta encontrada.</p>
          <p className="text-sm mt-2">Crie sua primeira oferta para divulgar produtos com preço promocional.</p>
          <Button onClick={() => setDialogNova(true)} className="mt-4 bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
            <Plus className="h-4 w-4" /> Criar oferta
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtradas.map((oferta) => {
            const cfg = STATUS_CONFIG[oferta.status] || STATUS_CONFIG.DRAFT;
            const economias = (oferta.itens || []).reduce((acc, i) => acc + (i.preco_original - i.preco_oferta), 0);
            return (
              <Card key={oferta.id} className="border border-white/10 bg-slate-900/80 hover:border-primary/30 transition-all">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-white truncate">{oferta.titulo}</h3>
                        {oferta.destaque && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                            <Sparkles className="h-3 w-3 mr-1" /> Destaque
                          </Badge>
                        )}
                        <Badge className={cfg.className}>{cfg.label}</Badge>
                      </div>
                      {oferta.descricao && <p className="text-sm text-slate-400 mt-1">{oferta.descricao}</p>}
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarRange className="h-3.5 w-3.5" />
                          {new Date(oferta.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')} → {new Date(oferta.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Send className="h-3.5 w-3.5" /> Canal: {oferta.canal}
                        </span>
                        {economias > 0 && (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5" /> Economia total: {formatCurrency(economias)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {oferta.status === 'DRAFT' && (
                        <Button size="sm" variant="outline" onClick={() => mudarStatus(oferta, 'REVIEW')} className="border-white/10 text-slate-300 gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Enviar para revisão
                        </Button>
                      )}
                      {oferta.status === 'REVIEW' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => mudarStatus(oferta, 'REJECTED')} className="border-rose-500/30 text-rose-400 gap-1.5">
                            Rejeitar
                          </Button>
                          <Button size="sm" onClick={() => mudarStatus(oferta, 'APPROVED')} className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                          </Button>
                        </>
                      )}
                      {oferta.status === 'APPROVED' && (
                        <Button size="sm" onClick={() => mudarStatus(oferta, 'PUBLISHED')} className="bg-gradient-to-r from-primary to-purple-500 text-white gap-1.5">
                          <Send className="h-3.5 w-3.5" /> Publicar
                        </Button>
                      )}
                      {oferta.status === 'PUBLISHED' && (
                        <Button size="sm" variant="outline" onClick={() => mudarStatus(oferta, 'ARCHIVED')} className="border-white/10 text-slate-400 gap-1.5">
                          <Archive className="h-3.5 w-3.5" /> Arquivar
                        </Button>
                      )}
                    </div>
                  </div>

                  {(oferta.itens || []).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {(oferta.itens || []).map((item) => (
                        <div key={item.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white truncate">{item.produto?.nome || 'Produto'}</span>
                            {item.desconto_porcentagem > 0 && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] shrink-0">
                                -{item.desconto_porcentagem}%
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-500 line-through text-xs">{formatCurrency(item.preco_original)}</span>
                            <span className="text-amber-400 font-bold">{formatCurrency(item.preco_oferta)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {oferta.status === 'GENERATING' && (
                    <div className="flex items-center gap-2 text-xs text-blue-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando criativos para esta oferta...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NovaOfertaDialog open={dialogNova} onOpenChange={setDialogNova} onSucesso={carregar} />
    </div>
  );
}