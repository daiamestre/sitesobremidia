import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { financeiroService, Cobranca } from '../../services/financeiro.service';
import { useToast } from '@/hooks/use-toast';

interface EditReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  cobranca: Cobranca;
  onSuccess: () => void;
}

export function EditReceivableModal({ isOpen, onClose, cobranca, onSuccess }: EditReceivableModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [valor, setValor] = useState<number>(Number(cobranca.valor) || 0);
  const [vencimento, setVencimento] = useState<string>(
    cobranca.data_vencimento ? String(cobranca.data_vencimento).substring(0, 10) : ''
  );
  const [descricao, setDescricao] = useState(cobranca.notes || '');
  const [metodo, setMetodo] = useState(cobranca.metodo_cobranca || 'PIX');

  useEffect(() => {
    if (isOpen) {
      setValor(Number(cobranca.valor) || 0);
      setVencimento(cobranca.data_vencimento ? String(cobranca.data_vencimento).substring(0, 10) : '');
      setDescricao(cobranca.notes || '');
      setMetodo(cobranca.metodo_cobranca || 'PIX');
    }
  }, [isOpen, cobranca]);

  const handleSubmit = async () => {
    if (!valor || valor <= 0) {
      toast({ title: 'Valor Inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
      return;
    }
    if (!vencimento) {
      toast({ title: 'Vencimento Inválido', description: 'Informe a data de vencimento.', variant: 'destructive' });
      return;
    }
    
    // Bloquear alteração de valor para menor que o valor já recebido
    const valorPago = Number(cobranca.valor_pago || 0);
    if (valor < valorPago) {
      toast({ 
        title: 'Valor Inválido', 
        description: `O valor total não pode ser menor que o valor já pago (R$ ${valorPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}).`, 
        variant: 'destructive' 
      });
      return;
    }

    setIsSubmitting(true);
    
    // Chamada ao serviço para atualizar
    const res = await financeiroService.updateReceivable(cobranca.id, {
      valor,
      dataVencimento: vencimento,
      descricao,
      metodoCobranca: metodo
    });

    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Cobrança atualizada', description: 'As alterações foram salvas com sucesso.' });
      onSuccess();
    } else {
      toast({ title: 'Erro ao atualizar', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Cobrança</DialogTitle>
          <DialogDescription className="text-slate-400">
            {cobranca.codigo_operacional} - Altere apenas os campos permitidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Descrição / Observações</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Faturamento mensal"
              className="bg-slate-950 border-white/10 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Valor Total (R$)</Label>
              <Input
                type="number"
                value={valor}
                onChange={(e) => setValor(Number(e.target.value))}
                min={Number(cobranca.valor_pago || 0)}
                step="0.01"
                className="bg-slate-950 border-white/10 text-white"
              />
              {Number(cobranca.valor_pago || 0) > 0 && (
                <p className="text-[10px] text-amber-400">
                  Mínimo: R$ {Number(cobranca.valor_pago || 0).toLocaleString('pt-BR')} (já pago)
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label className="text-slate-300">Vencimento</Label>
              <Input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className="bg-slate-950 border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Método Previsto</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger className="bg-slate-950 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                <SelectItem value="CARTAO">Cartão de Crédito</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-white/5">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
