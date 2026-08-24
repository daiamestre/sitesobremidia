import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Package, Plus, Loader2, ShoppingBasket, Pencil, Trash2, ShieldCheck,
  ImageOff, History, Search, TrendingDown, ArrowLeftRight, Eye,
} from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import type { Produto, PrecoAuditoria, ProdutoPreco } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';
import { NovoProdutoDialog } from '../../components/portal/NovoProdutoDialog';
import { PrecoDialog } from '../../components/portal/PrecoDialog';

const CARD_GRADIENTS = [
  'from-purple-500/20 to-indigo-500/10',
  'from-fuchsia-500/20 to-purple-500/10',
  'from-blue-500/20 to-purple-500/10',
  'from-violet-500/20 to-fuchsia-500/10',
];

export default function ProdutosPage() {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [dialogNovo, setDialogNovo] = useState(false);

  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<ProdutoPreco[]>([]);
  const [auditoria, setAuditoria] = useState<PrecoAuditoria[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [dialogPreco, setDialogPreco] = useState(false);
  const [dialogEditar, setDialogEditar] = useState(false);
  const [formEditar, setFormEditar] = useState({ nome: '', categoria: '', marca: '', descricao: '' });

  const carregar = useCallback(async () => {
    if (!usuario?.cliente_id) {
      setProdutos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await customerCommerceService.listarProdutos(usuario.cliente_id);
    setProdutos(data);
    setLoading(false);
  }, [usuario?.cliente_id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const categorias = Array.from(new Set(produtos.map((p) => p.categoria).filter(Boolean))) as string[];

  const filtrados = produtos.filter((p) => {
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      p.nome.toLowerCase().includes(q) ||
      (p.marca || '').toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q);
    const matchC = filtroCategoria === 'TODAS' || p.categoria === filtroCategoria;
    return matchQ && matchC;
  });

  const abrirDetalhe = async (produto: Produto) => {
    setProdutoSelecionado(produto);
    setCarregandoDetalhe(true);
    const [hist, aud] = await Promise.all([
      customerCommerceService.listarHistoricoPrecos(produto.id),
      customerCommerceService.listarAuditoriaPreco(produto.id),
    ]);
    setHistorico(hist);
    setAuditoria(aud);
    setCarregandoDetalhe(false);
  };

  const abrirEdicao = (produto: Produto) => {
    setFormEditar({ nome: produto.nome, categoria: produto.categoria || '', marca: produto.marca || '', descricao: produto.descricao || '' });
    setDialogEditar(true);
  };

  const salvarEdicao = async () => {
    if (!produtoSelecionado) return;
    const ok = await customerCommerceService.atualizarProduto(produtoSelecionado.id, formEditar);
    if (ok) {
      toast({ title: 'Produto atualizado', description: 'Alterações salvas.' });
      setDialogEditar(false);
      await carregar();
      const atualizado = await customerCommerceService.listarProdutos(usuario?.cliente_id);
      const novo = atualizado.find((p) => p.id === produtoSelecionado.id);
      if (novo) setProdutoSelecionado(novo);
    } else {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o produto.', variant: 'destructive' });
    }
  };

  const excluirProduto = async (produto: Produto) => {
    if (!window.confirm(`Excluir "${produto.nome}" do catálogo?`)) return;
    const ok = await customerCommerceService.excluirProduto(produto.id);
    if (ok) {
      toast({ title: 'Produto excluído', description: `"${produto.nome}" foi removido.` });
      setProdutoSelecionado(null);
      await carregar();
    } else {
      toast({ title: 'Erro', description: 'Não foi possível excluir o produto.', variant: 'destructive' });
    }
  };

  const estaEmPromocao = (p: Produto) => {
    if (p.preco_promocional == null) return false;
    const hoje = new Date().toISOString().slice(0, 10);
    if (p.promocao_inicio && p.promocao_inicio > hoje) return false;
    if (p.promocao_fim && p.promocao_fim < hoje) return false;
    return true;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBasket className="h-6 w-6 text-primary" /> Catálogo de Produtos
          </h2>
          <p className="text-slate-400 text-sm mt-1">Produtos oficiais do seu negócio. Preços são dados oficiais, com auditoria em cada alteração.</p>
        </div>
        <Button onClick={() => setDialogNovo(true)} className="bg-gradient-to-r from-primary to-purple-500 text-white font-bold gap-2">
          <Plus className="h-4 w-4" /> Novo Produto
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, marca ou categoria..."
            className="pl-9 bg-slate-900 border-white/10 text-white"
          />
        </div>
        {categorias.length > 1 && (
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="TODAS">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <Package className="h-12 w-12 mx-auto text-slate-600 mb-4" />
          <p className="text-lg font-medium">Nenhum produto no catálogo.</p>
          <p className="text-sm mt-2">Cadastre seus produtos para criar ofertas e campanhas.</p>
          <Button onClick={() => setDialogNovo(true)} className="mt-4 bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
            <Plus className="h-4 w-4" /> Cadastrar primeiro produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((produto, idx) => {
            const emPromocao = estaEmPromocao(produto);
            return (
              <Card
                key={produto.id}
                className="border border-white/10 bg-slate-900/80 hover:border-primary/40 transition-all cursor-pointer overflow-hidden"
                onClick={() => abrirDetalhe(produto)}
              >
                <div className={`h-24 bg-gradient-to-br ${CARD_GRADIENTS[idx % CARD_GRADIENTS.length]} relative`}>
                  {produto.imagem_url ? (
                    <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-10 w-10 text-purple-400/60" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge className={produto.ativo ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                      {produto.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-white truncate">{produto.nome}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                      {produto.marca && <span className="text-purple-400">{produto.marca}</span>}
                      {produto.categoria && (
                        <Badge variant="outline" className="border-white/10 text-slate-400 text-[10px]">{produto.categoria}</Badge>
                      )}
                      <span className="text-slate-500">{produto.unidade_medida}</span>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase tracking-wider block">Preço oficial</span>
                      <span className="text-xl font-bold text-white">{formatCurrency(produto.preco_atual)}</span>
                    </div>
                    {emPromocao && (
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider block">Promoção</span>
                        <span className="text-lg font-bold text-amber-400 flex items-center gap-1">
                          <TrendingDown className="h-4 w-4" /> {formatCurrency(produto.preco_promocional ?? 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detalhe do produto */}
      <Dialog open={!!produtoSelecionado} onOpenChange={(open) => { if (!open) setProdutoSelecionado(null); }}>
        <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> {produtoSelecionado?.nome}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              {produtoSelecionado?.marca && <span>{produtoSelecionado.marca} · </span>}
              {produtoSelecionado?.categoria || 'Sem categoria'} · {produtoSelecionado?.unidade_medida}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
              <span className="text-slate-500 text-[10px] uppercase block">Preço oficial</span>
              <strong className="text-xl text-white">{formatCurrency(produtoSelecionado?.preco_atual ?? 0)}</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
              <span className="text-slate-500 text-[10px] uppercase block">Preço promocional</span>
              <strong className="text-xl text-amber-400">
                {produtoSelecionado?.preco_promocional != null ? formatCurrency(produtoSelecionado.preco_promocional) : '—'}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setDialogPreco(true)} className="bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Alterar preço (auditado)
            </Button>
            <Button size="sm" variant="outline" onClick={() => abrirEdicao(produtoSelecionado!)} className="border-white/10 text-slate-300 gap-2">
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={() => excluirProduto(produtoSelecionado!)} className="border-rose-500/30 text-rose-400 gap-2">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Preço protegido: qualquer alteração exige justificativa e fica registrada em auditoria.
          </div>

          {carregandoDetalhe ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Tabs defaultValue="auditoria" className="w-full">
              <TabsList className="bg-slate-900 border border-white/10">
                <TabsTrigger value="auditoria" className="text-xs gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Auditoria de preço</TabsTrigger>
                <TabsTrigger value="historico" className="text-xs gap-1.5"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
              </TabsList>
              <TabsContent value="auditoria" className="space-y-2">
                {auditoria.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-6">Nenhuma alteração de preço registrada.</p>
                ) : (
                  auditoria.map((a) => (
                    <div key={a.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-medium">{a.responsavel_nome || 'Responsável'}</span>
                        <span className="text-slate-500 text-xs">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-rose-400 line-through">{formatCurrency(a.valor_anterior)}</span>
                        <ArrowLeftRight className="h-3 w-3 text-slate-500" />
                        <span className="text-emerald-400">{formatCurrency(a.valor_novo)}</span>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">{a.tipo_alteracao.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-slate-400 text-xs italic">"{a.justificativa}"</p>
                    </div>
                  ))
                )}
              </TabsContent>
              <TabsContent value="historico" className="space-y-2">
                {historico.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-6">Nenhuma versão de preço registrada.</p>
                ) : (
                  historico.map((h) => (
                    <div key={h.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-sm flex items-center justify-between">
                      <div>
                        <span className="text-white font-medium">{formatCurrency(h.preco)}</span>
                        {h.preco_promocional != null && (
                          <span className="text-amber-400 ml-2">promo: {formatCurrency(h.preco_promocional)}</span>
                        )}
                      </div>
                      <span className="text-slate-500 text-xs">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <NovoProdutoDialog open={dialogNovo} onOpenChange={setDialogNovo} onSucesso={carregar} />
      <PrecoDialog produto={produtoSelecionado} open={dialogPreco} onOpenChange={setDialogPreco} onSucesso={() => { abrirDetalhe(produtoSelecionado!); }} />

      {/* Edição */}
      <Dialog open={dialogEditar} onOpenChange={setDialogEditar}>
        <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Editar Produto</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">Preço não é editado aqui — use "Alterar preço" para manter a auditoria.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Nome</Label>
              <Input value={formEditar.nome} onChange={(e) => setFormEditar({ ...formEditar, nome: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs">Categoria</Label>
                <Input value={formEditar.categoria} onChange={(e) => setFormEditar({ ...formEditar, categoria: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-xs">Marca</Label>
                <Input value={formEditar.marca} onChange={(e) => setFormEditar({ ...formEditar, marca: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Descrição</Label>
              <Input value={formEditar.descricao} onChange={(e) => setFormEditar({ ...formEditar, descricao: e.target.value })} className="bg-slate-900 border-white/10 text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogEditar(false)} className="border-white/10 text-slate-300">Cancelar</Button>
            <Button onClick={salvarEdicao} className="bg-gradient-to-r from-primary to-purple-500 text-white">
              <Eye className="h-4 w-4 mr-2" /> Salvar alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}