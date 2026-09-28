import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Headphones, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatSuporte } from '@/components/suporte/ChatSuporte';
import { ROTULO_STATUS, rotuloCategoria, suporteService } from '@/services/suporte.service';

/** Fila de suporte do OWNER/ADMIN (F-102): responde e encerra como resolvido. */
export function SuporteAtendimento() {
  const [filtro, setFiltro] = useState<'ABERTOS' | 'RESOLVIDOS'>('ABERTOS');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const fila = useQuery({
    queryKey: ['suporte-chamados', 'fila', filtro],
    queryFn: () => suporteService.filaAtendimento(filtro),
    refetchInterval: 20_000,
  });
  const selecionado = fila.data?.find((c) => c.id === selecionadoId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" data-testid="suporte-atendimento">
      <div className="rounded-2xl border border-border/60 bg-card/80 p-2">
        <div className="flex gap-1 p-1">
          {(['ABERTOS', 'RESOLVIDOS'] as const).map((f) => (
            <button key={f} type="button" onClick={() => { setFiltro(f); setSelecionadoId(null); }}
              className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium',
                filtro === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}>
              {f === 'ABERTOS' ? 'Em aberto' : 'Resolvidos'}
            </button>
          ))}
        </div>
        {fila.isLoading ? (
          <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />
        ) : fila.data?.length ? (
          <ul className="divide-y divide-border/40">
            {fila.data.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelecionadoId(c.id)}
                  className={cn('w-full rounded-lg px-2 py-3 text-left hover:bg-muted/40', selecionadoId === c.id && 'bg-muted/50')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{c.solicitante?.nome || 'Usuário'}</span>
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground">{format(new Date(c.ultima_mensagem_em), 'dd/MM HH:mm')}</span>
                  </span>
                  <span className="block truncate text-sm text-foreground/90">{c.assunto}</span>
                  <span className="block text-xs text-muted-foreground">
                    {rotuloCategoria(c.categoria)} · {c.perfil_origem === 'ANUNCIANTE' ? 'Anunciante' : c.perfil_origem === 'GESTOR' ? 'Gestor de Mídias' : c.perfil_origem} · {ROTULO_STATUS[c.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {filtro === 'ABERTOS' ? 'Nenhum suporte aguardando atendimento.' : 'Nenhum suporte resolvido ainda.'}
          </p>
        )}
      </div>

      {selecionado ? (
        <ChatSuporte key={selecionado.id} chamado={selecionado} atendente onResolvido={() => setSelecionadoId(null)} />
      ) : (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 p-6 text-center text-muted-foreground">
          <Headphones className="h-8 w-8" />
          <p className="text-sm">Escolha um atendimento para responder.</p>
        </div>
      )}
    </div>
  );
}
