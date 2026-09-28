import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListVideo, Loader2, MapPin, Megaphone, Monitor, Plus, Save, Search, Store, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FilaAnaliseMidias } from '@/components/suporte/FilaAnaliseMidias';

/**
 * F-109 — Telas de pontos parceiros (só OWNER/ADMIN).
 * Criadas sozinhas quando o representante/OWNER/ADMIN/gestor termina o cadastro do ponto.
 * Aqui a equipe monta a grade, muda o valor e acompanha pareamento/online.
 * Anunciantes e gestores só consomem (o banco bloqueia alterações deles).
 */
interface TelaParceira {
  id: string;
  name: string;
  local_instalacao: string | null;
  foto_local_url: string | null;
  orientation: string | null;
  tamanho_polegadas: number | null;
  valor_anuncio: number | null;
  status_grade: 'AGUARDANDO_GRADE' | 'PRONTA' | null;
  playlist_id: string | null;
  bound_device_id: string | null;
  last_ping_at: string | null;
  is_active: boolean;
  criada_por_gestor: boolean;
  cadastrada_por_papel: string | null;
  ponto_id: string;
  ponto: { id: string; nome: string; bairro: string | null; cidade: string | null; foto_url: string | null } | null;
  cadastrador: { nome: string | null } | null;
  playlist: { name: string } | null;
}

const online = (t: TelaParceira) => !!t.last_ping_at && Date.now() - new Date(t.last_ping_at).getTime() < 5 * 60_000;

export default function TelasParceiras() {
  const { perfilNome, isOwner, loading } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'TODAS' | 'AGUARDANDO_GRADE' | 'PRONTA'>('TODAS');
  const [valores, setValores] = useState<Record<string, string>>({});
  const permitido = isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN';

  const telas = useQuery({
    queryKey: ['telas-parceiras'],
    enabled: permitido,
    queryFn: async (): Promise<TelaParceira[]> => {
      const { data, error } = await supabase
        .from('screens')
        .select(`id, name, local_instalacao, foto_local_url, orientation, tamanho_polegadas, valor_anuncio, status_grade, playlist_id,
                 bound_device_id, last_ping_at, is_active, criada_por_gestor, cadastrada_por_papel, ponto_id,
                 ponto:pontos(id, nome, bairro, cidade, foto_url),
                 cadastrador:usuarios!screens_cadastrada_por_fkey(nome),
                 playlist:playlists(name)` as never)
        .eq('tipo_tela' as never, 'PARCEIRA' as never)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as TelaParceira[];
    },
  });

  const anuncios = useQuery({
    queryKey: ['anuncios-por-ponto'],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.from('ponto_anuncios' as never).select('ponto_id').eq('status', 'ATIVO');
      if (error) throw error;
      const cont: Record<string, number> = {};
      for (const a of (data ?? []) as { ponto_id: string }[]) cont[a.ponto_id] = (cont[a.ponto_id] ?? 0) + 1;
      return cont;
    },
  });

  const salvarValor = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: number }) => {
      const { error } = await supabase.rpc('fn_atualizar_valor_tela' as never, { p_tela: id, p_valor: valor } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      toast.success('Valor atualizado. O anunciante já vê o novo valor.');
      setValores((x) => { const n = { ...x }; delete n[v.id]; return n; });
      qc.invalidateQueries({ queryKey: ['telas-parceiras'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = (telas.data ?? []).filter((t) =>
      (filtro === 'TODAS' || t.status_grade === filtro) &&
      (!termo || `${t.name} ${t.ponto?.nome ?? ''} ${t.ponto?.bairro ?? ''}`.toLowerCase().includes(termo)));
    const mapa = new Map<string, { ponto: TelaParceira['ponto']; telas: TelaParceira[] }>();
    for (const t of lista) {
      const g = mapa.get(t.ponto_id) ?? { ponto: t.ponto, telas: [] };
      g.telas.push(t);
      mapa.set(t.ponto_id, g);
    }
    return [...mapa.entries()];
  }, [telas.data, busca, filtro]);

  if (loading) return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-muted-foreground" />;
  if (!permitido) return <Navigate to="/dashboard/screens" replace />;

  const total = telas.data?.length ?? 0;
  const aguardando = (telas.data ?? []).filter((t) => t.status_grade !== 'PRONTA').length;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="telas-parceiras">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-display font-bold"><Store className="h-7 w-7 text-primary" /> Telas de pontos parceiros</h1>
          <p className="text-muted-foreground">Criadas pelo cadastro do ponto parceiro. Monte a grade, ajuste o valor e acompanhe cada tela.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/screens"><Button variant="outline"><Monitor className="mr-2 h-4 w-4" /> Telas próprias</Button></Link>
          <Link to="/dashboard/prospeccao/ponto-parceiro"><Button className="gradient-primary"><Plus className="mr-2 h-4 w-4" /> Cadastrar ponto parceiro</Button></Link>
        </div>
      </div>

      {/* F-110: mídias de anunciantes aguardando análise */}
      <FilaAnaliseMidias />

      <div className="grid grid-cols-3 gap-3">
        <Resumo rotulo="Telas parceiras" valor={total} />
        <Resumo rotulo="Aguardando grade" valor={aguardando} destaque={aguardando > 0} />
        <Resumo rotulo="Pontos parceiros" valor={new Set((telas.data ?? []).map((t) => t.ponto_id)).size} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por ponto, tela ou bairro" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {([['TODAS', 'Todas'], ['AGUARDANDO_GRADE', 'Aguardando grade'], ['PRONTA', 'Com grade']] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className={cn('rounded-md px-3 py-1.5 text-sm', filtro === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50')}>{r}</button>
          ))}
        </div>
      </div>

      {telas.isLoading ? (
        <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-muted-foreground" />
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border py-12 text-center text-muted-foreground">Nenhuma tela de ponto parceiro {busca || filtro !== 'TODAS' ? 'com esse filtro' : 'ainda — cadastre um ponto parceiro'}.</p>
      ) : grupos.map(([pontoId, g]) => (
        <section key={pontoId} className="overflow-hidden rounded-2xl border bg-card/80">
          <header className="flex items-center gap-3 border-b p-4">
            {g.ponto?.foto_url ? <img src={g.ponto.foto_url} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <Store className="h-8 w-8 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{g.ponto?.nome ?? 'Ponto parceiro'}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {[g.ponto?.bairro, g.ponto?.cidade].filter(Boolean).join(', ')}</p>
            </div>
            <Badge variant="outline" className="gap-1"><Megaphone className="h-3 w-3" /> {anuncios.data?.[pontoId] ?? 0} anúncios ativos</Badge>
          </header>
          <ul className="divide-y">
            {g.telas.map((t) => {
              const editando = valores[t.id] !== undefined;
              return (
                <li key={t.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center" data-testid="tela-parceira">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {t.foto_local_url ? <img src={t.foto_local_url} alt="" className="h-14 w-20 flex-shrink-0 rounded-lg object-cover" />
                      : <span className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-muted"><Monitor className="h-5 w-5 text-muted-foreground" /></span>}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.local_instalacao || t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.orientation === 'portrait' ? 'Em pé' : 'Deitada'}{t.tamanho_polegadas ? ` · ${t.tamanho_polegadas}"` : ''}
                        {t.playlist?.name ? ` · grade: ${t.playlist.name}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.status_grade === 'PRONTA'
                          ? <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-500" variant="outline"><CheckCircle2 className="h-3 w-3" /> Grade pronta</Badge>
                          : <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-500" variant="outline"><Clock className="h-3 w-3" /> Aguardando grade</Badge>}
                        {!t.bound_device_id ? <Badge variant="outline" className="text-muted-foreground">Aguardando instalação</Badge>
                          : online(t) ? <Badge variant="outline" className="gap-1 text-emerald-500"><Wifi className="h-3 w-3" /> Online</Badge>
                          : <Badge variant="outline" className="gap-1 text-muted-foreground"><WifiOff className="h-3 w-3" /> Offline</Badge>}
                        {t.criada_por_gestor && (
                          <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-500" data-testid="marca-gestor">
                            Criada pelo gestor {t.cadastrador?.nome ?? ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input className="h-9 w-24" inputMode="decimal"
                        value={editando ? valores[t.id] : (t.valor_anuncio != null ? Number(t.valor_anuncio).toFixed(2).replace('.', ',') : '')}
                        onChange={(e) => setValores((x) => ({ ...x, [t.id]: e.target.value.replace(/[^0-9.,]/g, '') }))} aria-label="Valor para anunciar por mês" />
                      <span className="text-xs text-muted-foreground">/mês</span>
                      {editando && (
                        <Button size="sm" variant="outline" disabled={salvarValor.isPending}
                          onClick={() => salvarValor.mutate({ id: t.id, valor: Number(valores[t.id].replace(/\./g, '').replace(',', '.')) })}>
                          <Save className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Link to={`/dashboard/screens/${t.id}`}>
                      <Button size="sm" className={cn(t.status_grade === 'PRONTA' ? '' : 'gradient-primary')} variant={t.status_grade === 'PRONTA' ? 'outline' : 'default'}>
                        <ListVideo className="mr-1 h-4 w-4" /> {t.status_grade === 'PRONTA' ? 'Ver grade' : 'Montar grade'}
                      </Button>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3', destaque && 'border-amber-500/40 bg-amber-500/5')}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  );
}
