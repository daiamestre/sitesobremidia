import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileCheck, ShieldCheck, Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SignatureDetailsProps {
  assinatura: any;
}

export function SignatureDetails({ assinatura }: SignatureDetailsProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-emerald-400" />
            Envelope #{assinatura.envelope_id}
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{assinatura.status}</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Validação de integridade jurídica e carimbo do tempo.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Provedor Assinador:</span>
            <strong className="text-white font-mono text-xs">{assinatura.provedor}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Hash do Documento:</span>
            <strong className="text-emerald-400 font-mono text-[10px] truncate block">{assinatura.document_hash}</strong>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 rounded-xl text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> Baixar PDF Assinado com Certificado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
