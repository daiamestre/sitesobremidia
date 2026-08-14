import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileCheck, ShieldCheck, Download, CheckCircle2, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { digitalSignatureService } from '../../services/digitalSignature.service';

interface SignatureDetailsProps {
  assinatura: any;
  onActionComplete?: () => void;
}

export function SignatureDetails({ assinatura, onActionComplete }: SignatureDetailsProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [viewing, setViewing] = useState(false);

  const handleDownload = async () => {
    if (!assinatura.envelope_id) return;
    setDownloading(true);
    try {
      const result = await digitalSignatureService.downloadSignedDocument(assinatura.envelope_id);
      if (result.pdfUrl) {
        const a = document.createElement('a');
        a.href = result.pdfUrl;
        a.download = result.fileName || `Contrato_Assinado_${assinatura.contrato?.numero_contrato || assinatura.id}.pdf`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast({ title: 'Sucesso', description: 'PDF assinado baixado.' });
      } else {
        toast({ title: 'Erro', description: 'Documento assinado não disponível.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha no download.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const handleView = async () => {
    if (!assinatura.envelope_id) return;
    setViewing(true);
    try {
      const result = await digitalSignatureService.downloadSignedDocument(assinatura.envelope_id);
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast({ title: 'Erro', description: 'Documento assinado não disponível.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao abrir.', variant: 'destructive' });
    } finally {
      setViewing(false);
    }
  };

  const isSigned = assinatura.status === 'ASSINADO' || !!assinatura.pdf_assinado_key;

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-emerald-400" />
            Envelope #{assinatura.envelope_id}
          </span>
          <Badge className={isSigned
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>
            {assinatura.status}
          </Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Validação de integridade jurídica e carimbo do tempo via SHA-256.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Provedor Assinador:</span>
            <strong className="text-white font-mono text-xs">{assinatura.provedor || 'ASSINADOR_INTERNO'}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Hash do Documento (SHA-256):</span>
            <strong className="text-emerald-400 font-mono text-[10px] break-all block" title={assinatura.document_hash}>
              {assinatura.document_hash ? `${assinatura.document_hash.substring(0, 24)}...` : 'Não disponível'}
            </strong>
          </div>
        </div>

        {assinatura.signatario_nome && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
              <span className="text-slate-400 block">Signatário:</span>
              <strong className="text-white text-xs">{assinatura.signatario_nome}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
              <span className="text-slate-400 block">E-mail:</span>
              <strong className="text-slate-300 text-xs break-all">{assinatura.signatario_email || 'N/I'}</strong>
            </div>
          </div>
        )}

        {assinatura.assinado_em && (
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Data/Hora da Assinatura:</span>
            <strong className="text-emerald-400 text-xs">
              {new Date(assinatura.assinado_em).toLocaleString('pt-BR')}
            </strong>
          </div>
        )}

        {assinatura.signed_document_hash && (
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Hash do PDF Assinado:</span>
            <strong className="text-cyan-400 font-mono text-[10px] break-all" title={assinatura.signed_document_hash}>
              {assinatura.signed_document_hash.substring(0, 24)}...
            </strong>
          </div>
        )}

        {assinatura.eventos && Array.isArray(assinatura.eventos) && assinatura.eventos.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Timeline de Eventos:</span>
            <div className="space-y-1 mt-1">
              {assinatura.eventos.map((ev: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <ShieldCheck className="h-3 w-3 text-slate-500" />
                  <span className="text-slate-300">{ev.evento}</span>
                  <span className="text-slate-500">
                    {new Date(ev.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 gap-2">
          {isSigned && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleView}
                disabled={viewing}
                className="border-slate-500/30 text-slate-300 rounded-xl text-xs gap-1"
              >
                {viewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Visualizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                disabled={downloading}
                className="border-cyan-500/30 text-cyan-400 rounded-xl text-xs gap-1"
              >
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Baixar PDF Assinado
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
