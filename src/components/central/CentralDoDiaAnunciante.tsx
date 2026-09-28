import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertStrip } from '@/components/central/AlertStrip';
import { VitrineAnunciante } from '@/components/central/VitrineAnunciante';
import { formatBRL, SemPermissaoError, type Alerta } from '@/lib/dashboardResumo';

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

/**
 * "Seu dia" no Portal do Anunciante: avisos (faturas e mensagens) no topo e, em
 * destaque, onde o anúncio passa e as campanhas rodando (F-101). O card de
 * faturas saiu da primeira vista: as faturas ficam em "Contratos e Faturas".
 */
export function CentralDoDiaAnunciante({ naoLidas = 0, mostrarCampanhas = true }: { naoLidas?: number; mostrarCampanhas?: boolean }) {
  const q = useQuery({
    queryKey: ['central-dia-anunciante'],
    queryFn: fetchResumoAnunciante,
    refetchInterval: 60_000,
    retry: (n, e) => !(e instanceof SemPermissaoError) && n < 2,
  });
  const r = q.data;
  const alertas = useMemo(() => (r ? montarAlertasAnunciante(r, naoLidas) : []), [r, naoLidas]);

  return (
    <section className="w-full min-w-0 space-y-4" data-testid="central-do-dia-anunciante" aria-label="Seu dia">
      {r && !q.isError && <AlertStrip alertas={alertas} />}
      {mostrarCampanhas && <VitrineAnunciante />}
    </section>
  );
}
