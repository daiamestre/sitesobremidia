import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, CheckCircle2, ArrowLeft, CreditCard, MessageCircle, Edit, Eye, Link } from 'lucide-react';
import { ContaReceberCompleta } from '../../services/financeiro.service';
import { useToast } from '@/hooks/use-toast';
import { EditReceivableModal } from './EditReceivableModal';
import { ManualPaymentModal } from './ManualPaymentModal';

interface ReceivableDetailsProps {
  conta: ContaReceberCompleta;
  onBack: () => void;
  onPaymentSuccess: () => void;
}

export function ReceivableDetails({ conta, onBack, onPaymentSuccess }: ReceivableDetailsProps) {
  const { toast } = useToast();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const urlPublica = `${window.location.origin}/cobranca/${conta.numero_documento}/${conta.public_token}`;

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardHeader className="border-b border-white/10 pb-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            {conta.codigo_operacional || conta.numero_documento}
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Resumo financeiro e ações operacionais da cobrança.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {conta.status !== 'CANCELADO' && (
            <Button
              variant="outline"
              onClick={() => setIsEditModalOpen(true)}
              className="border-white/10 text-slate-300 text-xs rounded-xl gap-1 hover:bg-white/5"
            >
              <Edit className="h-4 w-4" /> Editar
            </Button>
          )}

          {conta.public_token && conta.public_enabled && (
            <>
              <Button
                variant="outline"
                onClick={() => window.open(urlPublica, '_blank')}
                className="border-blue-500/50 text-blue-400 text-xs rounded-xl gap-1 hover:bg-blue-500/10"
              >
                <Eye className="h-4 w-4" /> Pré-visualizar como Cliente
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(urlPublica);
                  toast({ title: 'Link Copiado', description: 'Link de cobrança copiado para a área de transferência.' });
                }}
                className="border-primary/20 text-primary text-xs rounded-xl gap-1 hover:bg-primary/10"
              >
                <Link className="h-4 w-4" /> Copiar Link
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const nomeCliente = conta.cliente?.empresas?.[0]?.nome_fantasia || conta.cliente?.empresas?.[0]?.razao_social || 'Cliente';
                  const comp = conta.competencia ? ` referente a competência ${conta.competencia}` : '';
                  const text = `Olá, ${nomeCliente}! Sua cobrança da SOBRE MÍDIA${comp} está disponível.\n\nValor: R$ ${Number(conta.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nVencimento: ${new Date(conta.vencimento).toLocaleDateString('pt-BR')}\n\nAcesse o link abaixo para visualizar e realizar o pagamento:\n${urlPublica}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="border-green-500/50 text-green-500 text-xs rounded-xl gap-1 hover:bg-green-500/10"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
            </>
          )}

          {conta.status !== 'PAGO' && conta.status !== 'CANCELADO' && (
            <Button 
              onClick={() => setIsPaymentModalOpen(true)} 
              className="gradient-primary glow-primary font-bold text-xs rounded-xl gap-2 shadow-xl border-transparent"
            >
              <CheckCircle2 className="h-4 w-4" /> Registrar Pagamento
            </Button>
          )}

          <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300 text-xs rounded-xl gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Valor Original:</span>
            <strong className="text-white text-sm font-bold">R$ {Number(conta.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Valor Recebido:</span>
            <strong className="text-blue-400 text-sm font-bold">R$ {Number(conta.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Saldo a Receber:</span>
            <strong className="text-emerald-400 text-sm font-bold">R$ {Number(conta.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
            <span className="text-slate-400 block">Vencimento:</span>
            <strong className="text-amber-400 text-sm font-bold">{new Date(conta.vencimento).toLocaleDateString('pt-BR')}</strong>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Informações Auxiliares */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 text-xs">
            <h4 className="font-bold text-white mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4 text-slate-400" /> Dados da Cobrança</h4>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Cliente:</span> <span>{conta.cliente?.empresas?.[0]?.nome_fantasia || conta.cliente?.empresas?.[0]?.razao_social || 'Cliente'}</span></p>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Contrato:</span> <span>{conta.contrato?.numero_contrato || 'Avulso'}</span></p>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Competência:</span> <span>{conta.competencia || 'N/A'}</span></p>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Observações:</span> <span>{conta.notes || '—'}</span></p>
          </div>
          
          {/* Histórico Resumido (Pagamentos e Conciliação poderiam ir aqui) */}
           <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2 text-xs">
            <h4 className="font-bold text-white mb-2">Resumo Operacional</h4>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Status Financeiro:</span> <strong className="text-primary">{conta.status}</strong></p>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Qtd. Recebimentos:</span> <span>{conta.pagamentos?.length || 0}</span></p>
            <p className="text-slate-300 flex justify-between"><span className="text-slate-500">Régua de Cobrança:</span> <span>{conta.status === 'PAGO' ? 'Finalizada' : 'Em andamento'}</span></p>
          </div>
        </div>

      </CardContent>

      <EditReceivableModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        cobranca={conta as any} 
        onSuccess={() => {
          setIsEditModalOpen(false);
          onPaymentSuccess();
        }} 
      />

      <ManualPaymentModal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        conta={conta} 
        onSuccess={() => {
          setIsPaymentModalOpen(false);
          onPaymentSuccess();
        }} 
      />
    </Card>
  );
}
