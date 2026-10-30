import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ESTADOS, ROTULO, type Estado, type TipoProducao } from '../../../supabase/functions/_shared/studio/contrato.ts';
import type { Producao } from '@/lib/studio/api';

/** Fundo cinematográfico do Studio (escuro, com brilhos roxo e âmbar da identidade SOBRE MÍDIA). */
export function StudioFundo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // overflow-clip (e não hidden): o foco num campo nunca "rola" o painel para o lado no celular
    <div className={cn('relative min-h-full overflow-clip rounded-3xl bg-[#07060d] text-slate-100', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute -right-32 top-24 h-[380px] w-[380px] rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.12),transparent_60%)]" />
      </div>
      <div className="relative min-w-0">{children}</div>
    </div>
  );
}

export function StudioMarca() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-900/50">
        <Clapperboard className="h-6 w-6 text-white" />
      </span>
      <div className="leading-tight">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-violet-300">Sobre Mídia</p>
        <p className="text-lg font-extrabold tracking-tight text-white">Studio de IA <span className="text-amber-400">Cinematográfica</span></p>
      </div>
    </div>
  );
}

const COR_ESTADO: Record<Estado, string> = {
  recebido: 'bg-slate-500/20 text-slate-200 ring-slate-400/30',
  planejando: 'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  aguardando_aprovacao_plano: 'bg-amber-500/20 text-amber-200 ring-amber-400/40',
  gerando_imagens: 'bg-violet-500/20 text-violet-200 ring-violet-400/40',
  aguardando_aprovacao_imagens: 'bg-amber-500/20 text-amber-200 ring-amber-400/40',
  montando: 'bg-sky-500/20 text-sky-200 ring-sky-400/40',
  conferindo: 'bg-sky-500/20 text-sky-200 ring-sky-400/40',
  pronto: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  entregue: 'bg-emerald-600/25 text-emerald-100 ring-emerald-400/40',
  reprovado: 'bg-rose-500/20 text-rose-200 ring-rose-400/40',
  erro: 'bg-rose-500/20 text-rose-200 ring-rose-400/40',
  cancelado: 'bg-slate-700/40 text-slate-400 ring-slate-500/30',
};
export const ESTADOS_EM_ANDAMENTO: Estado[] = ['recebido', 'planejando', 'gerando_imagens', 'montando', 'conferindo'];
export const nomeDoEstado = (e: Estado) => ESTADOS.find((x) => x.id === e)?.nome ?? e;

export function SeloEstado({ estado }: { estado: Estado }) {
  const andando = ESTADOS_EM_ANDAMENTO.includes(estado);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1', COR_ESTADO[estado])}>
      {andando && <Loader2 className="h-3 w-3 animate-spin" />}
      {nomeDoEstado(estado)}
    </span>
  );
}

export function SeloRotulo({ tipo }: { tipo: TipoProducao }) {
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300 ring-1 ring-white/10">{ROTULO[tipo]}</span>;
}

/** Miniatura de uma produção: resultado final, senão a imagem aprovada/mais recente de uma cena. */
export function miniaturaDa(p: Producao): string | null {
  if (p.resultado?.miniatura_url) return p.resultado.miniatura_url;
  for (const c of Object.values(p.cenas ?? {})) {
    const v = c.versoes?.find((x) => x.versao === c.escolhida) ?? c.versoes?.at(-1);
    if (v) return v.url;
  }
  return null;
}

/** Quem pode usar o Studio (decidido no banco: anunciante com cadastro de cliente, owner ou ADM). */
export function useEscopoStudio() {
  return useQuery({
    queryKey: ['studio-escopo'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (f: string) => Promise<{ data: Array<{ pode: boolean; admin: boolean }> | null; error: { message: string } | null }> }).rpc('studio_escopo');
      if (error) return { pronto: false as const, motivo: error.message };
      const e = data?.[0];
      return { pronto: true as const, pode: !!e?.pode, admin: !!e?.admin };
    },
    staleTime: 60_000,
  });
}

export function StudioSemAcesso({ motivo }: { motivo: 'perfil' | 'ativacao' }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-400" />
      {motivo === 'perfil' ? (
        <>
          <h2 className="text-lg font-bold text-white">Studio restrito</h2>
          <p className="mt-2 text-sm text-slate-400">O Studio de IA está disponível para anunciantes e para o proprietário/administradores.</p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold text-white">Studio em ativação</h2>
          <p className="mt-2 text-sm text-slate-400">A estrutura do Studio ainda não foi publicada neste ambiente. Assim que for ativada, esta página passa a funcionar sozinha.</p>
        </>
      )}
    </div>
  );
}
