/**
 * F-233 — a PASTA "Encartes de Mercado" do SOBRE MÍDIA Studio, aberta.
 * À esquerda, "Seus produtos": digitar produto e preço (um por linha), bipar o código de barras (pistola ou câmera),
 * editar nome, preço "de" e "por" de cada um — as FOTOS REAIS chegam sozinhas (catálogo da empresa → código de barras →
 * bases abertas, com marca e medida certas). À direita, os 12 encartes já mostram os produtos da pessoa, ao vivo.
 * "Editar encarte" abre o editor completo do Cartaz Digital com esses produtos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, FolderOpen, Loader2, PenLine, ShoppingBasket, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { LeitorDeCodigo } from '@/components/tabloide/LeitorDeCodigo';
import { completarImagens } from '@/lib/tabloide/imagens';
import { lerLinha, lerLista, lerValor, mesclarListas, paraLinha, precoParaTexto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { ENCARTES } from '@/lib/tabloide/encartes';
import { MiniaturaDoEncarte, useFotosDosEncartes } from './EncartesDoStudio';

/** os produtos da pasta seguem para o editor do encarte escolhido (mesma aba do navegador) */
export const CHAVE_PRODUTOS_DO_ENCARTE = 'studio-encarte-produtos';

export function PastaDeEncartes() {
  const navegar = useNavigate();
  const inicial = ENCARTES[0].produtos;
  const [texto, setTexto] = useState(() => { try { return sessionStorage.getItem(CHAVE_PRODUTOS_DO_ENCARTE) || inicial; } catch { return inicial; } });
  const [produtos, setProdutos] = useState<ProdutoTabloide[]>(() => lerLista(texto));
  const [buscando, setBuscando] = useState<string[]>([]);
  const tentados = useRef(new Set<string>());

  // a lista vira o texto (e o texto fica guardado para o editor do encarte)
  const gravar = (lista: ProdutoTabloide[]) => {
    const t = lista.map(paraLinha).join('\n');
    setTexto(t);
    try { sessionStorage.setItem(CHAVE_PRODUTOS_DO_ENCARTE, t); } catch { /* sem armazenamento: segue sem lembrar */ }
  };

  /** fotos reais para quem ainda não tem (uma vez por produto) */
  const procurarFotos = useCallback(async (lista: ProdutoTabloide[]) => {
    const novos = lista.filter((p) => !p.imagem && !tentados.current.has(p.id));
    if (!novos.length) return;
    novos.forEach((p) => tentados.current.add(p.id));
    try {
      const semFoto = await completarImagens(
        novos,
        (id, imagem) => { if (imagem) setProdutos((a) => a.map((p) => (p.id === id ? { ...p, imagem } : p))); },
        setBuscando,
        (id, nomeCerto) => setProdutos((a) => { const n = a.map((p) => (p.id === id ? { ...p, nome: nomeCerto } : p)); gravar(n); return n; }),
      );
      if (semFoto.length) toast.info(`Sem foto automática: ${semFoto.join(', ')}. No editor do encarte dá para escolher ou enviar a foto.`, { duration: 8000 });
    } finally { setBuscando([]); }
  }, []);
  useEffect(() => { void procurarFotos(produtos); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = () => {
    const lidos = lerLista(texto);
    if (!lidos.length) { toast.error('Digite pelo menos um produto, um por linha. Exemplo: Arroz Camil 5kg 25,90'); return; }
    const n = mesclarListas(produtos, lidos);
    setProdutos(n); gravar(n);
    void procurarFotos(n);
  };
  const mudar = (id: string, x: Partial<ProdutoTabloide>) => setProdutos((a) => { const n = a.map((p) => (p.id === id ? { ...p, ...x } : p)); gravar(n); return n; });
  const remover = (id: string) => setProdutos((a) => { const n = a.filter((p) => p.id !== id); gravar(n); return n; });
  const porCodigo = (codigo: string) => {
    if (produtos.some((p) => p.codigo === codigo)) { toast.info('Este produto já está na lista.'); return; }
    const p = lerLinha(codigo);
    if (!p) return;
    setProdutos((a) => { const n = [...a, p]; gravar(n); return n; });
    void procurarFotos([p]);
  };
  const editar = (id: string) => { gravar(produtos); navegar(`/studio/encarte/${id}`); };

  // os encartes de mercado mostram os produtos da pessoa; açougue e hortifruti mantêm os exemplos deles (fotos do catálogo)
  const fotosDoCatalogo = useFotosDosEncartes();
  const comFoto = produtos.filter((p) => p.imagem).length;

  return (
    <div className="space-y-4" data-testid="studio-pasta-encartes-aberta">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Modelos</Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Encartes de Mercado</h1>
          <p className="text-xs text-slate-400">Supermercados · {ENCARTES.length} encartes A4 · coloque os seus produtos e preços: todos os encartes já mostram com as fotos reais</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* ── Seus produtos */}
        <section className="space-y-3 rounded-2xl border border-[#8A2EFF]/40 bg-[#14062f] p-3 lg:sticky lg:top-[84px] lg:max-h-[calc(100dvh-100px)] lg:overflow-y-auto" data-testid="encartes-produtos">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white"><ShoppingBasket className="h-4 w-4 text-[#FFD400]" />Seus produtos <span className="ml-auto text-[11px] font-normal text-slate-400">{produtos.length} produtos · {comFoto} com foto</span></h2>
          <label htmlFor="encartes-texto" className="block text-xs text-slate-300">Um produto por linha, com o preço (os 3 primeiros vão em destaque)</label>
          <textarea id="encartes-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} data-testid="encartes-texto"
            className="w-full rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none"
            placeholder={'Arroz Camil 5kg 25,90\nFeijão Carioca Camil 1kg de 8,99 por 6,49\nCoca-Cola 2L 9,99'} />
          <button type="button" onClick={aplicar} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="encartes-aplicar">
            <Wand2 className="h-4 w-4" />Colocar nos encartes
          </button>
          <div className="rounded-lg bg-white text-slate-900"><LeitorDeCodigo aoLer={porCodigo} /></div>
          {buscando.length > 0 && <p className="flex items-center gap-2 text-xs text-[#FFD400]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando a foto real de {buscando.length === 1 ? buscando[0] : `${buscando.length} produtos`}…</p>}

          <ul className="space-y-1.5" data-testid="encartes-lista">
            {produtos.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-1.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
                  {p.imagem ? <img src={p.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                    : <span className="px-0.5 text-center text-[8px] font-bold leading-tight text-slate-500">{buscando.includes(p.nome) ? 'buscando…' : 'sem foto'}</span>}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <input aria-label="Nome do produto" value={p.nome} onChange={(e) => mudar(p.id, { nome: e.target.value })}
                    className="h-7 w-full rounded border border-white/10 bg-black/30 px-1.5 text-xs text-white focus:border-[#B04DFF] focus:outline-none" />
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    {i < 3 && <span className="rounded bg-[#FFD400] px-1 font-bold text-[#22004A]">destaque</span>}
                    de<input aria-label="Preço antigo (de)" inputMode="decimal" value={precoParaTexto(p.precoDe)} onChange={(e) => mudar(p.id, { precoDe: lerValor(e.target.value) })} placeholder="—"
                      className="h-6 w-14 rounded border border-white/10 bg-black/30 px-1 text-right text-xs text-white" />
                    por<input aria-label="Preço (por)" inputMode="decimal" value={precoParaTexto(p.preco)} onChange={(e) => mudar(p.id, { preco: lerValor(e.target.value) })} placeholder="0,00"
                      className="h-6 w-16 rounded border border-white/10 bg-black/30 px-1 text-right text-xs font-bold text-white" />
                  </div>
                </div>
                <button type="button" onClick={() => remover(p.id)} aria-label={`Tirar ${p.nome}`} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/15"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── os 12 encartes com os produtos da pessoa */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Encartes com os seus produtos" data-testid="studio-encartes">
          {ENCARTES.map((e) => {
            return (
              <article key={e.id} className="sm-cartao-luz flex flex-col overflow-hidden rounded-xl p-2.5" data-testid="studio-encarte-card">
                <button type="button" onClick={() => editar(e.id)} aria-label={`Editar o encarte ${e.nome}`} className="block w-full text-left">
                  <MiniaturaDoEncarte e={e} fotos={fotosDoCatalogo.data} produtos={e.segmento === 'mercado' ? produtos : undefined} />
                </button>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-white">{e.nome.replace(/ – Encarte Grande$/, '')}</p>
                <p className="flex items-center gap-1 text-[10px] text-slate-400"><FileText className="h-3 w-3" />{e.segmento === 'mercado' ? 'com os seus produtos' : e.segmento === 'acougue' ? 'açougue (cortes de exemplo)' : 'hortifruti (exemplo)'}</p>
                <button type="button" onClick={() => editar(e.id)} className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-1.5 text-xs font-semibold text-white transition hover:bg-[#8A2EFF]" data-testid="studio-editar-encarte">
                  <PenLine className="h-3.5 w-3.5" />Editar encarte
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
