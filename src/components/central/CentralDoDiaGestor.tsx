import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Image as ImageIcon, ListVideo, Loader2, Monitor, PlayCircle } from 'lucide-react';
import { useCentralUnread } from '@/hooks/useCentral';
import { AlertStrip } from '@/components/central/AlertStrip';
import { EmptyLine, MiniStat, SummaryCard, SummaryRow } from '@/components/central/SummaryCard';
import { diaMes, SemPermissaoError, tempoDesde } from '@/lib/dashboardResumo';
import { formatDurationMs } from '@/lib/mediaDuration';
import { fetchResumoGestor, montarAlertasGestor, type ResumoGestor } from '@/lib/dashboardResumoGestor';

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

/** "Central do Dia" do Gestor de Mídias: alertas das telas + resumos reais; cada card leva à tela completa. */
export function CentralDoDiaGestor() {
  const { total: naoLidas } = useCentralUnread();
  const q = useQuery({
    queryKey: ['central-dia-gestor'],
    queryFn: fetchResumoGestor,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  const r = q.data;
  const alertas = useMemo(() => (r ? montarAlertasGestor(r, naoLidas) : []), [r, naoLidas]);
  if (q.error instanceof SemPermissaoError) return null;

  return (
    <section className="w-full min-w-0 space-y-4" data-testid="central-do-dia-gestor" aria-label="Seu dia">
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : q.isError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          Não foi possível carregar o resumo. <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar de novo</button>
        </div>
      ) : (
        <AlertStrip alertas={alertas} />
      )}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
        <TelasCard r={r} loading={q.isLoading} />
        <ExibicoesCard r={r} loading={q.isLoading} />
        <PlaylistsCard r={r} loading={q.isLoading} />
        <MidiasCard r={r} loading={q.isLoading} />
      </div>
    </section>
  );
}

type P = { r: ResumoGestor | undefined; loading: boolean };

function TelasCard({ r, loading }: P) {
  const t = r?.telas;
  const linha = (s: ResumoGestor['telas']['offline_itens'][number]) => (
    <SummaryRow key={s.id} to={`/dashboard/screens/${s.id}`} label={s.nome} sub={s.local || undefined} value={`sinal ${tempoDesde(s.ultimo_sinal)}`} tone="critico" />
  );
  return (
    <SummaryCard title="Minhas telas" icon={Monitor} to="/dashboard/screens" loading={loading} testId="gestor-card-telas"
      headline={t ? <>{t.online}<span className="text-lg font-semibold text-muted-foreground"> / {t.total} online</span></> : undefined}
      expanded={t && (t.offline_itens.length > 3 || t.sem_playlist_itens.length) ? (
        <div className="space-y-3">
          {t.offline_itens.length > 3 && <ul>{t.offline_itens.slice(3).map(linha)}</ul>}
          {t.sem_playlist_itens.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-400">Telas sem playlist</p>
              <ul>{t.sem_playlist_itens.map((s) => <SummaryRow key={s.id} to={`/dashboard/screens/${s.id}`} label={s.nome} value="Definir" tone="atencao" />)}</ul>
            </div>
          )}
        </div>
      ) : undefined}>
      {t && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Online" value={t.online} tone="ok" />
            <MiniStat label="Offline" value={t.offline} tone={t.offline ? 'critico' : 'ok'} />
            <MiniStat label="Sem playlist" value={t.sem_playlist} tone={t.sem_playlist ? 'atencao' : 'ok'} />
          </div>
          {t.offline_itens.length ? <ul>{t.offline_itens.slice(0, 3).map(linha)}</ul> : <EmptyLine>Todas as suas telas estão online.</EmptyLine>}
        </div>
      )}
    </SummaryCard>
  );
}

function ExibicoesCard({ r, loading }: P) {
  const e = r?.exibicoes;
  const dados = (e?.serie_7d || []).map((p) => ({ name: diaMes(p.dia), value: p.total }));
  return (
    <SummaryCard title="Exibições nas minhas telas" icon={PlayCircle} to="/dashboard/analytics" loading={loading} testId="gestor-card-exibicoes"
      headline={e ? e.hoje.toLocaleString('pt-BR') : undefined} caption={e ? `mídias exibidas hoje · ${e.semana.toLocaleString('pt-BR')} em 7 dias` : undefined}>
      {e && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Exibições por dia — 7 dias</p>
          <div className="h-28 w-full" aria-label="Gráfico de exibições por dia na última semana">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={4}>
                <CartesianGrid vertical={false} strokeOpacity={0.08} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis hide />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Exibições']} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </SummaryCard>
  );
}

function PlaylistsCard({ r, loading }: P) {
  const p = r?.playlists;
  const linha = (x: ResumoGestor['playlists']['recentes'][number]) => (
    <SummaryRow key={x.id} to="/dashboard/playlists" label={x.nome} sub={`${x.itens} ${x.itens === 1 ? 'item' : 'itens'} · alterada ${tempoDesde(x.alterada_em)}`} />
  );
  return (
    <SummaryCard title="Playlists" icon={ListVideo} to="/dashboard/playlists" loading={loading} testId="gestor-card-playlists"
      headline={p ? p.total : undefined} caption={p ? `playlists · ${p.em_uso} em uso nas telas · ${p.itens_agendados} itens com agendamento` : undefined}
      expanded={p && p.recentes.length > 3 ? <ul>{p.recentes.slice(3).map(linha)}</ul> : undefined}>
      {p && (p.recentes.length ? <ul>{p.recentes.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma playlist criada ainda.</EmptyLine>)}
    </SummaryCard>
  );
}

function MidiasCard({ r, loading }: P) {
  const m = r?.midias;
  const linha = (x: ResumoGestor['midias']['recentes'][number]) => (
    <SummaryRow key={x.id} to="/dashboard/medias" label={x.nome}
      sub={`${x.tipo === 'video' ? 'vídeo' : x.tipo === 'image' ? 'imagem' : x.tipo} · enviada ${tempoDesde(x.enviada_em)}`}
      value={x.duration_ms ? formatDurationMs(x.duration_ms) : undefined} />
  );
  return (
    <SummaryCard title="Mídias" icon={ImageIcon} to="/dashboard/medias" loading={loading} testId="gestor-card-midias"
      headline={m ? m.total : undefined} caption={m ? `${m.videos} vídeos · ${m.imagens} imagens · ${m.semana} enviadas em 7 dias` : undefined}
      expanded={m && m.recentes.length > 3 ? <ul>{m.recentes.slice(3).map(linha)}</ul> : undefined}>
      {m && (m.recentes.length ? <ul>{m.recentes.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma mídia enviada ainda.</EmptyLine>)}
    </SummaryCard>
  );
}
