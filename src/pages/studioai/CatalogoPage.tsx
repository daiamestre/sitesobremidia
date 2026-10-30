import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BriefcaseMedical, ChevronDown, Dumbbell, Filter, GraduationCap, Heart, House, LayoutGrid, Layers, Monitor, PawPrint, PenLine,
  Settings2, Shirt, ShoppingCart, Sparkles, Utensils, Flower2, Wand2, Smartphone,
} from 'lucide-react';
import { ArteModelo } from '@/components/studio/ArteModelo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { arquivarModelo, meuSaldo } from '@/lib/studioai/api';
import { useCatalogo } from '@/lib/studioai/modelos';
import { MODELOS, type ModeloDeArte } from '@/lib/studio/modelos';
import {
  FILTRO_INICIAL, FORMATOS, ORDENS, SEGMENTOS, TIPOS_DE_EDICAO, contarPorSegmento, filtrarModelos, nomeDoSegmento,
  type FiltroDoCatalogo, type SegmentoId,
} from '@/lib/studio/catalogo';
import { cn } from '@/lib/utils';

const ICONE: Record<SegmentoId | 'todos', typeof LayoutGrid> = {
  todos: LayoutGrid, supermercados: ShoppingCart, alimentacao: Utensils, saude: BriefcaseMedical, beleza: Flower2, servicos: Settings2,
  moda: Shirt, educacao: GraduationCap, imobiliaria: House, fitness: Dumbbell, pet: PawPrint, tecnologia: Monitor,
};
const CHAVE_FAVORITOS = 'studio-favoritos';
const lerFavoritos = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) ?? '[]')); } catch { return new Set(); } };

/** As 3 TVs do banner: modelos reais do catálogo (16:9, 16:9 e 9:16), não imagens de demonstração. */
function vitrine(): ModeloDeArte[] {
  const por = (seg: SegmentoId, f: '16:9' | '9:16') => MODELOS.find((m) => m.segmento === seg && m.formato === f) ?? MODELOS.find((m) => m.formato === f)!;
  return [por('alimentacao', '16:9'), por('saude', '16:9'), por('fitness', '9:16')];
}

function Selecao({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: string; opcoes: { id: string; nome: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="relative flex min-w-0 flex-col rounded-lg border border-white/10 bg-[#170838] px-3 py-1.5 sm:min-w-[150px]">
      <span className="text-[10px] text-slate-400">{rotulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent pr-6 text-sm text-white focus:outline-none">
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
  const lista = useMemo(() => filtrarModelos(catalogo.todos, filtro, favoritos), [catalogo.todos, filtro, favoritos]);
  const contagem = useMemo(() => contarPorSegmento(catalogo.todos, filtro), [catalogo.todos, filtro]);
  const arquivar = async (m: ModeloDeArte) => {
    if (!window.confirm(`Arquivar o modelo "${m.nome}"? Ele sai do catálogo (projetos já salvos continuam).`)) return;
    try { await arquivarModelo(m.id); void qc.invalidateQueries({ queryKey: ['studio-modelos'] }); toast.success('Modelo arquivado.'); } catch (e) { toast.error((e as Error).message); }
  };
  const tvs = useMemo(vitrine, []);
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
      {/* ── banner */}
      <section className="relative overflow-hidden rounded-2xl border border-[#8A2EFF]/40 bg-gradient-to-br from-[#22004A] via-[#14062f] to-[#0B0420] p-6 shadow-[0_0_40px_rgba(93,27,255,0.25)] md:p-9">
        <div aria-hidden className="pointer-events-none absolute -left-20 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_left,rgba(138,46,255,0.35),transparent_65%)]" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-2/3 bg-[radial-gradient(ellipse_at_bottom,rgba(176,77,255,0.55),transparent_70%)]" />
        <div className="relative grid items-center gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,0.7fr)]">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#B04DFF]">Sobre <span className="text-white">Mídia</span> Studio</p>
            <h1 className="text-4xl font-black leading-[1.05] text-white 2xl:text-5xl"><span className="block whitespace-nowrap">Encontre sua</span><span className="block whitespace-nowrap text-[#B04DFF]">próxima arte</span></h1>
            <p className="max-w-md text-sm text-slate-300 md:text-base">Personalize modelos prontos e crie anúncios incríveis para suas telas digitais. É rápido, fácil e sem complicação.</p>
            <a href="#modelos" className="inline-flex items-center gap-2 rounded-full bg-[#FFD400] px-6 py-3 text-sm font-bold text-[#22004A] shadow-[0_8px_24px_rgba(255,212,0,0.35)] transition hover:brightness-105">Explorar modelos <ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="relative flex items-end justify-center gap-3 pb-6" aria-label="Exemplos de artes nas telas">
            {tvs.map((m, i) => (
              <div key={m.id} className={cn('relative rounded-lg border-[3px] border-[#2a2a3a] bg-black p-0.5 shadow-[0_20px_40px_rgba(0,0,0,0.6)]',
                m.formato === '9:16' ? 'w-[22%]' : i === 1 ? 'z-10 w-[40%]' : 'w-[34%]')}>
                <ArteModelo modelo={m} className="rounded" />
              </div>
            ))}
            <div aria-hidden className="absolute bottom-2 left-[6%] right-[6%] h-3 rounded-full bg-gradient-to-r from-transparent via-[#B04DFF] to-transparent blur-sm" />
          </div>
          <ul className="hidden space-y-4 text-sm text-slate-200 md:block">
            {[['Modelos profissionais', PenLine], ['Edição simples e rápida', Wand2], ['Diversos formatos', Smartphone], ['Para todos os segmentos', Layers]].map(([t, I]) => {
              const Icone = I as typeof PenLine;
              return <li key={t as string} className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#8A2EFF]/50 text-[#B04DFF]"><Icone className="h-4 w-4" /></span>{t as string}</li>;
            })}
          </ul>
        </div>
      </section>

      {/* ── categorias */}
      <section aria-labelledby="titulo-categorias" className="space-y-3">
        <h2 id="titulo-categorias" className="flex items-center gap-2 text-lg font-bold text-white"><span className="h-5 w-1 rounded bg-[#8A2EFF]" />Categorias</h2>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0 xl:grid-cols-12">
          {([{ id: 'todos' as const, nome: 'Todos' }, ...SEGMENTOS]).map((s) => {
            const ativo = s.id === 'todos' ? filtro.segmentos.length === 0 : filtro.segmentos.length === 1 && filtro.segmentos[0] === s.id;
            const Icone = ICONE[s.id];
            return (
              <button key={s.id} type="button" onClick={() => escolherSegmento(s.id)} aria-pressed={ativo}
                className={cn('flex min-w-[88px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-medium transition md:min-w-0 md:py-4',
                  ativo ? 'border-[#B04DFF] bg-gradient-to-b from-[#8A2EFF] to-[#5D1BFF] text-white shadow-[0_0_24px_rgba(138,46,255,0.5)]' : 'border-white/10 bg-[#140632] text-slate-200 hover:border-[#8A2EFF]/60')}>
                <Icone className="h-7 w-7" strokeWidth={1.5} />{s.nome}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── filtros */}
      <div id="modelos" className="grid scroll-mt-24 grid-cols-2 gap-2 rounded-xl border border-white/5 bg-[#12052b] p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <button type="button" onClick={() => setSegmentosAbertos((v) => !v)} aria-expanded={segmentosAbertos} className={cn('flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-white hover:bg-white/5', segmentosAbertos ? 'border-[#8A2EFF]/70 bg-[#5D1BFF]/20' : 'border-white/10')}><Filter className="h-4 w-4" />Filtros{filtro.segmentos.length > 0 && <span className="rounded-full bg-[#FFD400] px-1.5 text-[10px] font-bold text-[#22004A]">{filtro.segmentos.length}</span>}</button>
        <Selecao rotulo="Formato" valor={filtro.formato ?? ''} opcoes={[{ id: '', nome: 'Todos' }, ...FORMATOS]} onChange={(v) => setFiltro((f) => ({ ...f, formato: (v || null) as FiltroDoCatalogo['formato'] }))} />
        <Selecao rotulo="Segmento" valor={filtro.segmentos.length === 1 ? filtro.segmentos[0] : ''} opcoes={[{ id: '', nome: 'Todos' }, ...SEGMENTOS]} onChange={(v) => escolherSegmento((v || 'todos') as SegmentoId | 'todos')} />
        <Selecao rotulo="Tipo de edição" valor={filtro.edicao ?? ''} opcoes={[{ id: '', nome: 'Todos' }, ...TIPOS_DE_EDICAO]} onChange={(v) => setFiltro((f) => ({ ...f, edicao: (v || null) as FiltroDoCatalogo['edicao'] }))} />
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:ml-auto [&>label]:flex-1 sm:[&>label]:flex-none">
          <Selecao rotulo="Ordenar por" valor={filtro.ordem} opcoes={ORDENS} onChange={(v) => setFiltro((f) => ({ ...f, ordem: v as FiltroDoCatalogo['ordem'] }))} />
          <p className="text-xs text-slate-400" aria-live="polite">Mostrando {lista.length} de {catalogo.todos.length} modelos</p>
        </div>
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
            {lista.map((m) => (
              <article key={m.id} className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#140632] p-3 transition hover:border-[#8A2EFF]/70 hover:shadow-[0_0_28px_rgba(93,27,255,0.35)]">
                <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-lg bg-black">
                  <div className={cn(m.formato === '16:9' ? 'w-full' : 'h-full aspect-[9/16]')}><ArteModelo modelo={m} /></div>
                  <button type="button" onClick={() => alternarFavorito(m.id)} aria-label={favoritos.has(m.id) ? 'Tirar dos favoritos' : 'Favoritar'} aria-pressed={favoritos.has(m.id)}
                    className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60">
                    <Heart className={cn('h-4 w-4', favoritos.has(m.id) && 'fill-[#FFD400] text-[#FFD400]')} />
                  </button>
                </div>
                <span className="mt-2 inline-flex w-fit items-center gap-1 rounded bg-[#5D1BFF]/40 px-1.5 py-0.5 text-[10px] font-bold text-white">{m.formato === '16:9' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}{m.formato}</span>
                <h3 className="mt-1 truncate text-sm font-semibold text-white" title={m.nome}>{m.nome}</h3>
                {catalogo.daEmpresa.has(m.id) && admin && <button type="button" onClick={() => void arquivar(m)} className="w-fit text-[11px] text-slate-500 hover:text-rose-300">Arquivar modelo</button>}
                <p className="text-xs text-slate-400">{nomeDoSegmento(m.segmento)}</p>
                <Link to={`/studio/editar/${m.id}`} className="mt-3 rounded-lg bg-[#5D1BFF] py-2 text-center text-sm font-semibold text-white transition hover:bg-[#8A2EFF]">Personalizar arte</Link>
              </article>
            ))}
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
