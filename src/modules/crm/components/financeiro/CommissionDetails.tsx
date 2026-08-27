import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCheck, DollarSign, Percent } from 'lucide-react';
import { ComissaoRecord } from '../../services/financeiro.service';

interface CommissionDetailsProps {
  comissao: ComissaoRecord;
}

export function CommissionDetails({ comissao }: CommissionDetailsProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-purple-400" />
            Comissão #{comissao.codigo_publico ?? '—'}
          </span>
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">{comissao.status}</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Apuração de comissão parametrizada por contrato comercial.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Percentual Aplicado:</span>
            <strong className="text-white text-sm font-bold">{comissao.percentual}%</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Valor a Liberar:</span>
            <strong className="text-emerald-400 text-sm font-bold">R$ {Number(comissao.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
