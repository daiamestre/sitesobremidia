import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign } from 'lucide-react';

interface Parcela {
  id: string;
  numero_parcela?: number | null;
  vencimento: string;
  valor: number;
  status: string;
}

interface ParcelasGridProps {
  parcelas: Parcela[];
}

export function ParcelasGrid({ parcelas }: ParcelasGridProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-primary" /> Grade de Parcelas ({parcelas.length})
        </h4>
      </div>

      {parcelas.length === 0 ? (
        <div className="text-center py-4 text-slate-500 text-xs">Nenhuma parcela individual cadastrada.</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-950">
              <TableRow className="border-white/10">
                <TableHead className="text-slate-300">Nº Parcela</TableHead>
                <TableHead className="text-slate-300">Vencimento</TableHead>
                <TableHead className="text-slate-300">Valor</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((p) => (
                <TableRow key={p.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="font-bold text-white text-xs">Parcela #{p.numero_parcela}</TableCell>
                  <TableCell className="text-xs text-slate-300">
                    {new Date(p.vencimento).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-xs font-bold text-emerald-400">
                    R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge className={p.status === 'PAGO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
