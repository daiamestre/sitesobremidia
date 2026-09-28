import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Headphones, Loader2, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { centralUnreadKey } from '@/hooks/useCentral';
import { ChatSuporte } from '@/components/suporte/ChatSuporte';
import {
  CATEGORIAS_SUPORTE, ROTULO_STATUS, rotuloCategoria, suporteService, type CategoriaSuporte,
} from '@/services/suporte.service';

/**
 * Lado de quem pede ajuda (Anunciante, Gestor de Mídias…) — F-102.
 * Só existe "Falar com o suporte": triagem obrigatória (motivo + assunto + mensagem).
 * Um suporte aberto por vez; depois de resolvido, abre-se outro.
 */
export function SuporteCliente() {
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [abrindo, setAbrindo] = useState(false);
  const [vendoId, setVendoId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaSuporte | null>(null);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');

  const chamados = useQuery({
    queryKey: ['suporte-chamados', 'meus', usuario?.id],
    queryFn: () => suporteService.meusChamados(usuario!.id),
    enabled: !!usuario?.id,
    refetchInterval: 30_000,
  });

  const aberto = chamados.data?.find((c) => c.status !== 'RESOLVIDO') ?? null;
  const vendo = chamados.data?.find((c) => c.id === vendoId) ?? null;

  const abrir = useMutation({
    mutationFn: () => suporteService.abrir(categoria!, assunto, mensagem),
    onSuccess: (r) => {
      toast.success(r.status === 'JA_ABERTO' ? 'Você já tem um suporte aberto.' : 'Mensagem enviada ao suporte.');
      setAbrindo(false); setCategoria(null); setAssunto(''); setMensagem('');
      setVendoId(r.chamado_id);
      qc.invalidateQueries({ queryKey: ['suporte-chamados'] });
      qc.invalidateQueries({ queryKey: centralUnreadKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (chamados.isLoading) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" />;

  if (vendo) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setVendoId(null)} className="gap-1"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        <ChatSuporte chamado={vendo} atendente={false} />
      </div>
    );
  }

  if (abrindo) {
    const pronto = !!categoria && assunto.trim().length >= 3 && mensagem.trim().length > 0;
    return (
      <form className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-4 sm:p-6" data-testid="form-suporte"
        onSubmit={(e) => { e.preventDefault(); if (pronto) abrir.mutate(); }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-foreground">Falar com o suporte</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbrindo(false)}>Cancelar</Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">1. Qual é o motivo do contato?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIAS_SUPORTE.map((c) => (
              <button key={c.valor} type="button" onClick={() => setCategoria(c.valor)} aria-pressed={categoria === c.valor}
                className={cn('rounded-xl border p-3 text-left transition-colors',
                  categoria === c.valor ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/40')}>
                <span className="block text-sm font-semibold text-foreground">{c.rotulo}</span>
                <span className="block text-xs text-muted-foreground">{c.descricao}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="sup-assunto" className="text-sm font-medium text-foreground">2. Resuma o problema</label>
          <Input id="sup-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={140}
            placeholder="Ex.: minha mídia não entrou no ar" />
        </div>
        <div className="space-y-2">
          <label htmlFor="sup-msg" className="text-sm font-medium text-foreground">3. Explique com detalhes</label>
          <Textarea id="sup-msg" value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} maxLength={4000}
            placeholder="Conte o que aconteceu. O dono e a administração da SOBRE MÍDIA recebem sua mensagem." />
        </div>
        <Button type="submit" disabled={!pronto || abrir.isPending} className="w-full gap-2 sm:w-auto">
          {abrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          Enviar ao suporte
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4" data-testid="suporte-cliente">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Headphones className="h-5 w-5" /></span>
          <div>
            <p className="font-semibold text-foreground">Suporte SOBRE MÍDIA</p>
            <p className="text-sm text-muted-foreground">
              {aberto ? 'Você tem um atendimento em andamento.' : 'Precisa de ajuda? Escolha o motivo e fale com o suporte.'}
            </p>
          </div>
        </div>
        {aberto ? (
          <Button onClick={() => setVendoId(aberto.id)} className="gap-2">Continuar atendimento</Button>
        ) : (
          <Button onClick={() => setAbrindo(true)} className="gap-2"><MessageSquarePlus className="h-4 w-4" /> Falar com o suporte</Button>
        )}
      </div>

      {!!chamados.data?.length && (
        <div className="rounded-2xl border border-border/60 bg-card/80 p-2">
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seus atendimentos</p>
          <ul className="divide-y divide-border/40">
            {chamados.data.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setVendoId(c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{c.assunto}</span>
                    <span className="block text-xs text-muted-foreground">{rotuloCategoria(c.categoria)} · {format(new Date(c.created_at), 'dd/MM/yyyy')}</span>
                  </span>
                  <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    c.status === 'RESOLVIDO' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400')}>
                    {ROTULO_STATUS[c.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
