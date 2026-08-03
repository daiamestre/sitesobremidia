import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroPlusService } from '../services/financeiroPlus.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookOpen, ArrowLeft, Loader2, Scale } from 'lucide-react';

export default function GeneralLedgerPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    const data = await financeiroPlusService.listGeneralLedger(empresaOperadoraId || undefined);
    setLancamentos(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

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
            <BookOpen className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Livro-Razão (General Ledger)</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">FASE 9.1-B</Badge>
          </div>
          <p className="text-slate-300 text-xs">Contabilidade de Partidas Dobradas (Débito vs. Crédito)</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-400" />
              Lançamentos Contábeis ({lancamentos.length})
            </span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">Partidas dobradas automatizadas no plano de contas corporativo.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {lancamentos.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">Nenhum lançamento no livro-razão.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Data / Histórico</TableHead>
                    <TableHead className="text-slate-300">Origem</TableHead>
                    <TableHead className="text-slate-300">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((l) => (
                    <TableRow key={l.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <strong className="text-white block text-xs">{l.historico}</strong>
                        <span className="text-[10px] text-slate-500">{new Date(l.created_at).toLocaleDateString('pt-BR')}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 font-mono">{l.origem}</TableCell>
                      <TableCell className="text-xs font-bold text-emerald-400">
                        R$ {Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
