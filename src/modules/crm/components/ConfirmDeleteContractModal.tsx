import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { contratoService, ContratoCompleto } from '@/modules/crm/services/contrato.service';

interface ConfirmDeleteContractModalProps {
  contrato: ContratoCompleto | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConfirmDeleteContractModal({
  contrato,
  isOpen,
  onClose,
  onSuccess,
}: ConfirmDeleteContractModalProps) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [motivo, setMotivo] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!contrato) return null;

  const targetNumero = contrato.numero_contrato || '';
  const isMatch = confirmText.trim() === targetNumero;
  const isMotivoValid = motivo.trim().length >= 5;
  const canDelete = isMatch && isMotivoValid && !isDeleting;

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText('');
    setMotivo('');
    onClose();
  };

  const handleConfirm = async () => {
    if (!canDelete) return;
    setIsDeleting(true);

    try {
      const result = await contratoService.excluirContrato(contrato.id, motivo.trim());

      if (result.success) {
        if (result.mode === 'HARD_DELETE') {
          toast({
            title: 'Contrato Excluído Definitivamente',
            description: `O contrato ${targetNumero} e seus arquivos foram excluídos fisicamente (Hard Delete).`,
          });
        } else {
          toast({
            title: 'Contrato Desativado (Soft Delete)',
            description: `O contrato ${targetNumero} foi cancelado e arquivado com preservação do histórico fiscal e contábil.`,
          });
        }
        handleClose();
        onSuccess();
      } else {
        toast({
          title: 'Falha na Exclusão',
          description: result.error || 'Não foi possível excluir o contrato.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro Inesperado',
        description: err?.message || 'Erro ao processar exclusão.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const clienteOuPontoNome =
    (contrato as any).empresa?.nome_fantasia ||
    (contrato as any).empresa?.razao_social ||
    (contrato as any).ponto?.nome ||
    (contrato as any).ponto?.nome_fantasia ||
    'Cliente não identificado';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-slate-950 border border-red-500/30 text-white shadow-2xl rounded-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Excluir Contrato
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Ação restrita a administradores e proprietários.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Card Resumo do Contrato */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Número do Contrato:</span>
              <span className="font-mono font-bold text-white text-sm">{targetNumero}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Vinculado a:</span>
              <span className="font-semibold text-slate-200 truncate max-w-[200px]">{clienteOuPontoNome}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Valor Mensal:</span>
              <span className="font-semibold text-emerald-400">
                R$ {Number(contrato.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Alerta de Governança Híbrida */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold">Regra de Segurança Híbrida:</p>
              <p className="text-amber-200/80">
                Se este contrato possuir pagamentos, notas fiscais ou assinaturas, o sistema aplicará automaticamente <strong>Soft Delete</strong> (preservação fiscal e jurídica). Contratos sem lastro serão expurgados definitivamente.
              </p>
            </div>
          </div>

          {/* Justificativa Obrigatória */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Motivo da Exclusão:</span>
              <span className="text-[10px] text-slate-500">(mínimo 5 caracteres)</span>
            </label>
            <Textarea
              placeholder="Descreva a razão do cancelamento ou exclusão..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="bg-slate-900 border-white/10 text-white placeholder:text-slate-500 text-xs min-h-[70px] resize-none"
              disabled={isDeleting}
            />
          </div>

          {/* Confirmação por Digitação */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Digite <span className="font-mono text-red-400 font-bold select-all">{targetNumero}</span> para confirmar:
            </label>
            <Input
              placeholder={targetNumero}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="bg-slate-900 border-white/10 text-white placeholder:text-slate-600 font-mono text-xs"
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canDelete}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Confirmar Exclusão
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
