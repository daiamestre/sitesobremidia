/**
 * F-248 — pasta "Logos" do SOBRE MÍDIA Studio: as logos oficiais e as logos da pessoa (criadas no Criador de Logos ou enviadas).
 * Daqui sai a janela "Trocar logo", usada em todos os encartes e no Palco de Ofertas.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderOpen, Loader2, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { CapaQueGira } from '@/components/media/CapaQueGira';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { meuSaldo } from '@/lib/studioai/api';
import { LOGOS_OFICIAIS, logosDaPasta, type LogoDaPasta } from '@/lib/studio/logos';
import { arquivarSelo, ehCentral, enviarParaBiblioteca, listarSelos } from '@/lib/tabloide/selos';

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

/** A janela "Trocar logo": escolher da pasta ou enviar uma nova (que já fica guardada na pasta). */
export function EscolherLogo({ titulo, aoEscolher, aoRestaurar, aoFechar }: { titulo: string; aoEscolher: (l: LogoDaPasta) => void; /** volta para a logo padrão do encarte */ aoRestaurar?: () => void; aoFechar: () => void }) {
  const { logos, carregando } = useLogosDaPasta();
  const { enviar, enviando } = useEnviarLogo();
  const arquivo = useRef<HTMLInputElement>(null);
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{logos.map((l) => <CartaoDaLogo key={l.id} l={l} aoTocar={() => aoEscolher(l)} />)}</div>
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
  const oficiais = logos.filter((l) => l.oficial), daPessoa = logos.filter((l) => !l.oficial);
  return (
    <div className="space-y-4" data-testid="studio-pasta-logos">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/studio" className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Modelos</span></Link>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-center gap-2 truncate text-xl font-black text-white"><FolderOpen className="h-5 w-5 shrink-0 text-[#FFD400]" />Logos</h1>
          <p className="text-xs text-slate-400">Todas as logos ficam aqui. Em cada encarte e no Palco, toque em “Trocar logo” para escolher uma delas.</p>
        </div>
        {central && <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={paraTodos} onChange={(e) => setParaTodos(e.target.checked)} className="h-4 w-4 accent-[#FFD400]" />Para todos os usuários</label>}
        <input ref={arquivo} type="file" accept={CAMPO_ARQUIVO} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void enviar(f, paraTodos); }} />
        <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} className="flex h-10 items-center gap-1.5 rounded-lg bg-[#5D1BFF] px-3 text-sm font-semibold text-white hover:bg-[#8A2EFF]" data-testid="pasta-logos-enviar">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Enviar logo</button>
        <Link to="/studio/logos" className="flex h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/5"><Sparkles className="h-4 w-4 text-[#FFD400]" />Criar logo 3D</Link>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Logos oficiais</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{oficiais.map((l) => <CartaoDaLogo key={l.id} l={l} />)}</div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Suas logos</h2>
        {carregando ? <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Abrindo a pasta…</p>
          : !daPessoa.length ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">Nenhuma ainda. Envie um PNG sem fundo ou crie uma logo 3D.</p>
            : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{daPessoa.map((l) => <CartaoDaLogo key={l.id} l={l} acao={l.dono && l.dono === user?.id ? <button type="button" onClick={() => void tirar(l)} aria-label={`Tirar a logo ${l.nome}`} className="absolute right-3 top-3 rounded-lg bg-black/60 p-1.5 text-rose-300 hover:bg-black/80"><Trash2 className="h-4 w-4" /></button> : undefined} />)}</div>}
      </section>
    </div>
  );
}
