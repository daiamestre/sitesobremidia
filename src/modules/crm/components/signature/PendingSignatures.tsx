import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Mail, Eye, Download, Loader2, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { digitalSignatureService } from '../../services/digitalSignature.service';
import { SignatureCaptureModal } from './SignatureCaptureModal';
import type { SignatureCaptureResult, SignatureSigner } from '../../types/assinatura.types';

interface AssinaturaPendente {
  id: string;
  envelope_id: string;
  provedor?: string | null;
  status?: string | null;
  signatario_nome?: string | null;
  signatario_email?: string | null;
  signatario_cpf_cnpj?: string | null;
  contrato?: { id?: string | null; numero_contrato?: string | null; tipo_contrato?: string | null } | null;
  eventos?: { evento: string; created_at: string }[] | null;
}

export function PendingSignatures({ pendentes, onAssinaturaEvent }: { pendentes: AssinaturaPendente[]; onAssinaturaEvent?: () => void }) {
  const { toast } = useToast();
  const { usuario, user } = useAuth();
  const [signingId, setSigningId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [modalAssinatura, setModalAssinatura] = useState<AssinaturaPendente | null>(null);

  const handleView = async (envelopeId: string) => {
    setViewingId(envelopeId);
    try {
      const result = await digitalSignatureService.viewDocument(envelopeId);
      if (result.success && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast({ title: 'Erro', description: result.error || 'Não foi possível abrir o documento.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setViewingId(null);
    }
  };

  const handleDownload = async (envelopeId: string) => {
    try {
      const result = await digitalSignatureService.downloadSignedDocument(envelopeId);
      if (result.pdfUrl) {
        const a = document.createElement('a');
        a.href = result.pdfUrl;
        a.download = result.fileName || 'documento.pdf';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const handleReenviar = async (envelopeId: string) => {
    try {
      await digitalSignatureService.downloadSignedDocument(envelopeId);
      toast({ title: 'Notificação Reenviada', description: 'Link de acesso reenviado ao signatário.' });
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const openSignatureModal = (p: AssinaturaPendente) => {
    setModalAssinatura(p);
  };

  const handleSignatureCapture = async (result: SignatureCaptureResult) => {
    const p = modalAssinatura;
    setModalAssinatura(null);
    if (!p || result.action === 'SKIPPED') {
      return;
    }

    const usuarioId = usuario?.id || user?.id;
    if (!p.contrato?.id || !usuarioId) return;

    setSigningId(p.id);
    try {
      const signResult = await digitalSignatureService.signDocument(
        p.envelope_id,
        usuarioId,
        {
          nome: result.signer.nome || p.signatario_nome || '',
          email: result.signer.email || p.signatario_email || '',
          cpfCnpj: result.signer.cpfCnpj || p.signatario_cpf_cnpj || '',
          signatureDataUrl: result.signatureDataUrl,
          method: result.method,
        }
      );
      if (signResult.success) {
        toast({ title: 'Documento Assinado!', description: 'PDF assinado gerado e armazenado com sucesso.' });
        onAssinaturaEvent?.();
      } else {
        toast({ title: 'Erro na Assinatura', description: signResult.error || 'Falha ao assinar.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSigningId(null);
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" /> Assinaturas Pendentes ({pendentes.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {pendentes.length === 0 ? (
          <div className="text-center py-4 text-slate-500">Nenhuma assinatura pendente.</div>
        ) : (
          pendentes.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <strong className="text-white font-mono block text-[11px]">Envelope: {p.envelope_id}</strong>
                <span className="text-[10px] text-slate-400">
                  Contrato: {p.contrato?.numero_contrato || 'N/I'} · Provedor: {p.provedor}
                </span>
                {p.signatario_nome && (
                  <span className="text-[10px] text-slate-400">
                    Signatário: {p.signatario_nome} ({p.signatario_email})
                  </span>
                )}
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] w-fit mt-1">
                  {p.status || 'ENVIADO'}
                </Badge>
                {p.eventos && p.eventos.length > 0 && (
                  <span className="text-[9px] text-slate-500 mt-0.5">
                    Último evento: {p.eventos[0].evento} · {new Date(p.eventos[0].created_at).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleView(p.envelope_id)}
                  disabled={viewingId === p.envelope_id}
                  className="border-slate-600 text-slate-300 rounded-xl text-[10px] h-7 gap-1"
                >
                  {viewingId === p.envelope_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                  </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(p.envelope_id)}
                  className="border-cyan-500/30 text-cyan-400 rounded-xl text-[10px] h-7 gap-1"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReenviar(p.envelope_id)}
                  className="border-blue-500/30 text-blue-400 rounded-xl text-[10px] h-7 gap-1"
                >
                  <Mail className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => openSignatureModal(p)}
                  disabled={signingId === p.id || !p.contrato?.id}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] h-7 gap-1"
                >
                  {signingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
                  <span>Assinar</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {modalAssinatura && (
        <SignatureCaptureModal
          isOpen={!!modalAssinatura}
          onClose={() => setModalAssinatura(null)}
          onCapture={handleSignatureCapture}
          signer={{
            nome: modalAssinatura.signatario_nome || '',
            email: modalAssinatura.signatario_email || '',
            cpfCnpj: modalAssinatura.signatario_cpf_cnpj || '',
          }}
          contratoNumero={modalAssinatura.contrato?.numero_contrato || ''}
          tipoContrato={modalAssinatura.contrato?.tipo_contrato || 'ANUNCIANTE'}
          tituloDocumento="Assinatura de Contrato"
        />
      )}
    </Card>
  );
}
