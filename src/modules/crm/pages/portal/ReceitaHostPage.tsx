import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, AlertCircle, TrendingUp, Calendar, CreditCard, Download, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/formatters';
import { supabase } from '@/integrations/supabase/client';

export interface RepasseItemReal {
  id: string;
  competencia: string;
  ponto_nome: string;
  modelo_comercial: string;
  percentual_aplicado: number;
  anuncios_distintos: number;
  valor_base: number;
  valor_liquido: number;
  status: string;
  data_liquidacao: string;
  data_pagamento: string | null;
}

export default function ReceitaHostPage() {
  const { isHost } = useClienteModalidade();
  const [repasses, setRepasses] = useState<RepasseItemReal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRepasses() {
      try {
        const { data, error } = await supabase.rpc('listar_repasses_parceiro');
        if (!error && data) {
          setRepasses(data as RepasseItemReal[]);
        }
      } catch {
        setRepasses([]);
      } finally {
        setLoading(false);
      }
    }
    loadRepasses();
  }, []);

  if (!isHost) {
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

  const totalLiquido = repasses.reduce((acc, m) => acc + (Number(m.valor_liquido) || 0), 0);
  const repasseAtual = repasses.length > 0 ? Number(repasses[0].valor_liquido) || 0 : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-400" /> Receita & Monetização
          </h2>
          <p className="text-slate-400 text-sm mt-1">Acompanhe seus ganhos por ceder espaço para as telas Sobre Mídia.</p>
        </div>
        <Button variant="outline" className="border-white/10 text-white gap-2">
          <Download className="h-4 w-4" /> Exportar Relatório
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Ganhos Acumulados (Repasses)</p>
              <h3 className="text-2xl font-bold text-white">{formatCurrency(totalLiquido)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Última Apuração (5%)</p>
              <h3 className="text-2xl font-bold text-white">{formatCurrency(repasseAtual)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total de Repasses</p>
              <h3 className="text-2xl font-bold text-white">{repasses.length}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border border-white/10 bg-slate-900/70 overflow-hidden">
        <CardHeader className="bg-slate-950/50 pb-4">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Histórico de Repasses (Comissionado 5%)
          </CardTitle>
          <CardDescription>Detalhamento por ponto parceiro e competência (PERMUTA não gera repasse financeiro).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Carregando repasses...</div>
          ) : repasses.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Nenhum repasse registrado até o momento.</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-900/50">
                <TableRow className="border-white/10">
                  <TableHead className="text-slate-300">Competência</TableHead>
                  <TableHead className="text-slate-300">Ponto Parceiro</TableHead>
                  <TableHead className="text-slate-300 text-center">Modelo</TableHead>
                  <TableHead className="text-slate-300 text-center">Anúncios Distintos</TableHead>
                  <TableHead className="text-slate-300 text-right">Base Econômica</TableHead>
                  <TableHead className="text-slate-300 text-right">Repasse (5%)</TableHead>
                  <TableHead className="text-slate-300 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repasses.map((row) => (
                  <TableRow key={row.id} className="border-white/10 hover:bg-white/5 transition-colors">
                    <TableCell className="font-medium text-slate-200">{row.competencia}</TableCell>
                    <TableCell className="text-slate-300">{row.ponto_nome}</TableCell>
                    <TableCell className="text-center text-slate-400">{row.modelo_comercial}</TableCell>
                    <TableCell className="text-center font-bold text-slate-200">{row.anuncios_distintos}</TableCell>
                    <TableCell className="text-right text-slate-300">{formatCurrency(Number(row.valor_base) || 0)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-400">{formatCurrency(Number(row.valor_liquido) || 0)}</TableCell>
                    <TableCell className="text-center">
                      {row.status === 'PAGO' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Pago</Badge>
                      ) : row.status === 'DEVIDO' ? (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Devido (5%)</Badge>
                      ) : (
                        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">{row.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
