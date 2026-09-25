import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Megaphone, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AlertStrip } from '@/components/central/AlertStrip';
import { EmptyLine, MiniStat, SummaryCard, SummaryRow } from '@/components/central/SummaryCard';
import { diaMes, formatBRL, SemPermissaoError, type Alerta } from '@/lib/dashboardResumo';

/** Resumo do dia do ANUNCIANTE (RPC fn_dashboard_resumo_anunciante: só o cliente do próprio usuário). */
export interface ResumoAnunciante {
  status: 'OK';
  parametros: { dias_vencer: number };
  faturas: {
    vencidas_qtd: number; vencidas_total: number; abertas_qtd: number; abertas_total: number; vencendo_qtd: number;
    itens: Array<{ id: string; valor: number; data_vencimento: string; codigo: string | null; dias_atraso: number }>;
  };
  campanhas: { no_ar: number; proximas: Array<{ id: string; titulo: string; inicio: string; fim: string; status: string; total_telas: number | null }> };
}

export async function fetchResumoAnunciante(): Promise<ResumoAnunciante> {
  const { data, error } = await supabase.rpc('fn_dashboard_resumo_anunciante' as never, { p_dias_vencer: 7, p_tz: 'America/Sao_Paulo' } as never);
  if (error) throw error;
  const r = data as unknown as ResumoAnunciante | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as ResumoAnunciante;
}

export function montarAlertasAnunciante(r: ResumoAnunciante, mensagensNaoLidas = 0): Alerta[] {
  const a: Alerta[] = [];
  const f = r.faturas;
  if (f.vencidas_qtd > 0) {
    a.push({ id: 'faturas-vencidas', nivel: 'critico', titulo: `${f.vencidas_qtd} ${f.vencidas_qtd === 1 ? 'fatura vencida' : 'faturas vencidas'}`, detalhe: `${formatBRL(f.vencidas_total)} · pague para manter a campanha no ar`, link: '/portal/financeiro' });
  }
  if (f.vencendo_qtd > 0) {
    a.push({ id: 'faturas-vencendo', nivel: 'atencao', titulo: `${f.vencendo_qtd} ${f.vencendo_qtd === 1 ? 'fatura vence' : 'faturas vencem'} em ${r.parametros.dias_vencer} dias`, detalhe: 'Contratos e Faturas', link: '/portal/financeiro' });
  }
  if (mensagensNaoLidas > 0) {
    a.push({ id: 'mensagens', nivel: 'atencao', titulo: `${mensagensNaoLidas} ${mensagensNaoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`, detalhe: 'Mensagens', link: '/portal/central' });
  }
  if (a.length === 0) a.push({ id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo em dia', detalhe: 'nenhuma fatura pendente', link: '/portal/financeiro' });
  return a;
}

/** "Seu dia" no Portal do Anunciante: alertas de faturas e mensagens + faturas e campanhas; cada card leva à tela completa. */
export function CentralDoDiaAnunciante({ naoLidas = 0, mostrarCampanhas = true }: { naoLidas?: number; mostrarCampanhas?: boolean }) {
  const q = useQuery({
    queryKey: ['central-dia-anunciante'],
    queryFn: fetchResumoAnunciante,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  const r = q.data;
  const alertas = useMemo(() => (r ? montarAlertasAnunciante(r, naoLidas) : []), [r, naoLidas]);
  if (q.error instanceof SemPermissaoError || q.isError) return null;

  const f = r?.faturas;
  const linha = (x: ResumoAnunciante['faturas']['itens'][number]) => (
    <SummaryRow key={x.id} to="/portal/financeiro" label={x.codigo || 'Fatura'}
      sub={x.dias_atraso > 0 ? `venceu ${diaMes(x.data_vencimento)} · ${x.dias_atraso} dias de atraso` : `vence ${diaMes(x.data_vencimento)}`}
      value={formatBRL(x.valor)} tone={x.dias_atraso > 0 ? 'critico' : 'atencao'} />
  );

  return (
    <section className="w-full min-w-0 space-y-4" data-testid="central-do-dia-anunciante" aria-label="Seu dia">
      {r && <AlertStrip alertas={alertas} />}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
        <SummaryCard title="Faturas" icon={Receipt} to="/portal/financeiro" loading={q.isLoading} testId="anu-card-faturas"
          headline={f ? formatBRL(f.vencidas_total + f.abertas_total) : undefined}
          caption={f ? `${f.vencidas_qtd} vencidas · ${f.abertas_qtd} em aberto` : undefined}
          expanded={f && f.itens.length > 3 ? <ul>{f.itens.slice(3).map(linha)}</ul> : undefined}>
          {f && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Vencidas" value={formatBRL(f.vencidas_total)} tone={f.vencidas_qtd ? 'critico' : 'ok'} />
                <MiniStat label="Em aberto" value={formatBRL(f.abertas_total)} />
              </div>
              {f.itens.length ? <ul>{f.itens.slice(0, 3).map(linha)}</ul> : <EmptyLine>Nenhuma fatura pendente.</EmptyLine>}
            </div>
          )}
        </SummaryCard>
        {mostrarCampanhas && (
          <SummaryCard title="Minhas campanhas" icon={Megaphone} to="/portal/campanhas" loading={q.isLoading} testId="anu-card-campanhas"
            headline={r ? r.campanhas.no_ar : undefined} caption={r ? 'campanhas no ar agora' : undefined}>
            {r && (r.campanhas.proximas.length ? (
              <ul>{r.campanhas.proximas.map((c) => (
                <SummaryRow key={c.id} to="/portal/campanhas" label={c.titulo}
                  sub={`${format(new Date(c.inicio), 'dd/MM')} a ${format(new Date(c.fim), 'dd/MM')}${c.total_telas ? ` · ${c.total_telas} telas` : ''}`}
                  value={new Date(c.inicio) <= new Date() ? 'No ar' : 'Em breve'} tone={new Date(c.inicio) <= new Date() ? 'ok' : undefined} />
              ))}</ul>
            ) : <EmptyLine>Nenhuma campanha programada.</EmptyLine>)}
          </SummaryCard>
        )}
      </div>
    </section>
  );
}
