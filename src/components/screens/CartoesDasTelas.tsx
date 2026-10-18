import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, Trash2, Wifi, WifiOff, Monitor, ListX, Unplug, CheckCircle2, Store, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { telaOnlineAgora } from '@/lib/statusDoAparelho';

/**
 * F-193 — Cartões da página Telas (Pontos Parceiros e Anunciantes): em pé, um ao lado do outro, com capa que o próprio
 * usuário escolhe e os números que importam de cada grupo (total, online, offline, ativas, sem playlist, sem aparelho).
 * A capa fica no perfil de cada usuário (user_metadata.capas_telas), então cada pessoa que usa os cartões tem a sua.
 */
export type SecaoDasTelas = 'parceiros' | 'anunciantes';

export interface TelaParaResumo {
  is_active?: boolean | null; bound_device_id?: string | null; last_ping_at?: string | null;
  playlist_id?: string | null; playlist?: { name?: string | null } | null;
}

export interface ResumoDoCartao { total: number; online: number; offline: number; ativas: number; semPlaylist: number; semAparelho: number }

/** Cada tela conta só pelo PRÓPRIO sinal (aparelho dela, últimos 3 minutos) — nenhuma tela empresta o online de outra. */
export function resumirTelas(telas: TelaParaResumo[], agora = Date.now()): ResumoDoCartao {
  const online = telas.filter((t) => telaOnlineAgora(t, null, agora)).length;
  return {
    total: telas.length,
    online,
    offline: telas.length - online,
    ativas: telas.filter((t) => t.is_active !== false).length,
    semPlaylist: telas.filter((t) => !t.playlist_id && !t.playlist).length,
    semAparelho: telas.filter((t) => !t.bound_device_id).length,
  };
}

type Capas = Partial<Record<SecaoDasTelas, string>>;

function useCapas() {
  const { user } = useAuth();
  const doPerfil = ((user?.user_metadata as { capas_telas?: Capas } | undefined)?.capas_telas) ?? {};
  const [capas, setCapas] = useState<Capas>(doPerfil);
  const [salvando, setSalvando] = useState<SecaoDasTelas | null>(null);

  const gravar = async (novas: Capas) => {
    const { error } = await supabase.auth.updateUser({ data: { capas_telas: novas } });
    if (error) throw error;
    setCapas(novas);
  };

  const trocar = async (secao: SecaoDasTelas, arquivo: File) => {
    if (!user) return;
    if (!arquivo.type.startsWith('image/')) { toast.error('Escolha uma imagem (JPG, PNG ou WEBP).'); return; }
    if (arquivo.size > 5 * 1024 * 1024) { toast.error('A imagem pode ter até 5 MB.'); return; }
    setSalvando(secao);
    try {
      const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const caminho = `${user.id}/capas-telas/${secao}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
      if (error) throw error;
      const url = supabase.storage.from('avatars').getPublicUrl(caminho).data.publicUrl;
      await gravar({ ...capas, [secao]: url });
      toast.success('Capa atualizada.');
    } catch (e) {
      toast.error(`Não foi possível trocar a capa: ${(e as Error).message}`);
    } finally { setSalvando(null); }
  };

  const remover = async (secao: SecaoDasTelas) => {
    setSalvando(secao);
    try {
      const novas = { ...capas }; delete novas[secao];
      await gravar(novas);
      toast.success('Capa removida.');
    } catch (e) {
      toast.error(`Não foi possível remover a capa: ${(e as Error).message}`);
    } finally { setSalvando(null); }
  };

  return { capas, salvando, trocar, remover };
}

function Numero({ icone, valor, rotulo, tom }: { icone: ReactNode; valor: number | string; rotulo: string; tom?: 'bom' | 'ruim' | 'aviso' }) {
  const cor = tom === 'bom' ? 'text-emerald-400' : tom === 'ruim' ? 'text-red-400' : tom === 'aviso' ? 'text-amber-400' : 'text-foreground';
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
      <span className={`flex-shrink-0 ${cor}`}>{icone}</span>
      <div className="min-w-0 leading-tight">
        <p className={`text-base font-bold ${cor}`}>{valor}</p>
        <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  );
}

function Cartao({ secao, titulo, subtitulo, icone, gradiente, resumo, carregando, ativo, onAbrir, capa, salvando, onTrocarCapa, onRemoverCapa }: {
  secao: SecaoDasTelas; titulo: string; subtitulo: string; icone: ReactNode; gradiente: string; resumo: ResumoDoCartao;
  carregando: boolean; ativo: boolean; onAbrir: () => void; capa?: string; salvando: boolean;
  onTrocarCapa: (f: File) => void; onRemoverCapa: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button" tabIndex={0} data-testid={`cartao-telas-${secao}`}
      onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition-all hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ativo ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'} bg-card/60`}
    >
      <div className={`relative aspect-square w-full overflow-hidden sm:aspect-[4/3] ${capa ? '' : gradiente}`}>
        {capa
          ? <img src={capa} alt={`Capa de ${titulo}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="flex h-full w-full items-start justify-center pt-[16%] opacity-90 sm:items-center sm:pt-0">{icone}</div>}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${resumo.online > 0 ? 'bg-emerald-500/90 text-white' : 'bg-slate-700/90 text-slate-200'}`}>
          {resumo.online > 0 ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {carregando ? '…' : `${resumo.online} online`}
        </span>
        <div className="absolute right-2 top-2 flex gap-1">
          <button type="button" aria-label="Trocar capa" title="Trocar capa" data-testid={`trocar-capa-${secao}`} disabled={salvando}
            onClick={(e) => { e.stopPropagation(); entrada.current?.click(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          {capa && (
            <button type="button" aria-label="Remover capa" title="Remover capa" disabled={salvando}
              onClick={(e) => { e.stopPropagation(); onRemoverCapa(); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-60">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <input ref={entrada} type="file" accept="image/*" className="hidden" onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onTrocarCapa(f); }} />
        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <p className="font-display text-[15px] font-bold leading-tight text-white drop-shadow sm:text-lg">{titulo}</p>
          <p className="text-xs text-white/80">{carregando ? 'Carregando…' : subtitulo}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 p-2 min-[420px]:grid-cols-2 sm:p-3">
        <Numero icone={<Monitor className="h-4 w-4" />} valor={carregando ? '…' : resumo.total} rotulo="Telas" />
        <Numero icone={<Wifi className="h-4 w-4" />} valor={carregando ? '…' : resumo.online} rotulo="Online agora" tom="bom" />
        <Numero icone={<WifiOff className="h-4 w-4" />} valor={carregando ? '…' : resumo.offline} rotulo="Offline" tom={resumo.offline > 0 ? 'ruim' : undefined} />
        <Numero icone={<CheckCircle2 className="h-4 w-4" />} valor={carregando ? '…' : resumo.ativas} rotulo="Ativas" />
        <Numero icone={<ListX className="h-4 w-4" />} valor={carregando ? '…' : resumo.semPlaylist} rotulo="Sem playlist" tom={resumo.semPlaylist > 0 ? 'aviso' : undefined} />
        <Numero icone={<Unplug className="h-4 w-4" />} valor={carregando ? '…' : resumo.semAparelho} rotulo="Sem aparelho" tom={resumo.semAparelho > 0 ? 'aviso' : undefined} />
      </div>
    </div>
  );
}

export function CartoesDasTelas({ secao, onAbrir, parceiros, anunciantes }: {
  secao: SecaoDasTelas | null;
  onAbrir: (s: SecaoDasTelas) => void;
  parceiros: { resumo: ResumoDoCartao; subtitulo: string; carregando: boolean };
  anunciantes: { resumo: ResumoDoCartao; subtitulo: string; carregando: boolean };
}) {
  const { capas, salvando, trocar, remover } = useCapas();
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-3xl" data-testid="cartoes-telas">
      <Cartao secao="parceiros" titulo="Telas Pontos Parceiros" subtitulo={parceiros.subtitulo} resumo={parceiros.resumo}
        carregando={parceiros.carregando} ativo={secao === 'parceiros'} onAbrir={() => onAbrir('parceiros')}
        gradiente="bg-gradient-to-br from-sky-600/60 via-sky-900/60 to-slate-900"
        icone={<Store className="h-10 w-10 text-sky-200 sm:h-16 sm:w-16" />}
        capa={capas.parceiros} salvando={salvando === 'parceiros'}
        onTrocarCapa={(f) => trocar('parceiros', f)} onRemoverCapa={() => remover('parceiros')} />
      <Cartao secao="anunciantes" titulo="Telas Anunciantes" subtitulo={anunciantes.subtitulo} resumo={anunciantes.resumo}
        carregando={anunciantes.carregando} ativo={secao === 'anunciantes'} onAbrir={() => onAbrir('anunciantes')}
        gradiente="bg-gradient-to-br from-violet-600/60 via-indigo-900/60 to-slate-900"
        icone={<Megaphone className="h-10 w-10 text-violet-200 sm:h-16 sm:w-16" />}
        capa={capas.anunciantes} salvando={salvando === 'anunciantes'}
        onTrocarCapa={(f) => trocar('anunciantes', f)} onRemoverCapa={() => remover('anunciantes')} />
    </div>
  );
}
