import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio, ShieldCheck } from 'lucide-react';

export function WebhookMonitor() {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-400" /> Monitor de Webhooks E-Sign
          </span>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Idempotente</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Recepção segura com verificação de assinatura HMAC SHA256.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
          <div className="space-y-0.5">
            <strong className="text-white block font-mono">POST /api/webhooks/clicksign</strong>
            <span className="text-[10px] text-slate-500">Status 200 OK — Processado com Sucesso</span>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-400">Validado</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
