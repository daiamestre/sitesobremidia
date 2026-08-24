import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PackagePlus } from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';

interface NovoProdutoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSucesso: () => void;
}

export function NovoProdutoDialog({ open, onOpenChange, onSucesso }: NovoProdutoDialogProps) {
  const { usuario, empresaOperadoraId } = useAuth();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    categoria: '',
    marca: '',
    unidade_medida: 'UN',
    codigo: '',
    descricao: '',
  });

  const handleSubmit = async () => {
    if (!usuario?.cliente_id || !empresaOperadoraId) {
      toast({ title: 'Erro', description: 'Identidade do cliente não resolvida.', variant: 'destructive' });
      return;
    }
    if (form.nome.trim().length < 2) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome do produto.', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    const produto = await customerCommerceService.criarProduto(usuario.cliente_id, empresaOperadoraId, form);
    setSalvando(false);
    if (produto) {
      toast({ title: 'Produto criado', description: `"${produto.nome}" adicionado ao catálogo.` });
      setForm({ nome: '', categoria: '', marca: '', unidade_medida: 'UN', codigo: '', descricao: '' });
      onOpenChange(false);
      onSucesso();
    } else {
      toast({ title: 'Erro', description: 'Não foi possível criar o produto.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <PackagePlus className="h-5 w-5 text-primary" /> Novo Produto
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            O produto entra no catálogo oficial do seu cliente. O preço é definido depois, com auditoria obrigatória.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Nome do produto *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Arroz Tipo 1 — 5kg" className="bg-slate-900 border-white/10 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Categoria</Label>
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Mercearia" className="bg-slate-900 border-white/10 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Marca</Label>
              <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} placeholder="Ex.: Marca X" className="bg-slate-900 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Código (opcional)</Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ex.: 789100..." className="bg-slate-900 border-white/10 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Unidade de medida</Label>
              <Select value={form.unidade_medida} onValueChange={(v) => setForm({ ...form, unidade_medida: v })}>
                <SelectTrigger className="bg-slate-900 border-white/10 text-white">
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  {['UN', 'KG', 'G', 'L', 'ML', 'CX', 'PC'].map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Descrição</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className="bg-slate-900 border-white/10 text-white" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-slate-300">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={salvando} className="bg-gradient-to-r from-primary to-purple-500 text-white">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackagePlus className="h-4 w-4 mr-2" />}
            Criar produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}