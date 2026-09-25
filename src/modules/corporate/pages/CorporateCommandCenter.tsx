import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, CalendarDays, CircleDollarSign, FileSignature, FileText, Inbox, Loader2, Monitor, PlayCircle,
  Receipt, RefreshCw, ShieldAlert, Trophy, Wallet, History,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { Button } from '@/components/ui/button';
import { AlertStrip } from '@/components/central/AlertStrip';
import { EmptyLine, MiniStat, SummaryCard, SummaryRow } from '@/components/central/SummaryCard';
import {
  cardsDoPerfil, diaMes, fetchResumoOwner, filtrarAlertas, rotuloStatus, formatBRL, formatBRLCompacto, montarAlertas, saudacao, SemPermissaoError, tempoDesde,
  type ResumoOwner,
} from '@/lib/dashboardResumo';
import { fetchPlaybackStats } from '@/lib/playbackStats';
import { representantesGerenciaService } from '@/services/representantesGerencia.service';

const ATUALIZAR_MS = 60_000;

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * "Central do Dia" do OWNER/ADMIN: o que exige atenção hoje logo de cara (alertas), um resumo de cada área com
 * "Expandir" (mais itens sem sair da tela) e clique que leva direto à tela completa. Só dados reais (RLS + trava de
 * perfil no banco), atualizados a cada 60 s.
 */
export default function CorporateCommandCenter() {
  const { usuario, user } = useAuth();
  const { total: naoLidas } = useCentralUnread();

  const resumo = useQuery({
    queryKey: ['central-dia-owner'],
    queryFn: fetchResumoOwner,
    refetchInterval: ATUALIZAR_MS,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });

  const inicioMes = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
  const hojeIso = format(new Date(), 'yyyy-MM-dd');
  const reps = useQuery({
    queryKey: ['central-dia-reps', inicioMes, hojeIso],
    queryFn: () => representantesGerenciaService.obterDesempenho({ periodoInicio: inicioMes, periodoFim: hojeIso, ordenar: 'receita' }),
    refetchInterval: ATUALIZAR_MS * 5,
    enabled: cardsDoPerfil(usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null)).has('representantes'),
  });

  const exibicoesSemana = useQuery({
    queryKey: ['central-dia-exibicoes-semana'],
    queryFn: () => fetchPlaybackStats(null, 'week'),
    refetchInterval: ATUALIZAR_MS,
  });

  const r = resumo.data;
  // Fonte oficial do perfil (AGENTS.md §7): perfil.nome, ou OWNER pelo is_owner
  const perfilNome = usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null);
  const cards = useMemo(() => cardsDoPerfil(perfilNome), [perfilNome]);
  const alertas = useMemo(() => (r ? filtrarAlertas(montarAlertas(r, naoLidas), cards) : []), [r, naoLidas, cards]);
  const agora = new Date();
  const nome = (usuario?.nome || user?.email || '').split(' ')[0];

  if (resumo.error instanceof SemPermissaoError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Este painel é exclusivo da gestão (Owner, Admin, Financeiro e Supervisão).</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 animate-in fade-in duration-300" data-testid="central-do-dia">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{primeiraMaiuscula(format(agora, "EEEE, d 'de' MMMM", { locale: ptBR }))}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {saudacao(agora.getHours())}{nome ? `, ${nome}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Seu resumo do dia: o que precisa de atenção agora e como está cada área.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {resumo.dataUpdatedAt ? `Atualizado ${tempoDesde(new Date(resumo.dataUpdatedAt).toISOString())}` : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => { resumo.refetch(); reps.refetch(); exibicoesSemana.refetch(); }}
            disabled={resumo.isFetching}
          >
            {resumo.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </Button>
        </div>
      </header>

      {/* Alertas de hoje */}
      {resumo.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando alertas…</div>
      ) : resumo.isError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          Não foi possível carregar o resumo. <button className="font-semibold text-primary underline" onClick={() => resumo.refetch()}>Tentar de novo</button>
        </div>
      ) : (
        <AlertStrip alertas={alertas} />
      )}

      {/* Resumos por área */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
        {cards.has('financeiro') && <FinanceiroCard r={r} loading={resumo.isLoading} />}
        {cards.has('cobrancas') && <CobrancasCard r={r} loading={resumo.isLoading} />}
        {cards.has('telas') && <TelasCard r={r} loading={resumo.isLoading} />}
        {cards.has('representantes') && <RepresentantesCard dados={reps.data} loading={reps.isLoading} erro={reps.isError} />}
        {cards.has('comercial') && <ComercialCard r={r} loading={resumo.isLoading} />}
        {cards.has('exibicoes') && <ExibicoesCard pontos={exibicoesSemana.data} loading={exibicoesSemana.isLoading} />}
        {cards.has('agenda') && <AgendaCard r={r} loading={resumo.isLoading} />}
        {cards.has('aprovacoes') && <AprovacoesCard r={r} loading={resumo.isLoading} naoLidas={naoLidas} />}
        {cards.has('atividade') && <AtividadeCard r={r} loading={resumo.isLoading} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cards

type CardProps = { r: ResumoOwner | undefined; loading: boolean };

const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

function FinanceiroCard({ r, loading }: CardProps) {
  const f = r?.financeiro;
  const pct = f && f.previsto_mes > 0 ? Math.round((f.recebido_mes / f.previsto_mes) * 100) : null;
  return (
    <SummaryCard
      title="Financeiro do mês"
      icon={Wallet}
      to="/workspace/financeiro"
      wide
      loading={loading}
      testId="card-financeiro"
      headline={f ? formatBRL(f.recebido_mes) : undefined}
      caption={f ? `recebido de ${formatBRL(f.previsto_mes)} previstos no mês${pct !== null ? ` (${pct}%)` : ''}` : undefined}
      expanded={f && (
        <ul>
          <SummaryRow label="Previsto no mês" value={formatBRL(f.previsto_mes)} />
          <SummaryRow label="Recebido no mês" value={formatBRL(f.recebido_mes)} tone="ok" />
          <SummaryRow label="A receber (em aberto)" value={formatBRL(f.a_receber)} />
          <SummaryRow label="Vencido" value={formatBRL(f.vencido_total)} tone={f.vencido_total > 0 ? 'critico' : undefined} />
        </ul>
      )}
    >
      {f && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="A receber" value={formatBRLCompacto(f.a_receber)} />
            <MiniStat label="Vencido" value={formatBRLCompacto(f.vencido_total)} tone={f.vencido_total > 0 ? 'critico' : 'ok'} />
            <MiniStat label="Previsto mês" value={formatBRLCompacto(f.previsto_mes)} />
          </div>
          {f.serie_30d.every((p) => !Number(p.recebido)) ? (
            <EmptyLine>Nenhum recebimento registrado nos últimos 30 dias.</EmptyLine>
          ) : (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Recebimentos por dia — últimos 30 dias</p>
            <div className="h-24 w-full" aria-label="Gráfico de recebimentos dos últimos 30 dias">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={f.serie_30d} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="gradRecebido" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dia" hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(d) => diaMes(String(d))}
                    formatter={(v) => [formatBRL(Number(v)), 'Recebido']}
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area type="monotone" dataKey="recebido" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradRecebido)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}
        </div>
      )}
    </SummaryCard>
  );
}

function CobrancasCard({ r, loading }: CardProps) {
  const c = r?.cobrancas;
  const linha = (i: ResumoOwner['cobrancas']['vencidas']['itens'][number], vencida: boolean) => (
    <SummaryRow
      key={i.id}
      to={`/workspace/financeiro/cobrancas/${i.id}`}
      label={i.cliente || i.codigo || 'Cobrança'}
      sub={vencida ? `venceu ${diaMes(i.data_vencimento)} · ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'} de atraso` : `vence ${diaMes(i.data_vencimento)}${i.dias === 0 ? ' (hoje)' : ` · em ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}`}`}
      value={formatBRL(i.valor)}
      tone={vencida ? 'critico' : 'atencao'}
    />
  );
  return (
    <SummaryCard
      title="Cobranças"
      icon={Receipt}
      to="/workspace/financeiro/cobrancas"
      loading={loading}
      testId="card-cobrancas"
      headline={c ? formatBRL(c.vencidas.total) : undefined}
      caption={c ? `${c.vencidas.qtd} vencidas · ${c.vencendo.qtd} vencem em 7 dias (${formatBRL(c.vencendo.total)})` : undefined}
      expanded={c && (
        <div className="space-y-3">
          {c.vencidas.itens.length > 3 && (
            <div>
              <p className="text-xs font-semibold text-red-400">Mais vencidas</p>
              <ul>{c.vencidas.itens.slice(3).map((i) => linha(i, true))}</ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-amber-400">Vencem nos próximos 7 dias</p>
            {c.vencendo.itens.length ? <ul>{c.vencendo.itens.map((i) => linha(i, false))}</ul> : <EmptyLine>Nenhuma cobrança vence nos próximos 7 dias.</EmptyLine>}
          </div>
        </div>
      )}
    >
      {c && (c.vencidas.itens.length ? <ul>{c.vencidas.itens.slice(0, 3).map((i) => linha(i, true))}</ul> : <EmptyLine>Nenhuma cobrança vencida.</EmptyLine>)}
    </SummaryCard>
  );
}

function TelasCard({ r, loading }: CardProps) {
  const t = r?.telas;
  const linha = (s: ResumoOwner['telas']['offline_itens'][number]) => (
    <SummaryRow key={s.id} to={`/workspace/screens/${s.id}`} label={s.nome} sub={s.cidade || undefined} value={`sinal ${tempoDesde(s.ultimo_sinal)}`} tone="critico" />
  );
  return (
    <SummaryCard
      title="Telas"
      icon={Monitor}
      to="/workspace/screens"
      loading={loading}
      testId="card-telas"
      headline={t ? <>{t.online}<span className="text-lg font-semibold text-muted-foreground"> / {t.total} online</span></> : undefined}
      expanded={t && t.offline_itens.length > 3 ? <ul>{t.offline_itens.slice(3).map(linha)}</ul> : undefined}
    >
      {t && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Online" value={t.online} tone="ok" />
            <MiniStat label="Offline" value={t.offline} tone={t.offline > 0 ? 'critico' : 'ok'} />
            <MiniStat label="Sem playlist" value={t.sem_playlist} tone={t.sem_playlist > 0 ? 'atencao' : 'ok'} />
          </div>
          {t.offline_itens.length ? <ul>{t.offline_itens.slice(0, 3).map(linha)}</ul> : <EmptyLine>Todas as telas estão online.</EmptyLine>}
        </div>
      )}
    </SummaryCard>
  );
}

function RepresentantesCard({ dados, loading, erro }: {
  dados: Awaited<ReturnType<typeof representantesGerenciaService.obterDesempenho>> | undefined; loading: boolean; erro: boolean;
}) {
  const ativos = (dados || []).filter((d) => d.ativo);
  const ranking = [...ativos].sort((a, b) => (b.receita_mensal || 0) - (a.receita_mensal || 0));
  const receitaTotal = ativos.reduce((s, d) => s + (Number(d.receita_mensal) || 0), 0);
  const contratos = ativos.reduce((s, d) => s + (d.contratos_fechados || 0), 0);
  const linha = (d: typeof ranking[number], pos: number) => {
    const meta = d.meta_mensal > 0 ? Math.round((d.meta_realizado / d.meta_mensal) * 100) : null;
    return (
      <SummaryRow
        key={d.representante_id}
        to={`/workspace/representantes/${d.representante_id}`}
        label={`${pos}º ${d.nome}`}
        sub={`${d.contratos_fechados} contratos · ${d.propostas_criadas} propostas${meta !== null ? ` · meta ${meta}%` : ''}`}
        value={formatBRLCompacto(d.receita_mensal)}
        tone={meta !== null ? (meta >= 100 ? 'ok' : meta < 50 ? 'atencao' : undefined) : undefined}
      />
    );
  };
  return (
    <SummaryCard
      title="Representantes no mês"
      icon={Trophy}
      to="/workspace/representantes/desempenho"
      loading={loading}
      testId="card-representantes"
      headline={!erro ? formatBRL(receitaTotal) : undefined}
      caption={!erro ? `receita mensal da equipe · ${contratos} contratos fechados · ${ativos.length} ativos` : undefined}
      expanded={ranking.length > 3 ? <ul>{ranking.slice(3, 10).map((d, i) => linha(d, i + 4))}</ul> : undefined}
    >
      {erro ? <EmptyLine>Não foi possível carregar o desempenho agora.</EmptyLine>
        : ranking.length ? <ul>{ranking.slice(0, 3).map((d, i) => linha(d, i + 1))}</ul>
        : <EmptyLine>Nenhum representante ativo no período.</EmptyLine>}
    </SummaryCard>
  );
}

function ComercialCard({ r, loading }: CardProps) {
  const c = r?.comercial;
  return (
    <SummaryCard
      title="Comercial"
      icon={FileSignature}
      to="/workspace/propostas"
      loading={loading}
      testId="card-comercial"
      headline={c ? c.propostas_mes : undefined}
      caption={c ? 'propostas criadas neste mês' : undefined}
      expanded={c && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Contratos de campanha que terminam em 30 dias</p>
          {c.contratos_a_vencer.length ? (
            <ul>{c.contratos_a_vencer.map((k) => (
              <SummaryRow key={k.id} to="/workspace/contratos" label={k.cliente || k.numero || 'Contrato'} sub={k.numero || undefined} value={`até ${diaMes(k.data_fim)}`} tone="atencao" />
            ))}</ul>
          ) : <EmptyLine>Nenhum contrato ativo termina nos próximos 30 dias.</EmptyLine>}
        </div>
      )}
    >
      {c && (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Propostas em rascunho" value={c.propostas_rascunho} />
          <MiniStat label="Propostas aprovadas" value={c.propostas_aprovadas} tone="ok" />
          <MiniStat label="Aguardando assinatura" value={c.contratos_aguardando_assinatura} tone={c.contratos_aguardando_assinatura > 0 ? 'atencao' : undefined} />
          <MiniStat label="Aguardando pagamento" value={c.contratos_aguardando_pagamento} tone={c.contratos_aguardando_pagamento > 0 ? 'atencao' : undefined} />
          <MiniStat label="Campanhas ativas" value={c.contratos_ativos} tone="ok" />
          <MiniStat label="Terminam em 30 dias" value={c.contratos_a_vencer.length} tone={c.contratos_a_vencer.length > 0 ? 'atencao' : undefined} />
        </div>
      )}
    </SummaryCard>
  );
}

function ExibicoesCard({ pontos, loading }: { pontos: Array<{ name: string; value: number }> | undefined; loading: boolean }) {
  const hoje = pontos?.[pontos.length - 1]?.value ?? 0;
  const semana = (pontos || []).reduce((s, p) => s + p.value, 0);
  return (
    <SummaryCard
      title="Exibições nas telas"
      icon={PlayCircle}
      to="/workspace/bi"
      loading={loading}
      testId="card-exibicoes"
      headline={pontos ? hoje.toLocaleString('pt-BR') : undefined}
      caption={pontos ? `mídias exibidas hoje · ${semana.toLocaleString('pt-BR')} nos últimos 7 dias` : undefined}
    >
      {pontos && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Exibições por dia — 7 dias</p>
          <div className="h-28 w-full" aria-label="Gráfico de exibições por dia na última semana">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pontos} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={4}>
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

function AgendaCard({ r, loading }: CardProps) {
  const itens = r?.agenda_hoje ?? [];
  const linha = (a: ResumoOwner['agenda_hoje'][number]) => (
    <SummaryRow
      key={a.id}
      to={`/workspace/agenda/${a.id}`}
      label={a.titulo}
      sub={a.evento === 'COMECA' ? `começa hoje às ${format(new Date(a.inicio), 'HH:mm')}` : `termina hoje às ${format(new Date(a.fim), 'HH:mm')}`}
      value={a.evento === 'COMECA' ? 'Início' : 'Fim'}
      tone={a.evento === 'COMECA' ? 'ok' : 'atencao'}
    />
  );
  return (
    <SummaryCard
      title="Agenda de hoje"
      icon={CalendarDays}
      to="/workspace/agenda"
      loading={loading}
      testId="card-agenda"
      headline={r ? itens.length : undefined}
      caption={r ? 'campanhas que começam ou terminam hoje' : undefined}
      expanded={itens.length > 4 ? <ul>{itens.slice(4).map(linha)}</ul> : undefined}
    >
      {r && (itens.length ? <ul>{itens.slice(0, 4).map(linha)}</ul> : <EmptyLine>Nenhuma campanha começa ou termina hoje.</EmptyLine>)}
    </SummaryCard>
  );
}

function AprovacoesCard({ r, loading, naoLidas }: CardProps & { naoLidas: number }) {
  const a = r?.aprovacoes;
  return (
    <SummaryCard
      title="Aprovações e mensagens"
      icon={Inbox}
      to="/workspace/central"
      loading={loading}
      testId="card-aprovacoes"
      headline={a ? a.pendentes : undefined}
      caption={a ? `aprovações pendentes · ${naoLidas} mensagens não lidas` : undefined}
    >
      {a && (a.itens.length ? (
        <ul>{a.itens.map((s) => (
          <SummaryRow key={s.id} to={`/admin/solicitacoes/${s.id}`} label={s.titulo} sub={`${s.tipo} · ${tempoDesde(s.criada_em)}`} value="Decidir" tone="atencao" />
        ))}</ul>
      ) : <EmptyLine>Nenhuma aprovação pendente.</EmptyLine>)}
    </SummaryCard>
  );
}

const iconeAtividade = { CONTRATO: FileText, PROPOSTA: BarChart3, PAGAMENTO: CircleDollarSign } as const;
const linkAtividade = (t: ResumoOwner['atividade'][number]) =>
  t.tipo === 'PAGAMENTO' ? `/workspace/financeiro/cobrancas/${t.id}` : t.tipo === 'CONTRATO' ? '/workspace/contratos' : '/workspace/propostas';

function AtividadeCard({ r, loading }: CardProps) {
  const itens = r?.atividade ?? [];
  const linha = (t: ResumoOwner['atividade'][number]) => {
    const Icon = iconeAtividade[t.tipo];
    const detalhe = t.tipo === 'PAGAMENTO' ? `pagamento de ${formatBRL(Number(t.detalhe))}` : `${t.tipo === 'CONTRATO' ? 'contrato' : 'proposta'} · ${rotuloStatus(t.detalhe)}`;
    return (
      <SummaryRow
        key={`${t.tipo}-${t.id}`}
        to={linkAtividade(t)}
        label={<span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{t.titulo || '—'}</span>}
        sub={detalhe}
        value={<span className="text-xs font-normal text-muted-foreground">{tempoDesde(t.quando)}</span>}
      />
    );
  };
  return (
    <SummaryCard
      title="Atividade recente"
      icon={History}
      to="/workspace/contratos"
      loading={loading}
      testId="card-atividade"
      expanded={itens.length > 4 ? <ul>{itens.slice(4).map(linha)}</ul> : undefined}
    >
      {r && (itens.length ? <ul>{itens.slice(0, 4).map(linha)}</ul> : <EmptyLine>Nenhuma atividade recente.</EmptyLine>)}
    </SummaryCard>
  );
}

