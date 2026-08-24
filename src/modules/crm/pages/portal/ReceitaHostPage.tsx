import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, AlertCircle, TrendingUp, Calendar, CreditCard, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/formatters';

// Mock data until DB is fully mapped
const MOCK_REVENUE_HISTORY = [
  { id: '1', mes: 'Agosto/2026', valorBruto: 4500, taxa: 450, valorLiquido: 4050, status: 'PREVISTO', dataPagamento: '10/09/2026' },
  { id: '2', mes: 'Julho/2026', valorBruto: 4200, taxa: 420, valorLiquido: 3780, status: 'PAGO', dataPagamento: '10/08/2026' },
  { id: '3', mes: 'Junho/2026', valorBruto: 3900, taxa: 390, valorLiquido: 3510, status: 'PAGO', dataPagamento: '10/07/2026' },
];

export default function ReceitaHostPage() {
  const { isHost } = useClienteModalidade();
  const [history] = useState(MOCK_REVENUE_HISTORY);

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

  const totalLiquido = history.reduce((acc, m) => acc + m.valorLiquido, 0);

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
              <p className="text-sm font-medium text-slate-400">Ganhos Acumulados (3 meses)</p>
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
              <p className="text-sm font-medium text-slate-400">Previsão Atual (Agosto)</p>
              <h3 className="text-2xl font-bold text-white">{formatCurrency(MOCK_REVENUE_HISTORY[0].valorLiquido)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Próximo Pagamento</p>
              <h3 className="text-2xl font-bold text-white">10/09/2026</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border border-white/10 bg-slate-900/70 overflow-hidden">
        <CardHeader className="bg-slate-950/50 pb-4">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Histórico de Repasses
          </CardTitle>
          <CardDescription>Detalhamento mensal das receitas geradas por suas telas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-900/50">
              <TableRow className="border-white/10">
                <TableHead className="text-slate-300">Período</TableHead>
                <TableHead className="text-slate-300 text-right">Valor Bruto</TableHead>
                <TableHead className="text-slate-300 text-right">Taxa Administrativa</TableHead>
                <TableHead className="text-slate-300 text-right">Valor Líquido</TableHead>
                <TableHead className="text-slate-300 text-center">Status</TableHead>
                <TableHead className="text-slate-300 text-right">Data de Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row.id} className="border-white/10 hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium text-slate-200">{row.mes}</TableCell>
                  <TableCell className="text-right text-slate-300">{formatCurrency(row.valorBruto)}</TableCell>
                  <TableCell className="text-right text-slate-400 text-sm">-{formatCurrency(row.taxa)}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-400">{formatCurrency(row.valorLiquido)}</TableCell>
                  <TableCell className="text-center">
                    {row.status === 'PAGO' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Pago</Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Previsto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-slate-400 text-sm">{row.dataPagamento}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
