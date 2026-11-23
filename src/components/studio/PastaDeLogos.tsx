/**
 * F-248 — pasta "Logos" do SOBRE MÍDIA Studio: as logos oficiais e as logos da pessoa (criadas no Criador de Logos ou enviadas).
 * Daqui sai a janela "Trocar logo", usada em todos os encartes e no Palco de Ofertas.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FolderOpen, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CapaQueGira } from '@/components/media/CapaQueGira';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { meuSaldo } from '@/lib/studioai/api';
import { LOGOS_OFICIAIS, logosDaPasta, type LogoDaPasta } from '@/lib/studio/logos';
import { arquivarSelo, ehCentral, enviarParaBiblioteca, listarSelos } from '@/lib/tabloide/selos';
import { guardarNoAcervo } from '@/lib/studio/acervo';
import { META_DE_LOGOS_POR_PASTA, PASTAS_DE_LOGOS, logosDaPastaDe, pastaDeLogo, progressoDaMeta, type GrupoDePasta } from '@/lib/studio/pastasDeLogos';
import { desenharLogoPersonalizada, lembrarValores, pngDoCanvas, valoresIniciais, type ValoresDaLogo } from '@/lib/studio/logoPersonalizada';

export const PASTA_LOGOS = 'logos';
const XADREZ = { backgroundImage: 'repeating-conic-gradient(#2a2340 0 25%, #1c1630 0 50%)', backgroundSize: '18px 18px' };

export function useLogosDaPasta() {
  const selos = useQuery({ queryKey: ['studio-logos-pasta'], queryFn: listarSelos, staleTime: 60_000 });
  return { logos: logosDaPasta(selos.data ?? null), carregando: selos.isLoading };
}

function useEnviarLogo() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const central = useQuery({ queryKey: ['tabloide-central'], queryFn: ehCentral, staleTime: 60_000 });
  const [enviando, setEnviando] = useState(false);
  const enviar = async (arquivo: File | undefined, paraTodos = false): Promise<LogoDaPasta | null> => {
    if (!arquivo || !user) return null;
    setEnviando(true);
    try {
      const nome = arquivo.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Minha logo';
      const s = await enviarParaBiblioteca({ arquivo, nome, tipo: 'LOGO_CABECALHO', categoria: 'Enviadas no Studio', usuarioId: user.id, clienteId: saldo.data?.cliente ?? null, daEmpresa: paraTodos && !!central.data });
      await qc.invalidateQueries({ queryKey: ['studio-logos-pasta'] });
      guardarNoAcervo({ tipo: 'logo', nome, url: s.imagem_url }); // F-310: acervo do SOBRE MÍDIA
      if (!s.transparente) toast.info('A logo tem fundo. Para ficar solta no encarte, envie um PNG sem fundo.');
      else toast.success('Logo guardada na pasta.');
      return { id: s.id, nome: s.nome, url: s.imagem_url, largura: s.largura, altura: s.altura, dono: s.dono_id, miniatura: s.miniatura_url };
    } catch (e) { toast.error((e as Error).message || 'Não foi possível guardar a logo.'); return null; } finally { setEnviando(false); }
  };
  return { enviar, enviando, central: !!central.data };
}

function CartaoDaLogo({ l, aoTocar, acao }: { l: LogoDaPasta; aoTocar?: () => void; acao?: React.ReactNode }) {
  const corpo = (
    <>
      <span className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-lg p-2" style={XADREZ}><img src={l.miniatura ?? l.url} alt="" loading="lazy" crossOrigin="anonymous" className="max-h-full max-w-full object-contain" /></span>
      <span className="mt-1 block truncate text-xs font-semibold text-white">{l.nome}</span>
      {l.oficial && <span className="text-[10px] font-semibold text-[#FFD400]">OFICIAL</span>}
      {l.espacos && <span className="ml-1 text-[10px] font-semibold text-emerald-300" data-testid="logo-personalizavel">· SEU NOME E LOGO</span>}
    </>
  );
  return (
    <article className="relative rounded-xl border border-white/10 bg-[#14062f] p-2" data-testid="logo-cartao">
      {aoTocar ? <button type="button" onClick={aoTocar} aria-label={`Usar a logo ${l.nome}`} className="block w-full text-left hover:brightness-110">{corpo}</button> : corpo}
      {acao}
    </article>
  );
}

const CAMPO_ARQUIVO = 'image/png,image/jpeg,image/webp';

/**
 * F-355 (pedido do dono, 22/11/2026): logo com faixa/placa/espaço → o usuário escreve o texto (começa com o nome da empresa)
 * e, se quiser, põe a logo da empresa dele. Tudo vira UMA imagem (o texto fica preso na logo) e vai para "Suas logos".
 * Sem a logo do usuário, o espaço dela não aparece.
 */
export function PersonalizarLogo({ logo, aoUsar, aoFechar }: { logo: LogoDaPasta; aoUsar: (l: LogoDaPasta) => void; aoFechar: () => void }) {
  const espacos = logo.espacos!;
  const { logos } = useLogosDaPasta();
  const { enviar, enviando } = useEnviarLogo();
  const [v, setV] = useState<ValoresDaLogo>(() => valoresIniciais(logo.id, espacos));
  const [previa, setPrevia] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => { desenharLogoPersonalizada(logo, v).then((c) => { if (vivo) setPrevia(c.toDataURL('image/png')); }).catch(() => { if (vivo) setPrevia(logo.url); }); }, 180);
    return () => { vivo = false; clearTimeout(t); };
  }, [logo, v]);
  const daPessoa = logos.filter((l) => !l.oficial);
  const usar = async () => {
    setGravando(true);
    try {
      lembrarValores(logo.id, v);
      const texto = Object.values(v.textos).find((x) => x.trim())?.trim();
      const blob = await pngDoCanvas(await desenharLogoPersonalizada(logo, v));
      const nome = `${logo.nome}${texto ? ` – ${texto}` : ''}`.slice(0, 60);
      const l = await enviar(new File([blob], `${nome.replace(/[\\/:*?"<>|]/g, ' ')}.png`, { type: 'image/png' }));
      if (l) aoUsar(l);
    } catch (e) { toast.error((e as Error).message || 'Não foi possível montar a logo.'); } finally { setGravando(false); }
  };
  const ocupado = gravando || enviando;
  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto border-white/10 bg-[#0f0428] text-white" data-testid="personalizar-logo">
        <DialogHeader><DialogTitle>{logo.nome}: seu nome e sua logo</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl p-3" style={XADREZ}>
            {previa ? <img src={previa} alt={`Prévia da logo ${logo.nome}`} className="max-h-full max-w-full object-contain" data-testid="personalizar-previa" /> : <Loader2 className="h-6 w-6 animate-spin text-slate-300" />}
          </div>
          <div className="space-y-3">
            {espacos.textos.map((t) => (
              <label key={t.id} className="block space-y-1">
                <span className="text-xs font-semibold text-slate-300">Texto · {t.rotulo}</span>
                <input value={v.textos[t.id] ?? ''} maxLength={40} placeholder="Nome da sua empresa" onChange={(e) => setV((x) => ({ ...x, textos: { ...x.textos, [t.id]: e.target.value } }))}
                  className="h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm font-bold text-white outline-none focus:border-[#B04DFF]" data-testid="personalizar-texto" />
                {t.somePorLogo && v.logoUrl && <span className="text-[11px] text-slate-400">Com a sua logo no mesmo lugar, este texto não aparece.</span>}
              </label>
            ))}
            {espacos.logo && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="text-xs font-semibold text-slate-300">Sua logo · {espacos.logo.rotulo} <span className="font-normal text-slate-400">(opcional)</span></p>
                {v.logoUrl ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-14 w-20 items-center justify-center rounded-lg p-1" style={XADREZ}><img src={v.logoUrl} alt="" className="max-h-full max-w-full object-contain" /></span>
                    <button type="button" onClick={() => setEscolhendo(true)} className="h-9 rounded-lg border border-white/15 px-2.5 text-xs text-white hover:bg-white/5">Trocar</button>
                    <button type="button" onClick={() => setV((x) => ({ ...x, logoUrl: null }))} className="flex h-9 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs text-rose-200 hover:bg-rose-500/10" data-testid="personalizar-tirar-logo"><X className="h-3.5 w-3.5" />Tirar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEscolhendo(true)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5D1BFF] text-xs font-semibold text-white hover:bg-[#8A2EFF]" data-testid="personalizar-por-logo"><ImagePlus className="h-4 w-4" />Pôr a logo da sua empresa</button>
                )}
                {escolhendo && (
                  <div className="space-y-2" data-testid="personalizar-suas-logos">
                    <input ref={arquivo} type="file" accept={CAMPO_ARQUIVO} className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; const l = await enviar(f); if (l) { setV((x) => ({ ...x, logoUrl: l.url })); setEscolhendo(false); } }} />
                    <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B04DFF]/60 text-xs font-semibold text-white hover:bg-[#5D1BFF]/20">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar do aparelho</button>
                    {daPessoa.length ? <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto">{daPessoa.map((l) => (
                      <button key={l.id} type="button" title={l.nome} onClick={() => { setV((x) => ({ ...x, logoUrl: l.url })); setEscolhendo(false); }} className="flex aspect-[3/2] items-center justify-center rounded-lg border border-white/10 p-1 hover:border-[#FFD400]" style={XADREZ}>
                        <img src={l.miniatura ?? l.url} alt={l.nome} loading="lazy" crossOrigin="anonymous" className="max-h-full max-w-full object-contain" />
                      </button>))}</div>
                      : <p className="text-[11px] text-slate-400">Suas logos aparecem aqui. Envie a logo da sua empresa (PNG sem fundo fica melhor).</p>}
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-400">O texto e a sua logo ficam presos na logo: ao mover, aumentar ou girar, vão juntos.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void usar()} disabled={ocupado} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#FFD400] px-3 text-sm font-black text-[#1a0b3d] hover:brightness-105 disabled:opacity-60" data-testid="personalizar-usar">{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Usar esta logo</button>
              <button type="button" onClick={() => aoUsar(logo)} disabled={ocupado} className="h-11 rounded-lg border border-white/15 px-3 text-xs text-white hover:bg-white/5" data-testid="personalizar-sem">Usar sem texto</button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PASTA_SUAS = 'suas-logos';
const GRUPOS: Array<{ id: GrupoDePasta; nome: string }> = [{ id: 'segmento', nome: 'Por segmento' }, { id: 'data', nome: 'Datas comemorativas' }];

/**
 * F-355 (pedido do dono, 22/11/2026): as logos separadas em PASTAS — por segmento do estabelecimento e por data
 * comemorativa. Primeiro aparecem as pastas; abriu uma, aparecem todas as logos dela.
 */
export function PastasDasLogos({ logos, carregando, aoTocar, acaoDaSua, colunas = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5', mostrarMeta = false }: {
  logos: LogoDaPasta[]; carregando?: boolean; aoTocar?: (l: LogoDaPasta) => void; acaoDaSua?: (l: LogoDaPasta) => React.ReactNode; colunas?: string;
  /** só o dono/ADM vê a meta de 8 logos por pasta */ mostrarMeta?: boolean;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const daPessoa = logos.filter((l) => !l.oficial);
  if (aberta) {
    const suas = aberta === PASTA_SUAS;
    const lista = suas ? daPessoa : logosDaPastaDe(logos.filter((l) => l.oficial), aberta);
    const p = pastaDeLogo(aberta);
    return (
      <section className="space-y-3" data-testid="pasta-de-logos-aberta">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAberta(null)} className="flex h-10 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/5" data-testid="pastas-voltar"><ArrowLeft className="h-4 w-4" />Pastas</button>
          <h2 className="truncate text-base font-black text-white">{suas ? '⭐ Suas logos' : `${p?.icone ?? ''} ${p?.nome ?? aberta}`}</h2>
          <span className="text-xs text-slate-400">{lista.length} {lista.length === 1 ? 'logo' : 'logos'}</span>
        </div>
        {suas && carregando ? <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Abrindo a pasta…</p>
          : !lista.length ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">{suas ? 'Nenhuma ainda. Envie um PNG sem fundo ou crie uma logo 3D.' : 'Nenhuma logo nesta pasta ainda.'}</p>
            : <div className={cn('grid gap-2', colunas)}>{lista.map((l) => <CartaoDaLogo key={l.id} l={l} aoTocar={aoTocar ? () => aoTocar(l) : undefined} acao={suas ? acaoDaSua?.(l) : undefined} />)}</div>}
      </section>
    );
  }
  // CAPA DA PASTA (como as capas das mídias): as logos da pasta passando, 8 s cada, com o nome do segmento embaixo
  const Cartao = ({ id, nome, icone, lista }: { id: string; nome: string; icone: string; lista: LogoDaPasta[] }) => (
    <button type="button" onClick={() => setAberta(id)} className={cn('overflow-hidden rounded-xl border border-white/10 bg-[#14062f] text-left hover:border-[#B04DFF]/70', !lista.length && 'opacity-70')} data-testid="pasta-de-logos" aria-label={`Abrir a pasta ${nome}`}>
      <span className="relative block aspect-[3/2] w-full overflow-hidden" style={XADREZ}>
        {lista.length ? <CapaQueGira slides={lista.map((l) => ({ chave: l.id, imagem: l.miniatura ?? l.url }))} ajuste="contain" className="h-full w-full p-1.5" />
          : <span className="flex h-full w-full items-center justify-center text-5xl">{icone}</span>}
      </span>
      <span className="flex items-center gap-1 bg-gradient-to-r from-[#5D1BFF] to-[#B04DFF] px-2 py-1.5 text-xs font-black uppercase tracking-wide text-white" data-testid="capa-da-pasta-nome"><span className="text-sm">{icone}</span><span className="truncate">{nome}</span></span>
      <span className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-400">
        <span>{lista.length ? `${lista.length} ${lista.length === 1 ? 'logo' : 'logos'}` : 'em breve'}</span>
        {mostrarMeta && id !== PASTA_SUAS && <span className={cn('font-bold', lista.length >= META_DE_LOGOS_POR_PASTA ? 'text-emerald-300' : 'text-[#FFD400]')} data-testid="meta-da-pasta">{lista.length >= META_DE_LOGOS_POR_PASTA ? '✓ meta' : `${lista.length}/${META_DE_LOGOS_POR_PASTA}`}</span>}
      </span>
    </button>
  );
  const meta = mostrarMeta ? progressoDaMeta(logos) : null;
  const oficiais = logos.filter((l) => l.oficial);
  return (
    <div className="space-y-4" data-testid="pastas-das-logos">
      {meta && (
        <div className="rounded-xl border border-[#FFD400]/40 bg-[#FFD400]/10 p-3 text-sm text-white" data-testid="meta-das-logos">
          <p className="font-black">Meta: {META_DE_LOGOS_POR_PASTA} logos em cada pasta · {meta.completas} de {meta.pastas.length} pastas completas</p>
          {meta.proxima ? <p className="text-xs text-slate-200">Próxima pasta: <b>{meta.proxima.pasta.icone} {meta.proxima.pasta.nome}</b> — tem {meta.proxima.tem}, faltam {meta.proxima.falta}.</p>
            : <p className="text-xs text-slate-200">Todas as pastas chegaram à meta. Próximo passo: mandar os <b>fundos</b> que combinam com as logos.</p>}
        </div>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Suas logos</h2>
        <div className={cn('grid gap-2', colunas)}><Cartao id={PASTA_SUAS} nome="Suas logos" icone="⭐" lista={daPessoa} /></div>
      </section>
      {GRUPOS.map((g) => (
        <section key={g.id} className="space-y-2">
          <h2 className="text-sm font-bold text-white">{g.nome}</h2>
          <div className={cn('grid gap-2', colunas)}>{PASTAS_DE_LOGOS.filter((p) => p.grupo === g.id).map((p) => <Cartao key={p.id} id={p.id} nome={p.nome} icone={p.icone} lista={logosDaPastaDe(oficiais, p.id)} />)}</div>
        </section>
      ))}
    </div>
  );
}

/** A janela "Trocar logo": escolher da pasta ou enviar uma nova (que já fica guardada na pasta). */
export function EscolherLogo({ titulo, aoEscolher, aoRestaurar, aoFechar }: { titulo: string; aoEscolher: (l: LogoDaPasta) => void; /** volta para a logo padrão do encarte */ aoRestaurar?: () => void; aoFechar: () => void }) {
  const { logos, carregando } = useLogosDaPasta();
  const { enviar, enviando } = useEnviarLogo();
  const arquivo = useRef<HTMLInputElement>(null);
  const [personalizando, setPersonalizando] = useState<LogoDaPasta | null>(null);
  // F-355: logo com faixa/espaço abre primeiro o "seu nome e sua logo"
  if (personalizando) return <PersonalizarLogo logo={personalizando} aoUsar={aoEscolher} aoFechar={() => setPersonalizando(null)} />;
  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto border-white/10 bg-[#0f0428] text-white" data-testid="escolher-logo">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <input ref={arquivo} type="file" accept={CAMPO_ARQUIVO} className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; const l = await enviar(f); if (l) aoEscolher(l); }} data-testid="logo-arquivo" />
          <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#5D1BFF] px-3 text-sm font-semibold text-white hover:bg-[#8A2EFF]">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar logo</button>
          <Link to="/studio/logos" className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/5"><Sparkles className="h-4 w-4 text-[#FFD400]" />Criar logo 3D</Link>
          {aoRestaurar && <button type="button" onClick={aoRestaurar} className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/5" data-testid="logo-restaurar"><RotateCcw className="h-4 w-4" />Logo original do encarte</button>}
        </div>
        {carregando ? <p className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Abrindo a pasta…</p> : (
          <PastasDasLogos logos={logos} carregando={carregando} colunas="grid-cols-2 sm:grid-cols-3" aoTocar={(l) => (l.espacos ? setPersonalizando(l) : aoEscolher(l))} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Capa da pasta no catálogo: passa as logos oficiais, 8 s cada, como todas as pastas. */
export function CapaDaPastaDeLogos() {
  return <CapaQueGira slides={LOGOS_OFICIAIS.map((l) => ({ chave: l.id, imagem: l.url }))} ajuste="contain" className="h-full w-full" style={{ aspectRatio: '3 / 2' }} />;
}

export function PastaDeLogos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { logos, carregando } = useLogosDaPasta();
  const { enviar, enviando, central } = useEnviarLogo();
  const [paraTodos, setParaTodos] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const tirar = async (l: LogoDaPasta) => {
    if (!window.confirm(`Tirar a logo "${l.nome}" da pasta?`)) return;
    try { await arquivarSelo(l.id); await qc.invalidateQueries({ queryKey: ['studio-logos-pasta'] }); toast.success('Logo tirada da pasta.'); }
    catch (e) { toast.error((e as Error).message || 'Não foi possível tirar a logo.'); }
  };
  const [personalizando, setPersonalizando] = useState<LogoDaPasta | null>(null);
  return (
    <div className="space-y-4" data-testid="studio-pasta-logos">
      {personalizando && <PersonalizarLogo logo={personalizando} aoUsar={() => setPersonalizando(null)} aoFechar={() => setPersonalizando(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/studio" className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Modelos</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Logos</h1>
          <p className="text-xs text-slate-400">As logos ficam separadas em pastas, por segmento e por data comemorativa. Em cada encarte e no Palco, toque em “Trocar logo” para escolher uma delas.</p>
        </div>
        {central && <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={paraTodos} onChange={(e) => setParaTodos(e.target.checked)} className="h-4 w-4 accent-[#FFD400]" />Para todos os usuários</label>}
        <input ref={arquivo} type="file" accept={CAMPO_ARQUIVO} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void enviar(f, paraTodos); }} />
        <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#5D1BFF] px-3 text-sm font-semibold text-white hover:bg-[#8A2EFF]" data-testid="pasta-logos-enviar">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar logo</button>
        <Link to="/studio/logos" className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/5"><Sparkles className="h-4 w-4 text-[#FFD400]" />Criar logo 3D</Link>
      </div>
      <PastasDasLogos logos={logos} carregando={carregando} mostrarMeta={central} aoTocar={(l) => (l.espacos ? setPersonalizando(l) : undefined)}
        acaoDaSua={(l) => (l.dono && l.dono === user?.id ? <button type="button" onClick={() => void tirar(l)} aria-label={`Tirar a logo ${l.nome}`} className="absolute right-3 top-3 rounded-lg bg-black/60 p-1.5 text-rose-300 hover:bg-black/80"><Trash2 className="h-4 w-4" /></button> : undefined)} />
    </div>
  );
}
