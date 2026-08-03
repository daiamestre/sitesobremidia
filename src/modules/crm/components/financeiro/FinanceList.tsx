import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, CheckCircle2, Clock, AlertCircle, Eye } from 'lucide-react';
import { ContaReceberCompleta } from '../../services/financeiro.service';

interface FinanceListProps {
  contas: ContaReceberCompleta[];
  onSelectConta: (conta: ContaReceberCompleta) => void;
}

export function FinanceList({ contas, onSelectConta }: FinanceListProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAGO':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Pago</Badge>;
      case 'PARCIAL':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Parcial</Badge>;
      case 'VENCIDO':
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Vencido</Badge>;
      case 'CANCELADO':
        return <Badge className="bg-slate-700 text-slate-300">Cancelado</Badge>;
      default:
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pendente</Badge>;
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Contas a Receber ({contas.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {contas.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">Nenhum título a receber cadastrado.</div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow className="border-white/10">
                  <TableHead className="text-slate-300">Documento / Cliente</TableHead>
                  <TableHead className="text-slate-300">Vencimento</TableHead>
                  <TableHead className="text-slate-300">Valor Original</TableHead>
                  <TableHead className="text-slate-300">Saldo a Receber</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-right text-slate-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((c) => (
                  <TableRow key={c.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <strong className="text-white block font-mono text-xs">{c.numero_documento}</strong>
                      <span className="text-[11px] text-slate-400">{c.cliente?.empresas?.[0]?.nome_fantasia || 'Cliente'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-300">
                      {new Date(c.vencimento).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-xs text-slate-200 font-semibold">
                      R$ {Number(c.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-emerald-400">
                      R$ {Number(c.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{getStatusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectConta(c)}
                        className="border-primary/30 text-primary hover:bg-primary/10 text-xs gap-1 h-8"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
