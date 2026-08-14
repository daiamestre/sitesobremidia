import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, BarChart2, ChevronDown, ChevronUp, Tv, Eye, MapPin, Monitor, Building2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { customerPortalDataService } from '../../services/customerPortalData.service';
import { InsercaoPorDia } from '../../types/portal.types';
import { formatNumber, formatDate } from '@/utils/formatters';

export default function InsercoesPorDiaPage() {
  const { usuario } = useAuth();
  const [insercoes, setInsercoes] = useState<InsercaoPorDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchInsercoes(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchInsercoes = async (clienteId: string) => {
    try {
      setLoading(true);
      const data = await customerPortalDataService.getInsercoesPorDia(clienteId);
      setInsercoes(data);
    } catch (error) {
      console.error('Erro ao buscar inserções:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (data: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(data)) next.delete(data);
      else next.add(data);
      return next;
    });
  };

  const totalInsercoes = useMemo(() => 
    insercoes.reduce((sum, i) => sum + i.quantidade, 0), 
    [insercoes]
  );

  const totalDias = insercoes.length;

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
        <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Inserções por Dia
          </h2>
          <p className="text-slate-400 text-sm mt-1">Visualize a quantidade de inserções veiculadas por dia.</p>
        </div>
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
              <Calendar className="h-6 w-6 text-primary" /> Inserções por Dia
            </h2>
            <p className="text-slate-400 text-sm mt-1">Quantidade de exibições veiculadas por data.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <BarChart2 className="h-4 w-4 text-primary" />
              <span>Total: <strong className="text-white">{formatNumber(totalInsercoes)}</strong> inserções em <strong className="text-white">{totalDias}</strong> dias</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Inserções */}
      {insercoes.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <Calendar className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhuma inserção encontrada</p>
          <p className="text-sm mt-2">Quando houver campanhas veiculadas, as inserções por dia aparecerão aqui.</p>
        </div>
      ) : (
        <Card className="border border-white/10 bg-slate-900/80 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300 w-12"></TableHead>
                    <TableHead className="text-slate-300">Data</TableHead>
                    <TableHead className="text-slate-300 text-center">Inserções</TableHead>
                    <TableHead className="text-slate-300">Campanhas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insercoes.map((insercao) => (
                    <>
                      <TableRow key={insercao.data} className="border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => toggleRow(insercao.data)}>
                        <TableCell className="text-center">
                          {expandedRows.has(insercao.data) ? (
                            <ChevronUp className="h-4 w-4 text-slate-400 mx-auto" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-white">
                          {formatDate(insercao.data)}
                        </TableCell>
                        <TableCell className="text-center font-bold text-lg text-primary">
                          {formatNumber(insercao.quantidade)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {insercao.campanhas.slice(0, 3).map(c => (
                              <Badge key={c.id} className="bg-primary/20 text-primary border-primary/30 text-[10px] px-2 py-0.5">
                                {c.titulo}
                              </Badge>
                            ))}
                            {insercao.campanhas.length > 3 && (
                              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-[10px] px-2 py-0.5">
                                +{insercao.campanhas.length - 3} mais
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(insercao.data) && (
                        <TableRow className="bg-slate-950/50 border-white/5">
                          <TableCell colSpan={4} className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {insercao.campanhas.map(campanha => (
                                <div key={campanha.id} className="p-3 rounded-lg border border-white/10 bg-slate-900/50 space-y-2">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/20 text-primary">
                                      <Tv className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-white truncate">{campanha.titulo}</p>
                                      <p className="text-xs text-slate-400">{campanha.duracao_segundos}s • {campanha.status}</p>
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                                      Veiculando
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/10">
                                    <div className="p-2 rounded bg-slate-950/50">
                                      <div className="text-slate-400 flex items-center gap-1">
                                        <Building2 className="h-3 w-3" /> Ponto
                                      </div>
                                      <div className="font-medium text-white truncate">{campanha.ponto_nome || '—'}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-950/50">
                                      <div className="text-slate-400 flex items-center gap-1">
                                        <Monitor className="h-3 w-3" /> Tela
                                      </div>
                                      <div className="font-medium text-white truncate">{campanha.tela_nome || '—'}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-950/50">
                                      <div className="text-slate-400 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" /> Cidade
                                      </div>
                                      <div className="font-medium text-white truncate">{campanha.cidade || '—'} / {campanha.estado || '—'}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}