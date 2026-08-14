import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Download, Eye, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { digitalSignatureService } from '../../services/digitalSignature.service';

export function SignedContracts({ assinados, onAssinaturaEvent }: { assinados: any[]; onAssinaturaEvent?: () => void }) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadSigned = async (a: any) => {
    const envelopeId = a.envelope_id;
    if (!envelopeId) {
      toast({ title: 'Erro', description: 'Envelope não identificado.', variant: 'destructive' });
      return;
    }

    setDownloadingId(a.id);
    try {
      const result = await digitalSignatureService.downloadSignedDocument(envelopeId);
      if (result.pdfUrl) {
        const link = document.createElement('a');
        link.href = result.pdfUrl;
        link.download = result.fileName || `Contrato_Assinado_${a.contrato?.numero_contrato || a.id}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        toast({ title: 'Erro', description: 'PDF assinado não disponível.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha no download.', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewSigned = async (a: any) => {
    const envelopeId = a.envelope_id;
    if (!envelopeId) return;

    try {
      const result = await digitalSignatureService.downloadSignedDocument(envelopeId);
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast({ title: 'Erro', description: 'PDF assinado não disponível.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao abrir.', variant: 'destructive' });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Contratos Assinados ({assinados.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {assinados.length === 0 ? (
          <div className="text-center py-4 text-slate-500 flex items-center gap-2 justify-center">
            <Hourglass className="h-4 w-4 animate-spin" /> Nenhum contrato assinado ainda.
          </div>
        ) : (
          assinados.map((a) => (
            <div key={a.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <strong className="text-white font-mono block text-[11px]">Envelope: {a.envelope_id}</strong>
                <span className="text-[10px] text-slate-400">
                  Contrato: {a.contrato?.numero_contrato || a.contrato_id || 'N/I'}
                  {a.contrato?.tipo_contrato && ` · Tipo: ${a.contrato.tipo_contrato}`}
                </span>
                <span className="text-[10px] text-slate-400">
                  Assinado em: {new Date(a.assinado_em || a.created_at).toLocaleString('pt-BR')}
                </span>
                {a.signed_document_hash && (
                  <code className="text-[9px] text-slate-500 mt-0.5" title={a.signed_document_hash}>
                    Hash: {a.signed_document_hash.substring(0, 16)}...
                  </code>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  ASSINADO
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewSigned(a)}
                  className="border-slate-500/30 text-slate-300 rounded-xl text-[10px] h-7 gap-1"
                >
                  <Eye className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadSigned(a)}
                  disabled={downloadingId === a.id}
                  className="border-cyan-500/30 text-cyan-400 rounded-xl text-[10px] h-7 gap-1"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
