import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock } from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import type { Produto } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';

interface PrecoDialogProps {
  produto: Produto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSucesso: () => void;
}

export function PrecoDialog({ produto, open, onOpenChange, onSucesso }: PrecoDialogProps) {
  const { toast } = useToast();
  const [novoPreco, setNovoPreco] = useState('');
  const [precoPromocional, setPrecoPromocional] = useState('');
  const [promocaoInicio, setPromocaoInicio] = useState('');
  const [promocaoFim, setPromocaoFim] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async () => {
    if (!produto) return;
    const preco = parseFloat(novoPreco.replace(',', '.'));
    if (isNaN(preco) || preco < 0) {
      toast({ title: 'Preço inválido', description: 'Informe um preço oficial válido.', variant: 'destructive' });
      return;
    }
    if (justificativa.trim().length < 3) {
      toast({ title: 'Justificativa obrigatória', description: 'Toda alteração de preço exige justificativa registrada em auditoria.', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    const promocional = precoPromocional ? parseFloat(precoPromocional.replace(',', '.')) : null;
    const resultado = await customerCommerceService.atualizarPreco(
      produto.id,
      preco,
      justificativa.trim(),
      promocional,
      promocaoInicio || null,
      promocaoFim || null
    );
    setSalvando(false);
    if (resultado.success) {
      toast({
        title: 'Preço atualizado com auditoria',
        description: `R$ ${formatCurrency(resultado.preco_anterior ?? 0)} → R$ ${formatCurrency(resultado.preco_novo ?? preco)}. Alteração registrada.`,
      });
      setNovoPreco('');
      setPrecoPromocional('');
      setPromocaoInicio('');
      setPromocaoFim('');
      setJustificativa('');
      onOpenChange(false);
      onSucesso();
    } else {
      toast({ title: 'Erro', description: resultado.error || 'Falha ao atualizar preço.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Lock className="h-5 w-5 text-amber-400" /> Alterar Preço — {produto?.nome}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Preço é informação oficial. A alteração passa pela plataforma, exige justificativa e fica registrada em auditoria (valor original, valor novo, responsável, data e motivo).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-sm flex items-center justify-between">
            <span className="text-slate-400">Preço atual</span>
            <strong className="text-white">{formatCurrency(produto?.preco_atual ?? 0)}</strong>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Novo preço oficial (R$)</Label>
            <Input
              value={novoPreco}
              onChange={(e) => setNovoPreco(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="bg-slate-900 border-white/10 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Preço promocional (R$) — opcional</Label>
            <Input
              value={precoPromocional}
              onChange={(e) => setPrecoPromocional(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="bg-slate-900 border-white/10 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Início da promoção</Label>
              <Input type="date" value={promocaoInicio} onChange={(e) => setPromocaoInicio(e.target.value)} className="bg-slate-900 border-white/10 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Fim da promoção</Label>
              <Input type="date" value={promocaoFim} onChange={(e) => setPromocaoFim(e.target.value)} className="bg-slate-900 border-white/10 text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Justificativa (obrigatória)</Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: reajuste de fornecedor, promoção de lançamento..."
              rows={3}
              className="bg-slate-900 border-white/10 text-white"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={salvando} className="bg-gradient-to-r from-primary to-purple-500 text-white">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            Registrar alteração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}