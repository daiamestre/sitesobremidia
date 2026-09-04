import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  FileText, CheckCircle2, AlertCircle, Loader2, PenTool, ArrowRight,
  ShieldCheck, MapPin, Monitor, CircleDollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { CanvasSignaturePad } from '../signature/CanvasSignaturePad';
import type { CanvasSignaturePadRef } from '../../types/assinatura.types';
import type { ItemComposicaoComUI } from './SelecaoComercialDialog';
import { contratoDocumentoService } from '../../services/contratoDocumento.service';
import { ContratoService } from '../../services/contrato.service';
import { OFFICIAL_PDFS } from '../../services/contractResolver.service';
import { supabase } from '@/integrations/supabase/client';

const contratoService = new ContratoService();

export interface AssinaturaContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string | null;
  codigoOperacional: string | null;
  publicIdentifier: string | null;
  composicao?: ItemComposicaoComUI[];
  onSuccess: (codigoOperacional: string, publicIdentifier: string) => void;
}

export function AssinaturaContratoDialog({
  open,
  onOpenChange,
  contratoId,
  codigoOperacional,
  publicIdentifier,
  composicao = [],
  onSuccess,
}: AssinaturaContratoDialogProps) {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const canvasPadRef = useRef<CanvasSignaturePadRef>(null);

  const [step, setStep] = useState<'VISUALIZACAO' | 'ASSINATURA' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO'>('VISUALIZACAO');
  const [loadingContrato, setLoadingContrato] = useState(false);
  const [contratoData, setContratoData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Signatário state
  const [signatarioNome, setSignatarioNome] = useState('');
  const [signatarioCpfCnpj, setSignatarioCpfCnpj] = useState('');
  const [signatarioEmail, setSignatarioEmail] = useState('');
  const [padEmpty, setPadEmpty] = useState(true);

  // Total da composição comercial
  const totalMensalComposicao = composicao.reduce((acc, item) => acc + (item.subtotal || 0), 0);
  const totalDescontoComposicao = composicao.reduce((acc, item) => acc + (item.desconto || 0), 0);
  const totalTabelaComposicao = composicao.reduce((acc, item) => acc + (item.valor_tabela || 0), 0);

  // Carregar dados do contrato ao abrir
  useEffect(() => {
    if (open && contratoId) {
      setStep('VISUALIZACAO');
      setErrorMessage(null);
      setLoadingContrato(true);

      contratoService.findByContratoId(contratoId).then((data) => {
        setContratoData(data);
        if (data) {
          setSignatarioNome(data.cliente?.nome || usuario?.nome || '');
          setSignatarioEmail(usuario?.email || '');
          setSignatarioCpfCnpj(data.cliente?.cpf_cnpj || '');
          
          if (data.status_documento === 'ASSINADO') {
            setStep('SUCESSO');
          }
        }
        setLoadingContrato(false);
      }).catch((err) => {
        console.error('[AssinaturaContratoDialog] Erro ao carregar contrato:', err);
        setLoadingContrato(false);
      });
    }
  }, [open, contratoId, usuario]);

  // Manipulador de submissão da assinatura
  const handleFinalizarAssinatura = async () => {
    if (step === 'PROCESSANDO') return; // Previne duplo envio simultâneo na UI

    if (!contratoId || !codigoOperacional || !publicIdentifier) {
      setErrorMessage('Identificadores do contrato ou cobrança não fornecidos.');
      setStep('ERRO');
      return;
    }

    if (!signatarioNome.trim()) {
      toast({
        title: 'Nome do Signatário Obrigatório',
        description: 'Por favor, informe o nome completo do signatário.',
        variant: 'destructive',
      });
      return;
    }

    if (canvasPadRef.current?.isEmpty()) {
      toast({
        title: 'Assinatura Necessária',
        description: 'Desenhe sua assinatura no painel antes de concluir.',
        variant: 'destructive',
      });
      return;
    }

    const signatureDataUrl = canvasPadRef.current?.toDataUrl();
    if (!signatureDataUrl) {
      toast({
        title: 'Falha na Captura',
        description: 'Não foi possível capturar a imagem da assinatura.',
        variant: 'destructive',
      });
      return;
    }

    setStep('PROCESSANDO');
    setErrorMessage(null);

    try {
      const usuarioId = usuario?.id;
      if (!usuarioId) {
        throw new Error('Usuário não autenticado.');
      }

      // 1. Garantir que o documento PDF base e o envelope de assinatura existam
      let envelopeRes = await contratoDocumentoService.criarEnvelopeInterno(contratoId, usuarioId);
      if (!envelopeRes.success) {
        // Tentar gerar o documento base primeiro se o envelope não existia
        const pdfGenRes = await contratoDocumentoService.gerarDocumentoContrato(contratoId, usuarioId);
        if (!pdfGenRes.success) {
          throw new Error(pdfGenRes.error || 'Falha ao gerar o documento PDF base do contrato.');
        }
        envelopeRes = await contratoDocumentoService.criarEnvelopeInterno(contratoId, usuarioId);
        if (!envelopeRes.success || !envelopeRes.assinaturaId) {
          throw new Error(envelopeRes.error || 'Falha ao criar o envelope de assinatura digital.');
        }
      }

      const assinaturaId = envelopeRes.assinaturaId!;

      // 2. Executar o pipeline de assinatura: PDF final -> SHA-256 -> R2 -> fn_assinar_contrato
      const signRes = await contratoDocumentoService.assinarDocumento(
        assinaturaId,
        {
          nome: signatarioNome.trim(),
          email: signatarioEmail.trim() || undefined,
          cpfCnpj: signatarioCpfCnpj.trim() || undefined,
          signatureDataUrl,
          method: 'DRAWN',
        },
        '127.0.0.1',
        window.navigator.userAgent,
        usuarioId
      );

      if (!signRes.success) {
        throw new Error(signRes.error || 'Falha na execução do pipeline de assinatura digital.');
      }

      // 3. Sucesso real confirmado pela RPC fn_assinar_contrato
      setStep('SUCESSO');
      toast({
        title: 'Contrato Assinado com Sucesso!',
        description: 'Documento assinado e registrado com SHA-256 e R2.',
      });

    } catch (err: any) {
      console.error('[AssinaturaContratoDialog] Erro na assinatura:', err);
      setErrorMessage(err?.message || 'Falha ao processar assinatura do contrato.');
      setStep('ERRO');
      toast({
        title: 'Falha na Assinatura do Contrato',
        description: err?.message || 'Ocorreu um erro ao assinar o contrato.',
        variant: 'destructive',
      });
    }
  };

  const handleProsseguirParaPagamento = () => {
    if (codigoOperacional && publicIdentifier) {
      onOpenChange(false);
      onSuccess(codigoOperacional, publicIdentifier);
    }
  };

  const officialPdf = OFFICIAL_PDFS.ANUNCIANTE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-white text-lg font-bold">
              <FileText className="h-5 w-5 text-primary" />
              Contrato de Anunciante — Assinatura Digital
            </DialogTitle>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              {contratoData?.status_documento || 'AGUARDANDO ASSINATURA'}
            </Badge>
          </div>
          <DialogDescription className="text-slate-400 text-xs mt-1">
            Contrato oficial de exibição de mídia publicitária na rede SOBRE MÍDIA (ANUNCIANTE).
          </DialogDescription>
        </DialogHeader>

        {loadingContrato ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-slate-400">Carregando dados do contrato...</p>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* ETAPA DE ERRO */}
            {step === 'ERRO' && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <AlertCircle className="h-5 w-5" /> Falha no Processo de Assinatura
                </div>
                <p className="text-xs">{errorMessage || 'Não foi possível concluir a assinatura do contrato.'}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStep('ASSINATURA')}
                  className="mt-2 border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                >
                  Tentar Novamente
                </Button>
              </div>
            )}

            {/* ETAPA DE SUCESSO */}
            {step === 'SUCESSO' && (
              <div className="py-8 text-center space-y-4">
                <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 mb-2 border border-emerald-500/30">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h3 className="text-xl font-bold text-white">Contrato Assinado com Sucesso!</h3>
                <p className="text-sm text-slate-300 max-w-md mx-auto">
                  O documento foi assinado digitalmente, assinado via SHA-256 e armazenado com segurança.
                </p>
                <div className="p-4 rounded-xl bg-slate-900 border border-white/10 text-left max-w-md mx-auto text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status Documento:</span>
                    <span className="text-emerald-400 font-bold">ASSINADO</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status Workflow:</span>
                    <span className="text-amber-400 font-bold">AGUARDANDO_PAGAMENTO</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Signatário:</span>
                    <span className="text-white font-medium">{signatarioNome}</span>
                  </div>
                </div>
                <Button
                  onClick={handleProsseguirParaPagamento}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold gap-2 px-8 py-6 rounded-xl shadow-lg hover:shadow-emerald-500/20"
                >
                  Ir para o Pagamento da Fatura <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* ETAPA DE PROCESSAMENTO */}
            {step === 'PROCESSANDO' && (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <h3 className="text-lg font-bold text-white">Processando Assinatura Digital...</h3>
                <p className="text-xs text-slate-400 max-w-sm text-center">
                  Gerando PDF final vetorial, calculando hash SHA-256, realizando upload R2 e registrando assinatura transacional...
                </p>
              </div>
            )}

            {/* ETAPA DE VISUALIZAÇÃO OU ASSINATURA */}
            {(step === 'VISUALIZACAO' || step === 'ASSINATURA') && (
              <>
                {/* RESUMO COMERCIAL (FONTE DE VALORES: COMPOSIÇÃO / CONTRATO) */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CircleDollarSign className="h-4 w-4 text-primary" /> Resumo Comercial da Contratação
                    </span>
                    <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                      {contratoData?.numero_contrato || 'ANUNCIANTE'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Valor de Tabela</span>
                      <span className="font-bold text-slate-200">
                        {formatCurrency(totalTabelaComposicao || contratoData?.valor_mensal || 0)}/mês
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-white/5">
                      <span className="text-slate-400 block mb-0.5">Desconto Aplicado</span>
                      <span className="font-bold text-emerald-400">
                        -{formatCurrency(totalDescontoComposicao || 0)}/mês
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-primary/20 bg-primary/5">
                      <span className="text-slate-400 block mb-0.5">Valor Mensal Final</span>
                      <span className="font-extrabold text-white text-sm">
                        {formatCurrency(totalMensalComposicao || contratoData?.valor_mensal || 0)}/mês
                      </span>
                    </div>
                  </div>

                  {composicao.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400 block">Pontos Contratados:</span>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {composicao.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px] p-2 rounded bg-slate-950 border border-white/5">
                            <span className="font-medium text-slate-200 truncate flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-primary shrink-0" /> {item.ponto_nome || item.ponto_id}
                            </span>
                            <span className="text-emerald-400 font-bold ml-2 shrink-0">
                              {formatCurrency(item.subtotal)}/{item.periodicidade.toLowerCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* DOCUMENTO OFICIAL DE ANUNCIANTE */}
                <div className="p-4 rounded-xl bg-slate-900 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-purple-400" /> Documento Oficial de Contrato
                    </span>
                    <a
                      href={officialPdf.publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Abrir PDF Oficial
                    </a>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-white/5 text-xs text-slate-300 font-mono max-h-36 overflow-y-auto leading-relaxed">
                    <p className="font-bold text-slate-200 mb-1">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MÍDIA DIGITAL SIGNAGE</p>
                    <p className="text-slate-400">
                      Pelo presente instrumento particular, a SOBRE MÍDIA PLATAFORMA DIGITAL e a CONTRATANTE celebram o presente contrato para exibição publicitária na rede de displays.
                    </p>
                    <p className="mt-2 text-slate-400">
                      Objeto: Prestação de serviços de veiculação em pontos de mídia indoor corporativa.
                      Forma de Pagamento: {contratoData?.forma_pagamento || 'BOLETO/PIX'}.
                      Vigência: {contratoData?.data_inicio ? new Date(contratoData.data_inicio).toLocaleDateString('pt-BR') : 'Data de Assinatura'} a {contratoData?.data_fim ? new Date(contratoData.data_fim).toLocaleDateString('pt-BR') : '12 meses'}.
                    </p>
                  </div>
                </div>

                {/* MODALIDADE: APENAS ASSINATURA */}
                {step === 'ASSINATURA' && (
                  <div className="space-y-4 border-t border-white/10 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-300 mb-1 block">Nome do Signatário *</Label>
                        <Input
                          value={signatarioNome}
                          onChange={(e) => setSignatarioNome(e.target.value)}
                          placeholder="Nome completo"
                          className="bg-slate-900 border-white/10 text-white text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-300 mb-1 block">CPF / CNPJ</Label>
                        <Input
                          value={signatarioCpfCnpj}
                          onChange={(e) => setSignatarioCpfCnpj(e.target.value)}
                          placeholder="000.000.000-00"
                          className="bg-slate-900 border-white/10 text-white text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-300 mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <PenTool className="h-3.5 w-3.5 text-primary" /> Assinatura Digital no Painel *
                        </span>
                        <span className="text-[11px] text-slate-400">Desenhe sua assinatura abaixo</span>
                      </Label>

                      <div className="p-2 rounded-xl bg-slate-900 border border-white/10">
                        <CanvasSignaturePad
                          ref={canvasPadRef}
                          onStrokeChange={(empty) => setPadEmpty(empty)}
                          lineColor="#6366f1"
                          strokeWidth={3}
                          height={160}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-white/10 pt-3">
          {step === 'VISUALIZACAO' && (
            <div className="flex w-full justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-white/10 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => setStep('ASSINATURA')}
                disabled={loadingContrato}
                className="bg-gradient-to-r from-primary to-purple-500 text-white font-bold gap-2"
              >
                <PenTool className="h-4 w-4" /> Ir para Assinatura
              </Button>
            </div>
          )}

          {step === 'ASSINATURA' && (
            <div className="flex w-full justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('VISUALIZACAO')}
                className="border-white/10 text-slate-300"
              >
                Voltar ao Resumo
              </Button>
              <Button
                onClick={handleFinalizarAssinatura}
                disabled={padEmpty || !signatarioNome.trim()}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold gap-2 shadow-lg hover:shadow-emerald-500/20"
              >
                <ShieldCheck className="h-4 w-4" /> Concluir Assinatura Digital
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
