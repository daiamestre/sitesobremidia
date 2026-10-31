import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BriefcaseMedical, Clapperboard, ChevronDown, Dumbbell, Filter, FolderOpen, GraduationCap, Heart, House, LayoutGrid, Layers, Monitor, PawPrint, PenLine,
  Percent, Settings2, Shirt, ShoppingCart, Sparkles, Utensils, Flower2, Wand2, Smartphone,
} from 'lucide-react';
import { Carrossel, MiniaturaDoModelo, TvEmLoop } from '@/components/studio/Vitrines';
import '@/components/studio/studio-efeitos.css';
import { intercalarPorSegmento } from '@/lib/studio/miniaturas';
import type { FormatoDoc } from '@/lib/studio/documento';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { arquivarModelo, meuSaldo } from '@/lib/studioai/api';
import { useCatalogo } from '@/lib/studioai/modelos';
import { MODELOS, type ModeloDeArte } from '@/lib/studio/modelos';
import { BLACK_FRIDAY } from '@/lib/studio/pastas';
import {
  FILTRO_INICIAL, FORMATOS, ORDENS, SEGMENTOS, TIPOS_DE_EDICAO, contarPorSegmento, filtrarModelos, nomeDoSegmento,
  type FiltroDoCatalogo, type SegmentoId,
} from '@/lib/studio/catalogo';
import { cn } from '@/lib/utils';

const ICONE: Record<SegmentoId | 'todos', typeof LayoutGrid> = {
  todos: LayoutGrid, supermercados: ShoppingCart, alimentacao: Utensils, saude: BriefcaseMedical, beleza: Flower2, servicos: Settings2,
  moda: Shirt, educacao: GraduationCap, imobiliaria: House, fitness: Dumbbell, pet: PawPrint, tecnologia: Monitor, campanhas: Percent,
};
const CHAVE_FAVORITOS = 'studio-favoritos';
const lerFavoritos = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) ?? '[]')); } catch { return new Set(); } };

/** F-224: as 3 TVs do banner passam 10 artes reais cada, em loop (cada TV com modelos diferentes das outras). */
function vitrine(todos: ModeloDeArte[]): [ModeloDeArte[], ModeloDeArte[], ModeloDeArte[]] {
  const base = intercalarPorSegmento(todos.length ? todos : MODELOS);
  const bf = base.find((m) => m.id === BLACK_FRIDAY.id);
  const l: [ModeloDeArte[], ModeloDeArte[], ModeloDeArte[]] = [[], [], []];
  base.filter((m) => m !== bf).slice(0, 30).forEach((m, i) => l[i % 3].push(m));
  if (bf) l[2] = [bf, ...l[2]].slice(0, 10);
  return l;
}

/** Miniatura de um modelo no formato pedido (cada modelo existe em 16:9 e 9:16). */
function Miniatura({ m, formato, className }: { m: ModeloDeArte; formato: FormatoDoc; className?: string }) {
  return <MiniaturaDoModelo m={m} formato={formato} className={className} />;
}

function Selecao({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: string; opcoes: { id: string; nome: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="relative flex h-[46px] min-w-0 flex-col justify-center rounded-lg border border-white/10 bg-[#170838] px-2.5">
      <span className="truncate text-[10px] leading-tight text-slate-400">{rotulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 appearance-none truncate bg-transparent pr-5 text-[13px] text-white focus:outline-none">
        {opcoes.map((o) => <option key={o.id} value={o.id} className="bg-[#170838]">{o.nome}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </label>
  );
}

export default function CatalogoPage() {
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroDoCatalogo>({ ...FILTRO_INICIAL, busca: params.get('busca') ?? '' });
  const [favoritos, setFavoritos] = useState<Set<string>>(lerFavoritos);
  // no celular e no tablet o painel de segmentos começa fechado (os chips de categoria já filtram)
  const [segmentosAbertos, setSegmentosAbertos] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => { setFiltro((f) => ({ ...f, busca: params.get('busca') ?? '' })); }, [params]);

  // catálogo = modelos próprios + modelos novos do owner/ADM (studio_modelos)
  const catalogo = useCatalogo();
  const qc = useQueryClient();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const admin = !!saldo.data?.admin;
  // F-221: cada card é uma PASTA; a busca acha a pasta por qualquer modelo dentro dela ("picanha" → Açougue)
  const pastaDe = useMemo(() => new Map(catalogo.pastas.map((p) => [p.capa.id, p])), [catalogo.pastas]);
  const casam = useMemo(() => {
    const ids = new Set(filtrarModelos(catalogo.todos, { ...filtro, formato: null, segmentos: [] }).map((m) => (m.pasta && pastaDe.has(m.pasta) ? m.pasta : m.id)));
    return catalogo.pastas.map((p) => p.capa).filter((c) => ids.has(c.id));
  }, [catalogo.todos, catalogo.pastas, filtro, pastaDe]);
  const lista = useMemo(() => filtrarModelos(casam, { ...filtro, formato: null, busca: '' }, favoritos), [casam, filtro, favoritos]);
  const contagem = useMemo(() => contarPorSegmento(casam, { ...filtro, formato: null, busca: '' }), [casam, filtro]);
  const total = catalogo.todos.length;
  const arquivar = async (m: ModeloDeArte) => {
    if (!window.confirm(`Arquivar o modelo "${m.nome}"? Ele sai do catálogo (projetos já salvos continuam).`)) return;
    try { await arquivarModelo(m.id); void qc.invalidateQueries({ queryKey: ['studio-modelos'] }); toast.success('Modelo arquivado.'); } catch (e) { toast.error((e as Error).message); }
  };
  const tvs = useMemo(() => vitrine(catalogo.todos), [catalogo.todos]);
  const vitrineH = useMemo(() => intercalarPorSegmento(catalogo.todos), [catalogo.todos]);
  const vitrineV = useMemo(() => [...vitrineH].reverse(), [vitrineH]);
  const alternarFavorito = (id: string) => setFavoritos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify([...n])); } catch { /* sem armazenamento: vale só nesta visita */ }
    return n;
  });
  const escolherSegmento = (id: SegmentoId | 'todos') => setFiltro((f) => ({ ...f, segmentos: id === 'todos' ? [] : [id] }));
  const alternarSegmento = (id: SegmentoId) => setFiltro((f) => ({ ...f, segmentos: f.segmentos.includes(id) ? f.segmentos.filter((s) => s !== id) : [...f.segmentos, id] }));

  return (
    <div className="space-y-6" data-testid="studio-catalogo">
      {/* ── banner compacto: texto + 3 TVs girando 10 artes cada (como o Player) + 4 vantagens em 2×2 */}
      <section className="sm-borda-viva relative overflow-hidden rounded-2xl p-5 sm:p-6" data-testid="studio-banner">
        <div className="relative grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-8">
          <div className="min-w-0 space-y-3">
            <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.25em] text-[#B04DFF]">Sobre <span className="text-white">Mídia</span> Studio</p>
            <h1 className="text-3xl font-black leading-[1.05] text-white sm:text-4xl"><span className="block whitespace-nowrap">Encontre sua</span><span className="block whitespace-nowrap bg-gradient-to-r from-[#B04DFF] to-[#22d3ee] bg-clip-text text-transparent">próxima arte</span></h1>
            <p className="max-w-md text-sm text-slate-300">Personalize modelos prontos e crie anúncios incríveis para suas telas digitais. Rápido, fácil e sem complicação.</p>
            <a href="#modelos" className="sm-reflexo sm-pulsar inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#FFD400] px-5 py-2.5 text-sm font-bold text-[#22004A] transition hover:brightness-105">Explorar modelos <ArrowRight className="h-4 w-4" /></a>
            <Link to="/studio/video" className="ml-2 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#B04DFF]/70 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#8A2EFF]/30" data-testid="atalho-editor-video"><Clapperboard className="h-4 w-4 text-[#FFD400]" />Editor de vídeo</Link>
          </div>
          <div className="relative flex items-end justify-center gap-2.5 pb-4" aria-label="Exemplos de artes rodando nas telas">
            <TvEmLoop modelos={tvs[0]} formato="16:9" className="sm-tv w-[38%] rounded-lg" />
            <TvEmLoop modelos={tvs[1]} formato="16:9" atraso={1500} className="sm-tv z-10 w-[44%] rounded-lg" />
            <TvEmLoop modelos={tvs[2]} formato="9:16" atraso={3000} className="sm-tv w-[18%] rounded-lg" />
            <div aria-hidden className="absolute bottom-0 left-[6%] right-[6%] h-2.5 rounded-full bg-gradient-to-r from-transparent via-[#B04DFF] to-transparent blur-sm" />
          </div>
            <ul className="grid grid-cols-2 gap-2 text-xs text-slate-200 md:col-span-2 lg:grid-cols-4">
              {[['Modelos prontos', PenLine], ['Edição fácil', Wand2], ['16:9 e 9:16', Smartphone], ['Vários nichos', Layers]].map(([t, I]) => {
                const Icone = I as typeof PenLine;
                return <li key={t as string} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#8A2EFF]/30 bg-white/[0.03] px-2 py-1.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#5D1BFF]/30 text-[#B04DFF]"><Icone className="h-3.5 w-3.5" /></span><span className="truncate whitespace-nowrap">{t as string}</span></li>;
              })}
            </ul>
        </div>
      </section>

      {/* ── categorias: pílulas que se arrumam sozinhas (uma fileira que desliza no celular; quebram em linhas no tablet/PC) */}
      <section aria-labelledby="titulo-categorias" className="space-y-2.5">
        <h2 id="titulo-categorias" className="flex items-center gap-2 text-base font-bold text-white"><span className="h-5 w-1 rounded bg-[#8A2EFF]" />Categorias</h2>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {([{ id: 'todos' as const, nome: 'Todos' }, ...SEGMENTOS]).map((s) => {
            const ativo = s.id === 'todos' ? filtro.segmentos.length === 0 : filtro.segmentos.length === 1 && filtro.segmentos[0] === s.id;
            const Icone = ICONE[s.id];
            return (
              <button key={s.id} type="button" onClick={() => escolherSegmento(s.id)} aria-pressed={ativo}
                className={cn('inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition',
                  ativo ? 'border-[#B04DFF] bg-gradient-to-r from-[#8A2EFF] to-[#5D1BFF] text-white shadow-[0_0_20px_rgba(138,46,255,0.6)]' : 'border-white/10 bg-[#140632] text-slate-200 hover:border-[#8A2EFF]/60 hover:shadow-[0_0_14px_rgba(138,46,255,0.35)]')}>
                <Icone className="h-4 w-4" strokeWidth={1.8} />{s.nome}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── todos os modelos girando: 16:9 para a esquerda, 9:16 para a direita (o dedo acelera ou inverte) */}
      {vitrineH.length > 0 && (
        <section aria-label="Todos os modelos em movimento" className="space-y-1 overflow-hidden rounded-2xl border border-white/5 bg-[#0d0424]/70 py-3">
          <p className="flex items-center gap-2 px-4 text-xs font-semibold text-slate-300"><Sparkles className="h-3.5 w-3.5 text-[#FFD400]" />{total} modelos, todos em 16:9 e 9:16 · deslize para acelerar</p>
          <Carrossel modelos={vitrineH} formato="16:9" direcao={-1} largura={220} rotulo="Modelos em 16:9" />
          <Carrossel modelos={vitrineV} formato="9:16" direcao={1} largura={118} rotulo="Modelos em 9:16" />
        </section>
      )}

      {/* ── filtros: grade que se ajusta sozinha à largura (nunca quebra o texto) */}
      <div id="modelos" className="scroll-mt-24 space-y-2 rounded-xl border border-white/5 bg-[#12052b] p-2.5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(138px,1fr))] gap-2">
          <button type="button" onClick={() => setSegmentosAbertos((v) => !v)} aria-expanded={segmentosAbertos} className={cn('flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm text-white hover:bg-white/5', segmentosAbertos ? 'border-[#8A2EFF]/70 bg-[#5D1BFF]/20' : 'border-white/10')}><Filter className="h-4 w-4" />Filtros{filtro.segmentos.length > 0 && <span className="rounded-full bg-[#FFD400] px-1.5 text-[10px] font-bold text-[#22004A]">{filtro.segmentos.length}</span>}</button>
          <Selecao rotulo="Formato" valor={filtro.formato ?? ''} opcoes={[{ id: '', nome: 'Todos' }, ...FORMATOS]} onChange={(v) => setFiltro((f) => ({ ...f, formato: (v || null) as FiltroDoCatalogo['formato'] }))} />
          <Selecao rotulo="Segmento" valor={filtro.segmentos.length === 1 ? filtro.segmentos[0] : ''} opcoes={[{ id: '', nome: 'Todos' }, ...SEGMENTOS]} onChange={(v) => escolherSegmento((v || 'todos') as SegmentoId | 'todos')} />
          <Selecao rotulo="Tipo de edição" valor={filtro.edicao ?? ''} opcoes={[{ id: '', nome: 'Todos' }, ...TIPOS_DE_EDICAO]} onChange={(v) => setFiltro((f) => ({ ...f, edicao: (v || null) as FiltroDoCatalogo['edicao'] }))} />
          <Selecao rotulo="Ordenar por" valor={filtro.ordem} opcoes={ORDENS} onChange={(v) => setFiltro((f) => ({ ...f, ordem: v as FiltroDoCatalogo['ordem'] }))} />
        </div>
        <p className="truncate px-1 text-xs text-slate-400" aria-live="polite">{lista.length} pastas · {total} modelos, todos em 16:9 e 9:16</p>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {segmentosAbertos && (
          <aside className="w-full shrink-0 rounded-xl border border-white/5 bg-[#12052b] p-4 lg:w-[210px]" aria-label="Segmentos">
            <p className="mb-3 text-sm font-bold text-white">Segmentos</p>
            <ul className="space-y-2.5">
              {SEGMENTOS.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
                    <input type="checkbox" checked={filtro.segmentos.includes(s.id)} onChange={() => alternarSegmento(s.id)} className="h-4 w-4 accent-[#8A2EFF]" />
                    <span className="flex-1">{s.nome}</span><span className="text-xs text-slate-500">{contagem[s.id]}</span>
                  </label>
                </li>
              ))}
            </ul>
            {(filtro.segmentos.length > 0 || filtro.busca) && (
              <button type="button" className="mt-4 text-xs font-semibold text-[#B04DFF] hover:underline" onClick={() => { setFiltro(FILTRO_INICIAL); setParams({}); }}>Limpar filtros</button>
            )}
          </aside>
        )}

        <div className="min-w-0 flex-1">
          {lista.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">
              Nenhum modelo com esses filtros. <Link to="/studio/ia" className="font-semibold text-[#FFD400] hover:underline">Crie uma arte nova com IA</Link>.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {lista.map((m) => {
              const f: FormatoDoc = filtro.formato ?? (m.formato as FormatoDoc);
              const qtd = pastaDe.get(m.id)?.modelos.length ?? 1;
              return (
              <article key={m.id} className="sm-cartao-luz group flex flex-col overflow-hidden rounded-xl p-3" data-testid="studio-pasta-card">
                <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-lg bg-black">
                  <Link to={`/studio/pasta/${m.id}`} aria-label={`Abrir a pasta ${m.nome}`} className={cn('block', f === '16:9' ? 'w-full' : 'h-full aspect-[9/16]')}><Miniatura m={m} formato={f} /></Link>
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur"><FolderOpen className="h-3 w-3 text-[#FFD400]" />{qtd} {qtd === 1 ? 'modelo' : 'modelos'}</span>
                  <button type="button" onClick={() => alternarFavorito(m.id)} aria-label={favoritos.has(m.id) ? 'Tirar dos favoritos' : 'Favoritar'} aria-pressed={favoritos.has(m.id)}
                    className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60">
                    <Heart className={cn('h-4 w-4', favoritos.has(m.id) && 'fill-[#FFD400] text-[#FFD400]')} />
                  </button>
                </div>
                <span className="mt-2 flex gap-1">{(['16:9', '9:16'] as const).map((x) => <span key={x} className={cn('inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white', x === f ? 'bg-[#5D1BFF]' : 'bg-[#5D1BFF]/30')}>{x === '16:9' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}{x}</span>)}</span>
                <h3 className="mt-1 truncate text-sm font-semibold text-white" title={m.nome}>{m.nome}</h3>
                {catalogo.daEmpresa.has(m.id) && admin && <button type="button" onClick={() => void arquivar(m)} className="w-fit text-[11px] text-slate-500 hover:text-rose-300">Arquivar modelo</button>}
                <p className="text-xs text-slate-400">{nomeDoSegmento(m.segmento)}</p>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <Link to={`/studio/pasta/${m.id}`} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] py-2 text-center text-sm font-semibold text-white transition hover:bg-[#8A2EFF]"><FolderOpen className="h-4 w-4" />Abrir pasta</Link>
                  <Link to={`/studio/editar/${m.id}?formato=${encodeURIComponent(f)}`} title="Personalizar esta arte" aria-label="Personalizar esta arte" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5"><PenLine className="h-4 w-4" /></Link>
                </div>
              </article>
              );
            })}
          </div>
          <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-xl border border-[#FFD400]/30 bg-gradient-to-r from-[#22004A] to-[#14062f] p-5 sm:flex-row">
            <p className="text-sm text-slate-200"><Sparkles className="mr-2 inline h-4 w-4 text-[#FFD400]" />Não achou o que queria? Descreva a sua ideia e a IA cria uma arte nova para você.</p>
            <Link to="/studio/ia" className="shrink-0 rounded-full bg-[#FFD400] px-5 py-2 text-sm font-bold text-[#22004A]">Criar com IA</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
