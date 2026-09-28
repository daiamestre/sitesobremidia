import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * F-106 — Para o OWNER/ADMIN: avisos enviados aos clientes (faturas, mídia pausada/reativada,
 * respostas do suporte) e se o cliente já viu, com data e hora.
 */
interface AvisoCliente {
  id: string;
  titulo: string;
  mensagem: string | null;
  created_at: string;
  lida_em: string | null;
  status_notificacao: string;
  usuario: { nome: string | null; email: string | null } | null;
}

export function AvisosVistosClientes() {
  const q = useQuery({
    queryKey: ['avisos-vistos-clientes'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<AvisoCliente[]> => {
      const { data, error } = await supabase
        .from('notificacoes_central')
        .select('id, titulo, mensagem, created_at, lida_em, status_notificacao, tipo_evento, usuario:usuarios!notificacoes_central_usuario_id_fkey(nome, email, cliente_id)')
        .not('usuario_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as (AvisoCliente & { usuario: { cliente_id?: string } | null })[])
        .filter((a) => a.usuario?.cliente_id).slice(0, 60);
    },
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-2" data-testid="avisos-vistos-clientes">
      <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Avisos enviados aos clientes — quem já viu
      </p>
      {q.isLoading ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
      ) : q.isError ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Não foi possível carregar os avisos.</p>
      ) : q.data?.length ? (
        <ul className="divide-y divide-border/40">
          {q.data.map((a) => {
            const visto = a.status_notificacao !== 'NAO_LIDA';
            return (
              <li key={a.id} className="flex items-start justify-between gap-3 px-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{a.usuario?.nome || a.usuario?.email || 'Cliente'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.titulo}{a.mensagem ? ` — ${a.mensagem}` : ''}</span>
                  <span className="block text-[11px] text-muted-foreground">enviado {format(new Date(a.created_at), 'dd/MM HH:mm')}</span>
                </span>
                <span className={cn('flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  visto ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>
                  {visto ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {visto ? `Visto ${a.lida_em ? format(new Date(a.lida_em), 'dd/MM HH:mm') : ''}` : 'Ainda não viu'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum aviso enviado aos clientes ainda.</p>
      )}
    </div>
  );
}
