import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BoletoManagement() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" /> Boletos Bancários Registrados
          </span>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">PDF no R2</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Emissão e download de Boletos com linha digitável e código de barras.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs text-slate-300">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div>
            <strong className="text-white block font-mono text-xs">Nosso Número #NOSSO-998877</strong>
            <span className="text-[10px] text-slate-500">Vencimento: 15/08/2026</span>
          </div>
          <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 rounded-xl text-xs gap-1 h-7">
            <Download className="h-3 w-3" /> Baixar PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
