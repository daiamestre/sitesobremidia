import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { financeiroService } from '../../services/financeiro.service';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';

interface NewReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewReceivableModal({ isOpen, onClose, onSuccess }: NewReceivableModalProps) {
  const { toast } = useToast();
  const { empresaOperadoraId } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [contratoId, setContratoId] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [metodosGateway, setMetodosGateway] = useState<string[]>(['PIX', 'BOLETO']);

  const handleMetodoGatewayChange = (method: string, checked: boolean) => {
    if (checked) {
      setMetodosGateway(prev => [...prev, method]);
    } else {
      setMetodosGateway(prev => prev.filter(m => m !== method));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaOperadoraId) return;

    if (!clienteId) {
      toast({ title: 'Atenção', description: 'Informe o ID do cliente', variant: 'destructive' });
      return;
    }
    if (metodosGateway.length === 0) {
      toast({ title: 'Atenção', description: 'Selecione pelo menos uma forma de pagamento.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const res = await financeiroService.createCobranca({
      empresaOperadoraId,
      clienteId,
      contratoId: contratoId || '00000000-0000-0000-0000-000000000000',
      valor: Number(valor),
      dataVencimento: vencimento,
      metodosGateway
    } as any);
    setLoading(false);

    if (res.success) {
      toast({ title: 'Sucesso', description: 'Cobrança gerada com sucesso!' });
      onSuccess();
      onClose();
    } else {
      toast({ title: 'Erro', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Cobrança Manual</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Cliente ID</Label>
            <Input 
              value={clienteId} 
              onChange={(e) => setClienteId(e.target.value)}
              placeholder="UUID do Cliente"
              className="bg-slate-950 border-white/10"
              required
            />
            {/* TODO: Implementar Select de Cliente real */}
          </div>

          <div className="space-y-2">
            <Label>Contrato ID (Opcional)</Label>
            <Input 
              value={contratoId} 
              onChange={(e) => setContratoId(e.target.value)}
              placeholder="UUID do Contrato"
              className="bg-slate-950 border-white/10"
            />
          </div>

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input 
              type="number"
              step="0.01"
              value={valor} 
              onChange={(e) => setValor(e.target.value)}
              placeholder="0.00"
              className="bg-slate-950 border-white/10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Vencimento</Label>
            <Input 
              type="date"
              value={vencimento} 
              onChange={(e) => setVencimento(e.target.value)}
              className="bg-slate-950 border-white/10"
              required
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-white/10">
            <Label>Métodos de Pagamento Oferecidos</Label>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="metodo-pix"
                  checked={metodosGateway.includes('PIX')}
                  onCheckedChange={(c) => handleMetodoGatewayChange('PIX', !!c)}
                />
                <Label htmlFor="metodo-pix" className="cursor-pointer">PIX</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="metodo-boleto"
                  checked={metodosGateway.includes('BOLETO')}
                  onCheckedChange={(c) => handleMetodoGatewayChange('BOLETO', !!c)}
                />
                <Label htmlFor="metodo-boleto" className="cursor-pointer">Boleto</Label>
              </div>
            </div>
            {metodosGateway.length === 0 && (
              <p className="text-red-400 text-xs">Atenção: Selecione ao menos um método de pagamento.</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Gerar Cobrança
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
