import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QrCode, CheckCircle2 } from 'lucide-react';

export function PixManagement() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-emerald-400" /> Cobranças PIX Ativas
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Instantâneo</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Geração de QRCodes dinâmicos com confirmação instantânea via webhook.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs text-slate-300">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div>
            <strong className="text-white block font-mono">TXID-PIX-9988776655</strong>
            <span className="text-[10px] text-slate-500">Expira em 3600s</span>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-400 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Conciliado
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
