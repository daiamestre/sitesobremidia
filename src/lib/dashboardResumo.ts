import { supabase } from '@/integrations/supabase/client';

/** Resumo da "Central do Dia" do OWNER/ADMIN (RPC fn_dashboard_resumo_owner, RLS + trava de perfil no banco). */

export interface TelaOffline { id: string; nome: string; cidade: string | null; ultimo_sinal: string | null }
export interface CobrancaItem { id: string; cliente: string | null; valor: number; data_vencimento: string; dias: number; codigo: string | null }
export interface ContratoVencer { id: string; numero: string | null; cliente: string | null; data_fim: string }
export interface AprovacaoItem { id: string; titulo: string; tipo: string; criada_em: string }
export interface AgendaItem { id: string; titulo: string; status: string; inicio: string; fim: string; evento: 'COMECA' | 'TERMINA' }
export interface AtividadeItem { tipo: 'CONTRATO' | 'PROPOSTA' | 'PAGAMENTO'; id: string; titulo: string | null; detalhe: string | null; quando: string }

export interface ResumoOwner {
  status: 'OK';
  gerado_em: string;
  parametros: { offline_min: number; dias_vencer: number };
  telas: { total: number; online: number; offline: number; sem_playlist: number; offline_itens: TelaOffline[] };
  cobrancas: {
    vencidas: { qtd: number; total: number; itens: CobrancaItem[] };
    vencendo: { qtd: number; total: number; itens: CobrancaItem[] };
  };
  financeiro: { recebido_mes: number; previsto_mes: number; a_receber: number; vencido_total: number; serie_30d: Array<{ dia: string; recebido: number }> };
  comercial: {
    propostas_rascunho: number; propostas_enviadas: number; propostas_aprovadas: number; propostas_mes: number;
    contratos_aguardando_assinatura: number; contratos_aguardando_pagamento: number; contratos_ativos: number;
    contratos_a_vencer: ContratoVencer[];
  };
  aprovacoes: { pendentes: number; itens: AprovacaoItem[] };
  agenda_hoje: AgendaItem[];
  atividade: AtividadeItem[];
}

export class SemPermissaoError extends Error {
  constructor() { super('Sem permissão para o resumo de gestão.'); }
}

export async function fetchResumoOwner(): Promise<ResumoOwner> {
  const { data, error } = await supabase.rpc('fn_dashboard_resumo_owner' as never, { p_offline_min: 10, p_dias_vencer: 7, p_tz: 'America/Sao_Paulo' } as never);
  if (error) throw error;
  const r = data as unknown as ResumoOwner | { status: 'SEM_PERMISSAO' };
  if (!r || r.status !== 'OK') throw new SemPermissaoError();
  return r as ResumoOwner;
}

// ------------------------------------------------------------------ formatação

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export const formatBRL = (v: number | null | undefined) => brl.format(Number(v) || 0);
/** R$ 88,9 mil — para números grandes em cards pequenos. */
export const formatBRLCompacto = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  return Math.abs(n) >= 10_000 ? brlCompacto.format(n) : brl.format(n);
};

/** "agora", "há 5 min", "há 3 h", "há 2 dias", "nunca". */
export function tempoDesde(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return 'nunca';
  const diffMin = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** 25/09 a partir de "2026-09-25" sem deslocar o dia pelo fuso. */
export function diaMes(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const ROTULOS: Record<string, string> = {
  DRAFT: 'Rascunho', RASCUNHO: 'Rascunho', SENT: 'Enviada', ENVIADA: 'Enviada', PENDING: 'Pendente', PENDENTE: 'Pendente',
  APPROVED: 'Aprovada', APROVADA: 'Aprovada', REJECTED: 'Recusada', RECUSADA: 'Recusada', EXPIRED: 'Expirada',
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura', AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  CAMPANHA_ATIVA: 'Campanha ativa', CANCELADO: 'Cancelado', ENCERRADO: 'Encerrado', SUSPENSO_FINANCEIRO: 'Suspenso (financeiro)',
};

/** Status do banco em português ("DRAFT" -> "Rascunho"); desconhecido vira texto legível. */
export function rotuloStatus(status: string | null | undefined): string {
  if (!status) return '';
  const k = status.toUpperCase();
  return ROTULOS[k] ?? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function saudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ------------------------------------------------------------------ alertas

export type NivelAlerta = 'critico' | 'atencao' | 'ok';
export interface Alerta { id: string; nivel: NivelAlerta; titulo: string; detalhe: string; link: string }

/** Faixa de alertas do topo: o que precisa de ação hoje, do mais grave para o menos grave. */
export function montarAlertas(r: ResumoOwner, mensagensNaoLidas = 0): Alerta[] {
  const a: Alerta[] = [];
  if (r.telas.offline > 0) {
    a.push({
      id: 'telas', nivel: 'critico',
      titulo: `${r.telas.offline} de ${r.telas.total} ${r.telas.total === 1 ? 'tela' : 'telas'} offline`,
      detalhe: `sem sinal há mais de ${r.parametros.offline_min} min`,
      link: '/workspace/screens',
    });
  }
  if (r.cobrancas.vencidas.qtd > 0) {
    a.push({
      id: 'vencidas', nivel: 'critico',
      titulo: `${r.cobrancas.vencidas.qtd} ${r.cobrancas.vencidas.qtd === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`,
      detalhe: formatBRL(r.cobrancas.vencidas.total),
      link: '/workspace/financeiro/cobrancas',
    });
  }
  if (r.cobrancas.vencendo.qtd > 0) {
    a.push({
      id: 'vencendo', nivel: 'atencao',
      titulo: `${r.cobrancas.vencendo.qtd} ${r.cobrancas.vencendo.qtd === 1 ? 'vence' : 'vencem'} em ${r.parametros.dias_vencer} dias`,
      detalhe: formatBRL(r.cobrancas.vencendo.total),
      link: '/workspace/financeiro/cobrancas',
    });
  }
  if (r.aprovacoes.pendentes > 0) {
    a.push({
      id: 'aprovacoes', nivel: 'atencao',
      titulo: `${r.aprovacoes.pendentes} ${r.aprovacoes.pendentes === 1 ? 'aprovação pendente' : 'aprovações pendentes'}`,
      detalhe: 'aguardando sua decisão',
      link: r.aprovacoes.itens[0] ? `/admin/solicitacoes/${r.aprovacoes.itens[0].id}` : '/workspace/central',
    });
  }
  if (mensagensNaoLidas > 0) {
    a.push({
      id: 'mensagens', nivel: 'atencao',
      titulo: `${mensagensNaoLidas} ${mensagensNaoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`,
      detalhe: 'Central de Mensagens',
      link: '/workspace/central',
    });
  }
  if (a.length === 0) {
    a.push({ id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo em dia', detalhe: 'nenhuma pendência urgente agora', link: '/workspace' });
  }
  return a;
}
