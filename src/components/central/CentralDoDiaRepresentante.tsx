import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, FileSignature, FileText, Loader2, Receipt, Users } from 'lucide-react';
import { useCentralUnread } from '@/hooks/useCentral';
import { AlertStrip } from '@/components/central/AlertStrip';
import { EmptyLine, MiniStat, SummaryCard, SummaryRow } from '@/components/central/SummaryCard';
import { diaMes, formatBRL, rotuloStatus, tempoDesde, SemPermissaoError } from '@/lib/dashboardResumo';
import { fetchResumoRepresentante, montarAlertasRepresentante, type ResumoRepresentante } from '@/lib/dashboardResumoRepresentante';

const BASE = '/representantes';

/** "Central do Dia" do Representante: alertas + resumos da própria carteira; cada card leva à tela completa. */
export function CentralDoDiaRepresentante() {
  const { total: naoLidas } = useCentralUnread();
  const q = useQuery({
    queryKey: ['central-dia-representante'],
    queryFn: fetchResumoRepresentante,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  const r = q.data;
  const alertas = useMemo(() => (r ? montarAlertasRepresentante(r, naoLidas, BASE) : []), [r, naoLidas]);

  if (q.error instanceof SemPermissaoError) return null;

  return (
    <section className="w-full min-w-0 space-y-4" data-testid="central-do-dia-representante" aria-label="Seu dia">
      <h3 className="text-lg font-bold text-foreground">Seu dia</h3>
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
        <PropostasCard r={r} loading={q.isLoading} />
        <ContratosCard r={r} loading={q.isLoading} />
        <CobrancasCard r={r} loading={q.isLoading} />
        <ClientesCard r={r} loading={q.isLoading} />
        <AgendaCard r={r} loading={q.isLoading} />
      </div>
    </section>
  );
}

type P = { r: ResumoRepresentante | undefined; loading: boolean };

function PropostasCard({ r, loading }: P) {
  const p = r?.propostas;
  const linha = (x: ResumoRepresentante['propostas']['paradas'][number]) => (
    <SummaryRow key={x.id} to={`${BASE}/propostas`} label={x.titulo || 'Proposta'} sub={`${x.cliente || 'Cliente'} · criada ${tempoDesde(x.criada_em)}`} value={x.valor ? formatBRL(x.valor) : undefined} tone="atencao" />
  );
  return (
    <SummaryCard title="Minhas propostas" icon={FileText} to={`${BASE}/propostas`} loading={loading} testId="rep-card-propostas"
      headline={p ? p.rascunho : undefined} caption={p ? `em rascunho · ${p.aprovadas} aprovadas · ${p.mes} criadas no mês` : undefined}
      expanded={p && p.paradas.length > 3 ? <ul>{p.paradas.slice(3).map(linha)}</ul> : undefined}>
      {p && (p.paradas.length ? <ul>{p.paradas.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma proposta parada em rascunho.</EmptyLine>)}
    </SummaryCard>
  );
}

function ContratosCard({ r, loading }: P) {
  const c = r?.contratos;
  return (
    <SummaryCard title="Meus contratos" icon={FileSignature} to={`${BASE}/contratos`} loading={loading} testId="rep-card-contratos"
      headline={c ? c.ativos : undefined} caption={c ? 'campanhas ativas' : undefined}
      expanded={c && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Campanhas que terminam em 30 dias</p>
          {c.terminam_30d.length ? <ul>{c.terminam_30d.map((k) => (
            <SummaryRow key={k.id} to={`${BASE}/contratos`} label={k.cliente || k.numero || 'Contrato'} sub={k.numero || undefined} value={`até ${diaMes(k.data_fim)}`} tone="atencao" />
          ))}</ul> : <EmptyLine>Nenhuma campanha termina nos próximos 30 dias.</EmptyLine>}
        </div>
      )}>
      {c && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Aguardando assinatura" value={c.aguardando_assinatura} tone={c.aguardando_assinatura ? 'atencao' : 'ok'} />
            <MiniStat label="Aguardando pagamento" value={c.aguardando_pagamento} tone={c.aguardando_pagamento ? 'atencao' : 'ok'} />
          </div>
          {c.pendentes.length ? <ul>{c.pendentes.slice(0, 3).map((k) => (
            <SummaryRow key={k.id} to={`${BASE}/contratos`} label={k.cliente || k.numero || 'Contrato'} sub={`${k.numero ?? ''} · ${rotuloStatus(k.status)}`} value={tempoDesde(k.criado_em)} />
          ))}</ul> : <EmptyLine>Nenhum contrato pendente.</EmptyLine>}
        </div>
      )}
    </SummaryCard>
  );
}

function CobrancasCard({ r, loading }: P) {
  const c = r?.cobrancas;
  const linha = (x: ResumoRepresentante['cobrancas']['itens'][number]) => (
    <SummaryRow key={x.id} to={`${BASE}/financeiro/recebiveis`} label={x.cliente || 'Cliente'}
      sub={x.dias_atraso > 0 ? `venceu ${diaMes(x.data_vencimento)} · ${x.dias_atraso} dias de atraso` : `vence ${diaMes(x.data_vencimento)}`}
      value={formatBRL(x.valor)} tone={x.dias_atraso > 0 ? 'critico' : 'atencao'} />
  );
  return (
    <SummaryCard title="Cobranças da carteira" icon={Receipt} to={`${BASE}/financeiro/recebiveis`} loading={loading} testId="rep-card-cobrancas"
      headline={c ? formatBRL(c.vencidas_total) : undefined} caption={c ? `${c.vencidas_qtd} vencidas · ${c.vencendo_qtd} vencem em 7 dias` : undefined}
      expanded={c && c.itens.length > 3 ? <ul>{c.itens.slice(3).map(linha)}</ul> : undefined}>
      {c && (c.itens.length ? <ul>{c.itens.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma cobrança vencida ou a vencer na sua carteira.</EmptyLine>)}
    </SummaryCard>
  );
}

function ClientesCard({ r, loading }: P) {
  const c = r?.clientes;
  return (
    <SummaryCard title="Minha carteira" icon={Users} to={`${BASE}/clientes`} loading={loading} testId="rep-card-clientes"
      headline={c ? c.total : undefined} caption={c ? `clientes · ${c.novos_mes} novos neste mês` : undefined}>
      {c && (c.recentes.length ? <ul>{c.recentes.slice(0, 4).map((x) => (
        <SummaryRow key={x.id} to={`${BASE}/clientes/${x.id}`} label={x.nome || 'Cliente'} sub={`cadastrado ${tempoDesde(x.criado_em)}`} />
      ))}</ul> : <EmptyLine>Nenhum cliente na carteira ainda.</EmptyLine>)}
    </SummaryCard>
  );
}

function AgendaCard({ r, loading }: P) {
  const itens = r?.agenda_hoje ?? [];
  return (
    <SummaryCard title="Agenda de hoje" icon={CalendarDays} to={`${BASE}/agenda`} loading={loading} testId="rep-card-agenda"
      headline={r ? itens.length : undefined} caption={r ? 'campanhas dos seus clientes que começam ou terminam hoje' : undefined}>
      {r && (itens.length ? <ul>{itens.map((a) => (
        <SummaryRow key={a.id} to={`${BASE}/agendamento/${a.id}`} label={a.titulo}
          sub={a.evento === 'COMECA' ? `começa às ${format(new Date(a.inicio), 'HH:mm')}` : `termina às ${format(new Date(a.fim), 'HH:mm')}`}
          value={a.evento === 'COMECA' ? 'Início' : 'Fim'} tone={a.evento === 'COMECA' ? 'ok' : 'atencao'} />
      ))}</ul> : <EmptyLine>Nenhuma campanha começa ou termina hoje.</EmptyLine>)}
    </SummaryCard>
  );
}
