import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Tv, Clock, CheckCircle2, XCircle, PauseCircle, FileText, Eye, BarChart2, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { customerPortalDataService } from '../../services/customerPortalData.service';
import { CampanhaComInsercoes } from '../../types/portal.types';
import { formatDate, formatNumber } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'ACTIVE':
    case 'VEICULANDO':
      return { icon: CheckCircle2, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Ativa' };
    case 'APPROVED':
      return { icon: CheckCircle2, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Aprovada' };
    case 'PAUSED':
      return { icon: PauseCircle, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Pausada' };
    case 'FINISHED':
    case 'CONCLUIDA':
      return { icon: XCircle, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Finalizada' };
    case 'DRAFT':
    case 'RASCUNHO':
      return { icon: FileText, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Rascunho' };
    default:
      return { icon: Clock, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: status };
  }
};

export default function MinhasCampanhasPage() {
  const { usuario } = useAuth();
  const [campanhas, setCampanhas] = useState<CampanhaComInsercoes[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ativas' | 'historico'>('ativas');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchCampanhas(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchCampanhas = async (clienteId: string) => {
    try {
      setLoading(true);
      const data = await customerPortalDataService.getCampanhasComInsercoes(clienteId);
      setCampanhas(data);
    } catch (error: any) {
      console.error('Erro ao buscar campanhas:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar as campanhas.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const campanhasAtivas = campanhas.filter(c => ['ACTIVE', 'APPROVED', 'VEICULANDO', 'PAUSED'].includes(c.status));
  const campanhasHistorico = campanhas.filter(c => ['FINISHED', 'CONCLUIDA', 'CANCELADA'].includes(c.status));

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tv className="h-6 w-6 text-primary" /> Minhas Campanhas
          </h2>
          <p className="text-slate-400 text-sm mt-1">Acompanhe suas campanhas ativas e histórico.</p>
        </div>
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const renderCampanhaCard = (campanha: CampanhaComInsercoes) => {
    const statusConfig = getStatusConfig(campanha.status);
    const StatusIcon = statusConfig.icon;
    const isAtiva = ['ACTIVE', 'APPROVED', 'VEICULANDO'].includes(campanha.status);

    return (
      <Card key={campanha.id} className="border border-white/10 bg-slate-900/80 hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-bold text-white truncate">{campanha.titulo}</CardTitle>
              {campanha.objetivo && (
                <p className="text-xs text-slate-400 mt-1 truncate">{campanha.objetivo}</p>
              )}
            </div>
            <Badge className={`${statusConfig.color} whitespace-nowrap flex items-center gap-1`}>
              <StatusIcon className="h-3 w-3" /> {statusConfig.label}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Início: {formatDate(campanha.inicio)}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Fim: {formatDate(campanha.fim)}</span>
            <span className="flex items-center gap-1"><Tv className="h-3 w-3" /> {campanha.duracao_segundos}s</span>
            {campanha.total_insercoes > 0 && (
              <span className="flex items-center gap-1 text-primary"><BarChart2 className="h-3 w-3" /> {formatNumber(campanha.total_insercoes)} inserções</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2 space-y-3">
          {campanha.insercoes.length > 0 && (
            <div className="border-t border-white/10 pt-3">
              <p className="text-xs font-medium text-slate-400 mb-2">Próximas inserções:</p>
              <div className="flex flex-wrap gap-2">
                {campanha.insercoes.slice(0, 5).map(ins => (
                  <Badge key={ins.data} className="bg-slate-800 border-white/10 text-slate-300 text-[10px] px-2 py-1">
                    {formatDate(ins.data)}: {ins.quantidade} inserções
                  </Badge>
                ))}
                {campanha.insercoes.length > 5 && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-2 py-1">
                    +{campanha.insercoes.length - 5} dias
                  </Badge>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-white gap-1 h-auto px-3 py-1.5" onClick={() => navigate(`/portal/campanhas/${campanha.id}`)}>
                <Eye className="h-3.5 w-3.5" /> Detalhes
              </Button>
              {isAtiva && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  Em veiculação
                </Badge>
              )}
            </div>

            {/* Menu de Ações Rápido */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-white/10 text-slate-300">
                <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer gap-2" onClick={() => navigate(`/portal/campanhas/${campanha.id}`)}>
                  <Eye className="h-4 w-4" /> Ver Detalhes
                </DropdownMenuItem>
                {campanha.status === 'DRAFT' && (
                  <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer gap-2">
                    <FileText className="h-4 w-4" /> Editar Rascunho
                  </DropdownMenuItem>
                )}
                {campanha.status === 'ACTIVE' && (
                  <DropdownMenuItem className="focus:bg-amber-500/20 focus:text-amber-400 cursor-pointer gap-2 text-amber-400">
                    <PauseCircle className="h-4 w-4" /> Pausar Campanha
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </CardContent>
      </Card>
    );
  };

  if (campanhas.length === 0) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tv className="h-6 w-6 text-primary" /> Minhas Campanhas
          </h2>
          <p className="text-slate-400 text-sm mt-1">Acompanhe suas campanhas ativas e histórico.</p>
        </div>
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <Tv className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhuma campanha encontrada</p>
          <p className="text-sm mt-2">Suas campanhas aparecerão aqui quando forem criadas e vinculadas ao seu contrato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Tv className="h-6 w-6 text-primary" /> Minhas Campanhas
            </h2>
            <p className="text-slate-400 text-sm mt-1">Acompanhe suas campanhas ativas e histórico de veiculação.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 text-sm w-full md:w-auto">
            <div className="flex gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {campanhasAtivas.length} Ativas
              </Badge>
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                {campanhasHistorico.length} no Histórico
              </Badge>
            </div>
            <Button 
              className="bg-primary hover:bg-primary/90 text-white gap-2"
              onClick={() => navigate('/portal/nova-campanha')}
            >
              <PlusCircle className="h-4 w-4" /> Nova Campanha
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'ativas' | 'historico')} className="bg-slate-900/50 border border-white/10 rounded-xl p-1">
        <TabsList className="grid grid-cols-2 bg-transparent">
          <TabsTrigger value="ativas" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Tv className="h-4 w-4 mr-2" /> Campanhas Ativas ({campanhasAtivas.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Clock className="h-4 w-4 mr-2" /> Histórico ({campanhasHistorico.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ativas" className="mt-4 animate-fade-in">
          {campanhasAtivas.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
              <Tv className="h-12 w-12 mx-auto text-slate-600 mb-4" />
              <p className="text-lg font-medium">Nenhuma campanha ativa no momento</p>
              <p className="text-sm mt-2">Campanhas aprovadas e em veiculação aparecerão aqui.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campanhasAtivas.map(renderCampanhaCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 animate-fade-in">
          {campanhasHistorico.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
              <Clock className="h-12 w-12 mx-auto text-slate-600 mb-4" />
              <p className="text-lg font-medium">Histórico vazio</p>
              <p className="text-sm mt-2">Campanhas finalizadas aparecerão aqui.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campanhasHistorico.map(renderCampanhaCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}