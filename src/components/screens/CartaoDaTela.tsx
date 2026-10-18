import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, Clock, ListVideo, MapPin, Monitor, MonitorSmartphone, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { ScreenIdBadge } from './ScreenIdBadge';
import { IconeDaRotacao } from './SeletorDeRotacao';
import { ehRotacao, rotacaoPadrao, telaEmPe } from '@/lib/rotacaoTela';

/**
 * F-194 — Resumo de um grupo de telas (Pontos Parceiros ou Anunciantes) no mesmo estilo dos cartões grandes:
 * total, online agora, offline e ativas — cada tela conta pelo PRÓPRIO sinal.
 */
export function ResumoDasTelas({ total, online, ativas, testId }: { total: number; online: number; ativas: number; testId?: string }) {
  const itens = [
    { rotulo: 'Total de telas', valor: total, icone: <Monitor className="h-5 w-5" />, cor: 'text-cyan-300', fundo: 'from-cyan-500/20' },
    { rotulo: 'Online agora', valor: online, icone: <Wifi className="h-5 w-5" />, cor: 'text-emerald-400', fundo: 'from-emerald-500/20' },
    { rotulo: 'Offline', valor: total - online, icone: <WifiOff className="h-5 w-5" />, cor: total - online > 0 ? 'text-red-400' : 'text-muted-foreground', fundo: 'from-red-500/20' },
    { rotulo: 'Ativas', valor: ativas, icone: <CheckCircle2 className="h-5 w-5" />, cor: 'text-violet-300', fundo: 'from-violet-500/20' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid={testId ?? 'resumo-das-telas'}>
      {itens.map((i) => (
        <div key={i.rotulo} className={`flex items-center gap-3 rounded-2xl border border-border bg-gradient-to-br ${i.fundo} to-card/60 p-3 shadow-[inset_0_0_14px_rgba(255,255,255,0.03)]`}>
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-background/60 ${i.cor}`}>{i.icone}</span>
          <div className="min-w-0 leading-tight">
            <p className={`text-2xl font-bold ${i.cor}`}>{i.valor}</p>
            <p className="truncate text-xs text-muted-foreground">{i.rotulo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface TelaDoCartao {
  id: string; name: string; location?: string | null; resolution?: string | null; orientation?: string | null;
  capa_url?: string | null; rotacao_tela?: number | null; last_ping_at?: string | null; app_version?: string | null; version?: string | null;
  playlist?: { name?: string | null } | null; custom_id?: string | null; codigo_operacional?: string | null; bound_device_id?: string | null;
  is_active?: boolean | null;
}

function Info({ icone, rotulo, valor, tom }: { icone: ReactNode; rotulo: string; valor: ReactNode; tom?: 'bom' | 'ruim' | 'aviso' }) {
  const cor = tom === 'bom' ? 'text-emerald-400' : tom === 'ruim' ? 'text-red-400' : tom === 'aviso' ? 'text-amber-400' : 'text-foreground';
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
      <span className={`flex-shrink-0 ${cor}`}>{icone}</span>
      <div className="min-w-0 leading-tight">
        <p className={`truncate text-xs font-semibold ${cor}`}>{valor}</p>
        <p className="truncate text-[10px] text-muted-foreground">{rotulo}</p>
      </div>
    </div>
  );
}

/**
 * F-194 — Cartão de uma tela de anunciante: capa em cima (ou a capa padrão), sinal da própria tela, nome e local, e as
 * informações em blocos — playlist, formato/rotação, último sinal, aplicativo e ID.
 */
export function CartaoDaTela({ tela, online, selecionada, onSelecionar, onAbrir, menu }: {
  tela: TelaDoCartao; online: boolean; selecionada: boolean;
  onSelecionar: (e: React.MouseEvent) => void; onAbrir: () => void; menu: ReactNode;
}) {
  const emPe = telaEmPe(tela.resolution, tela.orientation);
  const rot = ehRotacao(tela.rotacao_tela) ? tela.rotacao_tela : rotacaoPadrao(tela.resolution, tela.orientation);
  const versao = tela.app_version || tela.version;
  return (
    <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(); }} data-testid="cartao-da-tela"
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card/60 text-left transition-all hover:shadow-[0_0_18px_rgba(139,92,246,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selecionada ? 'border-primary ring-1 ring-primary' : online ? 'border-emerald-500/40 hover:border-emerald-400/70' : 'border-border hover:border-primary/50'}`}>
      <div className={`relative aspect-[16/9] w-full overflow-hidden ${tela.capa_url ? '' : online ? 'bg-gradient-to-br from-emerald-600/50 via-indigo-900/60 to-slate-900' : 'bg-gradient-to-br from-violet-600/50 via-indigo-900/60 to-slate-900'}`}>
        {tela.capa_url
          ? <img src={tela.capa_url} alt={`Capa de ${tela.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" data-testid="capa-no-cartao" />
          : <div className="flex h-full w-full items-start justify-center pt-[12%] opacity-90">{emPe ? <MonitorSmartphone className="h-10 w-10 text-violet-200" /> : <Monitor className="h-10 w-10 text-violet-200" />}</div>}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${online ? 'bg-emerald-500/90 text-white' : 'bg-red-500/85 text-white'}`} data-testid="sinal-da-tela">
          {online ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Online</> : <><WifiOff className="h-3 w-3" /> Offline</>}
        </span>
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selecionada} onClick={onSelecionar} onChange={() => {}} aria-label={`Selecionar ${tela.name}`}
            className="h-4 w-4 cursor-pointer rounded border-white/40 accent-primary" />
          <span className="rounded-full bg-black/50 text-white">{menu}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate font-display text-base font-bold leading-tight text-white drop-shadow">{tela.name}</p>
          {tela.location && <p className="flex items-center gap-1 truncate text-xs text-white/80"><MapPin className="h-3 w-3 flex-shrink-0" />{tela.location}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2.5">
        <Info icone={<ListVideo className="h-4 w-4" />} rotulo="Playlist" valor={tela.playlist?.name || 'Sem playlist'} tom={tela.playlist?.name ? undefined : 'aviso'} />
        <Info icone={<span className="block h-5 w-5"><IconeDaRotacao rotacao={rot} tamanho={20} /></span>} rotulo={`${emPe ? '9x16 em pé' : '16x9 deitada'}`} valor={`${rot}°`} />
        <Info icone={<Clock className="h-4 w-4" />} rotulo="Último sinal" tom={online ? 'bom' : tela.last_ping_at ? 'ruim' : undefined}
          valor={tela.last_ping_at ? format(new Date(tela.last_ping_at), "dd/MM HH:mm", { locale: ptBR }) : 'Nunca visto'} />
        <Info icone={<Smartphone className="h-4 w-4" />} rotulo={tela.bound_device_id ? 'Aplicativo' : 'Sem aparelho'} valor={versao ? `v${versao}` : '—'} tom={tela.bound_device_id ? undefined : 'aviso'} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">ID</span>
        <ScreenIdBadge customId={tela.custom_id ?? null} codigoOperacional={tela.codigo_operacional ?? null} className="h-6 border-border/50 bg-background px-2 text-[10px]" />
      </div>
    </div>
  );
}
