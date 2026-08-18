import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DollarSign, CheckCircle2, Loader2, ArrowLeft, CreditCard } from 'lucide-react';
import { ContaReceberCompleta, financeiroService, TipoPagamento } from '../../services/financeiro.service';
import { useToast } from '@/hooks/use-toast';

interface ReceivableDetailsProps {
  conta: ContaReceberCompleta;
  onBack: () => void;
  onPaymentSuccess: () => void;
}

export function ReceivableDetails({ conta, onBack, onPaymentSuccess }: ReceivableDetailsProps) {
  const { toast } = useToast();
  const [valor, setValor] = useState(conta.saldo);
  const [tipo, setTipo] = useState<TipoPagamento>('PIX');
  const [txid, setTxid] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegisterPayment = async () => {
    if (valor <= 0) {
      toast({ title: 'Valor Inválido', description: 'Informe um valor maior que R$ 0,00', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    const res = await financeiroService.registerPayment({
      contaReceberId: conta.id,
      tipo,
      valor: Number(valor),
      txid: txid || `TX-${Date.now()}`,
    });
    setIsSubmitting(false);

    if (res.success) {
      toast({ title: 'Pagamento Registrado!', description: 'Baixa efetuada e comissão liberada.' });
      onPaymentSuccess();
    } else {
      toast({ title: 'Erro no Pagamento', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardHeader className="border-b border-white/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Detalhes do Título #{conta.numero_documento}
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Registro de liquidação, conciliação e baixas financeiras.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300 text-xs rounded-xl gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Valor Original:</span>
            <strong className="text-white text-sm font-bold">R$ {Number(conta.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Valor Pago:</span>
            <strong className="text-blue-400 text-sm font-bold">R$ {Number(conta.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Saldo Restante:</span>
            <strong className="text-emerald-400 text-sm font-bold">R$ {Number(conta.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Vencimento:</span>
            <strong className="text-amber-400 text-sm font-bold">{new Date(conta.vencimento).toLocaleDateString('pt-BR')}</strong>
          </div>
        </div>

        {conta.status !== 'PAGO' && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-4">
            <h4 className="font-bold text-xs text-white flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-primary" /> Registrar Liquidação / Pagamento
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Valor do Pagamento (R$)</Label>
                <Input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(Number(e.target.value))}
                  className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Forma de Pagamento</Label>
                <Select value={tipo} onValueChange={(val) => setTipo(val as TipoPagamento)}>
                  <SelectTrigger className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-xs">
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

              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Identificador / TXID / NSU (Opcional)</Label>
                <Input
                  placeholder="Ex: TX-9988776655"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  className="bg-slate-900 border-white/10 text-white rounded-xl h-10 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleRegisterPayment}
                disabled={isSubmitting}
                className="gradient-primary glow-primary font-bold text-xs px-6 h-10 rounded-xl gap-2 shadow-xl"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>Confirmar Pagamento & Dar Baixa</span>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
