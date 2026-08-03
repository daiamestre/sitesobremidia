import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroService } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Landmark, ArrowLeft, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function CashFlowPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [fluxo, setFluxo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFluxo = useCallback(async () => {
    setLoading(true);
    const data = await financeiroService.getCashFlow(empresaOperadoraId || undefined);
    setFluxo(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchFluxo();
  }, [fetchFluxo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Projeção de Fluxo de Caixa</h2>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 ml-2">FASE 9.1</Badge>
          </div>
          <p className="text-slate-300 text-xs">Entradas, Saídas, Previsões vs. Realizados</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-400" />
              Lançamentos do Fluxo de Caixa ({fluxo.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {fluxo.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">Nenhum lançamento no fluxo de caixa.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Descrição / Categoria</TableHead>
                    <TableHead className="text-slate-300">Data Prevista</TableHead>
                    <TableHead className="text-slate-300">Valor Previsto</TableHead>
                    <TableHead className="text-slate-300">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fluxo.map((f) => (
                    <TableRow key={f.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <strong className="text-white block text-xs">{f.descricao}</strong>
                        <span className="text-[10px] text-slate-500">{f.categoria}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {new Date(f.data_prevista).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-emerald-400">
                        R$ {Number(f.valor_previsto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={f.tipo === 'ENTRADA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                          {f.tipo === 'ENTRADA' ? <ArrowUpRight className="h-3 w-3 mr-1 inline" /> : <ArrowDownRight className="h-3 w-3 mr-1 inline" />}
                          {f.tipo}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
