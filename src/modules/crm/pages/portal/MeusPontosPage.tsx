import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin, Tv, ShieldCheck, Loader2, AlertTriangle, CheckCircle2, BarChart2, PlusCircle, Wifi, WifiOff, AlertCircle, Monitor, Building2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { customerPortalDataService, PontoDetalhado, PontosDetalhadosResponse } from '../../services/customerPortalData.service';
import { PontosResumo } from '../../types/portal.types';
import { formatNumber } from '@/utils/formatters';

const getSituacaoConfig = (situacao: string) => {
  switch (situacao) {
    case 'ATIVO':
      return { icon: CheckCircle2, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Ativo', bgIcon: 'bg-emerald-500/20 text-emerald-400' };
    case 'SEM_SINAL':
      return { icon: AlertCircle, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Sem Sinal', bgIcon: 'bg-amber-500/20 text-amber-400' };
    case 'MANUTENCAO':
      return { icon: Monitor, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Manutenção', bgIcon: 'bg-blue-500/20 text-blue-400' };
    default:
      return { icon: AlertTriangle, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Inativo', bgIcon: 'bg-slate-500/20 text-slate-400' };
  }
};

const getTelaStatusConfig = (status: string | undefined) => {
  switch (status) {
    case 'ONLINE':
      return { icon: Wifi, color: 'text-emerald-400', label: 'Online', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'OFFLINE':
      return { icon: WifiOff, color: 'text-rose-400', label: 'Offline', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    default:
      return { icon: AlertCircle, color: 'text-slate-400', label: 'Desconhecido', bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
  }
};

const getLimiteStatus = (usado: number, limite: number | null) => {
  if (limite === null) return { label: 'Ilimitado', color: 'text-slate-400', bg: 'bg-slate-500/20' };
  if (usado >= limite) return { label: 'Limite atingido', color: 'text-rose-400', bg: 'bg-rose-500/20' };
  if (usado >= limite * 0.8) return { label: 'Próximo do limite', color: 'text-amber-400', bg: 'bg-amber-500/20' };
  return { label: 'Disponível', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
};

export default function MeusPontosPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [pontos, setPontos] = useState<PontoDetalhado[]>([]);
  const [resumo, setResumo] = useState<PontosResumo | null>(null);
  const [porCidade, setPorCidade] = useState<PontosDetalhadosResponse['por_cidade']>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const { toast } = useToast();

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchPontos(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchPontos = async (clienteId: string) => {
    try {
      setLoading(true);
      const data = await customerPortalDataService.getPontosDetalhados(clienteId);
      setPontos(data.pontos);
      setResumo(data.resumo);
      setPorCidade(data.por_cidade);
    } catch (error: unknown) {
      console.error('Erro ao buscar pontos:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os pontos.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" /> Meus Pontos e Cobertura
            </h2>
            <p className="text-slate-400 text-sm mt-1">Pontos onde sua marca está sendo exibida atualmente.</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  const limitePontosStatus = getLimiteStatus(resumo?.total_pontos || 0, resumo?.limite_pontos_contrato || null);
  const limiteTelasStatus = getLimiteStatus(resumo?.total_telas || 0, resumo?.limite_telas_contrato || null);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" /> Meus Pontos e Cobertura
          </h2>
          <p className="text-slate-400 text-sm mt-1">Pontos onde sua marca está sendo exibida atualmente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode('cards')} className={viewMode === 'cards' ? 'bg-primary/20 text-primary border-primary/30' : ''}>
            <div className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Cards</div>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'bg-primary/20 text-primary border-primary/30' : ''}>
            <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Tabela</div>
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold flex items-center gap-2" onClick={() => navigate('/portal/expansao')}>
            <PlusCircle className="h-4 w-4" /> + Solicitar Expansão
          </Button>
        </div>
      </div>

      {/* Resumo de Limites */}
      {resumo && (resumo.limite_pontos_contrato !== null || resumo.limite_telas_contrato !== null) && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              Limites do Contrato
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Acompanhamento de uso vs. limite contratado</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {resumo.limite_pontos_contrato !== null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Pontos Contratados</span>
                  <Badge className={`${limitePontosStatus.bg} ${limitePontosStatus.color} border-${limitePontosStatus.color.replace('text-', '')}/30`}>
                    {resumo.total_pontos} / {resumo.limite_pontos_contrato}
                  </Badge>
                </div>
                <Progress 
                  value={resumo.limite_pontos_contrato > 0 ? Math.min(100, (resumo.total_pontos / resumo.limite_pontos_contrato) * 100) : 0} 
                  className="h-3 bg-slate-950" 
                />
                <div className="flex justify-between text-xs">
                  <span className={limitePontosStatus.color}>{limitePontosStatus.label}</span>
                  <span className="text-slate-400">{resumo.pontos_disponiveis !== null ? `${resumo.pontos_disponiveis} disponíveis` : 'Ilimitado'}</span>
                </div>
              </div>
            )}
            {resumo.limite_telas_contrato !== null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Telas Contratadas</span>
                  <Badge className={`${limiteTelasStatus.bg} ${limiteTelasStatus.color} border-${limiteTelasStatus.color.replace('text-', '')}/30`}>
                    {resumo.total_telas} / {resumo.limite_telas_contrato}
                  </Badge>
                </div>
                <Progress 
                  value={resumo.limite_telas_contrato > 0 ? Math.min(100, (resumo.total_telas / resumo.limite_telas_contrato) * 100) : 0} 
                  className="h-3 bg-slate-950" 
                />
                <div className="flex justify-between text-xs">
                  <span className={limiteTelasStatus.color}>{limiteTelasStatus.label}</span>
                  <span className="text-slate-400">{resumo.telas_disponiveis !== null ? `${resumo.telas_disponiveis} disponíveis` : 'Ilimitado'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/20 text-primary border border-primary/30">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total de Pontos</span>
              <strong className="text-xl font-bold text-white">{formatNumber(resumo?.total_pontos || 0)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total de Telas</span>
              <strong className="text-xl font-bold text-white">{formatNumber(resumo?.total_telas || 0)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Pontos Ativos</span>
              <strong className="text-xl font-bold text-emerald-400">{formatNumber(resumo?.pontos_ativos || 0)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Telas Ativas</span>
              <strong className="text-xl font-bold text-blue-400">{formatNumber(resumo?.telas_ativas || 0)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Disponíveis</span>
              <strong className="text-xl font-bold text-amber-400">
                {resumo?.pontos_disponiveis !== null ? formatNumber(resumo.pontos_disponiveis) : 'N/A'}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por Cidade */}
      {porCidade.length > 0 && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Distribuição por Cidade/Estado
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Quantidade de pontos e telas por localidade</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase">
                  <th className="text-left p-3">Cidade / UF</th>
                  <th className="text-center p-3">Pontos</th>
                  <th className="text-center p-3">Telas</th>
                  <th className="text-center p-3">Ativos</th>
                  <th className="text-center p-3">Inativos</th>
                  <th className="text-center p-3">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {porCidade.map((c, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 font-medium text-white">{c.cidade} / {c.estado}</td>
                    <td className="text-center p-3 text-slate-300">{c.pontos}</td>
                    <td className="text-center p-3 text-slate-300">{c.telas}</td>
                    <td className="text-center p-3 text-emerald-400 font-semibold">{c.ativos}</td>
                    <td className="text-center p-3 text-rose-400">{c.inativos}</td>
                    <td className="text-center p-3">
                      <Badge className={c.pontos > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}>
                        {c.pontos > 0 ? Math.round((c.ativos / c.pontos) * 100) : 0}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Lista/Tabela de Pontos */}
      {pontos.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <MapPin className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Você não possui pontos ativos no momento.</p>
          <p className="text-sm mt-2">Quando houver campanhas veiculadas, os pontos aparecerão aqui.</p>
        </div>
      ) : viewMode === 'table' ? (
        <Card className="border border-white/10 bg-slate-900/80 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
              <MapPin className="h-5 w-5 text-primary" /> Detalhamento dos Pontos
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-950 border-b border-white/10 text-slate-400 text-xs uppercase">
                  <th className="text-left p-3">Ponto / Unidade</th>
                  <th className="text-center p-3">Cidade / UF</th>
                  <th className="text-center p-3">Tela</th>
                  <th className="text-center p-3">Resolução</th>
                  <th className="text-center p-3">Situação</th>
                  <th className="text-center p-3">Tela Status</th>
                  <th className="text-center p-3">Último Ping</th>
                  <th className="text-center p-3">Última Exibição</th>
                  <th className="text-center p-3">Playbacks</th>
                </tr>
              </thead>
              <tbody>
                {pontos.map((ponto) => {
                  const situacaoConfig = getSituacaoConfig(ponto.situacao);
                  const telaStatusConfig = getTelaStatusConfig(ponto.tela_status);
                  const SituacaoIcon = situacaoConfig.icon;
                  const TelaStatusIcon = telaStatusConfig.icon;
                  
                  return (
                    <tr key={ponto.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3">
                        <div className="font-medium text-white">{ponto.nome}</div>
                        <div className="text-xs text-slate-400">PI: {ponto.pi_id?.slice(0, 8)}</div>
                      </td>
                      <td className="text-center p-3 text-slate-300">{ponto.cidade} / {ponto.estado}</td>
                      <td className="text-center p-3">
                        {ponto.tela_nome ? (
                          <span className="text-white font-mono text-xs">{ponto.tela_nome}</span>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-center p-3 text-slate-400 text-xs">{ponto.resolucao}</td>
                      <td className="text-center p-3">
                        <Badge className={situacaoConfig.color}>
                          <SituacaoIcon className="h-3 w-3 mr-1" /> {situacaoConfig.label}
                        </Badge>
                      </td>
                      <td className="text-center p-3">
                        <Badge className={telaStatusConfig.bg}>
                          <TelaStatusIcon className="h-3 w-3 mr-1" /> {telaStatusConfig.label}
                        </Badge>
                      </td>
                      <td className="text-center p-3 text-xs text-slate-400">
                        {ponto.tela_ultimo_ping ? new Date(ponto.tela_ultimo_ping).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="text-center p-3 text-xs text-slate-400">
                        {ponto.tela_ultima_exibicao ? new Date(ponto.tela_ultima_exibicao).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="text-center p-3 text-slate-300 font-mono">{ponto.playback_count || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pontos.map((ponto) => {
            const situacaoConfig = getSituacaoConfig(ponto.situacao);
            const telaStatusConfig = getTelaStatusConfig(ponto.tela_status);
            const SituacaoIcon = situacaoConfig.icon;
            const TelaStatusIcon = telaStatusConfig.icon;
            
            return (
              <Card key={ponto.id} className="border border-white/10 bg-slate-900/80 hover:border-primary/30 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-bold text-white truncate">{ponto.nome}</CardTitle>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <Building2 className="h-3 w-3" /> {ponto.unidade_nome || ponto.cidade} / {ponto.estado}
                      </div>
                    </div>
                    <Badge className={situacaoConfig.color} title={situacaoConfig.label}>
                      <SituacaoIcon className="h-3 w-3 mr-1" /> {situacaoConfig.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5">
                      <div className="text-slate-400 flex items-center gap-1"><Tv className="h-3 w-3" /> Telas</div>
                      <div className="font-bold text-white">{ponto.quantidade_telas || 1}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5">
                      <div className="text-slate-400 flex items-center gap-1"><Monitor className="h-3 w-3" /> Resolução</div>
                      <div className="font-bold text-white truncate">{ponto.resolucao}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5">
                      <div className="text-slate-400 flex items-center gap-1"><Wifi className="h-3 w-3" /> Status</div>
                      <Badge className={telaStatusConfig.bg} title={telaStatusConfig.label}>
                        <TelaStatusIcon className="h-3 w-3 mr-1" /> {telaStatusConfig.label}
                      </Badge>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5">
                      <div className="text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" /> Playbacks</div>
                      <div className="font-bold text-white">{ponto.playback_count || 0}</div>
                    </div>
                  </div>
                  
                  <div className="border-t border-white/10 pt-2 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Último ping: {ponto.tela_ultimo_ping ? new Date(ponto.tela_ultimo_ping).toLocaleString('pt-BR') : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Monitor className="h-3.5 w-3.5" />
                      <span>Última exibição: {ponto.tela_ultima_exibicao ? new Date(ponto.tela_ultima_exibicao).toLocaleString('pt-BR') : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{ponto.endereco}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}