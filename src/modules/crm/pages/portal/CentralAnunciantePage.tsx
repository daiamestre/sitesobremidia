import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bell, CheckCheck, Headphones, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { centralUnreadKey } from '@/hooks/useCentral';
import { Button } from '@/components/ui/button';
import { AlertStrip } from '@/components/central/AlertStrip';
import { fetchResumoAnunciante, montarAlertasAnunciante } from '@/components/central/CentralDoDiaAnunciante';
import { SuporteCliente } from '@/components/suporte/SuporteCliente';
import { centralService } from '@/services/central.service';
import { cn } from '@/lib/utils';

/**
 * Central do Anunciante (F-102): só AVISOS (faturas a pagar/atrasadas, ativação de
 * mídias, respostas do suporte) e SUPORTE com triagem. Sem chat livre e sem grupos.
 */
interface Aviso {
  id: string;
  titulo: string;
  mensagem: string | null;
  prioridade: string | null;
  status_notificacao: string;
  rota_destino: string | null;
  created_at: string;
}

export default function CentralAnunciantePage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [aba, setAba] = useState<'avisos' | 'suporte'>(params.get('aba') === 'suporte' ? 'suporte' : 'avisos');
  useEffect(() => { if (params.get('aba') === 'suporte') setAba('suporte'); }, [params]);

  const resumo = useQuery({ queryKey: ['central-dia-anunciante'], queryFn: fetchResumoAnunciante, retry: false });
  const avisos = useQuery({
    queryKey: ['avisos-anunciante', usuario?.id],
    enabled: !!usuario?.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Aviso[]> => {
      const { data, error } = await supabase
        .from('notificacoes_central')
        .select('id, titulo, mensagem, prioridade, status_notificacao, rota_destino, created_at')
        .eq('usuario_id', usuario!.id)
        .eq('canal', 'IN_APP')
        .is('dispensada_em', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
  });

  const marcar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.rpc('central_notificacoes_marcar_lidas' as never, { p_ids: ids } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos-anunciante'] });
      qc.invalidateQueries({ queryKey: centralUnreadKey });
    },
  });

  // F-167: "excluir" = o aviso conta como lido e some da tela (continua gravado)
  const dispensar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!(await centralService.dispensarNotificacoes(ids))) throw new Error('falha');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos-anunciante'] });
      qc.invalidateQueries({ queryKey: centralUnreadKey });
    },
  });

  const naoLidos = (avisos.data ?? []).filter((a) => a.status_notificacao === 'NAO_LIDA');

  // F-106: aviso exibido na tela = aviso visto. Sai do contador e o OWNER/ADMIN vê quando foi visto (lida_em).
  // A bolinha de "novo" continua nesta visita para o cliente saber o que chegou.
  const [novosNestaVisita, setNovosNestaVisita] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (aba !== 'avisos' || naoLidos.length === 0 || marcar.isPending) return;
    const ids = naoLidos.map((a) => a.id);
    setNovosNestaVisita((prev) => new Set([...prev, ...ids]));
    const t = setTimeout(() => marcar.mutate(ids), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, naoLidos.map((a) => a.id).join(',')]);
  const [verLidos, setVerLidos] = useState(false);
  const recebidosAgora = (a: Aviso) => a.status_notificacao === 'NAO_LIDA' || novosNestaVisita.has(a.id);
  const listados = (avisos.data ?? []).filter((a) => verLidos || recebidosAgora(a));
  const lidosEscondidos = (avisos.data ?? []).length - listados.length;
  const alertasFatura = resumo.data ? montarAlertasAnunciante(resumo.data, 0).filter((a) => a.id !== 'tudo-ok') : [];

  const abrirAviso = (a: Aviso) => {
    if (a.status_notificacao === 'NAO_LIDA') marcar.mutate([a.id]);
    if (a.rota_destino === '/portal/central') { setAba('suporte'); return; }
    if (a.rota_destino?.startsWith('/portal')) navigate(a.rota_destino);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central</h1>
        <p className="text-sm text-muted-foreground">Avisos da sua conta e atendimento do suporte.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border/60 bg-card/60 p-1" role="tablist">
        {([['avisos', 'Avisos', Bell], ['suporte', 'Suporte', Headphones]] as const).map(([v, rotulo, Icone]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
              aba === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40')}>
            <Icone className="h-4 w-4" /> {rotulo}
            {v === 'avisos' && naoLidos.length > 0 && (
              <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{naoLidos.length}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'suporte' ? <SuporteCliente /> : (
        <div className="space-y-4" data-testid="avisos-anunciante">
          {alertasFatura.length > 0 && <AlertStrip alertas={alertasFatura} />}

          <div className="rounded-2xl border border-border/60 bg-card/80 p-2">
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avisos</p>
              {naoLidos.length > 0 && (
                <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => marcar.mutate(naoLidos.map((a) => a.id))}>
                  <CheckCheck className="h-4 w-4" /> Marcar todos como lidos
                </Button>
              )}
            </div>
            {avisos.isLoading ? (
              <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />
            ) : listados.length ? (
              <ul className="divide-y divide-border/40">
                {listados.map((a) => (
                  <li key={a.id} className="flex items-start" data-testid="aviso-anunciante">
                    <button type="button" onClick={() => abrirAviso(a)}
                      className="flex w-full min-w-0 items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/40">
                      <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                        (a.status_notificacao === 'NAO_LIDA' || novosNestaVisita.has(a.id)) ? 'bg-primary' : 'bg-transparent')} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', (a.status_notificacao === 'NAO_LIDA' || novosNestaVisita.has(a.id)) ? 'font-semibold text-foreground' : 'text-foreground/80')}>{a.titulo}</span>
                        {a.mensagem && <span className="block text-xs text-muted-foreground line-clamp-2">{a.mensagem}</span>}
                      </span>
                      <span className="flex-shrink-0 text-[11px] text-muted-foreground">{format(new Date(a.created_at), 'dd/MM HH:mm')}</span>
                    </button>
                    <button type="button" data-testid="dispensar-aviso" aria-label="Excluir aviso (já li)" title="Excluir aviso (já li)"
                      onClick={() => dispensar.mutate([a.id])}
                      className="mt-2.5 flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nenhum aviso novo por aqui. Faturas e ativações de mídia aparecem nesta tela.
              </p>
            )}
            {!verLidos && lidosEscondidos > 0 && (
              <button type="button" data-testid="ver-avisos-lidos" onClick={() => setVerLidos(true)}
                className="w-full px-3 py-2 text-center text-xs text-primary hover:underline">
                Ver {lidosEscondidos} {lidosEscondidos === 1 ? 'aviso já lido' : 'avisos já lidos'}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Precisa falar com a gente? <button type="button" className="text-primary hover:underline" onClick={() => setAba('suporte')}>Abra um suporte</button>
            {' '}· Faturas em <Link to="/portal/financeiro" className="text-primary hover:underline">Contratos e Faturas</Link>
          </p>
        </div>
      )}
    </div>
  );
}
