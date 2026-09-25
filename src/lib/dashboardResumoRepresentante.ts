import { supabase } from '@/integrations/supabase/client';
import { formatBRL, SemPermissaoError, type Alerta } from '@/lib/dashboardResumo';

/** Resumo do dia do REPRESENTANTE (RPC fn_dashboard_resumo_representante: só a carteira do próprio usuário). */
export interface ResumoRepresentante {
  status: 'OK';
  gerado_em: string;
  parametros: { dias_vencer: number };
  propostas: {
    rascunho: number; aprovadas: number; mes: number;
    paradas: Array<{ id: string; titulo: string | null; cliente: string | null; valor: number | null; criada_em: string }>;
  };
  contratos: {
    aguardando_assinatura: number; aguardando_pagamento: number; ativos: number;
    pendentes: Array<{ id: string; numero: string | null; cliente: string | null; status: string; criado_em: string }>;
    terminam_30d: Array<{ id: string; numero: string | null; cliente: string | null; data_fim: string }>;
  };
  cobrancas: {
    vencidas_qtd: number; vencidas_total: number; vencendo_qtd: number; vencendo_total: number;
    itens: Array<{ id: string; cliente: string | null; valor: number; data_vencimento: string; dias_atraso: number }>;
  };
  clientes: { total: number; novos_mes: number; recentes: Array<{ id: string; nome: string | null; criado_em: string }> };
  agenda_hoje: Array<{ id: string; titulo: string; status: string; inicio: string; fim: string; evento: 'COMECA' | 'TERMINA' }>;
}

export async function fetchResumoRepresentante(): Promise<ResumoRepresentante> {
  const { data, error } = await supabase.rpc('fn_dashboard_resumo_representante' as never, { p_dias_vencer: 7, p_tz: 'America/Sao_Paulo' } as never);
  if (error) throw error;
  const r = data as unknown as ResumoRepresentante | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as ResumoRepresentante;
}

/** O que o representante precisa fazer hoje, do mais urgente ao menos urgente. */
export function montarAlertasRepresentante(r: ResumoRepresentante, mensagensNaoLidas = 0, base = '/representantes'): Alerta[] {
  const a: Alerta[] = [];
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (r.cobrancas.vencidas_qtd > 0) {
    a.push({ id: 'vencidas', nivel: 'critico', titulo: plural(r.cobrancas.vencidas_qtd, 'cliente com cobrança vencida', 'cobranças vencidas na carteira'), detalhe: formatBRL(r.cobrancas.vencidas_total), link: `${base}/financeiro/recebiveis` });
  }
  if (r.contratos.aguardando_assinatura > 0) {
    a.push({ id: 'assinatura', nivel: 'atencao', titulo: plural(r.contratos.aguardando_assinatura, 'contrato aguardando assinatura', 'contratos aguardando assinatura'), detalhe: 'cobre o cliente para assinar', link: `${base}/contratos` });
  }
  if (r.contratos.aguardando_pagamento > 0) {
    a.push({ id: 'pagamento', nivel: 'atencao', titulo: plural(r.contratos.aguardando_pagamento, 'contrato aguardando pagamento', 'contratos aguardando pagamento'), detalhe: 'acompanhe o pagamento', link: `${base}/contratos` });
  }
  if (r.cobrancas.vencendo_qtd > 0) {
    a.push({ id: 'vencendo', nivel: 'atencao', titulo: `${plural(r.cobrancas.vencendo_qtd, 'cobrança vence', 'cobranças vencem')} em ${r.parametros.dias_vencer} dias`, detalhe: formatBRL(r.cobrancas.vencendo_total), link: `${base}/financeiro/recebiveis` });
  }
  if (r.propostas.rascunho > 0) {
    a.push({ id: 'rascunhos', nivel: 'atencao', titulo: plural(r.propostas.rascunho, 'proposta em rascunho', 'propostas em rascunho'), detalhe: 'finalize e envie ao cliente', link: `${base}/propostas` });
  }
  if (mensagensNaoLidas > 0) {
    a.push({ id: 'mensagens', nivel: 'atencao', titulo: plural(mensagensNaoLidas, 'mensagem não lida', 'mensagens não lidas'), detalhe: 'Central de Mensagens', link: `${base}/central` });
  }
  if (a.length === 0) a.push({ id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo em dia', detalhe: 'nenhuma pendência na sua carteira', link: base });
  return a;
}
