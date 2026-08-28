import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { financeiroService, TipoPagamento, ContaReceberCompleta } from '../../services/financeiro.service';
import { useToast } from '@/hooks/use-toast';

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conta: ContaReceberCompleta;
  onSuccess: () => void;
}

export function ManualPaymentModal({ isOpen, onClose, conta, onSuccess }: ManualPaymentModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [valor, setValor] = useState<number>(Number(conta.saldo) || 0);
  const [tipo, setTipo] = useState<TipoPagamento>('PIX');
  const [txid, setTxid] = useState('');
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().substring(0, 10));

  const handleRegisterPayment = async () => {
    if (valor <= 0) {
      toast({ title: 'Valor Inválido', description: 'Informe um valor maior que R$ 0,00', variant: 'destructive' });
      return;
    }
    
    if (valor > Number(conta.saldo)) {
      toast({ title: 'Valor Acima do Saldo', description: 'Não é permitido baixar um valor maior que o saldo devedor.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    const res = await financeiroService.registerPayment({
      contaReceberId: conta.id,
      tipo,
      valor: Number(valor),
      txid: txid || `TX-${Date.now()}`,
      dataPagamento: dataPagamento ? `${dataPagamento}T12:00:00Z` : undefined
    });
    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Pagamento Registrado!', description: 'Baixa efetuada com sucesso.' });
      onSuccess();
      onClose();
    } else {
      toast({ title: 'Erro no Pagamento', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Liquidação Manual</DialogTitle>
          <DialogDescription className="text-slate-400">
            {conta.codigo_operacional} - Saldo devedor atual: R$ {Number(conta.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Valor do Pagamento (R$)</Label>
              <Input
                type="number"
                value={valor}
                onChange={(e) => setValor(Number(e.target.value))}
                max={Number(conta.saldo)}
                step="0.01"
                className="bg-slate-950 border-white/10 text-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-slate-300">Data de Liquidação</Label>
              <Input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="bg-slate-950 border-white/10 text-white [&::-webkit-calendar-picker-indicator]:filter-[invert(1)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Forma de Pagamento</Label>
            <Select value={tipo} onValueChange={(val) => setTipo(val as TipoPagamento)}>
              <SelectTrigger className="bg-slate-950 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                <SelectItem value="PIX">PIX</SelectItem>
                <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                <SelectItem value="CARTÃO">Cartão de Crédito</SelectItem>
                <SelectItem value="TRANSFERÊNCIA">TED / Transferência</SelectItem>
                <SelectItem value="DINHEIRO">Dinheiro Espécie</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Identificador / TXID / NSU (Opcional)</Label>
            <Input
              placeholder="Ex: TX-9988776655"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              className="bg-slate-950 border-white/10 text-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-white/5">
            Cancelar
          </Button>
          <Button 
            onClick={handleRegisterPayment} 
            disabled={isSubmitting}
            className="gradient-primary glow-primary border-transparent"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar Pagamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
