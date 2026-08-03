import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeiroService, ComissaoRecord } from '../services/financeiro.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, ArrowLeft, Loader2, DollarSign, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CommissionsDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, user } = useAuth();
  const [comissoes, setComissoes] = useState<ComissaoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComissoes = useCallback(async () => {
    setLoading(true);
    const data = await financeiroService.listCommissions(empresaOperadoraId || undefined);
    setComissoes(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchComissoes();
  }, [fetchComissoes]);

  const handleRelease = async (id: string) => {
    await financeiroService.releaseCommission(id, user?.id);
    toast({ title: 'Comissão Liberada!', description: 'Status atualizado para LIBERADA.' });
    fetchComissoes();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalComissoes = comissoes.reduce((acc, c) => acc + Number(c.valor), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-extrabold text-white flex items-center gap-2">
            <PieChart className="h-6 w-6 text-purple-400" />
            Dashboard de Gestão de Comissões
          </h2>
          <p className="text-xs text-slate-300">Apuração Automática para Representante (5%), Supervisor (2%) e Gerente (1%)</p>
        </div>

        <Button variant="outline" onClick={() => navigate('/representantes/financeiro')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Financeiro
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="pb-3 border-b border-white/10">
          <CardTitle className="text-base font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-400" /> Comissões por Perfil ({comissoes.length})
            </span>
            <Badge className="bg-purple-500/20 text-purple-300 font-bold">
              Total Apurado: R$ {totalComissoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {comissoes.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">Nenhuma comissão apurada.</div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Beneficiário</TableHead>
                    <TableHead className="text-slate-300">Cargo</TableHead>
                    <TableHead className="text-slate-300">Percentual</TableHead>
                    <TableHead className="text-slate-300">Valor</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoes.map((c) => (
                    <TableRow key={c.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-bold text-white text-xs">{c.usuario?.nome || 'Representante'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-white/10 text-slate-300 text-[10px]">
                          {c.cargo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-300 font-mono">{c.percentual}%</TableCell>
                      <TableCell className="text-xs font-bold text-emerald-400">
                        R$ {Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === 'PENDENTE' && (
                          <Button
                            size="sm"
                            onClick={() => handleRelease(c.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-7 gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Liberar
                          </Button>
                        )}
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
