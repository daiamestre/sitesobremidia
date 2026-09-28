import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Loader2, ShieldQuestion, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * F-110 — Mídias de anunciantes aguardando análise (OWNER/ADMIN).
 * Aparecem aqui quando o robô não tem chave de IA, fica em dúvida ou falha.
 * Aprovar → a cobrança do anúncio é gerada; recusar → o cliente recebe o motivo.
 */
interface RelatorioAnalise {
  achados?: { gravidade: 'recusar' | 'revisar'; detalhe: string }[];
  fala?: string | null; textos_imagem?: string[]; erros?: string[]; analisando_desde?: string;
}
interface MidiaEmAnalise {
  id: string; nome: string; tipo: 'imagem' | 'video'; url: string; quadros: string[] | null; duracao: number | null;
  status: string; motivo: string | null; enviada_em: string; cliente: string | null; detalhes: RelatorioAnalise | null;
}

/** F-111: o que o analisador próprio viu, ouviu e leu — para a equipe decidir rápido. */
function Relatorio({ d }: { d: RelatorioAnalise | null }) {
  if (!d) return <p className="text-xs text-muted-foreground">Na fila do analisador automático.</p>;
  if (d.analisando_desde && !d.achados) return <p className="text-xs text-muted-foreground">Sendo analisada agora…</p>;
  return (
    <div className="space-y-1 rounded-lg bg-muted/40 p-2 text-xs" data-testid="relatorio-analise">
      {d.achados?.map((a, i) => (
        <p key={i} className={a.gravidade === 'recusar' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}>• {a.detalhe}</p>
      ))}
      {!!d.fala && <p className="text-muted-foreground"><span className="font-medium">Fala:</span> “{d.fala}”</p>}
      {!!d.textos_imagem?.length && <p className="text-muted-foreground"><span className="font-medium">Texto na imagem:</span> {d.textos_imagem.join(' · ').slice(0, 240)}</p>}
    </div>
  );
}

export function FilaAnaliseMidias() {
  const qc = useQueryClient();
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const fila = useQuery({
    queryKey: ['midias-em-analise'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<MidiaEmAnalise[]> => {
      const { data, error } = await supabase.rpc('fn_midias_em_analise' as never);
      if (error) throw error;
      return (data ?? []) as unknown as MidiaEmAnalise[];
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ id, aprovar, motivo }: { id: string; aprovar: boolean; motivo?: string }) => {
      const { error } = await supabase.rpc('fn_moderar_midia' as never, { p_asset: id, p_aprovar: aprovar, p_motivo: motivo ?? null } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      toast.success(v.aprovar ? 'Mídia aprovada. O cliente já pode pagar e ir ao ar.' : 'Mídia recusada. O cliente recebeu o motivo.');
      setRecusando(null); setMotivo('');
      qc.invalidateQueries({ queryKey: ['midias-em-analise'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fila.isLoading || !fila.data?.length) return null;

  return (
    <section className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-4" data-testid="fila-analise-midias">
      <p className="mb-3 flex items-center gap-2 font-semibold"><ShieldQuestion className="h-5 w-5 text-sky-500" /> Mídias aguardando análise ({fila.data.length})</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fila.data.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-xl border bg-card">
            {m.tipo === 'imagem'
              ? <img src={m.url} alt={m.nome} className="aspect-video w-full object-cover" />
              : <video src={m.url} controls muted preload="metadata" className="aspect-video w-full bg-black" />}
            <div className="space-y-2 p-3">
              <div>
                <p className="truncate text-sm font-medium">{m.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {m.cliente ?? 'Cliente'} · {format(new Date(m.enviada_em), 'dd/MM HH:mm')}{m.duracao ? ` · ${m.duracao}s` : ''}
                </p>
                {m.motivo && <p className="text-xs text-sky-600 dark:text-sky-300">{m.motivo}</p>}
              </div>
              <Relatorio d={m.detalhes} />
              {recusando === m.id ? (
                <div className="space-y-2">
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa (o cliente vai ler)" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={decidir.isPending || motivo.trim().length < 3}
                      onClick={() => decidir.mutate({ id: m.id, aprovar: false, motivo })}>Confirmar recusa</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRecusando(null); setMotivo(''); }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 gap-1" disabled={decidir.isPending} onClick={() => decidir.mutate({ id: m.id, aprovar: true })}>
                    {decidir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setRecusando(m.id)}><X className="h-4 w-4" /> Recusar</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
