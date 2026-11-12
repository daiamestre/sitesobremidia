/**
 * F-310 (pedido do dono, 12/11/2026) — ACERVO DO STUDIO (só owner/ADM). Tudo o que os usuários enviam (fundos, logos,
 * imagens) e cada vídeo/arte que criam e salvam, organizado por SEGMENTO. Daqui o dono/ADM abre a criação no palco ou no
 * editor e a transforma em modelo do sistema ("Adicionar ao catálogo" no editor). O palco abre SEM a logo do cliente.
 */
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, Download, ExternalLink, Loader2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { meuSaldo } from '@/lib/studioai/api';
import { listarAcervo, type ItemDoAcervo, type TipoNoAcervo } from '@/lib/studio/acervo';
import { SEGMENTOS } from '@/lib/studio/catalogo';
import { SEGMENTOS_COM_OFERTAS, infoDaPasta, nomeDoSegmentoDeOfertas } from '@/lib/studio/pastasDoSegmento';
import { enderecoDaArtePronta } from '@/lib/studio/artePronta';
import type { Documento, FormatoArte } from '@/lib/studio/documento';
import type { SegmentoDoStudio } from '@/lib/studio/palco';
import { PreviaDocumento } from '@/components/studio/PreviaDocumento';
import { cn } from '@/lib/utils';

const CRIACOES: TipoNoAcervo[] = ['palco', 'encarte', 'arte'];
const NOMES: Record<TipoNoAcervo, string> = { palco: 'Palco (vídeo)', encarte: 'Encarte', arte: 'Arte / vídeo', fundo: 'Fundo', logo: 'Logo', imagem: 'Imagem' };
type Filtro = 'tudo' | 'criacoes' | 'fundo' | 'logo' | 'imagem';

export function nomeDoSegmento(s: string | null): string {
  if (!s) return 'Sem segmento';
  if ((SEGMENTOS_COM_OFERTAS as string[]).includes(s)) return nomeDoSegmentoDeOfertas(s as SegmentoDoStudio);
  return SEGMENTOS.find((x) => x.id === s)?.nome ?? s;
}

/** abre a criação de palco na pasta do palco do segmento, com o fundo, os movimentos e os ajustes dela (sem a logo do cliente) */
function abrirPalco(item: ItemDoAcervo, navegar: (to: string) => void) {
  const d = (item.dados ?? {}) as { fundoId?: string; formato?: string; textoBotao?: string; movimento?: unknown; ajustes?: unknown };
  const seg = (item.segmento ?? 'mercado') as SegmentoDoStudio;
  if (!(SEGMENTOS_COM_OFERTAS as string[]).includes(seg) || d.fundoId == null) { toast.error('Esta criação não tem os dados do palco.'); return; }
  if (!window.confirm('Abrir esta criação no palco? As opções do palco deste segmento nesta conta passam a ser as dela (sem a logo do cliente).')) return;
  const chave = seg === 'mercado' ? 'studio-palco-opcoes' : `studio-palco-opcoes-${seg}`;
  try {
    const atual = JSON.parse(localStorage.getItem(chave) ?? '{}') as { porFundo?: Record<string, unknown> };
    localStorage.setItem(chave, JSON.stringify({ ...atual, fundoId: d.fundoId, formato: d.formato, porFundo: { ...(atual.porFundo ?? {}), [d.fundoId]: { textoBotao: d.textoBotao, movimento: d.movimento, ajustes: d.ajustes } } }));
  } catch { toast.error('Não foi possível abrir.'); return; }
  navegar(`/studio/pasta/${infoDaPasta(seg).pastaPalco}?modelo=${encodeURIComponent(d.fundoId)}`);
}

/** abre o encarte/arte no editor de camadas (lá, "Adicionar ao catálogo" vira modelo do sistema) */
function abrirNoEditor(item: ItemDoAcervo, navegar: (to: string) => void) {
  const d = (item.dados ?? {}) as { documentos?: Partial<Record<FormatoArte, Documento>>; formato?: FormatoArte };
  const docs = d.documentos ?? {};
  const formato = (d.formato && docs[d.formato] ? d.formato : (Object.keys(docs)[0] as FormatoArte | undefined));
  if (!formato) { toast.error('Esta criação não tem os dados da arte.'); return; }
  navegar(enderecoDaArtePronta({ docs, formato, nome: item.nome ?? 'Criação do acervo', pasta: { chave: 'acervo', nome: 'Acervo', segmento: item.segmento }, voltar: '/studio/acervo' }));
}

function Cartao({ item }: { item: ItemDoAcervo }) {
  const navegar = useNavigate();
  const d = (item.dados ?? {}) as { documentos?: Partial<Record<FormatoArte, Documento>>; formato?: FormatoArte };
  const doc = d.documentos ? (d.formato && d.documentos[d.formato]) || Object.values(d.documentos)[0] : null;
  const criacao = CRIACOES.includes(item.tipo);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#140632]" data-testid="acervo-item">
      <div className="relative flex aspect-square items-center justify-center bg-[repeating-conic-gradient(#1c0d3f_0%_25%,#140632_0%_50%)] bg-[length:18px_18px]">
        {item.video ? <video src={item.video} poster={item.url ?? undefined} muted loop playsInline controls preload="none" className="video-inteiro h-full w-full object-contain" />
          : doc ? <div className="h-full w-full p-1"><PreviaDocumento doc={doc} className="h-full w-full" /></div>
          : item.url ? <img src={item.url} alt="" loading="lazy" className="h-full w-full object-contain" />
          : <Archive className="h-8 w-8 text-slate-600" />}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">{NOMES[item.tipo]}</span>
        {item.promovido_para && <span className="absolute right-1.5 top-1.5 rounded-full bg-[#25D366] px-2 py-0.5 text-[10px] font-bold text-[#04210f]">Virou modelo</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-xs font-bold text-white" title={item.nome ?? ''}>{item.nome || NOMES[item.tipo]}</p>
        <p className="truncate text-[10px] text-slate-400">{item.autor || 'Usuário'} · {new Date(item.criado_em).toLocaleDateString('pt-BR')}</p>
        <div className="mt-auto flex gap-1 pt-1">
          {item.tipo === 'palco' && <button type="button" onClick={() => abrirPalco(item, navegar)} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#5D1BFF] text-[11px] font-semibold text-white" data-testid="acervo-abrir-palco"><PenLine className="h-3.5 w-3.5" />Abrir no palco</button>}
          {criacao && item.tipo !== 'palco' && doc && <button type="button" onClick={() => abrirNoEditor(item, navegar)} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#5D1BFF] text-[11px] font-semibold text-white" data-testid="acervo-abrir-editor"><PenLine className="h-3.5 w-3.5" />Abrir no editor</button>}
          {(item.video || item.url) && (
            <a href={item.video ?? item.url!} target="_blank" rel="noreferrer" download className={cn('flex h-8 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 text-[11px] text-white', !criacao && 'flex-1')} aria-label="Abrir ou baixar">
              {criacao ? <ExternalLink className="h-3.5 w-3.5" /> : <><Download className="h-3.5 w-3.5" />Baixar</>}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function AcervoPage() {
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const interno = saldo.data?.paga === false;
  const acervo = useQuery({ queryKey: ['studio-acervo'], queryFn: () => listarAcervo(), enabled: interno, staleTime: 30_000 });
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [segmento, setSegmento] = useState<string>('todos');
  const itens = useMemo(() => acervo.data ?? [], [acervo.data]);
  const segmentos = useMemo(() => [...new Set(itens.map((i) => i.segmento ?? ''))], [itens]);
  const filtrados = itens.filter((i) => (filtro === 'tudo' || (filtro === 'criacoes' ? CRIACOES.includes(i.tipo) : i.tipo === filtro)) && (segmento === 'todos' || (i.segmento ?? '') === segmento));
  const grupos = segmentos.map((s) => ({ s, itens: filtrados.filter((i) => (i.segmento ?? '') === s) })).filter((g) => g.itens.length);
  if (saldo.isLoading) return <p className="p-10 text-sm text-slate-400">Abrindo…</p>;
  if (!interno) return <Navigate to="/studio" replace />;
  const chip = (ativo: boolean) => cn('h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition', ativo ? 'border-[#FFD400] bg-[#FFD400]/15 text-[#FFD400]' : 'border-white/10 text-slate-300 hover:bg-white/5');
  const filtros: [Filtro, string][] = [['tudo', 'Tudo'], ['criacoes', 'Criações'], ['fundo', 'Fundos'], ['logo', 'Logos'], ['imagem', 'Imagens']];

  return (
    <div className="space-y-4" data-testid="acervo-do-studio">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Archive className="h-5 w-5 text-[#FFD400]" />Acervo</h1>
        <p className="text-xs text-slate-400 sm:text-sm">Fundos, logos e imagens enviados e as criações salvas pelos usuários, por segmento · {itens.length} itens · abra uma criação para transformá-la em modelo do sistema (sem a marca do cliente)</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Tipo">
        {filtros.map(([id, n]) => <button key={id} type="button" role="radio" aria-checked={filtro === id} onClick={() => setFiltro(id)} className={chip(filtro === id)} data-testid={`acervo-filtro-${id}`}>{n}</button>)}
      </div>
      {segmentos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Segmento">
          <button type="button" role="radio" aria-checked={segmento === 'todos'} onClick={() => setSegmento('todos')} className={chip(segmento === 'todos')}>Todos os segmentos</button>
          {segmentos.map((s) => <button key={s || 'sem'} type="button" role="radio" aria-checked={segmento === s} onClick={() => setSegmento(s)} className={chip(segmento === s)}>{nomeDoSegmento(s || null)}</button>)}
        </div>
      )}
      {acervo.isLoading && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Carregando o acervo…</p>}
      {acervo.isError && <p className="text-sm text-red-400">Não foi possível abrir o acervo.</p>}
      {!acervo.isLoading && !filtrados.length && <p className="rounded-xl border border-white/10 bg-[#140632] p-6 text-center text-sm text-slate-400">Nada aqui ainda. Tudo o que os usuários enviarem e salvarem no Studio aparece aqui.</p>}
      {grupos.map((g) => (
        <section key={g.s || 'sem'} className="space-y-2">
          <h2 className="text-sm font-bold text-white">{nomeDoSegmento(g.s || null)} <span className="font-normal text-slate-400">· {g.itens.length}</span></h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{g.itens.map((i) => <Cartao key={i.id} item={i} />)}</div>
        </section>
      ))}
    </div>
  );
}
