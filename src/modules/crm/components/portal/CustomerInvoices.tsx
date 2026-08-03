import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CustomerInvoices() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" /> Faturamento, Boletos & Notas Fiscais
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div className="space-y-0.5">
            <strong className="text-white block font-mono">Fatura #FAT-2026-0042</strong>
            <span className="text-[10px] text-slate-400">Vencimento: 15/08/2026 — R$ 12.500,00</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 rounded-xl text-xs gap-1 h-7">
              <Download className="h-3 w-3" /> Boleto PIX
            </Button>
            <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 rounded-xl text-xs gap-1 h-7">
              <FileText className="h-3 w-3" /> NFS-e XML
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
