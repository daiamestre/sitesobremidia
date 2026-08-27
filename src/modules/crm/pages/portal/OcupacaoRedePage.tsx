import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, MapPin, Tv, BarChart2, Building2, Target, TrendingUp, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { customerPortalDataService } from '../../services/customerPortalData.service';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import { OcupacaoRede } from '../../types/portal.types';
import { formatNumber, formatPercentage } from '@/utils/formatters';

export default function OcupacaoRedePage() {
  const { usuario, empresaOperadoraId } = useAuth();
  const { isHost, isLoading: loadingModalidade } = useClienteModalidade();
  const [ocupacao, setOcupacao] = useState<OcupacaoRede | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (empresaOperadoraId && isHost) {
      fetchOcupacao(empresaOperadoraId);
    } else if (!loadingModalidade) {
      setLoading(false);
    }
  }, [empresaOperadoraId, isHost, loadingModalidade]);

  const fetchOcupacao = async (empresaOperadoraId: string) => {
    try {
      setLoading(true);
      const data = await customerPortalDataService.getOcupacaoRede(empresaOperadoraId);
      setOcupacao(data);
    } catch (error) {
      console.error('Erro ao buscar ocupação da rede:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTaxaColor = (taxa: number) => {
    if (taxa >= 80) return 'text-rose-400';
    if (taxa >= 60) return 'text-amber-400';
    if (taxa >= 40) return 'text-blue-400';
    return 'text-emerald-400';
  };

  const getTaxaBg = (taxa: number) => {
    if (taxa >= 80) return 'bg-rose-500/20 border-rose-500/30';
    if (taxa >= 60) return 'bg-amber-500/20 border-amber-500/30';
    if (taxa >= 40) return 'bg-blue-500/20 border-blue-500/30';
    return 'bg-emerald-500/20 border-emerald-500/30';
  };

  if (!loadingModalidade && !isHost) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-slate-600" />
          <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
          <p>Esta página é exclusiva para clientes da modalidade HOST (Hospedadores de Telas).</p>
        </div>
      </div>
    );
  }

  if (loading || loadingModalidade) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Ocupação da Rede
          </h2>
          <p className="text-slate-400 text-sm mt-1">Visão geral da ocupação dos pontos e telas na rede.</p>
        </div>
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (!ocupacao) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Ocupação da Rede
          </h2>
        </div>
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <AlertCircle className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Dados de ocupação indisponíveis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" /> Ocupação da Rede
            </h2>
            <p className="text-slate-400 text-sm mt-1">Visão geral da ocupação dos pontos e telas na rede da operadora.</p>
          </div>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/20 text-primary border border-primary/30">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total de Pontos</span>
              <strong className="text-2xl font-bold text-white">{formatNumber(ocupacao.total_pontos_rede)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Total de Telas</span>
              <strong className="text-2xl font-bold text-white">{formatNumber(ocupacao.total_telas_rede)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Taxa Ocupação Pontos</span>
              <strong className="text-2xl font-bold" style={{ color: getTaxaColor(ocupacao.taxa_ocupacao_pontos) }}>
                {formatPercentage(ocupacao.taxa_ocupacao_pontos)}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-slate-400 text-xs block font-semibold">Taxa Ocupação Telas</span>
              <strong className="text-2xl font-bold" style={{ color: getTaxaColor(ocupacao.taxa_ocupacao_telas) }}>
                {formatPercentage(ocupacao.taxa_ocupacao_telas)}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalhes de Ocupação */}
      <Tabs defaultValue="visao-geral" className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
        <TabsList className="grid grid-cols-3 bg-transparent p-1">
          <TabsTrigger value="visao-geral" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Building2 className="h-4 w-4 mr-2" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="por-cidade" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <MapPin className="h-4 w-4 mr-2" /> Por Cidade
          </TabsTrigger>
          <TabsTrigger value="por-tipo" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Tv className="h-4 w-4 mr-2" /> Por Tipo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="p-4 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pontos */}
            <Card className="border border-white/10 bg-slate-900/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Ocupação de Pontos
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">Distribuição de pontos ocupados vs livres</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Ocupados</span>
                    <span className="font-bold text-emerald-400">{formatNumber(ocupacao.pontos_ocupados)} / {formatNumber(ocupacao.total_pontos_rede)}</span>
                  </div>
                  <Progress 
                    value={ocupacao.total_pontos_rede > 0 ? (ocupacao.pontos_ocupados / ocupacao.total_pontos_rede) * 100 : 0} 
                    className="h-3 bg-slate-950" 
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Livres</span>
                    <span className="font-bold text-slate-400">{formatNumber(ocupacao.pontos_livres)} / {formatNumber(ocupacao.total_pontos_rede)}</span>
                  </div>
                  <Progress 
                    value={ocupacao.total_pontos_rede > 0 ? (ocupacao.pontos_livres / ocupacao.total_pontos_rede) * 100 : 0} 
                    className="h-3 bg-slate-950" 
                  />
                </div>
                <div className="pt-2 border-t border-white/10">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Taxa de Ocupação</span>
                    <Badge className={getTaxaBg(ocupacao.taxa_ocupacao_pontos)}>
                      {formatPercentage(ocupacao.taxa_ocupacao_pontos)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Telas */}
            <Card className="border border-white/10 bg-slate-900/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Tv className="h-5 w-5 text-emerald-400" />
                  Ocupação de Telas
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">Distribuição de telas ocupadas vs livres</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Ocupadas</span>
                    <span className="font-bold text-emerald-400">{formatNumber(ocupacao.telas_ocupadas)} / {formatNumber(ocupacao.total_telas_rede)}</span>
                  </div>
                  <Progress 
                    value={ocupacao.total_telas_rede > 0 ? (ocupacao.telas_ocupadas / ocupacao.total_telas_rede) * 100 : 0} 
                    className="h-3 bg-slate-950" 
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-300">Livres</span>
                    <span className="font-bold text-slate-400">{formatNumber(ocupacao.telas_livres)} / {formatNumber(ocupacao.total_telas_rede)}</span>
                  </div>
                  <Progress 
                    value={ocupacao.total_telas_rede > 0 ? (ocupacao.telas_livres / ocupacao.total_telas_rede) * 100 : 0} 
                    className="h-3 bg-slate-950" 
                  />
                </div>
                <div className="pt-2 border-t border-white/10">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Taxa de Ocupação</span>
                    <Badge className={getTaxaBg(ocupacao.taxa_ocupacao_telas)}>
                      {formatPercentage(ocupacao.taxa_ocupacao_telas)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumo Numérico */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 text-center">
              <p className="text-2xl font-bold text-emerald-400">{formatNumber(ocupacao.pontos_ocupados)}</p>
              <p className="text-xs text-slate-400">Pontos Ocupados</p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 text-center">
              <p className="text-2xl font-bold text-slate-400">{formatNumber(ocupacao.pontos_livres)}</p>
              <p className="text-xs text-slate-400">Pontos Livres</p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 text-center">
              <p className="text-2xl font-bold text-emerald-400">{formatNumber(ocupacao.telas_ocupadas)}</p>
              <p className="text-xs text-slate-400">Telas Ocupadas</p>
            </div>
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 text-center">
              <p className="text-2xl font-bold text-slate-400">{formatNumber(ocupacao.telas_livres)}</p>
              <p className="text-xs text-slate-400">Telas Livres</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="por-cidade" className="p-4 animate-fade-in">
          {ocupacao.por_cidade.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
              <MapPin className="h-12 w-12 mx-auto text-slate-600 mb-4" />
              <p className="text-lg font-medium">Nenhum dado por cidade disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ocupacao.por_cidade.map((cidade, index) => (
                <Card key={index} className="border border-white/10 bg-slate-900/80">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20 text-primary">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold text-white">{cidade.cidade} / {cidade.estado}</p>
                          <p className="text-xs text-slate-400">{formatNumber(cidade.pontos)} pontos • {formatNumber(cidade.telas)} telas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{formatNumber(cidade.ocupados)} ocupados</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                          <Circle className="h-3.5 w-3.5" />
                          <span>{formatNumber(cidade.livres)} livres</span>
                        </div>
                        <Badge className={getTaxaBg(cidade.pontos > 0 ? Math.round((cidade.ocupados / cidade.pontos) * 100) : 0)}>
                          {cidade.pontos > 0 ? formatPercentage(Math.round((cidade.ocupados / cidade.pontos) * 100)) : '0%'}
                        </Badge>
                      </div>
                    </div>
                    <Progress 
                      value={cidade.pontos > 0 ? (cidade.ocupados / cidade.pontos) * 100 : 0} 
                      className="h-2 bg-slate-950 mt-3" 
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="por-tipo" className="p-4 animate-fade-in">
          {ocupacao.por_tipo.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
              <Tv className="h-12 w-12 mx-auto text-slate-600 mb-4" />
              <p className="text-lg font-medium">Nenhum dado por tipo disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ocupacao.por_tipo.map((tipo, index) => (
                <Card key={index} className="border border-white/10 bg-slate-900/80">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                          <Tv className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold text-white capitalize">{tipo.tipo.replace('_', ' ')}</p>
                          <p className="text-xs text-slate-400">{formatNumber(tipo.pontos)} pontos • {formatNumber(tipo.telas)} telas</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper component for circle icon
function Circle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function CheckCircle2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}