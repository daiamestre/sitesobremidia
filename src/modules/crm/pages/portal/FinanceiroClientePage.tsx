import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Loader2, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function FinanceiroClientePage() {
  const { usuario } = useAuth();
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (usuario?.cliente_id) {
      fetchFinanceiro(usuario.cliente_id);
    }
  }, [usuario?.cliente_id]);

  const fetchFinanceiro = async (clienteId: string) => {
    try {
      const { data, error } = await supabase
        .from('cobrancas')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('data_vencimento', { ascending: false });

      if (error) throw error;
      setCobrancas(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar financeiro:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar o financeiro.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-500" /> Meu Financeiro
        </h2>
        <p className="text-slate-400 text-sm mt-1">Acompanhe seus pagamentos e faturas emitidas.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : cobrancas.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          Nenhuma cobrança registrada.
        </div>
      ) : (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow className="border-white/10">
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Valor</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobrancas.map(cob => {
                  const valor = Number(cob.valor_parcela || cob.valor || 0);
                  const dataVenc = cob.data_vencimento ? new Date(cob.data_vencimento).toLocaleDateString() : 'N/A';
                  return (
                    <TableRow key={cob.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-slate-300 text-xs">
                        {dataVenc}
                      </TableCell>
                      <TableCell className="text-white font-bold text-xs">
                        R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          cob.status_pagamento === 'PAID' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                          cob.status_pagamento === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 
                          'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }>
                          {cob.status_pagamento}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {cob.status_pagamento === 'PENDING' && (
                          <Badge className="cursor-pointer bg-primary/20 text-primary border-primary/30">Pagar</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
