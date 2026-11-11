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
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, FolderOpen, ImagePlus, Monitor, Move, MousePointerClick, Palette, Pause, PenLine, Play, Plus, RotateCcw, Smartphone } from 'lucide-react';
import { GaleriaDeProdutos } from './GaleriaDeProdutos';
import { EditorDeVideo } from '@/pages/studioai/VideoEditorPage';
import { toast } from 'sonner';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { Palco as PalcoDoEditor } from '@/components/studio/editor/Palco';
import { CartaoDaAba, abasDe, type Aba } from '@/components/studio/editor/Paineis';
import { TrocarFoto } from '@/components/tabloide/TrocarFoto';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista, lerValor, precoParaTexto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { infoDaPasta } from '@/lib/studio/pastasDoSegmento';
import { TAMANHO_DOC, camadaNoPonto, type Camada, type CamadaTexto, type Documento, type FormatoDoc } from '@/lib/studio/documento';
import { FUNDOS_DO_PALCO, SEGUNDOS_POR_PRODUTO, chaveDoProdutoNoPalco, transicaoDoProduto, fundosDoSegmento, type SegmentoDoStudio, TRANSICOES_DO_CARROSSEL, palcoDoProduto, projetoDoCarrossel, srcDoFundo, type AjustesDoPalco, type FundoDoPalco, type MovimentoDoPalco } from '@/lib/studio/palco';
import { comAlfa, corDoDocumento, coresDosEfeitos } from '@/lib/studio/corDaArte';
import { GaleriaDeModelos } from './GaleriaDeModelos';
import type { TipoDeTransicao } from '@/lib/studio/video/linha';
import { CHAVE_PROJETO_DO_CORE } from '@/lib/studio/video/doCore';
import { cn } from '@/lib/utils';
import { useFotosDosEncartes, fotoDoExemplo } from './EncartesDoStudio';
import { logoSalvaDoStudio } from '@/lib/studio/logoDoStudio';
import { PainelDeProdutos, faltasDoProduto, useProdutosComFotos } from './ProdutosComFotos';
import { gravarLogoDoEncarte, lerLogoDoEncarte, type LogoDaPasta } from '@/lib/studio/logos';
import { EscolherLogo } from './PastaDeLogos';
import { PainelDaLogo } from '@/components/studio/editor/PainelDaLogo';
import { Cor, Faixa, MovimentoDoElemento } from '@/components/studio/editor/Paineis';
import { ehCamadaDaLogo } from '@/lib/studio/logoEditavel';

type ProdutoDoPalco = Parameters<typeof palcoDoProduto>[0];
const CHAVE_OPCOES = 'studio-palco-opcoes';

// a troca de um produto para o outro na tela, igual à transição do vídeo. F-290: efeitos de troca de cena (flash, luz, brilho,
// girar a cena, desfocar…) — só transform, opacity e filter, que o navegador anima liso, sem pular quadro
const TROCA: Record<string, { entra: [string, string]; sai: [string, string]; luz?: string }> = {
  'deslizar-esquerda': { entra: ['transform:translateX(100%)', 'transform:none'], sai: ['transform:none', 'transform:translateX(-100%)'] },
  'deslizar-direita': { entra: ['transform:translateX(-100%)', 'transform:none'], sai: ['transform:none', 'transform:translateX(100%)'] },
  'deslizar-cima': { entra: ['transform:translateY(100%)', 'transform:none'], sai: ['transform:none', 'transform:translateY(-100%)'] },
  zoom: { entra: ['transform:scale(.6);opacity:0', 'transform:none;opacity:1'], sai: ['transform:none;opacity:1', 'transform:scale(1.4);opacity:0'] },
  dissolver: { entra: ['opacity:0', 'opacity:1'], sai: ['opacity:1', 'opacity:0'] },
  // F-296: o flash, a luz e o brilho saem na COR DA ARTE (`luzDaTroca`), nunca branco fixo
  preto: { entra: ['opacity:0', 'opacity:1'], sai: ['opacity:1', 'opacity:0'], luz: '#000' },
  flash: { entra: ['opacity:0', 'opacity:1'], sai: ['opacity:1', 'opacity:0'], luz: 'cor' },
  luz: { entra: ['opacity:0', 'opacity:1'], sai: ['opacity:1', 'opacity:0'], luz: 'faixa' },
  brilho: { entra: ['opacity:0;filter:brightness(3)', 'opacity:1;filter:brightness(1)'], sai: ['opacity:1;filter:brightness(1)', 'opacity:0;filter:brightness(3)'], luz: 'brilho' },
  'girar-tudo': { entra: ['transform:rotate(-180deg) scale(.4);opacity:0', 'transform:none;opacity:1'], sai: ['transform:none;opacity:1', 'transform:rotate(180deg) scale(.4);opacity:0'] },
  desfocar: { entra: ['opacity:0;filter:blur(18px)', 'opacity:1;filter:blur(0)'], sai: ['opacity:1;filter:blur(0)', 'opacity:0;filter:blur(18px)'] },
  circulo: { entra: ['clip-path:circle(0% at 50% 50%)', 'clip-path:circle(75% at 50% 50%)'], sai: ['opacity:1', 'opacity:1'] },
  cortina: { entra: ['clip-path:inset(0 100% 0 0)', 'clip-path:inset(0 0 0 0)'], sai: ['opacity:1', 'opacity:1'] },
};
const nomeDaTroca = (t: string) => t.replace(/[^a-z]/g, '');
/** F-296: a luz da troca na cor da arte (clarão tingido, faixa de luz e brilho colorido) */
function luzDaTroca(tipo: string, cor: string): string {
  const fx = coresDosEfeitos(cor);
  if (tipo === 'cor') return fx.clarao;
  if (tipo === 'faixa') return `linear-gradient(115deg,${comAlfa(fx.luz, 0)} 20%,${comAlfa(fx.luz, 0.95)} 50%,${comAlfa(fx.luz, 0)} 80%)`;
  if (tipo === 'brilho') return comAlfa(fx.forte, 0.55);
  return tipo;
}
function estiloDaTroca(t: TipoDeTransicao | undefined, lado: 'entra' | 'sai'): React.CSSProperties {
  const tipo = TROCA[t ?? ''] ? t! : 'deslizar-esquerda';
  return { animation: `palco-${lado}-${nomeDaTroca(tipo)} .6s cubic-bezier(.25,.8,.25,1) both`, willChange: 'transform, opacity, filter' };
}
const ESTILO_DAS_TROCAS = Object.keys(TROCA).map((t) => {
  const n = nomeDaTroca(t);
  return `@keyframes palco-entra-${n}{from{${TROCA[t].entra[0]}}to{${TROCA[t].entra[1]}}}@keyframes palco-sai-${n}{from{${TROCA[t].sai[0]}}to{${TROCA[t].sai[1]}}}`;
}).join('') + '@keyframes palco-luz{0%{opacity:0}45%{opacity:1}100%{opacity:0}}@keyframes palco-luz-passa{0%{opacity:0;transform:translateX(-60%)}50%{opacity:1}100%{opacity:0;transform:translateX(60%)}}';

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
  // F-290: a troca é a do produto que SAI (cada produto pode ter a sua; sem ela, a padrão do palco)
  const troca = transicaoDoProduto(movimento, produtos[vez.anterior ?? i]?.nome ?? '');
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-black', aoTocar && 'cursor-pointer', className)} style={{ aspectRatio: formato === '9:16' ? '9 / 16' : '16 / 9' }} data-testid="palco-carrossel"
      onClick={aoTocar && docs[i] ? (ev) => aoTocar(i, elementoTocado(ev, docs[i])) : undefined}>
      <style>{ESTILO_DAS_TROCAS}</style>
      {vez.anterior != null && docs[vez.anterior] && (
        <div key={`sai-${vez.n}`} className="absolute inset-0" style={estiloDaTroca(troca, 'sai')}><PreviaDocumento doc={docs[vez.anterior]} sempre className="h-full w-full" /></div>
      )}
      {docs[i] && <div key={`entra-${vez.n}`} className="absolute inset-0" style={vez.n ? estiloDaTroca(troca, 'entra') : undefined}><PreviaDocumento doc={docs[i]} animar sempre className="h-full w-full" /></div>}
      {/* F-290: flash, luz e escurecer passam por cima da troca */}
      {vez.anterior != null && TROCA[troca]?.luz && <div key={`luz-${vez.n}`} className="pointer-events-none absolute inset-0" style={{ background: luzDaTroca(TROCA[troca].luz!, corDoDocumento(docs[vez.anterior] ?? docs[i])), mixBlendMode: troca === 'brilho' ? 'screen' : undefined, animation: `${troca === 'luz' ? 'palco-luz-passa' : 'palco-luz'} .6s ease-out both` }} />}
    </div>
  );
}

/** Capa da pasta no catálogo: o palco passando os produtos de exemplo (fotos do catálogo da empresa). */
export function CapaDaPastaPalco({ segmento = 'mercado' }: { segmento?: SegmentoDoStudio }) {
  const fotos = useFotosDosEncartes();
  const cesta = infoDaPasta(segmento).cestaDaCapa;
  const produtos = useMemo(() => lerLista(cesta).slice(0, 6).map((p) => ({ ...p, imagem: fotoDoExemplo(fotos.data, p.nome) })), [fotos.data, cesta]);
  return <CarrosselNoPalco produtos={produtos} formato="9:16" className="h-full" fundo={fundosDoSegmento(segmento)[0]} />;
}

const ROTULOS: Record<string, string> = { Produto: 'Foto do produto', 'Nome do produto': 'Nome do produto', 'Preço': 'Balão de preço', 'Botão': 'Botão', 'Logo do palco': 'Logo', 'Logo – OFERTAS': 'Logo · texto grande', 'Logo – faixa': 'Logo · texto da fita', 'Logo – frase': 'Logo · frase', 'Logo – base': 'Logo', 'Logo no círculo': 'Logo · círculo', 'Logo – ícone esquerdo': 'Logo · ícone da esquerda', 'Logo – ícone direito': 'Logo · ícone da direita' };
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

/** F-296: o que o cliente editou em UM palco (botão, movimento, elementos): fica só nele */
interface OpcoesDoFundo { textoBotao?: string; movimento?: MovimentoDoPalco; ajustes?: AjustesDoPalco }
function lerOpcoes(chave: string): { fundoId?: string; formato?: FormatoDoc; porFundo?: Record<string, OpcoesDoFundo> } & OpcoesDoFundo {
  try { return JSON.parse(localStorage.getItem(chave) ?? '{}'); } catch { return {}; }
}

/**
 * F-288 — EDITAR O BOTÃO de baixo (FARMÁCIA, OFERTAS…): texto livre, textos prontos, cor do botão, da borda e das letras.
 * Ao tocar no botão na tela, isto abre na lateral na hora.
 */
function EditarBotao({ c, botoes, mudar, doc }: { c: CamadaTexto; botoes: string[]; mudar: (p: Partial<Camada>) => void; doc: Documento }) {
  const fundoDoBotao = c.fundo ?? { cor: '#c40f24', raio: 20, margem: 10, cheio: true, borda: null };
  return (
    <div className="space-y-2" data-testid="palco-editar-botao">
      <label className="block text-xs text-slate-300">Texto do botão
        <input value={c.texto} onChange={(e) => mudar({ texto: e.target.value.toUpperCase().slice(0, 24) } as Partial<Camada>)} className={cn(campoCss, 'font-black uppercase')} data-testid="palco-botao-texto" />
      </label>
      {botoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {botoes.map((b) => <button key={b} type="button" onClick={() => mudar({ texto: b } as Partial<Camada>)} className={cn('h-8 rounded-full border px-3 text-xs font-bold', c.texto === b ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10 text-slate-300')} data-testid="palco-botao">{b}</button>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Cor t="Cor do botão" valor={fundoDoBotao.cor} onChange={(v) => mudar({ fundo: { ...fundoDoBotao, cor: v } } as Partial<Camada>)} doc={doc} />
        <Cor t="Cor das letras" valor={c.cor} onChange={(v) => mudar({ cor: v, degrade: null } as Partial<Camada>)} doc={doc} />
        <Cor t="Cor da borda" valor={fundoDoBotao.borda?.cor ?? '#ffd21f'} onChange={(v) => mudar({ fundo: { ...fundoDoBotao, borda: { cor: v, largura: fundoDoBotao.borda?.largura ?? 8 } } } as Partial<Camada>)} doc={doc} />
        <Cor t="Borda das letras" valor={c.contorno?.cor ?? '#000000'} onChange={(v) => mudar({ contorno: { cor: v, largura: c.contorno?.largura || Math.max(2, Math.round(c.tamanho * 0.05)) } } as Partial<Camada>)} doc={doc} />
      </div>
    </div>
  );
}

/** F-259: o mesmo palco para mercado e farmácia: cada pasta com os seus fundos, produtos e opções guardadas */
export function PalcoDeOfertas({ segmento = 'mercado' }: { segmento?: SegmentoDoStudio }) {
  const navegar = useNavigate();
  // F-277: cada segmento com a sua lista de produtos, cesta de exemplo e opções guardadas
  const info = infoDaPasta(segmento);
  const fundos = fundosDoSegmento(segmento);
  const chaveOpcoes = segmento === 'mercado' ? CHAVE_OPCOES : `${CHAVE_OPCOES}-${segmento}`;
  const s = useProdutosComFotos(info.cesta, info.chave);
  const salvas = useMemo(() => lerOpcoes(chaveOpcoes), [chaveOpcoes]);
  const [formato, setFormato] = useState<FormatoDoc>(salvas.formato ?? '9:16');
  const [titulo, setTitulo] = useState('SUPER OFERTAS');
  // F-237: fundo OFICIAL do dono (o padrão) e o texto do botão no lugar do "YOUR LOGO"
  const [fundoId, setFundoId] = useState<string>(() => (salvas.fundoId != null && (salvas.fundoId === '' || fundos.some((f) => f.id === salvas.fundoId)) ? salvas.fundoId : fundos[0].id));
  const fundo = fundos.find((f) => f.id === fundoId) ?? null;
  // F-296 (pedido do dono): cada palco é ÚNICO — o botão, os movimentos e os ajustes ficam guardados POR FUNDO; trocar de
  // fundo nunca leva junto o que foi feito em outro (os salvos antigos, de um fundo só, continuam valendo para aquele fundo)
  const porFundo = useRef<Record<string, OpcoesDoFundo>>(salvas.porFundo ?? (salvas.fundoId != null ? { [salvas.fundoId]: { textoBotao: salvas.textoBotao, movimento: salvas.movimento, ajustes: salvas.ajustes } } : {}));
  const doFundo = (id: string): OpcoesDoFundo => porFundo.current[id] ?? {};
  const botaoPadrao = (id: string) => fundos.find((f) => f.id === id)?.botoes[0] ?? fundos[0].botoes[0];
  const [textoBotao, setTextoBotao] = useState(() => doFundo(fundoId).textoBotao ?? botaoPadrao(fundoId));
  const [movimento, setMovimento] = useState<MovimentoDoPalco>(() => doFundo(fundoId).movimento ?? {});
  // F-249: o que o cliente editou nos elementos fica guardado e vale para todos os produtos (deste palco)
  const [ajustes, setAjustes] = useState<AjustesDoPalco>(() => doFundo(fundoId).ajustes ?? {});
  const trocarFundo = (id: string) => {
    porFundo.current[fundoId] = { textoBotao, movimento, ajustes };
    const o = doFundo(id);
    setFundoId(id); setTextoBotao(o.textoBotao ?? botaoPadrao(id)); setMovimento(o.movimento ?? {}); setAjustes(o.ajustes ?? {});
  };
  // F-286: a logo do cliente no círculo da logo 3D do segmento (vale em pé e deitado)
  const [trocandoCirculo, setTrocandoCirculo] = useState(false);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const porLogoNoCirculo = (url: string | null) => {
    setAjustes((a) => {
      const novo = { ...a };
      for (const f of ['9:16', '16:9'] as FormatoDoc[]) {
        const atual = { ...(a[f]?.['Logo no círculo'] ?? {}) } as Record<string, unknown>;
        if (url) atual.src = url; else delete atual.src;
        novo[f] = { ...a[f], 'Logo no círculo': atual as never };
      }
      return novo;
    });
    setTrocandoCirculo(false);
  };
  useEffect(() => {
    porFundo.current[fundoId] = { textoBotao, movimento, ajustes };
    try { localStorage.setItem(chaveOpcoes, JSON.stringify({ fundoId, formato, porFundo: porFundo.current })); } catch { /* sem armazenamento */ }
  }, [chaveOpcoes, fundoId, textoBotao, movimento, formato, ajustes]);

  // F-244: só os produtos escolhidos passam no palco
  const comPreco = useMemo(() => s.produtos.filter((p) => p.preco != null).slice(0, s.quantos), [s.produtos, s.quantos]);
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
  const lateral = useRef<HTMLElement>(null);
  // F-288: fundo, logo e botão se editam mesmo com o carrossel tocando (vale para todos os produtos): usa o 1º produto como base
  const alvo = sel ?? comPreco[0] ?? null;
  const opcoesDoDoc = { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes };
  const docEd = useMemo(() => (alvo ? palcoDoProduto(alvo, formato, opcoesDoDoc) : null), [alvo, formato, titulo, fundo, textoBotao, movimento, logoDoPalco, ajustes]); // eslint-disable-line react-hooks/exhaustive-deps
  const docSel = sel ? docEd : null;
  const camadaSel = docEd?.camadas.find((c) => c.id === nomeSel) ?? null;
  const ehDaLogo = ehCamadaDaLogo(camadaSel?.nome);
  const ehDoProduto = !!camadaSel && ['Produto', 'Nome do produto', 'Preço'].includes(camadaSel.nome);
  const abas = abasDe(camadaSel).filter((a) => a.id !== 'camadas' && a.id !== 'video' && a.id !== 'fundo');
  const andar = (d: number) => { if (!comPreco.length) return; const i = Math.max(0, comPreco.findIndex((p) => p.id === selId)); setSelId(comPreco[(i + d + comPreco.length) % comPreco.length].id); };
  const escolherElemento = (nome: string | null) => {
    clearTimeout(fimDoDemo.current); setDemo(null); setNomeSel(nome);
    if (!nome) return;
    setTocando(false);
    // F-286 (pedido do dono): NÃO rola a tela — a pessoa continua vendo o produto para mover e girar; os botões ficam ao lado
    // F-288: só a LATERAL volta ao topo, onde abre a edição do elemento tocado (a tela da arte não se mexe)
    lateral.current?.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  useEffect(() => { if (camadaSel) setAba(abasDe(camadaSel)[0].id); }, [nomeSel]); // eslint-disable-line react-hooks/exhaustive-deps
  /** o nome e o preço são de cada produto; todo o resto vale para todos */
  const mudarElemento = (nome: string, patch: Partial<Camada>) => {
    if (!alvo || !docEd) return;
    const c = docEd.camadas.find((x) => x.id === nome);
    if (!c) return;
    const resto = { ...patch } as Partial<Camada> & Record<string, unknown>;
    if (nome === 'Nome do produto' && typeof resto.texto === 'string') { s.mudar(alvo.id, { nome: resto.texto }); delete resto.texto; }
    if (c.tipo === 'selo' && nome === 'Preço' && ('valor' in resto || 'sufixo' in resto)) {
      const inteiro = String(resto.valor ?? c.valor), cent = String(resto.sufixo ?? c.sufixo).replace(/\D/g, '');
      s.mudar(alvo.id, { preco: lerValor(`${inteiro},${cent || '00'}`) });
      delete resto.valor; delete resto.sufixo;
    }
    if (nome === 'Produto') delete resto.src;
    // F-290 (pedido do dono): aumentar/diminuir/mover/girar o PRODUTO vale só para ESTE produto (cada um no seu tamanho)
    if (nome === 'Produto') {
      const geo = Object.fromEntries(Object.entries(resto).filter(([k]) => ['x', 'y', 'w', 'h', 'rot'].includes(k)));
      if (Object.keys(geo).length) {
        const k = chaveDoProdutoNoPalco(alvo.nome);
        setAjustes((a) => ({ ...a, [formato]: { ...a[formato], [k]: { ...a[formato]?.[k], ...geo } } }));
        for (const g of Object.keys(geo)) delete resto[g];
      }
    }
    // F-288: texto, cor, fonte, ícone e movimento valem nos dois formatos; posição e tamanho são de cada um
    if (Object.keys(resto).length) {
      const outro: FormatoDoc = formato === '9:16' ? '16:9' : '9:16';
      const estilo = Object.fromEntries(Object.entries(resto).filter(([k]) => !['x', 'y', 'w', 'h', 'rot', 'tamanho'].includes(k)));
      setAjustes((a) => {
        const novo = { ...a, [formato]: { ...a[formato], [nome]: { ...a[formato]?.[nome], ...resto } } };
        const existeNoOutro = !nome.startsWith('Logo – texto ') || !!a[outro]?.[nome];
        if (Object.keys(estilo).length && existeNoOutro) novo[outro] = { ...a[outro], [nome]: { ...a[outro]?.[nome], ...estilo } };
        return novo;
      });
    }
    // escolheu um movimento: o elemento repete 2 vezes e depois a arte inteira toca
    if (patch.animacao) {
      const ciclo = Math.max(1.4, 0.2 + patch.animacao.duracao + 0.5);
      setDemo({ nome, ciclo }); setTocando(false);
      clearTimeout(fimDoDemo.current);
      fimDoDemo.current = setTimeout(() => { setDemo(null); setTocando(true); }, 2 * (ciclo + 0.35) * 1000);
    }
  };
  const voltarAoPadrao = (nome: string) => setAjustes((a) => { const f = { ...a[formato] }; delete f[nome]; if (nome === 'Produto' && alvo) delete f[chaveDoProdutoNoPalco(alvo.nome)]; return { ...a, [formato]: f }; });
  /** F-290: "Movimento padrão": o elemento volta ao movimento com que a arte nasceu (nos dois formatos) */
  const movimentoPadrao = (nome: string | null) => {
    setAjustes((a) => {
      const n = { ...a };
      for (const f of ['9:16', '16:9'] as FormatoDoc[]) {
        const x = { ...n[f] };
        for (const k of Object.keys(x)) if ((nome == null || k === nome) && x[k] && 'animacao' in (x[k] as object)) { const { animacao: _a, ...r } = x[k] as Partial<Camada>; x[k] = r; }
        n[f] = x;
      }
      return n;
    });
    if (nome == null) setMovimento((m) => ({ ...m, transicoes: {} }));
    setDemo(null); setTocando(true);
  };
  /** F-290: a troca de cena DESTE produto para o próximo (null = a padrão) */
  const trocaDoProduto = (tipo: TipoDeTransicao | null, todos = false) => setMovimento((m) => {
    if (todos) return { ...m, transicao: tipo ?? 'deslizar-esquerda', transicoes: {} };
    if (!alvo) return m;
    const t = { ...(m.transicoes ?? {}) };
    if (tipo) t[chaveCanonica(alvo.nome)] = tipo; else delete t[chaveCanonica(alvo.nome)];
    return { ...m, transicoes: t };
  });
  /** F-288: texto novo na logo: entra nos dois formatos, no mesmo lugar em relação à logo */
  const adicionarCamada = (c: Camada) => {
    if (!alvo || !docEd) return;
    const outro: FormatoDoc = formato === '9:16' ? '16:9' : '9:16';
    const docOutro = palcoDoProduto(alvo, outro, opcoesDoDoc);
    const b1 = docEd.camadas.find((x) => x.nome === 'Logo – base'), b2 = docOutro.camadas.find((x) => x.nome === 'Logo – base');
    const k = b1 && b2 ? b2.w / b1.w : 1;
    const noOutro = b1 && b2 ? { ...c, x: b2.x + (c.x - b1.x) * k, y: b2.y + (c.y - b1.y) * k, w: c.w * k, h: c.h * k, ...(c.tipo === 'texto' ? { tamanho: Math.round(c.tamanho * k) } : {}) } : c;
    setAjustes((a) => ({ ...a, [formato]: { ...a[formato], [c.nome]: c }, [outro]: { ...a[outro], [c.nome]: noOutro } }));
  };
  const tirarCamada = (nome: string) => { setAjustes((a) => { const n = { ...a }; for (const f of ['9:16', '16:9'] as FormatoDoc[]) { const x = { ...n[f] }; delete x[nome]; n[f] = x; } return n; }); if (nomeSel === nome) setNomeSel(null); };
  /** tocar num texto da lista da logo seleciona ele na tela (para mover e girar) */
  const selecionarNaTela = (nome: string) => { if (!sel && alvo) setSelId(alvo.id); escolherElemento(nome); };
  const botaoCamada = docEd?.camadas.find((c) => c.nome === 'Botão');
  const docNaTela = useMemo(() => {
    if (!docSel || !demo) return docSel;
    return { ...docSel, camadas: docSel.camadas.map((c) => (c.id === demo.nome ? { ...c, animacao: c.animacao ? { ...c.animacao, atraso: 0.2 } : null } : { ...c, animacao: null })) };
  }, [docSel, demo]);

  const criarVideo = () => {
    if (!comPreco.length) { toast.error('Coloque pelo menos um produto com preço.'); return; }
    const incompletos = comPreco.filter((p) => faltasDoProduto(p).length);
    if (incompletos.length) { toast.error(`Complete antes: falta ${faltasDoProduto(incompletos[0]).join(', ')} em “${incompletos[0].nome}”.`); setSelId(incompletos[0].id); return; }
    const projeto = projetoDoCarrossel(comPreco, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes });
    try { sessionStorage.setItem(CHAVE_PROJETO_DO_CORE, JSON.stringify({ projeto, nome: `${info.tituloPalco} – ${fundo ? textoBotao : titulo}` })); } catch { toast.error('Não foi possível abrir o editor de vídeo.'); return; }
    navegar('/studio/video');
  };
  const mover = (k: keyof MovimentoDoPalco, v: string) => setMovimento((m) => ({ ...m, [k]: v }));
  // F-292: o EDITOR DE VÍDEO fica embaixo da arte, já com um clipe por produto, acompanhando o palco (meio segundo depois de cada mudança)
  const projetoDoPalco = useMemo(() => (comPreco.length ? projetoDoCarrossel(comPreco, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco, ajustes }) : null), [comPreco, formato, titulo, fundo, textoBotao, movimento, logoDoPalco, ajustes]);
  const [projetoNoEditor, setProjetoNoEditor] = useState(projetoDoPalco);
  useEffect(() => { const t = setTimeout(() => setProjetoNoEditor(projetoDoPalco), 500); return () => clearTimeout(t); }, [projetoDoPalco]);
  const transicaoPeloEditor = (nome: string, tipo: TipoDeTransicao) => setMovimento((m) => ({ ...m, transicoes: { ...(m.transicoes ?? {}), [chaveCanonica(nome)]: tipo } }));
  // F-297: UMA visualização só — a arte animada ('palco') ou, ao mexer na linha do tempo, o vídeo naquele instante ('video')
  const [vista, setVista] = useState<'palco' | 'video'>('palco');
  const [slotPrevia, setSlotPrevia] = useState<HTMLDivElement | null>(null);
  const [slotFerramentas, setSlotFerramentas] = useState<HTMLDivElement | null>(null);
  /** tocou no vídeo parado: abre a edição daquele produto e do elemento tocado, na arte */
  const tocouNoVideo = (nome: string, ev: MouseEvent<HTMLElement>, doc: Documento) => {
    const p = comPreco.find((x) => x.nome === nome);
    if (!p) return;
    const n = elementoTocado(ev, doc);
    setVista('palco'); setSelId(p.id); setTocando(true);
    if (n) escolherElemento(n);
  };

  return (
    <div className="space-y-3" data-testid="studio-palco">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/studio" className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Modelos</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg font-black text-white sm:text-xl"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />{info.tituloPalco}</h1>
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

      {/* F-296 (pedido do dono): GALERIA DE MODELOS de palco do segmento — cada modelo guarda o que foi editado nele */}
      {fundos.length > 1 && <GaleriaDeModelos titulo="Modelos de palco" itens={fundos.map((f) => ({ id: f.id, nome: f.nome.replace(/^Ofertas – /, ''), capa: srcDoFundo(f, formato) }))} selecionado={fundoId} aoEscolher={trocarFundo} deitado={formato === '16:9'} />}
      {/* F-297 (pedido do dono): MESA DE EDIÇÃO como nos aplicativos de vídeo — UMA visualização só (a arte animada; ao mexer na
          linha do tempo ela mostra o vídeo naquele instante), a LATERAL DIREITA rolando só na altura da arte e a LINHA DO TEMPO
          embaixo, de largura inteira (também por baixo da lateral). Tudo cabe na tela: a arte diminui para a linha do tempo
          ficar à vista enquanto se edita. */}
      <div className={cn('flex flex-col gap-2', comPreco.length > 0 && 'h-[calc(100dvh-96px)] min-h-[560px]')} data-testid="palco-mesa">
      <div className={cn('grid min-h-0 flex-1 gap-2 sm:gap-3', formato === '9:16'
        ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] min-[540px]:grid-cols-[minmax(0,1fr)_minmax(250px,330px)] lg:grid-cols-[minmax(0,1fr)_380px]'
        : 'grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]')} data-testid="palco-layout">
        {/* A TELA (uma só) + a fila de produtos */}
        <section className={cn('flex min-h-0 min-w-0 flex-col gap-1.5', formato === '9:16' && comPreco.length > 0 && 'lg:flex-row-reverse')}>
          {!comPreco.length && <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-slate-400">Coloque produtos com preço em “Seus produtos”.</p>}
          {comPreco.length > 0 && <div className={cn('relative min-h-0', formato === '9:16' ? 'flex-1' : 'h-[52vw] shrink-0 md:h-auto md:flex-1')} style={{ containerType: 'size' }}>
            <div className="relative mx-auto" style={{ width: formato === '9:16' ? 'min(100cqw, calc(100cqh * 0.5625))' : 'min(100cqw, calc(100cqh * 1.7778))' }} data-testid="palco-tela">
              {vista === 'palco' && (docNaTela && docSel ? (
                  <div className="relative" data-testid="palco-editavel">
                    <PalcoDoEditor doc={docNaTela} animar={tocando || !!demo} ciclo={demo?.ciclo} sel={tocando || demo ? null : nomeSel} onSelecionar={escolherElemento} onInicio={() => undefined} onMudar={mudarElemento} />
                    {tocando && <button type="button" aria-label="Tocar num elemento para editar" className="absolute inset-0 cursor-pointer" onClick={(ev) => { const n = elementoTocado(ev, docSel); if (n) escolherElemento(n); }} data-testid="palco-toque" />}
                  </div>
                ) : <CarrosselNoPalco produtos={comPreco} formato={formato} titulo={titulo} fundo={fundo} textoBotao={textoBotao} movimento={movimento} logoDoPalco={logoDoPalco} ajustes={ajustes} aoTocar={(i, nome) => { setSelId(comPreco[i]?.id ?? null); setTocando(true); if (nome) escolherElemento(nome); }} />)}
              {/* a prévia do VÍDEO (linha do tempo) entra aqui, no mesmo lugar da arte */}
              <div ref={setSlotPrevia} className={cn('relative', vista !== 'video' && 'hidden')} data-testid="palco-previa-video">
                <span className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-[#7dffb0]"><Clapperboard className="h-3 w-3" />Vídeo</span>
              </div>
            </div>
          </div>}
          {comPreco.length > 0 && (
            <div className={cn('flex shrink-0 gap-1.5 overflow-x-auto pb-1', formato === '9:16' && 'lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0 lg:pr-1')} role="listbox" aria-label="Produtos do palco" data-testid="palco-fila">
              <button type="button" onClick={() => { setVista('palco'); setSelId(null); escolherElemento(null); setTocando(true); }} aria-selected={vista === 'palco' && !sel} role="option"
                className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold', vista === 'palco' && !sel ? 'border-[#FFD400] bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/10 text-slate-300')}>
                <Play className="h-5 w-5" />Tocar
              </button>
              {/* F-292: ao lado do Tocar, a galeria de produtos por segmento */}
              <button type="button" onClick={() => setGaleriaAberta(true)} title="Adicionar produtos da galeria" aria-label="Adicionar produtos da galeria por segmento"
                className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-[#25D366]/60 bg-[#25D366]/10 text-[10px] font-bold text-[#7dffb0] hover:bg-[#25D366]/20" data-testid="palco-abrir-galeria">
                <Plus className="h-5 w-5" />Produtos
              </button>
              {sel && vista === 'palco' && (
                <button type="button" onClick={() => { setDemo(null); clearTimeout(fimDoDemo.current); setTocando((t) => !t); }} title={tocando ? 'Parar para editar' : 'Ver todo o movimento'} aria-label={tocando ? 'Parar para editar' : 'Ver todo o movimento'}
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/15 text-[10px] font-bold leading-tight text-white hover:bg-white/5" data-testid="palco-ver-movimento">
                  {tocando ? <><Pause className="h-5 w-5" />Parar</> : <><Play className="h-5 w-5" />Mover</>}
                </button>
              )}
              {comPreco.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={sel?.id === p.id} onClick={() => { setVista('palco'); setSelId(p.id); escolherElemento(null); setTocando(true); }} title={p.nome}
                  className={cn('relative flex h-14 w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl border bg-white', sel?.id === p.id ? 'border-[3px] border-[#FFD400]' : 'border-white/10', faltasDoProduto(p).length && 'ring-2 ring-amber-400')} data-testid="palco-fila-produto">
                  {p.imagem ? <img src={p.imagem.url} alt="" className="h-9 w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="flex h-9 items-center px-1 text-center text-[8px] font-bold text-slate-500">sem foto</span>}
                  <span className="w-full truncate bg-[#c40f24] px-0.5 text-center text-[10px] font-black text-white">{precoParaTexto(p.preco)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* EDIÇÃO compacta */}
        {/* F-288/F-297: a LATERAL DIREITA rola sozinha, só na altura da arte; o elemento tocado (ou o clipe da linha do tempo) abre em cima */}
        <aside ref={lateral} className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pr-1" data-testid="palco-lateral">
          {/* F-297: o clipe, texto ou música escolhido na linha do tempo abre as ferramentas dele aqui */}
          <div ref={setSlotFerramentas} className="empty:hidden" data-testid="palco-ferramentas-do-video" />

          <div ref={edicao}>
            <Cartao titulo={camadaSel ? rotulo(camadaSel.nome) : 'Editar elemento'} icone={MousePointerClick}
              acao={camadaSel && <button type="button" onClick={() => voltarAoPadrao(camadaSel.nome)} title="Voltar este elemento ao padrão" aria-label="Voltar este elemento ao padrão" className="rounded-lg p-1.5 text-white hover:bg-white/10" data-testid="palco-elemento-padrao"><RotateCcw className="h-4 w-4" /></button>}>
              {!camadaSel ? <p className="text-xs text-slate-400">Toque em qualquer elemento da tela: <b className="text-white">produto, nome, balão de preço, botão, logo ou faixa</b>. Dá para arrastar, aumentar, girar e mudar texto, fonte, cor e movimento. Vale para todos os produtos.</p> : (
                <div className="space-y-2" data-testid="palco-elemento">
                  <div className="flex flex-wrap gap-1" role="tablist" aria-label="Ferramentas do elemento">
                    {abas.map((a) => <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={cn('flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold', aba === a.id ? 'bg-[#5D1BFF] text-white' : 'bg-white/5 text-slate-200 hover:bg-white/10')} data-testid={`palco-aba-${a.id}`}><a.I className="h-3.5 w-3.5" />{a.nome}</button>)}
                  </div>
                  {/* F-288: tocou na logo: textos, cores, ícone do círculo e textos novos, tudo aqui */}
                  {ehDaLogo && docEd && <PainelDaLogo doc={docEd} mudar={mudarElemento} adicionar={adicionarCamada} tirar={tirarCamada} porLogoNoCirculo={() => setTrocandoCirculo(true)} selecionar={selecionarNaTela} />}
                  {camadaSel.nome === 'Botão' && camadaSel.tipo === 'texto' && docEd && <EditarBotao c={camadaSel} botoes={fundo?.botoes ?? []} mudar={(p) => mudarElemento('Botão', p)} doc={docEd} />}
                  {camadaSel.nome === 'Logo do palco' && <button type="button" onClick={() => setTrocandoLogo(true)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]"><ImagePlus className="h-4 w-4" />Trocar logo</button>}
                  {camadaSel.nome === 'Produto' && sel && <button type="button" onClick={() => setTrocando(sel)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]"><ImagePlus className="h-4 w-4" />Trocar produto, foto ou criar com IA</button>}
                  {(ehDaLogo || camadaSel.nome === 'Botão') && <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-[#B04DFF]">Mais ferramentas deste elemento</p>}
                  <CartaoDaAba aba={abas.some((a) => a.id === aba) ? aba : abas[0].id} c={camadaSel} doc={docEd!} mudar={(p) => mudarElemento(camadaSel.nome, p)} mudarFundo={() => undefined} mover={() => undefined} camadas={null} />
                </div>
              )}
            </Cartao>
          </div>

          {/* F-290/F-297: MOVIMENTO (agora na lateral, logo abaixo do elemento tocado): do elemento tocado (entrada, 2 movimentos, saída, padrão) e a troca de cena deste produto */}
          {comPreco.length > 0 && docEd && (
            <div className="space-y-2 rounded-2xl border border-[#8A2EFF]/40 bg-[#14062f] p-3" data-testid="palco-barra-movimento">
              {camadaSel ? (
                <>
                  <p className="flex items-center gap-2 text-xs font-bold text-white"><Move className="h-4 w-4 text-[#B04DFF]" />Movimento: {rotulo(camadaSel.nome)}</p>
                  <MovimentoDoElemento c={camadaSel} doc={docEd} mudar={(p) => mudarElemento(camadaSel.nome, p)} aoPadrao={() => movimentoPadrao(camadaSel.nome)} />
                </>
              ) : <p className="text-[11px] text-slate-400">Toque num elemento da arte (produto, nome, balão, botão, logo) para escolher o movimento dele.</p>}
              <div className="space-y-1 border-t border-white/10 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Troca de cena{alvo ? `: ${alvo.nome}` : ''} → próximo</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Troca de cena deste produto" data-testid="palco-troca-produto">
                  <button type="button" role="radio" aria-checked={!movimento.transicoes?.[chaveCanonica(alvo?.nome ?? '')]} onClick={() => trocaDoProduto(null)} className={cn('h-8 shrink-0 rounded-full border px-3 text-[11px] font-semibold', !movimento.transicoes?.[chaveCanonica(alvo?.nome ?? '')] ? 'border-[#25D366] bg-[#25D366]/15 text-[#7dffb0]' : 'border-white/10 text-slate-200')}>Padrão</button>
                  {TRANSICOES_DO_CARROSSEL.map((o) => {
                    const ativo = movimento.transicoes?.[chaveCanonica(alvo?.nome ?? '')] === o.id;
                    return <button key={o.id} type="button" role="radio" aria-checked={ativo} onClick={() => trocaDoProduto(o.id)} className={cn('h-8 shrink-0 rounded-full border px-3 text-[11px] font-semibold', ativo ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-200 hover:bg-white/5')} data-testid={`palco-troca-${o.id}`}>{o.nome}</button>;
                  })}
                </div>
                <button type="button" onClick={() => movimentoPadrao(null)} className="h-8 w-full rounded-lg border border-white/10 text-[11px] font-semibold text-slate-200 hover:bg-white/5" data-testid="palco-movimento-padrao-todos">Voltar TODOS os elementos e trocas ao movimento padrão</button>
              </div>
            </div>
          )}

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
              {fundos.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={fundoId === f.id} onClick={() => trocarFundo(f.id)} data-testid="palco-fundo"
                  className={cn('w-24 shrink-0 overflow-hidden rounded-lg border-2 text-left', fundoId === f.id ? 'border-[#FFD400]' : 'border-white/10')}>
                  <img src={srcDoFundo(f, '16:9')} alt="" className="aspect-video w-full object-cover" />
                  <span className="block truncate px-1 py-0.5 text-[10px] text-slate-200">{f.nome}</span>
                </button>
              ))}
              {segmento === 'mercado' && <button type="button" role="radio" aria-checked={!fundo} onClick={() => trocarFundo('')} className={cn('flex w-24 shrink-0 items-center justify-center rounded-lg border-2 px-1 text-center text-[10px] text-slate-300', !fundo ? 'border-[#FFD400]' : 'border-white/10')}>Palco desenhado (com título)</button>}
            </div>
            {/* F-288: cor do fundo do palco (gira o tom da arte) */}
            {fundo && docEd?.camadas.some((c) => c.nome === 'Fundo oficial') && (
              <Faixa t="Cor do fundo (tom)" valor={(docEd.camadas.find((c) => c.nome === 'Fundo oficial') as { matiz?: number }).matiz ?? 0} min={-180} max={180} sufixo="°" onChange={(v) => mudarElemento('Fundo oficial', { matiz: v } as Partial<Camada>)} />
            )}
            {fundo && (
              <div className="flex items-center gap-2">
                <img src={(logoDoPalco ?? fundo.logoPadrao).url} alt="" crossOrigin="anonymous" className="h-10 w-14 rounded-md bg-black/30 object-contain" />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">Logo: {(logoDoPalco ?? fundo.logoPadrao).nome}</span>
                <button type="button" onClick={() => setTrocandoLogo(true)} className="h-9 shrink-0 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/5" data-testid="palco-trocar-logo">Trocar logo</button>
              </div>
            )}
            {/* F-288: a seção COMPLETA da logo criada por nós (textos, ícones, círculo, cores) */}
            {fundo && docEd && docEd.camadas.some((c) => c.nome === 'Logo – base') && (
              <details className="rounded-xl border border-white/10 bg-black/20 p-2" open={!ehDaLogo} data-testid="palco-secao-logo">
                <summary className="cursor-pointer text-xs font-bold text-white">Editar a logo (textos, ícones e cores)</summary>
                <div className="pt-2"><PainelDaLogo doc={docEd} mudar={mudarElemento} adicionar={adicionarCamada} tirar={tirarCamada} porLogoNoCirculo={() => setTrocandoCirculo(true)} selecionar={selecionarNaTela} /></div>
              </details>
            )}
            {fundo ? (
              botaoCamada && botaoCamada.tipo === 'texto' && docEd ? (
                <details className="rounded-xl border border-white/10 bg-black/20 p-2" open={camadaSel?.nome !== 'Botão'} data-testid="palco-secao-botao">
                  <summary className="cursor-pointer text-xs font-bold text-white">Editar o botão de baixo</summary>
                  <div className="pt-2"><EditarBotao c={botaoCamada} botoes={fundo.botoes} mudar={(p) => mudarElemento('Botão', p)} doc={docEd} /></div>
                </details>
              ) : null
            ) : (
              <label className="flex flex-col gap-1 text-xs text-slate-300">Título do palco
                <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 28))} className={cn(campoCss, 'font-bold')} data-testid="palco-titulo" />
              </label>
            )}
          </Cartao>

          <PainelDeProdutos s={s} destaques={0} botao="Colocar no palco" emGrade={false} fixar={false} />

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
      {/* F-292/F-297: a LINHA DO TEMPO de edição de vídeo, de largura inteira embaixo da arte e da lateral: um clipe por produto,
          "+" em cada troca, música, textos, filtros, cortes e exportar MP4 — sem rolar a tela, vendo a arte em cima */}
      {projetoNoEditor && (
        <section className="shrink-0 rounded-2xl border border-[#25D366]/30 bg-[#0b1f14]/30 p-1.5" data-testid="palco-editor-video" aria-label={`Vídeo do palco (${comPreco.length} produtos · ${comPreco.length * SEGUNDOS_POR_PRODUTO} s)`}>
          <EditorDeVideo embutido projetoInicial={projetoNoEditor} nomeInicial={`${info.tituloPalco} – ${fundo ? textoBotao : titulo}`} aoTransicao={transicaoPeloEditor}
            mesa={{ previa: slotPrevia, ferramentas: slotFerramentas, visivel: vista === 'video', aoUsar: () => setVista('video'), aoTocarNaTela: tocouNoVideo, clipeEmFoco: sel?.nome ?? null }} />
        </section>
      )}
      </div>
      <GaleriaDeProdutos aberto={galeriaAberta} aoFechar={() => setGaleriaAberta(false)} aoAdicionar={s.adicionarPronto} segmentoInicial={segmento === 'mercado' ? 'mercearia' : segmento} />
      {trocandoCirculo && <EscolherLogo titulo="Sua logo no círculo" aoEscolher={(l) => porLogoNoCirculo(l.url)} aoRestaurar={() => porLogoNoCirculo(null)} aoFechar={() => setTrocandoCirculo(false)} />}
      {trocandoLogo && <EscolherLogo titulo="Logo do palco" aoEscolher={escolherLogo} aoRestaurar={() => escolherLogo(null)} aoFechar={() => setTrocandoLogo(false)} />}
      {trocando && <TrocarFoto produto={trocando} aoFechar={() => setTrocando(null)} aoEscolher={(img, termo) => { const nome = termo.trim() || trocando.nome; const p = { ...trocando, nome }; setTrocando(null); if (nome !== trocando.nome) s.mudar(p.id, { nome }); void s.trocarFoto(p, img); }} />}
    </div>
  );
}
