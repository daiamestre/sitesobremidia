/**
 * Janela "Foto do produto": buscar outra foto, enviar a sua ou criar com IA. Usada no Cartaz Digital e, desde a F-242, no
 * SOBRE MÍDIA Studio (Seus produtos, Palco de Ofertas). Quem chama grava a escolha no catálogo (a foto volta sozinha).
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Loader2, Plus, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buscarCandidatos, buscarProdutosDaMarca, fotosAceitas, gerarImagemIA, imagemDaMarca, type CandidatoImagem } from '@/lib/tabloide/imagens';
import type { ProdutoOficial } from '@/lib/tabloide/buscaProduto';
import type { ImagemProduto, ProdutoTabloide } from '@/lib/tabloide/parseProdutos';

export function TrocarFoto({ produto, aoFechar, aoEscolher }: { produto: Pick<ProdutoTabloide, 'nome'>; aoFechar: () => void; /** `termo` é o produto buscado: diferente do atual, é a troca por outro produto */ aoEscolher: (img: ImagemProduto, termo: string) => void }) {
  const { user } = useAuth();
  const [termo, setTermo] = useState(produto.nome);
  const [cands, setCands] = useState<CandidatoImagem[] | null>(null);
  const [oficiais, setOficiais] = useState<ProdutoOficial[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [criando, setCriando] = useState(false);

  const criarComIA = async () => {
    setCriando(true);
    try {
      const r = await gerarImagemIA(termo || produto.nome);
      if (r.imagem) aoEscolher(r.imagem, termo); else toast.error(r.motivo || 'A IA não conseguiu criar a imagem agora.');
    } finally { setCriando(false); }
  };

  const buscar = useCallback(async (t: string) => {
    setCands(null);
    setOficiais([]);
    // F-256: as imagens oficiais das marcas aparecem na hora; a busca nas outras fontes demora mais
    void buscarProdutosDaMarca(t).then((l) => setOficiais(l.slice(0, 24)));
    // F-283: só foto de embalagem do produto (e, para fresco, só a que a IA confirmou): nada de estátua, campo ou prato de restaurante
    setCands(fotosAceitas(t, await buscarCandidatos(t)));
  }, []);
  useEffect(() => { void buscar(produto.nome); }, [buscar, produto.nome]);

  const enviar = async (arq: File | undefined) => {
    if (!arq || !user?.id) return;
    if (!arq.type.startsWith('image/')) { toast.error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    if (arq.size > 8 * 1024 * 1024) { toast.error('A imagem tem mais de 8 MB. Escolha uma menor.'); return; }
    setEnviando(true);
    try {
      const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { publicUrl } = await uploadToR2(arq, `${user.id}/tabloide/${Date.now()}-produto.${ext}`, arq.type, user.id);
      aoEscolher({ url: publicUrl, fonte: 'UPLOAD' }, termo);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar a imagem.');
    } finally { setEnviando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-w-2xl" data-testid="tabloide-trocar-foto">
        <DialogHeader><DialogTitle>Foto de “{produto.nome}”</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-[160px] flex-1" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(termo)} aria-label="Buscar outra foto" />
          <Button variant="outline" onClick={() => buscar(termo)}>Buscar</Button>
          <Button variant="outline" onClick={criarComIA} disabled={criando} data-testid="tabloide-criar-ia" title="Cria um produto genérico, sem marca">
            {criando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} {criando ? 'Criando (até 1 min)…' : 'Criar com IA'}
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar a minha
            <input type="file" accept="image/*" className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
          </label>
        </div>
        {oficiais.length > 0 && (
          <section data-testid="tabloide-oficiais">
            <h3 className="mb-1 text-sm font-medium">Imagem oficial da marca</h3>
            <div className="grid max-h-[40vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {oficiais.map((l) => (
                <button key={l.imagem_url} type="button" onClick={() => aoEscolher(imagemDaMarca(l), l.nome)} className="overflow-hidden rounded-lg border bg-white text-left hover:ring-2 hover:ring-primary">
                  <img src={l.imagem_url} alt={l.nome} loading="lazy" crossOrigin="anonymous" className="aspect-square w-full object-contain" />
                  <span className="block truncate bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{l.nome}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {cands === null ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Procurando fotos…</p>
        ) : cands.length === 0 ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><ImageIcon className="h-4 w-4" /> Não achamos uma foto boa. Tente outro nome ou envie a sua.</p>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {cands.map((c) => (
              <button key={c.url} type="button" onClick={() => aoEscolher({ url: c.url, fonte: c.fonte, credito: c.credito }, termo)} className="overflow-hidden rounded-lg border bg-white text-left hover:ring-2 hover:ring-primary">
                <img src={c.miniatura} alt={c.legenda} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-contain" />
                <span className="block truncate bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.legenda || c.fonte}</span>
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={aoFechar}><Plus className="mr-1 h-4 w-4 rotate-45" /> Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}
