import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { centralUnreadKey } from '@/hooks/useCentral';
import {
  ROTULO_STATUS, rotuloCategoria, suporteService, type ChamadoSuporte,
} from '@/services/suporte.service';

/** Conversa de um chamado de suporte (F-102). Atendente vê "Marcar como resolvido". */
export function ChatSuporte({ chamado, atendente, onResolvido }: {
  chamado: ChamadoSuporte;
  atendente: boolean;
  onResolvido?: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const fimRef = useRef<HTMLDivElement>(null);
  const encerrado = chamado.status === 'RESOLVIDO';

  const msgs = useQuery({
    queryKey: ['suporte-mensagens', chamado.id],
    queryFn: () => suporteService.mensagens(chamado.id),
    refetchInterval: encerrado ? false : 15_000,
  });

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.data?.length]);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['suporte-mensagens', chamado.id] });
    qc.invalidateQueries({ queryKey: ['suporte-chamados'] });
    qc.invalidateQueries({ queryKey: centralUnreadKey });
  };

  const enviar = useMutation({
    mutationFn: () => suporteService.enviar(chamado.id, texto),
    onSuccess: () => { setTexto(''); atualizar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolver = useMutation({
    mutationFn: () => suporteService.resolver(chamado.id),
    onSuccess: () => { toast.success('Suporte encerrado como resolvido.'); atualizar(); onResolvido?.(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-[420px] flex-col rounded-2xl border border-border/60 bg-card/80" data-testid="chat-suporte">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{chamado.assunto}</p>
          <p className="text-xs text-muted-foreground">
            {rotuloCategoria(chamado.categoria)} · aberto em {format(new Date(chamado.created_at), 'dd/MM/yyyy HH:mm')}
            {chamado.solicitante?.nome ? ` · ${chamado.solicitante.nome}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            encerrado ? 'border-emerald-500/40 text-emerald-400' : chamado.status === 'EM_ATENDIMENTO' ? 'border-sky-500/40 text-sky-400' : 'border-amber-500/40 text-amber-400')}>
            {ROTULO_STATUS[chamado.status]}
          </Badge>
          {atendente && !encerrado && (
            <Button size="sm" variant="outline" onClick={() => resolver.mutate()} disabled={resolver.isPending}
              className="gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
              {resolver.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Marcar como resolvido
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[55vh]">
        {msgs.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
        {msgs.data?.map((m) => {
          const doSuporte = m.do_atendente;
          const minha = atendente ? doSuporte : !doSuporte;
          return (
            <div key={m.id} className={cn('flex', minha ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                minha ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm')}>
                <p className="mb-0.5 text-[11px] font-semibold opacity-80">{doSuporte ? 'Suporte SOBRE MÍDIA' : (atendente ? (chamado.solicitante?.nome || 'Cliente') : 'Você')}</p>
                <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>
                <p className="mt-1 text-right text-[10px] opacity-70">{format(new Date(m.created_at), 'dd/MM HH:mm')}</p>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {encerrado ? (
        <p className="border-t border-border/50 p-4 text-center text-sm text-muted-foreground">
          Este suporte foi encerrado como resolvido{atendente ? '.' : '. Se precisar, abra um novo suporte.'}
        </p>
      ) : (
        <form className="flex items-end gap-2 border-t border-border/50 p-3"
          onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviar.mutate(); }}>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva sua mensagem…"
            rows={2} maxLength={4000} className="min-h-[44px] resize-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviar.mutate(); } }} />
          <Button type="submit" size="icon" disabled={!texto.trim() || enviar.isPending} aria-label="Enviar">
            {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
