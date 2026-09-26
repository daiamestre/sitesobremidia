import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LayoutGrid, Library, ListVideo, Loader2, Monitor, PlayCircle, Sparkles } from 'lucide-react';
import { useCentralUnread } from '@/hooks/useCentral';
import { AlertStrip } from '@/components/central/AlertStrip';
import { EmptyLine, MiniStat, SummaryCard, SummaryRow } from '@/components/central/SummaryCard';
import { diaMes, SemPermissaoError, tempoDesde } from '@/lib/dashboardResumo';
import { fetchResumoMidiasOwner, montarAlertasMidias, versaoAnterior, VERSAO_PLAYER_ATUAL, type ResumoMidiasOwner } from '@/lib/dashboardResumoMidias';
import { TIPO_LABEL, type WidgetTypeId } from '@/lib/widgetCatalog';

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

/**
 * Dashboard do Gestor de Mídias para OWNER/ADM: a operação de mídia da EMPRESA (telas, Player, exibições, playlists,
 * mídias, Biblioteca, widgets e Conteúdo automático). Mesma linguagem visual dos dashboards dos outros perfis;
 * cada cartão leva à tela completa. Dados reais do banco (fn_dashboard_resumo_midias_owner).
 */
export function CentralDoDiaMidiasOwner() {
  const { total: naoLidas } = useCentralUnread();
  const q = useQuery({
    queryKey: ['central-dia-midias-owner'],
    queryFn: fetchResumoMidiasOwner,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  const r = q.data;
  const alertas = useMemo(() => (r ? montarAlertasMidias(r, naoLidas) : []), [r, naoLidas]);
  if (q.error instanceof SemPermissaoError) return null;

  return (
    <section className="w-full min-w-0 space-y-4" data-testid="central-do-dia-midias-owner" aria-label="Operação de mídia da empresa">
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
        <PlayerCard r={r} loading={q.isLoading} />
        <PlaylistsCard r={r} loading={q.isLoading} />
        <MidiasCard r={r} loading={q.isLoading} />
        <WidgetsCard r={r} loading={q.isLoading} />
        <ConteudoCard r={r} loading={q.isLoading} />
      </div>
    </section>
  );
}

type P = { r: ResumoMidiasOwner | undefined; loading: boolean };

function TelasCard({ r, loading }: P) {
  const t = r?.telas;
  const linha = (s: ResumoMidiasOwner['telas']['offline_itens'][number]) => (
    <SummaryRow key={s.id} to={`/dashboard/screens/${s.id}`} label={s.nome} sub={s.local || undefined} value={`sinal ${tempoDesde(s.ultimo_sinal)}`} tone="critico" />
  );
  return (
    <SummaryCard title="Telas da empresa" icon={Monitor} to="/dashboard/screens" loading={loading} testId="owner-card-telas"
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
          {t.offline_itens.length ? <ul>{t.offline_itens.slice(0, 3).map(linha)}</ul> : <EmptyLine>Todas as telas da empresa estão online.</EmptyLine>}
        </div>
      )}
    </SummaryCard>
  );
}

function ExibicoesCard({ r, loading }: P) {
  const e = r?.exibicoes;
  const dados = (e?.serie_7d || []).map((p) => ({ name: diaMes(p.dia), value: p.total }));
  return (
    <SummaryCard title="Exibições nas telas da empresa" icon={PlayCircle} to="/dashboard/analytics" loading={loading} testId="owner-card-exibicoes"
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

function PlayerCard({ r, loading }: P) {
  const v = r?.telas.versoes ?? [];
  const antigos = v.filter((x) => versaoAnterior(x.versao)).reduce((s, x) => s + x.qtd, 0);
  const total = v.reduce((s, x) => s + x.qtd, 0);
  return (
    <SummaryCard title="Player nos aparelhos" icon={Monitor} to="/dashboard/screens" loading={loading} testId="owner-card-player"
      headline={r ? <>{total - antigos}<span className="text-lg font-semibold text-muted-foreground"> / {total} atualizados</span></> : undefined}
      caption={r ? `versão atual ${VERSAO_PLAYER_ATUAL} (Esportes e fundo no YouTube)` : undefined}>
      {r && (v.length
        ? <ul>{v.map((x) => <SummaryRow key={x.versao} to="/dashboard/screens" label={x.versao === 'desconhecida' ? 'Versão não informada' : x.versao}
            value={`${x.qtd} ${x.qtd === 1 ? 'aparelho' : 'aparelhos'}`} tone={versaoAnterior(x.versao) ? 'atencao' : undefined} />)}</ul>
        : <EmptyLine>Nenhum aparelho vinculado às telas.</EmptyLine>)}
    </SummaryCard>
  );
}

function PlaylistsCard({ r, loading }: P) {
  const p = r?.playlists;
  const linha = (x: ResumoMidiasOwner['playlists']['recentes'][number]) => (
    <SummaryRow key={x.id} to="/dashboard/playlists" label={x.nome} sub={`${x.itens} ${x.itens === 1 ? 'item' : 'itens'} · alterada ${tempoDesde(x.alterada_em)}`} />
  );
  return (
    <SummaryCard title="Playlists da empresa" icon={ListVideo} to="/dashboard/playlists" loading={loading} testId="owner-card-playlists"
      headline={p ? p.total : undefined} caption={p ? `playlists · ${p.em_uso} em uso nas telas` : undefined}
      expanded={p && p.recentes.length > 3 ? <ul>{p.recentes.slice(3).map(linha)}</ul> : undefined}>
      {p && (p.recentes.length ? <ul>{p.recentes.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma playlist criada ainda.</EmptyLine>)}
    </SummaryCard>
  );
}

function MidiasCard({ r, loading }: P) {
  const m = r?.midias;
  const b = r?.biblioteca;
  return (
    <SummaryCard title="Mídias e Biblioteca" icon={Library} to="/dashboard/biblioteca" loading={loading} testId="owner-card-midias"
      headline={m && b ? m.total + b.itens : undefined} caption={m && b ? `${m.total} em Minhas Mídias · ${b.itens} na Biblioteca` : undefined}>
      {m && b && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Vídeos" value={m.videos + b.videos} />
            <MiniStat label="Imagens" value={m.imagens + b.imagens} />
            <MiniStat label="Pastas" value={b.pastas} />
          </div>
          <ul>
            <SummaryRow to="/dashboard/medias" label="Minhas Mídias" value={`${m.total}`} sub={`${m.semana} enviadas em 7 dias`} />
            <SummaryRow to="/dashboard/biblioteca" label="Biblioteca de Mídias" value={`${b.itens}`} sub={`${b.pastas} pastas`} />
          </ul>
        </div>
      )}
    </SummaryCard>
  );
}

function WidgetsCard({ r, loading }: P) {
  const w = r?.widgets;
  const tipos = w ? Object.entries(w.por_tipo).sort((a, b) => b[1] - a[1]) : [];
  return (
    <SummaryCard title="Widgets" icon={LayoutGrid} to="/dashboard/widgets" loading={loading} testId="owner-card-widgets"
      headline={w ? w.ativos : undefined} caption={w ? `ativos de ${w.total} · ${w.em_playlists} em playlists` : undefined}>
      {w && (tipos.length
        ? <ul>{tipos.slice(0, 4).map(([tipo, n]) => <SummaryRow key={tipo} to="/dashboard/widgets" label={TIPO_LABEL[tipo as WidgetTypeId] ?? tipo} value={`${n}`} />)}</ul>
        : <EmptyLine>Nenhum widget criado ainda.</EmptyLine>)}
    </SummaryCard>
  );
}

function ConteudoCard({ r, loading }: P) {
  const c = r?.conteudo;
  const falha = !!c && (c.esportes_fontes_com_falha > 0 || (!!c.noticias_saude && c.noticias_saude !== 'HEALTHY'));
  return (
    <SummaryCard title="Conteúdo automático" icon={Sparkles} to="/dashboard/biblioteca" loading={loading} testId="owner-card-conteudo"
      headline={c ? c.esportes_publicados.toLocaleString('pt-BR') : undefined} caption={c ? 'jogos confirmados publicados (duas fontes)' : undefined}>
      {c && (
        <ul>
          <SummaryRow to="/dashboard/biblioteca" label="Esportes" sub={`atualizado ${tempoDesde(c.esportes_ultima)}`}
            value={c.esportes_fontes_com_falha ? `${c.esportes_fontes_com_falha} fonte(s) instável(is)` : 'fontes OK'} tone={c.esportes_fontes_com_falha ? 'atencao' : 'ok'} />
          <SummaryRow to="/dashboard/biblioteca" label="Notícias de Esportes" sub={`atualizado ${tempoDesde(c.noticias_ultima)}`}
            value={`${c.noticias_ativas} ativas`} tone={falha && c.noticias_saude !== 'HEALTHY' ? 'atencao' : 'ok'} />
        </ul>
      )}
    </SummaryCard>
  );
}

