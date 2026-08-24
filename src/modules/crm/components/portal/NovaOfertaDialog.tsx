import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BadgePercent, Plus, Trash2, Package } from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import type { Produto, OfertaCanal } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';

interface NovaOfertaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSucesso: () => void;
}

export function NovaOfertaDialog({ open, onOpenChange, onSucesso }: NovaOfertaDialogProps) {
  const { usuario, empresaOperadoraId } = useAuth();
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    data_inicio: new Date().toISOString().slice(0, 10),
    data_fim: '',
    canal: 'TODOS' as OfertaCanal,
    destaque: false,
  });
  const [itens, setItens] = useState<{ produto_id: string; preco_oferta: string }[]>([]);

  useEffect(() => {
    if (open && usuario?.cliente_id) {
      customerCommerceService.listarProdutos(usuario.cliente_id).then((data) => setProdutos(data.filter((p) => p.ativo)));
    }
  }, [open, usuario?.cliente_id]);

  const adicionarItem = () => {
    const disponiveis = produtos.filter((p) => !itens.some((i) => i.produto_id === p.id));
    if (disponiveis.length === 0) return;
    setItens([...itens, { produto_id: disponiveis[0].id, preco_oferta: String(disponiveis[0].preco_atual) }]);
  };

  const atualizarItem = (index: number, patch: Partial<{ produto_id: string; preco_oferta: string }>) => {
    const novo = [...itens];
    novo[index] = { ...novo[index], ...patch };
    setItens(novo);
  };

  const removerItem = (index: number) => setItens(itens.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!usuario?.cliente_id || !empresaOperadoraId) {
      toast({ title: 'Erro', description: 'Identidade do cliente não resolvida.', variant: 'destructive' });
      return;
    }
    if (form.titulo.trim().length < 3) {
      toast({ title: 'Título obrigatório', description: 'Informe um título para a oferta.', variant: 'destructive' });
      return;
    }
    if (!form.data_fim || form.data_fim < form.data_inicio) {
      toast({ title: 'Período inválido', description: 'A data final deve ser maior ou igual à data inicial.', variant: 'destructive' });
      return;
    }
    if (itens.length === 0) {
      toast({ title: 'Nenhum produto', description: 'Adicione ao menos um produto à oferta.', variant: 'destructive' });
      return;
    }

    const itensValidos = itens.map((item) => {
      const produto = produtos.find((p) => p.id === item.produto_id)!;
      const precoOferta = parseFloat(item.preco_oferta.replace(',', '.'));
      return {
        produto_id: produto.id,
        preco_original: produto.preco_atual,
        preco_oferta: isNaN(precoOferta) ? produto.preco_atual : precoOferta,
        desconto_porcentagem: isNaN(precoOferta) || precoOferta >= produto.preco_atual
          ? 0
          : Math.round(((produto.preco_atual - precoOferta) / produto.preco_atual) * 100),
      };
    });

    const invalida = itensValidos.find((i) => i.preco_oferta > i.preco_original);
    if (invalida) {
      toast({ title: 'Preço de oferta inválido', description: 'O preço da oferta não pode ser maior que o preço oficial.', variant: 'destructive' });
      return;
    }

    setSalvando(true);
    const oferta = await customerCommerceService.criarOferta(usuario.cliente_id, empresaOperadoraId, {
      titulo: form.titulo.trim(),
      descricao: form.descricao,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      canal: form.canal,
      destaque: form.destaque,
      itens: itensValidos,
    });
    setSalvando(false);

    if (oferta) {
      toast({ title: 'Oferta criada', description: `"${oferta.titulo}" criada em status DRAFT.` });
      setForm({ titulo: '', descricao: '', data_inicio: new Date().toISOString().slice(0, 10), data_fim: '', canal: 'TODOS', destaque: false });
      setItens([]);
      onOpenChange(false);
      onSucesso();
    } else {
      toast({ title: 'Erro', description: 'Não foi possível criar a oferta.', variant: 'destructive' });
    }
  };

  const produtoDe = (id: string) => produtos.find((p) => p.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BadgePercent className="h-5 w-5 text-amber-400" /> Nova Oferta
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            O preço da oferta parte do preço oficial do produto e nunca pode superá-lo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Título da oferta *</Label>
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Semana do Arroz — até 20% off" className="bg-slate-900 border-white/10 text-white" />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Descrição</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className="bg-slate-900 border-white/10 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Início *</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Fim *</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Canal de distribuição</Label>
              <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v as OfertaCanal })}>
                <SelectTrigger className="bg-slate-900 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  {(['TODOS', 'WEB', 'WHATSAPP', 'TELA', 'LED', 'TV', 'INSTAGRAM', 'PORTAL'] as OfertaCanal[]).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-end">
              <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer">
                <input type="checkbox" checked={form.destaque} onChange={(e) => setForm({ ...form, destaque: e.target.checked })} className="accent-purple-500" />
                Destaque na rede
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-xs">Produtos da oferta</Label>
              <Button size="sm" variant="outline" onClick={adicionarItem} disabled={produtos.length === 0 || itens.length >= produtos.length} className="border-white/10 text-slate-300 gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" /> Adicionar produto
              </Button>
            </div>

            {itens.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-4 border border-dashed border-white/10 rounded-xl">
                {produtos.length === 0 ? 'Cadastre produtos no catálogo primeiro.' : 'Nenhum produto selecionado.'}
              </p>
            )}

            {itens.map((item, idx) => {
              const produto = produtoDe(item.produto_id);
              return (
                <div key={idx} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-purple-400 shrink-0" />
                      <select
                        value={item.produto_id}
                        onChange={(e) => atualizarItem(idx, { produto_id: e.target.value })}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none flex-1 min-w-0"
                      >
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
                      </select>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removerItem(idx)} className="h-7 w-7 text-rose-400 hover:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {produto && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5">
                        <span className="text-slate-500 block">Preço oficial</span>
                        <strong className="text-white">{formatCurrency(produto.preco_atual)}</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5">
                        <span className="text-slate-500 block">Preço da oferta (R$)</span>
                        <Input
                          value={item.preco_oferta}
                          onChange={(e) => atualizarItem(idx, { preco_oferta: e.target.value })}
                          inputMode="decimal"
                          className="bg-transparent border-0 p-0 h-6 text-amber-400 font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={salvando} className="bg-gradient-to-r from-primary to-purple-500 text-white">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BadgePercent className="h-4 w-4 mr-2" />}
            Criar oferta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}