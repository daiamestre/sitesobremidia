/**
 * F-234 — PALCO DE OFERTAS (mercado), no estilo do palco da Black Friday: o vídeo passa UM produto de cada vez no
 * pedestal, com o nome e o preço. "Criar vídeo do carrossel" abre o editor de vídeo com um clipe por produto (dá para pôr
 * música, mudar o tempo e exportar MP4 para as telas).
 * F-242: tela de edição COMPACTA e responsiva (PC, tablet, celular):
 *  - a tela no meio e, embaixo, a fila de produtos: tocar num produto para o carrossel e abre a edição dele; tocar no nome,
 *    no preço ou na foto, na própria tela, abre o campo certo (nome, promoção/de/por, trocar foto — a foto fica guardada);
 *  - "Seus produtos" fica fechado num cartão (abre a lista ao tocar);
 *  - F-244: o cliente escolhe quantos produtos passam no palco (padrão 16, até 20);
 *  - fundo e botão OFERTAS/ALERTAS; MOVIMENTO: de que lado entram o produto, o nome e o balão, e para que lado o
 *    carrossel passa de um produto ao outro (vale na tela e no vídeo); cada produto fica 8 s.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, FolderOpen, ImagePlus, Monitor, Move, Palette, PenLine, Play, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { TrocarFoto } from '@/components/tabloide/TrocarFoto';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { lerLista, lerValor, precoParaTexto, type ProdutoTabloide } from '@/lib/tabloide/parseProdutos';
import { CESTA_MERCADO } from '@/lib/tabloide/encartes';
import type { Documento, FormatoDoc } from '@/lib/studio/documento';
import { ENTRADAS, FUNDOS_DO_PALCO, SEGUNDOS_POR_PRODUTO, TRANSICOES_DO_CARROSSEL, palcoDoProduto, projetoDoCarrossel, srcDoFundo, type FundoDoPalco, type MovimentoDoPalco } from '@/lib/studio/palco';
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

/** A tela tocando o carrossel: um produto por vez (8 s), cada um com a sua animação, trocando para o lado escolhido. */
export function CarrosselNoPalco({ produtos, formato, titulo, className, fundo = FUNDOS_DO_PALCO[0], textoBotao, movimento, logoDoPalco }: { produtos: ProdutoDoPalco[]; formato: FormatoDoc; titulo?: string; className?: string; fundo?: FundoDoPalco | null; textoBotao?: string; movimento?: MovimentoDoPalco; logoDoPalco?: LogoDaPasta | null }) {
  const docs = useMemo(() => produtos.map((p) => palcoDoProduto(p, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco })), [produtos, formato, titulo, fundo, textoBotao, movimento, logoDoPalco]);
  const [vez, setVez] = useState({ i: 0, anterior: null as number | null, n: 0 });
  useEffect(() => {
    if (docs.length < 2) return;
    const t = setTimeout(() => setVez((v) => ({ i: (v.i + 1) % docs.length, anterior: v.i, n: v.n + 1 })), SEGUNDOS_POR_PRODUTO * 1000);
    return () => clearTimeout(t);
  }, [vez, docs.length]);
  useEffect(() => { if (vez.anterior == null) return; const t = setTimeout(() => setVez((v) => ({ ...v, anterior: null })), 600); return () => clearTimeout(t); }, [vez.anterior]);
  const i = docs.length ? vez.i % docs.length : 0;
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-black', className)} style={{ aspectRatio: formato === '9:16' ? '9 / 16' : '16 / 9' }} data-testid="palco-carrossel">
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

type Campo = 'nome' | 'preco' | 'foto';
/** Um produto parado na tela: tocar no nome, no preço ou na foto abre o campo para editar. */
function PalcoEditavel({ doc, aoTocar, campo }: { doc: Documento; aoTocar: (c: Campo) => void; campo: Campo | null }) {
  const W = doc.formato === '9:16' ? 1080 : 1920, H = doc.formato === '9:16' ? 1920 : 1080;
  const alvos: Array<{ nome: string; campo: Campo; rotulo: string }> = [{ nome: 'Produto', campo: 'foto', rotulo: 'Trocar a foto' }, { nome: 'Nome do produto', campo: 'nome', rotulo: 'Editar o nome' }, { nome: 'Preço', campo: 'preco', rotulo: 'Editar o preço' }];
  return (
    <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: doc.formato === '9:16' ? '9 / 16' : '16 / 9' }} data-testid="palco-editavel">
      <PreviaDocumento doc={doc} sempre className="h-full w-full" />
      {alvos.map((a) => {
        const c = doc.camadas.find((x) => x.nome === a.nome);
        if (!c) return null;
        return (
          <button key={a.nome} type="button" onClick={() => aoTocar(a.campo)} aria-label={a.rotulo} title={a.rotulo} data-testid={`palco-alvo-${a.campo}`}
            className={cn('absolute rounded-lg border-2 border-dashed transition hover:border-[#FFD400] hover:bg-[#FFD400]/10', campo === a.campo ? 'border-[#FFD400] bg-[#FFD400]/10' : 'border-white/40')}
            style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%`, width: `${(c.w / W) * 100}%`, height: `${(c.h / H) * 100}%` }} />
        );
      })}
    </div>
  );
}

function Cartao({ titulo, icone: Icone, children, acao }: { titulo: string; icone: typeof Move; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-white/10 bg-[#14062f] p-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Icone className="h-4 w-4 text-[#B04DFF]" />{titulo}{acao && <span className="ml-auto">{acao}</span>}</h2>
      {children}
    </section>
  );
}
const campoCss = 'h-10 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-white focus:border-[#B04DFF] focus:outline-none';

function lerOpcoes(): { fundoId?: string; textoBotao?: string; movimento?: MovimentoDoPalco; formato?: FormatoDoc } {
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
  useEffect(() => { try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify({ fundoId, textoBotao, movimento, formato })); } catch { /* sem armazenamento */ } }, [fundoId, textoBotao, movimento, formato]);

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
  const [campo, setCampo] = useState<Campo | null>(null);
  const [trocando, setTrocando] = useState<ProdutoTabloide | null>(null);
  const [promo, setPromo] = useState(false);
  useEffect(() => { setPromo(sel?.precoDe != null); }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  const edicao = useRef<HTMLDivElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const precoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!campo || !sel) return;
    edicao.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (campo === 'nome') nomeRef.current?.focus();
    else if (campo === 'preco') precoRef.current?.focus();
    else if (campo === 'foto') setTrocando(sel);
  }, [campo, selId]); // eslint-disable-line react-hooks/exhaustive-deps
  const docSel = useMemo(() => (sel ? palcoDoProduto(sel, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco }) : null), [sel, formato, titulo, fundo, textoBotao, movimento, logoDoPalco]);
  const andar = (d: number) => { if (!comPreco.length) return; const i = Math.max(0, comPreco.findIndex((p) => p.id === selId)); setSelId(comPreco[(i + d + comPreco.length) % comPreco.length].id); setCampo(null); };

  const criarVideo = () => {
    if (!comPreco.length) { toast.error('Coloque pelo menos um produto com preço.'); return; }
    const incompletos = comPreco.filter((p) => faltasDoProduto(p).length);
    if (incompletos.length) { toast.error(`Complete antes: falta ${faltasDoProduto(incompletos[0]).join(', ')} em “${incompletos[0].nome}”.`); setSelId(incompletos[0].id); return; }
    const projeto = projetoDoCarrossel(comPreco, formato, { titulo, logoTitulo: logoSalvaDoStudio(), fundo, textoBotao, movimento, logoDoPalco });
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
          <p className="hidden text-xs text-slate-400 sm:block">Um produto de cada vez no palco, com nome e preço ({SEGUNDOS_POR_PRODUTO} s cada) · toque no produto para editar</p>
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
              : docSel ? <PalcoEditavel doc={docSel} campo={campo} aoTocar={(c) => setCampo(c)} />
                : <CarrosselNoPalco produtos={comPreco} formato={formato} titulo={titulo} fundo={fundo} textoBotao={textoBotao} movimento={movimento} logoDoPalco={logoDoPalco} />}
          </div>
          {comPreco.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="listbox" aria-label="Produtos do palco" data-testid="palco-fila">
              <button type="button" onClick={() => { setSelId(null); setCampo(null); }} aria-selected={!sel} role="option"
                className={cn('flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold', !sel ? 'border-[#FFD400] bg-[#FFD400]/10 text-[#FFD400]' : 'border-white/10 text-slate-300')}>
                <Play className="h-5 w-5" />Tocar
              </button>
              {comPreco.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={sel?.id === p.id} onClick={() => { setSelId(p.id); setCampo(null); }} title={p.nome}
                  className={cn('relative flex h-16 w-16 shrink-0 flex-col items-center overflow-hidden rounded-xl border bg-white', sel?.id === p.id ? 'border-[3px] border-[#FFD400]' : 'border-white/10', faltasDoProduto(p).length && 'ring-2 ring-amber-400')} data-testid="palco-fila-produto">
                  {p.imagem ? <img src={p.imagem.url} alt="" className="h-11 w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="flex h-11 items-center px-1 text-center text-[8px] font-bold text-slate-500">sem foto</span>}
                  <span className="w-full truncate bg-[#c40f24] px-0.5 text-center text-[10px] font-black text-white">{precoParaTexto(p.preco)}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={criarVideo} className="mx-auto flex h-11 w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-[#0b2a17] hover:brightness-105" data-testid="palco-criar-video">
            <Clapperboard className="h-5 w-5" />Criar vídeo ({comPreco.length} produtos · {comPreco.length * SEGUNDOS_POR_PRODUTO} s)
          </button>
        </section>

        {/* EDIÇÃO compacta */}
        <aside className="min-w-0 space-y-3">
          <PainelDeProdutos s={s} destaques={0} botao="Colocar no palco" emGrade={false} />

          <div ref={edicao}>
            <Cartao titulo={sel ? 'Editar produto' : 'Editar produto'} icone={PenLine}
              acao={sel && <span className="flex gap-1"><button type="button" onClick={() => andar(-1)} aria-label="Produto anterior" className="rounded-lg p-1.5 text-white hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => andar(1)} aria-label="Próximo produto" className="rounded-lg p-1.5 text-white hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button></span>}>
              {!sel ? <p className="text-xs text-slate-400">Toque num produto da fila (embaixo da tela) — depois toque no <b className="text-white">nome</b>, no <b className="text-white">preço</b> ou na <b className="text-white">foto</b>, na própria tela, para editar.</p> : (
                <div className="space-y-2" data-testid="palco-edicao">
                  <label className="block text-xs text-slate-300">Nome do produto (com marca e medida)
                    <input ref={nomeRef} value={sel.nome} onChange={(e) => s.mudar(sel.id, { nome: e.target.value })} className={cn(campoCss, campo === 'nome' && 'border-[#FFD400]')} data-testid="palco-nome" />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className={cn('flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold', promo ? 'border-[#ff4d5e] bg-[#ff4d5e]/15 text-[#ff8a96]' : 'border-white/15 text-slate-300')}>
                      <input type="checkbox" className="h-4 w-4 accent-[#ff4d5e]" checked={promo} onChange={(e) => { setPromo(e.target.checked); if (!e.target.checked) s.mudar(sel.id, { precoDe: null }); }} data-testid="palco-promocao" />É promoção?
                    </label>
                    {promo && <label className="w-24 text-xs text-slate-300">De<input inputMode="decimal" value={precoParaTexto(sel.precoDe)} onChange={(e) => s.mudar(sel.id, { precoDe: lerValor(e.target.value) })} placeholder="49,90" className={campoCss} data-testid="palco-de" /></label>}
                    <label className="w-28 text-xs text-slate-300">{promo ? 'Por' : 'Preço'}<input ref={precoRef} inputMode="decimal" value={precoParaTexto(sel.preco)} onChange={(e) => s.mudar(sel.id, { preco: lerValor(e.target.value) })} placeholder="39,90" className={cn(campoCss, 'font-bold', campo === 'preco' && 'border-[#FFD400]')} data-testid="palco-preco" /></label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">{sel.imagem ? <img src={sel.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="text-[8px] font-bold text-slate-500">sem foto</span>}</span>
                    <button type="button" onClick={() => setTrocando(sel)} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/5" data-testid="palco-trocar-foto"><ImagePlus className="h-4 w-4" />Trocar ou enviar a foto</button>
                  </div>
                  {faltasDoProduto(sel).length > 0 && <p className="text-[11px] font-semibold text-amber-300">Falta: {faltasDoProduto(sel).join(', ')}</p>}
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
                {fundo.botoes.map((b) => <button key={b} type="button" onClick={() => setTextoBotao(b)} className={cn('h-8 rounded-full border px-3 font-bold', textoBotao === b ? 'border-[#FFD400] text-[#FFD400]' : 'border-white/10')} data-testid="palco-botao">{b}</button>)}
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-slate-300">Título do palco
                <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 28))} className={cn(campoCss, 'font-bold')} data-testid="palco-titulo" />
              </label>
            )}
          </Cartao>

          <Cartao titulo="Movimento" icone={Move}>
            <div className="grid grid-cols-2 gap-2">
              {([['produto', 'Produto entra'], ['nome', 'Nome entra'], ['preco', 'Balão entra']] as const).map(([k, rotulo]) => (
                <label key={k} className="text-xs text-slate-300">{rotulo}
                  <select value={movimento[k] ?? ''} onChange={(e) => mover(k, e.target.value)} className={campoCss} data-testid={`palco-mov-${k}`}>
                    <option value="">Padrão</option>
                    {ENTRADAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </label>
              ))}
              <label className="text-xs text-slate-300">Troca de produto
                <select value={movimento.transicao ?? 'deslizar-esquerda'} onChange={(e) => mover('transicao', e.target.value)} className={campoCss} data-testid="palco-mov-transicao">
                  {TRANSICOES_DO_CARROSSEL.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[10px] text-slate-500">Vale na tela e no vídeo. Cada produto fica {SEGUNDOS_POR_PRODUTO} s.</p>
          </Cartao>
        </aside>
      </div>
      {trocandoLogo && <EscolherLogo titulo="Logo do palco" aoEscolher={escolherLogo} aoRestaurar={() => escolherLogo(null)} aoFechar={() => setTrocandoLogo(false)} />}
      {trocando && <TrocarFoto produto={trocando} aoFechar={() => { setTrocando(null); setCampo(null); }} aoEscolher={(img) => { const p = trocando; setTrocando(null); setCampo(null); void s.trocarFoto(p, img); }} />}
    </div>
  );
}
