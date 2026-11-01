/**
 * F-234 — PALCO DE OFERTAS (mercado), no estilo do palco da Black Friday: o vídeo passa UM produto de cada vez no
 * pedestal, com o nome e o preço. À esquerda, "Seus produtos" (os mesmos dos encartes, com as fotos reais); no meio, a
 * tela tocando o carrossel como vai ficar; "Criar vídeo do carrossel" abre o editor de vídeo com um clipe por produto
 * (dá para pôr música, mudar o tempo e exportar MP4 para as telas).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clapperboard, FolderOpen, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { CapaQueGira } from '@/components/media/CapaQueGira';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { ENCARTES } from '@/lib/tabloide/encartes';
import type { FormatoDoc } from '@/lib/studio/documento';
import { SEGUNDOS_POR_PRODUTO, palcoDoProduto, projetoDoCarrossel } from '@/lib/studio/palco';
import { CHAVE_PROJETO_DO_CORE } from '@/lib/studio/video/doCore';
import { cn } from '@/lib/utils';
import { useFotosDosEncartes } from './EncartesDoStudio';
import { PainelDeProdutos, useProdutosComFotos } from './ProdutosComFotos';

/** A tela tocando o carrossel: um produto por vez, cada um com a sua animação no palco. */
export function CarrosselNoPalco({ produtos, formato, titulo, className }: { produtos: Parameters<typeof palcoDoProduto>[0][]; formato: FormatoDoc; titulo?: string; className?: string }) {
  const slides = useMemo(() => produtos.map((p, i) => {
    const doc = palcoDoProduto(p, formato, { titulo });
    return { chave: `${i}-${p.nome}-${p.preco}`, animada: () => <PreviaDocumento doc={doc} animar sempre /> };
  }), [produtos, formato, titulo]);
  return <CapaQueGira slides={slides} tempo={SEGUNDOS_POR_PRODUTO * 1000} ajuste="contain" className={cn('rounded-xl', className)} style={{ aspectRatio: formato === '9:16' ? '9 / 16' : '16 / 9' }} />;
}

/** Capa da pasta no catálogo: o palco passando os produtos de exemplo (fotos do catálogo da empresa). */
export function CapaDaPastaPalco() {
  const fotos = useFotosDosEncartes();
  const produtos = useMemo(() => lerLista(ENCARTES[0].produtos).slice(0, 6).map((p) => ({ ...p, imagem: fotos.data?.get(chaveCanonica(p.nome)) ?? null })), [fotos.data]);
  return <CarrosselNoPalco produtos={produtos} formato="9:16" className="h-full" />;
}

export function PalcoDeOfertas() {
  const navegar = useNavigate();
  const s = useProdutosComFotos();
  const [formato, setFormato] = useState<FormatoDoc>('9:16');
  const [titulo, setTitulo] = useState('SUPER OFERTAS');
  const comPreco = s.produtos.filter((p) => p.preco != null);

  const criarVideo = () => {
    if (!comPreco.length) { toast.error('Coloque pelo menos um produto com preço.'); return; }
    const projeto = projetoDoCarrossel(comPreco, formato, { titulo });
    try { sessionStorage.setItem(CHAVE_PROJETO_DO_CORE, JSON.stringify({ projeto, nome: `Palco de Ofertas – ${titulo}` })); } catch { toast.error('Não foi possível abrir o editor de vídeo.'); return; }
    navegar('/studio/video');
  };

  return (
    <div className="space-y-4" data-testid="studio-palco">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Palco de Ofertas – Mercado</h1>
          <p className="text-xs text-slate-400">Um produto de cada vez no palco, com nome e preço ({SEGUNDOS_POR_PRODUTO} s cada) · use os mesmos produtos dos encartes</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['9:16', '16:9'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}{f === '16:9' ? 'TV deitada' : 'TV em pé'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <PainelDeProdutos s={s} destaques={0} botao="Colocar no palco" />
        <section className="space-y-3">
          <label className="flex max-w-md flex-col gap-1 text-xs text-slate-300">Título do palco
            <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 28))} className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm font-bold text-white focus:border-[#B04DFF] focus:outline-none" data-testid="palco-titulo" />
          </label>
          <div className={cn('mx-auto', formato === '9:16' ? 'max-w-[360px]' : 'max-w-[760px]')} data-testid="palco-tela">
            {comPreco.length
              ? <CarrosselNoPalco produtos={comPreco} formato={formato} titulo={titulo} />
              : <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-slate-400">Coloque produtos com preço à esquerda.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={criarVideo} className="flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-5 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="palco-criar-video">
              <Clapperboard className="h-5 w-5" />Criar vídeo do carrossel ({comPreco.length} produtos · {comPreco.length * SEGUNDOS_POR_PRODUTO} s)
            </button>
          </div>
          <p className="text-center text-xs text-slate-500">No editor de vídeo dá para pôr música, mudar o tempo de cada produto, a transição, e exportar o MP4 para as telas.</p>
        </section>
      </div>
    </div>
  );
}
