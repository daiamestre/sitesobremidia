/**
 * F-234 — PALCO DE OFERTAS (mercado), no estilo do palco da Black Friday: o vídeo passa UM produto de cada vez no
 * pedestal, com o nome e o preço. "Criar vídeo do carrossel" abre o editor de vídeo com um clipe por produto (dá para pôr
 * música, mudar o tempo e exportar MP4 para as telas).
 * F-242: tela de edição COMPACTA e responsiva (PC, tablet, celular):
 *  - a tela no meio e, embaixo, a fila de produtos. F-249: tocar em QUALQUER elemento da tela (produto, nome, balão, botão, logo,
 *    faixas), mesmo com ela se mexendo, abre as ferramentas completas do editor do Studio: arrastar, aumentar, girar, trocar,
 *    texto, fonte, cor e movimento. O que se edita vale para todos os produtos do palco (só nome, preço e foto são de cada um);
 *  - "Seus produtos" fica fechado num cartão (abre a lista ao tocar);
 *  - F-244: o cliente escolhe quantos produtos passam no palco (padrão 16, até 20);
 *  - fundo e botão OFERTAS/ALERTAS; MOVIMENTO: de que lado entram o produto, o nome e o balão, e para que lado o
 *    carrossel passa de um produto ao outro (vale na tela e no vídeo); cada produto fica 8 s.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, FolderOpen, ImagePlus, Monitor, Move, MousePointerClick, Palette, Pause, PenLine, Play, RotateCcw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { Palco as PalcoDoEditor } from '@/components/studio/editor/Palco';
import { CartaoDaAba, abasDe, type Aba } from '@/components/studio/editor/Paineis';
import { TrocarFoto } from '@/components/tabloide/TrocarFoto';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista, lerValor, precoParaTexto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { CESTA_MERCADO } from '@/lib/tabloide/encartes';
import { TAMANHO_DOC, camadaNoPonto, type Camada, type Documento, type FormatoDoc } from '@/lib/studio/documento';
import { FUNDOS_DO_PALCO, SEGUNDOS_POR_PRODUTO, TRANSICOES_DO_CARROSSEL, palcoDoProduto, projetoDoCarrossel, srcDoFundo, type AjustesDoPalco, type FundoDoPalco, type MovimentoDoPalco } from '@/lib/studio/palco';
import type { TipoDeTransicao } from '@/lib/studio/video/linha';
import { CHAVE_PROJETO_DO_CORE } from '@/lib/studio/video/doCore';
import { cn } from '@/lib/utils';
import { useFotosDosEncartes } from './EncartesDoStudio';
import { logoSalvaDoStudio } from '@/lib/studio/logoDoStudio';
import { PainelDeProdutos, faltasDoProduto, useProdutosComFotos } from './ProdutosComFotos';
import { gravarLogoDoEncarte, lerLogoDoEncarte, type LogoDaPasta } from '@/lib/studio/logos';
import { EscolherLogo } from './PastaDeLogos';

type ProdutoDoPalco = Parameters<typeof palcoDoProduto>[0];
const CHAVE_OPCOES = 'studio-palco-opcoes';

// a troca de um produto para o outro na tela, igual à transição do vídeo
const TROCA: Record<string, { entra: string; sai: string }> = {
  'deslizar-esquerda': { entra: 'translateX(100%)', sai: 'translateX(-100%)' },
  'deslizar-direita': { entra: 'translateX(-100%)', sai: 'translateX(100%)' },
  'deslizar-cima': { entra: 'translateY(100%)', sai: 'translateY(-100%)' },
  zoom: { entra: 'scale(.6)', sai: 'scale(1.4)' },
  dissolver: { entra: 'none', sai: 'none' },
};
function estiloDaTroca(t: TipoDeTransicao | undefined, lado: 'entra' | 'sai'): React.CSSProperties {
  const tipo = TROCA[t ?? ''] ? t! : 'deslizar-esquerda';
  return { animation: `palco-${lado}-${tipo.replace(/[^a-z]/g, '')} .55s cubic-bezier(.2,.7,.2,1) both` };
}
const ESTILO_DAS_TROCAS = Object.keys(TROCA).map((t) => {
  const n = t.replace(/[^a-z]/g, '');
  return `@keyframes palco-entra-${n}{from{transform:${TROCA[t].entra};opacity:${t === 'dissolver' ? 0 : 1}}to{transform:none;opacity:1}}@keyframes palco-sai-${n}{from{transform:none;opacity:1}to{transform:${TROCA[t].sai};opacity:${t === 'dissolver' ? 0 : 1}}}`;
}).join('');

/** F-249: qual elemento está no ponto tocado da tela. */
function elementoTocado(ev: MouseEvent<HTMLElement>, d: Documento): string | null {
  const r = ev.currentTarget.getBoundingClientRect();
  const { w, h } = TAMANHO_DOC[d.formato];
  return camadaNoPonto(d, ((ev.clientX - r.left) / r.width) * w, ((ev.clientY - r.top) / r.height) * h)?.nome ?? null;
}

/** A tela tocando o carrossel: um produto por vez (8 s), cada um com a sua animação, trocando para o lado escolhido. */
export function CarrosselNoPalco({ produtos, formato, titulo, className, fundo = FUNDOS_DO_PALCO[0], textoBotao, movimento, logoDoPalco, ajustes, aoTocar }: { produtos: ProdutoDoPalco[]; formato: FormatoDoc; titulo?: string; className?: string; fundo?: FundoDoPalco | null; textoBotao?: string; movimento?: MovimentoDoPalco; logoDoPalco?: LogoDaPasta | null; ajustes?: AjustesDoPalco; /** F-249: tocou num elemento da tela */ aoTocar?: (produto: number, elemento: string | null) => void }) {
  const docs = useMemo(() => produtos.map((p) => palcoDoProduto(p, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes })), [produtos, formato, titulo, fundo, textoBotao, movimento, logoDoPalco, ajustes]);
  const [vez, setVez] = useState({ i: 0, anterior: null as number | null, n: 0 });
  useEffect(() => {
    if (docs.length < 2) return;
    const t = setTimeout(() => setVez((v) => ({ i: (v.i + 1) % docs.length, anterior: v.i, n: v.n + 1 })), SEGUNDOS_POR_PRODUTO * 1000);
    return () => clearTimeout(t);
  }, [vez, docs.length]);
  useEffect(() => { if (vez.anterior == null) return; const t = setTimeout(() => setVez((v) => ({ ...v, anterior: null })), 600); return () => clearTimeout(t); }, [vez.anterior]);
  const i = docs.length ? vez.i % docs.length : 0;
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-black', aoTocar && 'cursor-pointer', className)} style={{ aspectRatio: formato === '9:16' ? '9 / 16' : '16 / 9' }} data-testid="palco-carrossel"
      onClick={aoTocar && docs[i] ? (ev) => aoTocar(i, elementoTocado(ev, docs[i])) : undefined}>
      <style>{ESTILO_DAS_TROCAS}</style>
      {vez.anterior != null && docs[vez.anterior] && (
        <div key={`sai-${vez.n}`} className="absolute inset-0" style={estiloDaTroca(movimento?.transicao, 'sai')}><PreviaDocumento doc={docs[vez.anterior]} sempre className="h-full w-full" /></div>
      )}
      {docs[i] && <div key={`entra-${vez.n}`} className="absolute inset-0" style={vez.n ? estiloDaTroca(movimento?.transicao, 'entra') : undefined}><PreviaDocumento doc={docs[i]} animar sempre className="h-full w-full" /></div>}
    </div>
  );
}

/** Capa da pasta no catálogo: o palco passando os produtos de exemplo (fotos do catálogo da empresa). */
export function CapaDaPastaPalco() {
  const fotos = useFotosDosEncartes();
  const produtos = useMemo(() => lerLista(CESTA_MERCADO).slice(0, 6).map((p) => ({ ...p, imagem: fotos.data?.get(chaveCanonica(p.nome)) ?? null })), [fotos.data]);
  return <CarrosselNoPalco produtos={produtos} formato="9:16" className="h-full" />;
}

const ROTULOS: Record<string, string> = { Produto: 'Foto do produto', 'Nome do produto': 'Nome do produto', 'Preço': 'Balão de preço', 'Botão': 'Botão', 'Logo do palco': 'Logo' };
const rotulo = (nome: string) => ROTULOS[nome] ?? nome;

function Cartao({ titulo, icone: Icone, children, acao }: { titulo: string; icone: typeof Move; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-white/10 bg-[#14062f] p-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Icone className="h-4 w-4 text-[#B04DFF]" />{titulo}{acao && <span className="ml-auto">{acao}</span>}</h2>
      {children}
    </section>
  );
}
const campoCss = 'h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white focus:border-[#B04DFF] focus:outline-none';

function lerOpcoes(): { fundoId?: string; textoBotao?: string; movimento?: MovimentoDoPalco; formato?: FormatoDoc; ajustes?: AjustesDoPalco } {
  try { return JSON.parse(localStorage.getItem(CHAVE_OPCOES) ?? '{}'); } catch { return {}; }
}

export function PalcoDeOfertas() {
  const navegar = useNavigate();
  const s = useProdutosComFotos();
  const salvas = useMemo(lerOpcoes, []);
  const [formato, setFormato] = useState<FormatoDoc>(salvas.formato ?? '9:16');
  const [titulo, setTitulo] = useState('SUPER OFERTAS');
  // F-237: fundo OFICIAL do dono (o padrão) e o texto do botão no lugar do "YOUR LOGO"
  const [fundoId, setFundoId] = useState<string>(salvas.fundoId ?? FUNDOS_DO_PALCO[0].id);
  const fundo = FUNDOS_DO_PALCO.find((f) => f.id === fundoId) ?? null;
  const [textoBotao, setTextoBotao] = useState(salvas.textoBotao ?? FUNDOS_DO_PALCO[0].botoes[0]);
  const [movimento, setMovimento] = useState<MovimentoDoPalco>(salvas.movimento ?? {});
  // F-249: o que o cliente editou nos elementos fica guardado e vale para todos os produtos
  const [ajustes, setAjustes] = useState<AjustesDoPalco>(salvas.ajustes ?? {});
  useEffect(() => { try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify({ fundoId, textoBotao, movimento, formato, ajustes })); } catch { /* sem armazenamento */ } }, [fundoId, textoBotao, movimento, formato, ajustes]);

  // F-244: só os produtos escolhidos passam no palco
  const comPreco = s.produtos.filter((p) => p.preco != null).slice(0, s.quantos);
  // F-248: a logo do palco vem da pasta Logos
  const chaveLogo = `palco-${fundoId}`;
  const [logoDoPalco, setLogoDoPalco] = useState<LogoDaPasta | null>(() => lerLogoDoEncarte(chaveLogo));
  useEffect(() => { setLogoDoPalco(lerLogoDoEncarte(chaveLogo)); }, [chaveLogo]);
  const [trocandoLogo, setTrocandoLogo] = useState(false);
  const escolherLogo = (l: LogoDaPasta | null) => { gravarLogoDoEncarte(chaveLogo, l); setLogoDoPalco(l); setTrocandoLogo(false); };
  // produto escolhido para editar (null = a tela toca o carrossel)
  const [selId, setSelId] = useState<string | null>(null);
  const sel = comPreco.find((p) => p.id === selId) ?? null;
  const [trocando, setTrocando] = useState<ProdutoTabloide | null>(null);
  const [promo, setPromo] = useState(false);
  useEffect(() => { setPromo(sel?.precoDe != null); }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  // F-249: o elemento escolhido na tela (a identidade é o nome dele), a tela tocando e o "ver o movimento" de um elemento
  const [nomeSel, setNomeSel] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('texto');
  const [tocando, setTocando] = useState(true);
  const [demo, setDemo] = useState<{ nome: string; ciclo: number } | null>(null);
  const fimDoDemo = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(fimDoDemo.current), []);
  const edicao = useRef<HTMLDivElement>(null);
  const docSel = useMemo(() => (sel ? palcoDoProduto(sel, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes }) : null), [sel, formato, titulo, fundo, textoBotao, movimento, logoDoPalco, ajustes]);
  const camadaSel = docSel?.camadas.find((c) => c.id === nomeSel) ?? null;
  const abas = abasDe(camadaSel).filter((a) => a.id !== 'camadas' && a.id !== 'video' && a.id !== 'fundo');
  const andar = (d: number) => { if (!comPreco.length) return; const i = Math.max(0, comPreco.findIndex((p) => p.id === selId)); setSelId(comPreco[(i + d + comPreco.length) % comPreco.length].id); };
  const escolherElemento = (nome: string | null) => {
    clearTimeout(fimDoDemo.current); setDemo(null); setNomeSel(nome);
    if (!nome) return;
    setTocando(false);
    edicao.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  useEffect(() => { if (camadaSel) setAba(abasDe(camadaSel)[0].id); }, [nomeSel]); // eslint-disable-line react-hooks/exhaustive-deps
  /** o nome e o preço são de cada produto; todo o resto vale para todos */
  const mudarElemento = (nome: string, patch: Partial<Camada>) => {
    if (!sel || !docSel) return;
    const c = docSel.camadas.find((x) => x.id === nome);
    if (!c) return;
    const resto = { ...patch } as Partial<Camada> & Record<string, unknown>;
    if (nome === 'Nome do produto' && typeof resto.texto === 'string') { s.mudar(sel.id, { nome: resto.texto }); delete resto.texto; }
    if (c.tipo === 'selo' && nome === 'Preço' && ('valor' in resto || 'sufixo' in resto)) {
      const inteiro = String(resto.valor ?? c.valor), cent = String(resto.sufixo ?? c.sufixo).replace(/\D/g, '');
      s.mudar(sel.id, { preco: lerValor(`${inteiro},${cent || '00'}`) });
      delete resto.valor; delete resto.sufixo;
    }
    if (nome === 'Produto') delete resto.src;
    if (Object.keys(resto).length) setAjustes((a) => ({ ...a, [formato]: { ...a[formato], [nome]: { ...a[formato]?.[nome], ...resto } } }));
    // escolheu um movimento: o elemento repete 2 vezes e depois a arte inteira toca
    if (patch.animacao) {
      const ciclo = Math.max(1.4, 0.2 + patch.animacao.duracao + 0.5);
      setDemo({ nome, ciclo }); setTocando(false);
      clearTimeout(fimDoDemo.current);
      fimDoDemo.current = setTimeout(() => { setDemo(null); setTocando(true); }, 2 * (ciclo + 0.35) * 1000);
    }
  };
  const voltarAoPadrao = (nome: string) => setAjustes((a) => { const f = { ...a[formato] }; delete f[nome]; return { ...a, [formato]: f }; });
  const docNaTela = useMemo(() => {
    if (!docSel || !demo) return docSel;
    return { ...docSel, camadas: docSel.camadas.map((c) => (c.id === demo.nome ? { ...c, animacao: c.animacao ? { ...c.animacao, atraso: 0.2 } : null } : { ...c, animacao: null })) };
  }, [docSel, demo]);

  const criarVideo = () => {
    if (!comPreco.length) { toast.error('Coloque pelo menos um produto com preço.'); return; }
    const incompletos = comPreco.filter((p) => faltasDoProduto(p).length);
    if (incompletos.length) { toast.error(`Complete antes: falta ${faltasDoProduto(incompletos[0]).join(', ')} em “${incompletos[0].nome}”.`); setSelId(incompletos[0].id); return; }
    const projeto = projetoDoCarrossel(comPreco, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes });
    try { sessionStorage.setItem(CHAVE_PROJETO_DO_CORE, JSON.stringify({ projeto, nome: `Palco de Ofertas – ${fundo ? textoBotao : titulo}` })); } catch { toast.error('Não foi possível abrir o editor de vídeo.'); return; }
    navegar('/studio/video');
  };
  const mover = (k: keyof MovimentoDoPalco, v: string) => setMovimento((m) => ({ ...m, [k]: v }));

  return (
    <div className="space-y-3" data-testid="studio-palco">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/studio" className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Modelos</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg font-black text-white sm:text-xl"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Palco de Ofertas – Mercado</h1>
          <p className="hidden text-xs text-slate-400 sm:block">Um produto de cada vez no palco, com nome e preço ({SEGUNDOS_POR_PRODUTO} s cada) · toque em qualquer elemento da tela para editar</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Formato">
          {(['9:16', '16:9'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)}
              className={cn('flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold', formato === f ? 'bg-[#5D1BFF] text-white' : 'text-slate-300 hover:bg-white/5')}>
              {f === '16:9' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}<span className="hidden sm:inline">{f === '16:9' ? 'TV deitada' : 'TV em pé'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* A TELA + a fila de produtos */}
        <section className="min-w-0 space-y-2">
          <div className={cn('mx-auto w-full', formato === '9:16' ? 'max-w-[min(340px,calc(56dvh*0.5625))] lg:max-w-[340px]' : 'max-w-[760px]')} data-testid="palco-tela">
            {!comPreco.length ? <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-slate-400">Coloque produtos com preço em “Seus produtos”.</p>
              : docNaTela && docSel ? (
                <div className="relative" data-testid="palco-editavel">
                  <PalcoDoEditor doc={docNaTela} animar={tocando || !!demo} ciclo={demo?.ciclo} sel={tocando || demo ? null : nomeSel} onSelecionar={escolherElemento} onInicio={() => undefined} onMudar={mudarElemento} />
                  {tocando && <button type="button" aria-label="Tocar num elemento para editar" className="absolute inset-0 cursor-pointer" onClick={(ev) => { const n = elementoTocado(ev, docSel); if (n) escolherElemento(n); }} data-testid="palco-toque" />}
                </div>
              ) : <CarrosselNoPalco produtos={comPreco} formato={formato} titulo={titulo} fundo={fundo} textoBotao={textoBotao} movimento={movimento} logoDoPalco={logoDoPalco} ajustes={ajustes} aoTocar={(i, nome) => { setSelId(comPreco[i]?.id ?? null); setTocando(true); if (nome) escolherElemento(nome); }} />}
          </div>
          {comPreco.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="listbox" aria-label="Produtos do palco" data-testid="palco-fila">
              <button type="button" onClick={() => { setSelId(null); escolherElemento(null); setTocando(true); }} aria-selected={!sel} role="option"
                className={cn('flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold', !sel ? 'border-[#FFD400] bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/10 text-slate-300')}>
                <Play className="h-5 w-5" />Tocar
              </button>
              {comPreco.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={sel?.id === p.id} onClick={() => { setSelId(p.id); escolherElemento(null); setTocando(true); }} title={p.nome}
                  className={cn('relative flex h-16 w-16 shrink-0 flex-col items-center overflow-hidden rounded-xl border bg-white', sel?.id === p.id ? 'border-[3px] border-[#FFD400]' : 'border-white/10', faltasDoProduto(p).length && 'ring-2 ring-amber-400')} data-testid="palco-fila-produto">
                  {p.imagem ? <img src={p.imagem.url} alt="" className="h-11 w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="flex h-11 items-center px-1 text-center text-[8px] font-bold text-slate-500">sem foto</span>}
                  <span className="w-full truncate bg-[#c40f24] px-0.5 text-center text-[10px] font-black text-white">{precoParaTexto(p.preco)}</span>
                </button>
              ))}
            </div>
          )}
          {sel && (
            <button type="button" onClick={() => { setDemo(null); clearTimeout(fimDoDemo.current); setTocando((t) => !t); }} className="mx-auto flex h-10 w-full max-w-md items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-white hover:bg-white/5" data-testid="palco-ver-movimento">
              {tocando ? <><Pause className="h-4 w-4" />Parar para editar</> : <><Play className="h-4 w-4" />Ver todo o movimento</>}
            </button>
          )}
          <button type="button" onClick={criarVideo} className="mx-auto flex h-11 w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="palco-criar-video">
            <Clapperboard className="h-5 w-5" />Criar vídeo ({comPreco.length} produtos · {comPreco.length * SEGUNDOS_POR_PRODUTO} s)
          </button>
        </section>

        {/* EDIÇÃO compacta */}
        <aside className="min-w-0 space-y-3">
          <PainelDeProdutos s={s} destaques={0} botao="Colocar no palco" emGrade={false} />

          <div ref={edicao}>
            <Cartao titulo={camadaSel ? rotulo(camadaSel.nome) : 'Editar elemento'} icone={MousePointerClick}
              acao={camadaSel && <button type="button" onClick={() => voltarAoPadrao(camadaSel.nome)} title="Voltar este elemento ao padrão" aria-label="Voltar este elemento ao padrão" className="rounded-lg p-1.5 text-white hover:bg-white/10" data-testid="palco-elemento-padrao"><RotateCcw className="h-4 w-4" /></button>}>
              {!camadaSel ? <p className="text-xs text-slate-400">Toque em qualquer elemento da tela: <b className="text-white">produto, nome, balão de preço, botão, logo ou faixa</b>. Dá para arrastar, aumentar, girar e mudar texto, fonte, cor e movimento. Vale para todos os produtos.</p> : (
                <div className="space-y-2" data-testid="palco-elemento">
                  <div className="flex flex-wrap gap-1" role="tablist" aria-label="Ferramentas do elemento">
                    {abas.map((a) => <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={cn('flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold', aba === a.id ? 'bg-[#5D1BFF] text-white' : 'bg-white/5 text-slate-200 hover:bg-white/10')} data-testid={`palco-aba-${a.id}`}><a.I className="h-3.5 w-3.5" />{a.nome}</button>)}
                  </div>
                  {camadaSel.nome === 'Logo do palco' && <button type="button" onClick={() => setTrocandoLogo(true)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]"><ImagePlus className="h-4 w-4" />Trocar logo</button>}
                  {camadaSel.nome === 'Produto' && sel && <button type="button" onClick={() => setTrocando(sel)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]"><ImagePlus className="h-4 w-4" />Trocar produto, foto ou criar com IA</button>}
                  <CartaoDaAba aba={abas.some((a) => a.id === aba) ? aba : abas[0].id} c={camadaSel} doc={docSel!} mudar={(p) => mudarElemento(camadaSel.nome, p)} mudarFundo={() => undefined} mover={() => undefined} camadas={null} />
                </div>
              )}
            </Cartao>
          </div>

          <div>
            <Cartao titulo={sel ? 'Editar produto' : 'Editar produto'} icone={PenLine}
              acao={sel && <span className="flex gap-1"><button type="button" onClick={() => andar(-1)} aria-label="Produto anterior" className="rounded-lg p-1.5 text-white hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => andar(1)} aria-label="Próximo produto" className="rounded-lg p-1.5 text-white hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button></span>}>
              {!sel ? <p className="text-xs text-slate-400">Toque num produto da fila, embaixo da tela, para mudar o nome, o preço e a foto dele.</p> : (
                <div className="space-y-2" data-testid="palco-edicao">
                  <label className="block text-xs text-slate-300">Nome do produto (com marca e medida)
                    <input value={sel.nome} onChange={(e) => s.mudar(sel.id, { nome: e.target.value })} className={campoCss} data-testid="palco-nome" />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className={cn('flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold', promo ? 'border-[#ff4d5e] bg-[#ff4d5e]/15 text-[#ff8a96]' : 'border-white/15 text-slate-300')}>
                      <input type="checkbox" className="h-4 w-4 accent-[#ff4d5e]" checked={promo} onChange={(e) => { setPromo(e.target.checked); if (!e.target.checked) s.mudar(sel.id, { precoDe: null }); }} data-testid="palco-promocao" />É promoção?
                    </label>
                    {promo && <label className="w-24 text-xs text-slate-300">De<input inputMode="decimal" value={precoParaTexto(sel.precoDe)} onChange={(e) => s.mudar(sel.id, { precoDe: lerValor(e.target.value) })} placeholder="49,90" className={campoCss} data-testid="palco-de" /></label>}
                    <label className="w-28 text-xs text-slate-300">{promo ? 'Por' : 'Preço'}<input inputMode="decimal" value={precoParaTexto(sel.preco)} onChange={(e) => s.mudar(sel.id, { preco: lerValor(e.target.value) })} placeholder="39,90" className={cn(campoCss, 'font-bold')} data-testid="palco-preco" /></label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">{sel.imagem ? <img src={sel.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="text-[8px] font-bold text-slate-500">sem foto</span>}</span>
                    <button type="button" onClick={() => setTrocando(sel)} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/5" data-testid="palco-trocar-foto"><ImagePlus className="h-4 w-4" />Trocar ou enviar a foto</button>
                  </div>
                  {faltasDoProduto(sel).length > 0 && <p className="text-[11px] font-semibold text-red-500 motion-safe:animate-pulse">Falta: {faltasDoProduto(sel).join(', ')}</p>}
                  <p className="text-[10px] text-slate-500">A foto escolhida fica guardada: quando este produto entrar de novo, ela volta sozinha.</p>
                </div>
              )}
            </Cartao>
          </div>

          <Cartao titulo="Fundo e botão" icone={Palette}>
            <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Fundo do palco">
              {FUNDOS_DO_PALCO.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={fundoId === f.id} onClick={() => { setFundoId(f.id); setTextoBotao(f.botoes[0]); }} data-testid="palco-fundo"
                  className={cn('w-24 shrink-0 overflow-hidden rounded-lg border-2 text-left', fundoId === f.id ? 'border-[#FFD400]' : 'border-white/10')}>
                  <img src={srcDoFundo(f, '16:9')} alt="" className="aspect-video w-full object-cover" />
                  <span className="block truncate px-1 py-0.5 text-[10px] text-slate-200">{f.nome}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={!fundo} onClick={() => setFundoId('')} className={cn('flex w-24 shrink-0 items-center justify-center rounded-lg border-2 px-1 text-center text-[10px] text-slate-300', !fundo ? 'border-[#FFD400]' : 'border-white/10')}>Palco desenhado (com título)</button>
            </div>
            {fundo && (
              <div className="flex items-center gap-2">
                <img src={(logoDoPalco ?? fundo.logoPadrao).url} alt="" crossOrigin="anonymous" className="h-10 w-14 rounded-md bg-black/30 object-contain" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">Logo: {(logoDoPalco ?? fundo.logoPadrao).nome}</span>
                <button type="button" onClick={() => setTrocandoLogo(true)} className="h-9 shrink-0 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/5" data-testid="palco-trocar-logo">Trocar logo</button>
              </div>
            )}
            {fundo ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">Botão:
                {fundo.botoes.map((b) => <button key={b} type="button" onClick={() => { setTextoBotao(b); setAjustes((a) => { const atual = a[formato]?.['Botão'] as Partial<Camada> & { texto?: string } | undefined; if (!atual?.texto) return a; const { texto: _t, ...resto } = atual; return { ...a, [formato]: { ...a[formato], 'Botão': resto } }; }); }} className={cn('h-8 rounded-full border px-3 font-bold', textoBotao === b ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10')} data-testid="palco-botao">{b}</button>)}
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-slate-300">Título do palco
                <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 28))} className={cn(campoCss, 'font-bold')} data-testid="palco-titulo" />
              </label>
            )}
          </Cartao>

          <Cartao titulo="Movimento" icone={Move}>
            <label className="block text-xs text-slate-300">Troca de um produto para o outro
              <select value={movimento.transicao ?? 'deslizar-esquerda'} onChange={(e) => mover('transicao', e.target.value)} className={campoCss} data-testid="palco-mov-transicao">
                {TRANSICOES_DO_CARROSSEL.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
            <p className="text-[10px] text-slate-500">O movimento de cada elemento fica em Animar: toque no elemento na tela.</p>
            <p className="text-[10px] text-slate-500">Vale na tela e no vídeo. Cada produto fica {SEGUNDOS_POR_PRODUTO} s.</p>
          </Cartao>
        </aside>
      </div>
      {trocandoLogo && <EscolherLogo titulo="Logo do palco" aoEscolher={escolherLogo} aoRestaurar={() => escolherLogo(null)} aoFechar={() => setTrocandoLogo(false)} />}
      {trocando && <TrocarFoto produto={trocando} aoFechar={() => setTrocando(null)} aoEscolher={(img, termo) => { const nome = termo.trim() || trocando.nome; const p = { ...trocando, nome }; setTrocando(null); if (nome !== trocando.nome) s.mudar(p.id, { nome }); void s.trocarFoto(p, img); }} />}
    </div>
  );
}
