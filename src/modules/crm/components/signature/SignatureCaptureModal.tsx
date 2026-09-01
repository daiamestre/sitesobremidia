import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PenLine,
  Type,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Loader2,
  AlertCircle,
  FileSignature,
  User,
} from 'lucide-react';
import { CanvasSignaturePad } from './CanvasSignaturePad';
import { TypedSignaturePad } from './TypedSignaturePad';
import {
  SignatureMethod,
  SignatureSigner,
  SignatureCaptureResult,
  CanvasSignaturePadRef,
  TypedSignaturePadRef,
} from '../../types/assinatura.types';

export interface SignatureCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (result: SignatureCaptureResult) => void;
  signer: SignatureSigner;
  contratoNumero?: string;
  tipoContrato?: 'ANUNCIANTE' | 'PARCEIRO' | string;
  tituloDocumento?: string;
}

export function SignatureCaptureModal({
  isOpen,
  onClose,
  onCapture,
  signer,
  contratoNumero,
  tipoContrato,
  tituloDocumento,
}: SignatureCaptureModalProps) {
  const [activeTab, setActiveTab] = useState<SignatureMethod>('DRAWN');
  const [isDrawnEmpty, setIsDrawnEmpty] = useState(true);
  const [isTypedEmpty, setIsTypedEmpty] = useState(!signer.nome?.trim());
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<CanvasSignaturePadRef>(null);
  const typedRef = useRef<TypedSignaturePadRef>(null);

  useEffect(() => {
    setIsTypedEmpty(!signer.nome?.trim());
  }, [signer.nome]);

  const isCurrentEmpty = activeTab === 'DRAWN' ? isDrawnEmpty : isTypedEmpty;

  const handleTabChange = (val: SignatureMethod) => {
    setActiveTab(val);
    setErrorMessage(null);
  };

  const handleSkip = () => {
    onCapture({
      action: 'SKIPPED',
      signer,
      timestamp: new Date().toISOString(),
    });
    onClose();
  };

  const handleConfirm = async () => {
    setErrorMessage(null);

    if (activeTab === 'DRAWN') {
      if (canvasRef.current?.isEmpty()) {
        setErrorMessage('Por favor, desenhe sua assinatura no campo antes de confirmar.');
        return;
      }
    } else {
      if (typedRef.current?.isEmpty()) {
        setErrorMessage('Por favor, digite seu nome completo antes de confirmar.');
        return;
      }
    }

    setIsProcessing(true);
    try {
      let imageBlob: Blob | null = null;
      let dataUrl: string | null = null;
      let finalSignerName = signer.nome;

      if (activeTab === 'DRAWN') {
        imageBlob = await canvasRef.current!.toPngBlob();
        dataUrl = canvasRef.current!.toDataUrl();
      } else {
        imageBlob = await typedRef.current!.toPngBlob();
        dataUrl = await typedRef.current!.toDataUrl();
        finalSignerName = typedRef.current!.getSelectedName() || signer.nome;
      }

      if (!imageBlob) {
        throw new Error('Falha ao exportar a imagem da assinatura.');
      }

      onCapture({
        action: 'SIGNED',
        method: activeTab,
        signatureImage: imageBlob,
        signatureDataUrl: dataUrl || undefined,
        signer: {
          ...signer,
          nome: finalSignerName,
        },
        timestamp: new Date().toISOString(),
      });

      onClose();
    } catch (err: any) {
      console.error('[SignatureCaptureModal] Erro ao capturar assinatura:', err);
      setErrorMessage(err?.message || 'Erro ao processar assinatura visual.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl w-full bg-slate-900 border-white/10 text-white rounded-2xl p-0 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        aria-describedby="signature-modal-description"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-white/10 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <FileSignature className="h-5 w-5" />
                </div>
                <DialogTitle className="text-lg font-bold text-white">
                  Assinatura Digital do Contrato
                </DialogTitle>
                {tipoContrato && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                    {tipoContrato}
                  </Badge>
                )}
              </div>
              <DialogDescription id="signature-modal-description" className="text-slate-400 text-xs">
                {contratoNumero ? (
                  <span>
                    Contrato: <strong className="text-slate-200 font-mono">{contratoNumero}</strong> ·{' '}
                  </span>
                ) : null}
                {tituloDocumento || 'Documento Oficial de Prestação de Serviços'}
              </DialogDescription>
            </div>
          </div>

          {/* Signer Info Badge */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Signatário:</span>
              <strong className="text-white font-medium">{signer.nome || 'Não informado'}</strong>
            </div>
            {signer.cpfCnpj && (
              <span className="text-[11px] font-mono text-slate-400">
                Doc: {signer.cpfCnpj}
              </span>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 grow">
          <div className="w-full">
            {/* Segmented Tab Controls */}
            <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl border border-white/5 mb-4" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'DRAWN'}
                data-state={activeTab === 'DRAWN' ? 'active' : 'inactive'}
                onClick={() => handleTabChange('DRAWN')}
                className={`rounded-lg text-xs font-semibold py-2 flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'DRAWN'
                    ? 'bg-primary text-white shadow-md ring-1 ring-primary/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PenLine className="h-3.5 w-3.5" />
                <span>Desenhar na Tela</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'TYPED'}
                data-state={activeTab === 'TYPED' ? 'active' : 'inactive'}
                onClick={() => handleTabChange('TYPED')}
                className={`rounded-lg text-xs font-semibold py-2 flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'TYPED'
                    ? 'bg-primary text-white shadow-md ring-1 ring-primary/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Type className="h-3.5 w-3.5" />
                <span>Digitar meu Nome</span>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fade-in mb-3">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Tab A: Drawn Signature */}
            <div className={activeTab === 'DRAWN' ? 'space-y-2' : 'hidden'}>
              <p className="text-xs text-slate-400">
                Utilize o dedo, caneta stylus ou mouse para assinar dentro do quadro:
              </p>
              <CanvasSignaturePad
                ref={canvasRef}
                height={200}
                onStrokeChange={(empty) => setIsDrawnEmpty(empty)}
              />
            </div>

            {/* Tab B: Typed Signature */}
            <div className={activeTab === 'TYPED' ? 'space-y-2' : 'hidden'}>
              <TypedSignaturePad
                ref={typedRef}
                initialName={signer.nome}
                onNameChange={(_, empty) => setIsTypedEmpty(empty)}
              />
            </div>
          </div>

          {/* Legal / Evidence Notice */}
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Garantia de Autenticidade:</strong> Esta assinatura eletrônica registra
              carimbo de tempo UTC, endereço IP, User Agent e vinculação criptográfica ao Hash SHA-256
              do contrato, em conformidade com a MP 2.200-2/2001 e a Lei Federal 14.063/2020.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950/80 border-t border-white/10 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={isProcessing}
            className="w-full sm:w-auto border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl text-xs gap-2"
          >
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>Assinar Depois (Pular)</span>
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isProcessing}
              className="text-slate-400 hover:text-white text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isCurrentEmpty || isProcessing}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold gap-2 shadow-lg shadow-emerald-900/30 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Confirmar Assinatura</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
