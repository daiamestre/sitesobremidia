import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, DollarSign } from 'lucide-react';

interface NovaPropostaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NovaPropostaModal: React.FC<NovaPropostaModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { empresaOperadoraId, representante, user } = useAuth();
  const { toast } = useToast();

  const [clientes, setClientes] = useState<any[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [numeroProposta, setNumeroProposta] = useState('');
  const [valorTotal, setValorTotal] = useState<number>(10000);
  const [desconto, setDesconto] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<string>('BOLETO');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchClientes();
    }
  }, [isOpen]);

  const fetchClientes = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('id, codigo_cliente, empresas(razao_social, nome_fantasia)')
      .is('deleted_at', null);

    setClientes(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClienteId) {
      toast({
        title: 'Selecione um Cliente',
        description: 'Pelas regras de governança ERP, nenhuma proposta pode ser criada sem cliente vinculado.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const valorFinal = valorTotal - desconto;
      const { error } = await supabase.from('propostas').insert({
        empresa_operadora_id: empresaOperadoraId || '7d62aaec-e24d-4273-b257-867183cf658c',
        cliente_id: selectedClienteId,
        representante_id: representante?.id || null,
        numero_proposta: numeroProposta,
        valor_total: valorTotal,
        desconto: desconto,
        valor_final: valorFinal,
        forma_pagamento: formaPagamento,
        status: 'DRAFT',
        created_by: user?.id
      });

      if (error) throw error;

      toast({
        title: 'Proposta Criada com Sucesso!',
        description: `Proposta ${numeroProposta} vinculada ao cliente selecionado.`
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({
        title: 'Erro ao criar proposta',
        description: err.message || 'Falha ao registrar proposta no PostgreSQL.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-white/10 text-white rounded-2xl p-6 shadow-2xl">
        <DialogHeader className="border-b border-white/10 pb-3">
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Emitir Nova Proposta Comercial
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Registro transacional vinculado diretamente a um Cliente do banco de dados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Cliente Obrigatório</label>
            <Select value={selectedClienteId} onValueChange={setSelectedClienteId}>
              <SelectTrigger className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs">
                <SelectValue placeholder="Selecione o Cliente..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                {clientes.map(c => {
                  const emp = c.empresas?.[0];
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      #{c.codigo_cliente} - {emp?.nome_fantasia || emp?.razao_social || 'Cliente'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Número da Proposta</label>
            <Input
              value={numeroProposta}
              onChange={(e) => setNumeroProposta(e.target.value)}
              className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Valor Total (R$)</label>
              <Input
                type="number"
                value={valorTotal}
                onChange={(e) => setValorTotal(Number(e.target.value))}
                className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Desconto (R$)</label>
              <Input
                type="number"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
                className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Forma de Pagamento</label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger className="bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white">
                <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                <SelectItem value="PIX">PIX à Vista / Parcelado</SelectItem>
                <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10 text-white text-xs">
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="gradient-primary glow-primary font-bold text-xs">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Proposta Rascunho'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
