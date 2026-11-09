/**
 * F-233/F-234 — "SEUS PRODUTOS": o painel de produtos usado na pasta de Encartes e no Palco de Ofertas.
 * Digitar produto e preço (um por linha), bipar o código de barras (pistola ou câmera), editar nome, "de" e "por" —
 * as FOTOS REAIS chegam sozinhas (catálogo da empresa → código de barras → bases abertas, com marca e medida certas).
 * A lista fica guardada na aba do navegador e vale para os encartes, o palco e o editor do encarte.
 * F-242: o painel começa FECHADO (só o cartão com as fotos); NOME + MARCA + MEDIDA + PREÇO são obrigatórios, com
 * exemplos; cada produto pergunta "é promoção?" (abre o "de"); "Trocar foto" grava a escolha no catálogo — da próxima
 * vez que o produto entrar, a mesma foto volta sozinha.
 * F-244: o cliente escolhe quantos produtos mostrar (padrão 16, até 20), sempre à vista, mesmo com a lista fechada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ImagePlus, Loader2, ShoppingBasket, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { LeitorDeCodigo } from '@/components/tabloide/LeitorDeCodigo';
import { TrocarFoto } from '@/components/tabloide/TrocarFoto';
import { AvisoDeProdutos } from '@/components/tabloide/AvisoDeProdutos';
import { NovoProduto } from '@/components/tabloide/NovoProduto';
import { faltasDoProduto, revisarProdutos } from '@/lib/tabloide/produtoCompleto';
import { completarImagens, guardarFotoDoProduto, prepararFotoDoProduto } from '@/lib/tabloide/imagens';
import { lerLinha, lerLista, lerValor, mesclarListas, paraLinha, precoParaTexto, type ImagemProduto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { CESTA_PADRAO } from '@/lib/tabloide/encartes';
import { QUANTIDADES, gravarQuantidade, lerQuantidade, quantidadeCompleta } from '@/lib/studio/gradeInteligente';
import { cn } from '@/lib/utils';

/** os produtos colocados na pasta seguem para o editor do encarte e para o palco (mesma aba do navegador) */
export const CHAVE_PRODUTOS_DO_ENCARTE = 'studio-encarte-produtos';

export { faltasDoProduto };

export interface ProdutosComFotos {
  texto: string; setTexto: (t: string) => void;
  produtos: ProdutoTabloide[];
  buscando: string[];
  /** F-242: linhas digitadas que ainda não podem entrar (o que falta em cada uma) */
  erros: Array<{ linha: string; faltas: string[] }>;
  duvidas: Record<string, number>;
  aplicar: () => void;
  mudar: (id: string, x: Partial<ProdutoTabloide>) => void;
  remover: (id: string) => void;
  porCodigo: (codigo: string) => void;
  gravar: (lista: ProdutoTabloide[]) => void;
  /** F-242: troca a foto e grava no catálogo (volta sozinha da próxima vez) */
  trocarFoto: (p: ProdutoTabloide, imagem: ImagemProduto) => Promise<void>;
  /** F-244: quantos produtos mostrar nos encartes e no palco */
  quantos: number; escolherQuantos: (n: number) => void;
}

/** F-259: a lista da farmácia fica guardada à parte (não mistura com a do mercado) */
export const CHAVE_PRODUTOS_DA_FARMACIA = 'studio-encarte-produtos-farmacia';

export function useProdutosComFotos(inicial = CESTA_PADRAO, chave = CHAVE_PRODUTOS_DO_ENCARTE): ProdutosComFotos {
  const [texto, setTexto] = useState(() => { try { return sessionStorage.getItem(chave) || inicial; } catch { return inicial; } });
  const [produtos, setProdutos] = useState<ProdutoTabloide[]>(() => lerLista(texto));
  const [buscando, setBuscando] = useState<string[]>([]);
  const [erros, setErros] = useState<ProdutosComFotos['erros']>([]);
  const [duvidas, setDuvidas] = useState<Record<string, number>>({});
  const [quantos, setQuantos] = useState(lerQuantidade);
  const escolherQuantos = useCallback((n: number) => { setQuantos(n); gravarQuantidade(n); }, []);
  const tentados = useRef(new Set<string>());

  // a lista vira o texto (e o texto fica guardado para o editor do encarte e para o palco)
  const gravar = useCallback((lista: ProdutoTabloide[]) => {
    const t = lista.map(paraLinha).join('\n');
    setTexto(t);
    try { sessionStorage.setItem(chave, t); } catch { /* sem armazenamento: segue sem lembrar */ }
  }, [chave]);

  /** fotos reais para quem ainda não tem (uma vez por produto) */
  const procurarFotos = useCallback(async (lista: ProdutoTabloide[]) => {
    const novos = lista.filter((p) => !p.imagem && !tentados.current.has(p.id));
    if (!novos.length) return;
    novos.forEach((p) => tentados.current.add(p.id));
    try {
      await completarImagens(
        novos,
        (id, imagem) => { if (imagem) setProdutos((a) => a.map((p) => (p.id === id ? { ...p, imagem } : p))); },
        setBuscando,
        (id, nomeCerto) => setProdutos((a) => { const n = a.map((p) => (p.id === id ? { ...p, nome: nomeCerto } : p)); gravar(n); return n; }),
        (nome, parecidos) => setDuvidas((d) => ({ ...d, [nome]: parecidos })),
      );
    } finally { setBuscando([]); }
  }, [gravar]);
  useEffect(() => { void procurarFotos(produtos); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = () => {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    const lidos = lerLista(texto);
    if (!lidos.length) { toast.error('Digite pelo menos um produto, um por linha. Exemplo: Arroz Camil 5kg 24,90'); return; }
    // F-279 (regra do dono): a lista SEMPRE entra no encarte, sem bloqueio; o que faltar aparece depois no aviso vermelho
    const ruins = linhas.map((linha) => { const p = lerLinha(linha); return { linha, faltas: p ? faltasDoProduto(p) : ['nome e preço'] }; }).filter((e) => e.faltas.length);
    setErros(ruins);
    const n = mesclarListas(produtos, lidos);
    setProdutos(n); gravar(n);
    void procurarFotos(n);
    if (n.some((p) => p.precoDe == null)) toast.info('É promoção? Ligue "Promoção" no produto e coloque o preço DE (ex.: de 49,90 por 39,90).', { duration: 7000 });
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
  const trocarFoto = async (produto: ProdutoTabloide, imagem: ImagemProduto) => {
    // F-280: o cliente escolheu a foto: o produto sai do aviso "confira a foto"
    setDuvidas((d) => { const { [produto.nome]: _, ...resto } = d; return resto; });
    setProdutos((a) => a.map((p) => (p.id === produto.id ? { ...p, imagem } : p)));
    try {
      // F-252: identifica se tem fundo e tira; grava no catálogo pelo nome (e pelo código de barras): vira a foto do produto
      const aviso = toast.loading('Tirando o fundo do produto…');
      const pronta = await prepararFotoDoProduto(imagem, produto.nome);
      toast.dismiss(aviso);
      if (pronta !== imagem) setProdutos((a) => a.map((p) => (p.id === produto.id ? { ...p, imagem: pronta } : p)));
      if (await guardarFotoDoProduto(produto.nome, pronta, produto.codigo)) toast.success(`Foto guardada como a foto de "${produto.nome}".`);
      else toast.error(`Foto não aprovada${pronta.recusa ? `: ${pronta.recusa}` : ''}. Ela ficou só nesta arte; envie uma foto do produto inteiro.`);
    } catch { toast.error('A foto entrou, mas não foi possível guardá-la para a próxima vez.'); }
  };
  return { texto, setTexto, produtos, buscando, erros, duvidas, aplicar, mudar, remover, porCodigo, gravar, trocarFoto, quantos, escolherQuantos };
}

const EXEMPLOS = ['Arroz Camil Tipo 1 5kg 24,90', 'Feijão Carioca Kicaldo 1kg de 8,99 por 6,49', 'Coca-Cola Original 2L 9,99', 'Picanha kg de 89,90 por 69,90'];

/** Um produto da lista: foto (toque para trocar), nome, "é promoção?" (abre o "de") e o preço. */
function LinhaDoProduto({ p, s, destaque, aoTrocarFoto, atencao }: { p: ProdutoTabloide; s: ProdutosComFotos; destaque: boolean; aoTrocarFoto: () => void; /** F-280: precisa de atenção (falta informação ou a foto pode não ser o produto) */ atencao?: string | null }) {
  const [promo, setPromo] = useState(p.precoDe != null);
  const faltas = faltasDoProduto(p);
  return (
    <li className={cn('flex items-center gap-2 rounded-lg border bg-black/20 p-1.5', atencao ? 'border-2 border-red-500 shadow-[0_0_14px_rgba(239,68,68,.9)] motion-safe:animate-pulse' : 'border-white/10')} data-testid="produto-linha" data-atencao={atencao ? 'sim' : undefined}>
      <button type="button" onClick={aoTrocarFoto} title="Trocar a foto" aria-label={`Trocar a foto de ${p.nome}`} className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
        {p.imagem ? <img src={p.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" />
          : <span className="px-0.5 text-center text-[8px] font-bold leading-tight text-slate-500">{s.buscando.includes(p.nome) ? 'buscando…' : 'pôr foto'}</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><ImagePlus className="h-4 w-4 text-white" /></span>
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <input aria-label="Nome do produto" value={p.nome} onChange={(e) => s.mudar(p.id, { nome: e.target.value })}
          className="h-8 w-full rounded border border-white/10 bg-black/30 px-1.5 text-xs text-white focus:border-[#B04DFF] focus:outline-none" />
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
          {destaque && <span className="rounded bg-[#FFD400] px-1 font-bold text-[#22004A]">destaque</span>}
          <label className={cn('flex h-6 cursor-pointer items-center gap-1 rounded-full border px-1.5 font-semibold', promo ? 'border-[#ff4d5e] bg-[#ff4d5e]/15 text-[#ff8a96]' : 'border-white/15 text-slate-300')} title="É promoção? (de … por …)">
            <input type="checkbox" className="h-3 w-3 accent-[#ff4d5e]" checked={promo} onChange={(e) => { setPromo(e.target.checked); if (!e.target.checked) s.mudar(p.id, { precoDe: null }); }} data-testid="produto-promocao" />Promoção
          </label>
          {promo && <>de<input aria-label="Preço antigo (de)" inputMode="decimal" value={precoParaTexto(p.precoDe)} onChange={(e) => s.mudar(p.id, { precoDe: lerValor(e.target.value) })} placeholder="49,90" autoFocus={p.precoDe == null}
            className="h-6 w-14 rounded border border-white/10 bg-black/30 px-1 text-right text-xs text-white" /></>}
          {promo ? 'por' : 'preço'}<input aria-label="Preço (por)" inputMode="decimal" value={precoParaTexto(p.preco)} onChange={(e) => s.mudar(p.id, { preco: lerValor(e.target.value) })} placeholder="0,00"
            className="h-6 w-16 rounded border border-white/10 bg-black/30 px-1 text-right text-xs font-bold text-white" />
        </div>
        {atencao && <p className="flex items-center gap-1 text-[10px] font-semibold text-red-500"><AlertTriangle className="h-3 w-3 shrink-0" />{faltas.length ? `Falta: ${faltas.join(', ')}` : atencao}</p>}
      </div>
      <button type="button" onClick={() => s.remover(p.id)} aria-label={`Tirar ${p.nome}`} className="rounded p-1.5 text-rose-300 hover:bg-rose-500/15"><Trash2 className="h-4 w-4" /></button>
    </li>
  );
}

export function PainelDeProdutos({ s, destaques = 3, botao = 'Colocar nos encartes', aberto: abertoInicial = false, emGrade = true }: { s: ProdutosComFotos; destaques?: number; botao?: string; /** F-242: começa fechado (só o cartão) */ aberto?: boolean; /** F-244: encarte = grade completa; palco = um produto por vez */ emGrade?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [trocando, setTrocando] = useState<ProdutoTabloide | null>(null);
  const lista = useRef<HTMLUListElement>(null);
  const comFoto = s.produtos.filter((p) => p.imagem).length;
  const incompletos = s.produtos.filter((p) => faltasDoProduto(p).length).length;
  // F-256: confere enquanto o cliente digita, com a lista aberta ou fechada
  const revisao = revisarProdutos(s.texto, s.produtos, s.produtos.filter((p) => !p.imagem && !s.buscando.includes(p.nome)).map((p) => p.nome), s.duvidas);
  // F-280: o motivo de cada produto que precisa de atenção (o mesmo do aviso vermelho)
  const motivoDe = (p: ProdutoTabloide) => revisao.itens.find((i) => i.nome === p.nome.trim())?.motivo ?? null;
  const irParaCorrigir = () => { setAberto(true); setTimeout(() => (lista.current?.querySelector('[data-atencao="sim"]') ?? lista.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); };
  const naGrade = quantidadeCompleta(s.quantos, s.produtos.length);
  const faltam = s.quantos - s.produtos.length;
  return (
    <section className={cn('rounded-2xl border border-[#8A2EFF]/40 bg-[#14062f] p-3', aberto && 'space-y-3 lg:sticky lg:top-[84px] lg:max-h-[calc(100dvh-100px)] lg:overflow-y-auto')} data-testid="encartes-produtos">
      {/* o CARTÃO: contagem e as fotos; tocar abre a lista */}
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="flex w-full items-center gap-2 text-left" data-testid="produtos-cartao">
        <ShoppingBasket className="h-5 w-5 shrink-0 text-[#FFD400]" />
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap text-sm font-bold text-white">Seus produtos</span>
          <span className="block truncate text-[11px] text-slate-400">{s.produtos.length} produtos · {comFoto} com foto{incompletos ? ` · ${incompletos} incompleto${incompletos > 1 ? 's' : ''}` : ''}</span>
        </span>
        <span className="hidden shrink-0 -space-x-2 sm:flex" aria-hidden>
          {s.produtos.filter((p) => p.imagem).slice(0, 3).map((p) => <img key={p.id} src={p.imagem!.url} alt="" className="h-8 w-8 rounded-full border-2 border-[#14062f] bg-white object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" />)}
        </span>
        <span className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white">{aberto ? 'Fechar' : 'Editar'}<ChevronDown className={cn('h-4 w-4 transition', aberto && 'rotate-180')} /></span>
      </button>

      <AvisoDeProdutos itens={revisao.itens} total={revisao.total} className="mt-2" aoTocar={irParaCorrigir} />

      {/* F-244: sempre à vista, mesmo com a lista fechada */}
      <div className="mt-2 flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Quantos produtos mostrar" data-testid="produtos-quantidade">
        <span className="mr-1 text-xs font-semibold text-slate-300">Mostrar</span>
        {QUANTIDADES.map((q) => (
          <button key={q} type="button" role="radio" aria-checked={s.quantos === q} onClick={() => s.escolherQuantos(q)} title={q === 16 ? 'Padrão: 16 produtos' : `${q} produtos`}
            className={cn('h-8 min-w-8 rounded-lg px-1.5 text-xs font-bold', s.quantos === q ? 'bg-[#FFD400] text-[#22004A]' : 'bg-white/10 text-white hover:bg-white/20')}>{q}</button>
        ))}
      </div>
      {faltam > 0 && (
        <p className="mt-1.5 text-[11px] font-semibold text-amber-300" data-testid="produtos-aviso-quantidade">
          {emGrade ? `A lista tem ${s.produtos.length} produtos: a grade mostra ${naGrade} para ficar completa. Coloque mais ${faltam} para chegar a ${s.quantos}.` : `A lista tem ${s.produtos.length} produtos. Coloque mais ${faltam} para chegar a ${s.quantos}.`}
        </p>
      )}

      {aberto && (
        <>
          <NovoProduto escuro aoAdicionar={(linha) => s.setTexto(s.texto.trim() ? `${s.texto.trim()}\n${linha}` : linha)} />
          <div>
            <label htmlFor="encartes-texto" className="text-xs font-semibold text-white">Produtos adicionados</label>
            <p className="text-[11px] leading-snug text-slate-400">Pode editar aqui o sabor, o peso ou o preço. Um produto por linha.{destaques ? ` Os ${destaques} primeiros vão em destaque.` : ''}</p>
          </div>
          <textarea id="encartes-texto" aria-label="Produtos, um por linha" value={s.texto} onChange={(e) => s.setTexto(e.target.value)} rows={6} data-testid="encartes-texto"
            className="w-full rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-[#B04DFF] focus:outline-none"
            placeholder={EXEMPLOS.join('\n')} />
          <button type="button" onClick={s.aplicar} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="encartes-aplicar">
            <Wand2 className="h-4 w-4" />{botao}
          </button>
          <div className="rounded-lg bg-white text-slate-900"><LeitorDeCodigo aoLer={s.porCodigo} /></div>
          {s.buscando.length > 0 && <p className="flex items-center gap-2 text-xs text-[#FFD400]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando a foto real de {s.buscando.length === 1 ? s.buscando[0] : `${s.buscando.length} produtos`}…</p>}
          <ul ref={lista} className="space-y-1.5" data-testid="encartes-lista">
            {s.produtos.map((p, i) => <LinhaDoProduto key={p.id} p={p} s={s} destaque={i < destaques} aoTrocarFoto={() => setTrocando(p)} atencao={motivoDe(p)} />)}
          </ul>
        </>
      )}
      {trocando && <TrocarFoto produto={trocando} aoFechar={() => setTrocando(null)} aoEscolher={(img) => { const p = trocando; setTrocando(null); void s.trocarFoto(p, img); }} />}
    </section>
  );
}
