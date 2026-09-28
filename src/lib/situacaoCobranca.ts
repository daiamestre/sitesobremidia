/**
 * F-105 — Situação da cobrança em linguagem do cliente, igual em todo o sistema:
 * "Cobrança em aberto", "Em atraso há N dias", "Fatura paga", "Cancelada".
 */
export type TipoSituacao = 'paga' | 'atraso' | 'aberta' | 'cancelada';

export interface SituacaoCobranca {
  tipo: TipoSituacao;
  texto: string;
  dias: number;
  /** classes Tailwind (texto, borda e fundo) */
  cor: string;
}

export const hojeSaoPaulo = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function situacaoCobranca(status: string | null | undefined, vencimento: string | null | undefined, hoje = hojeSaoPaulo()): SituacaoCobranca {
  const s = String(status || '').toUpperCase();
  if (['PAGA', 'PAGO', 'CONCILIADA'].includes(s)) {
    return { tipo: 'paga', texto: 'Fatura paga', dias: 0, cor: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10' };
  }
  if (['CANCELADA', 'CANCELADO'].includes(s)) {
    return { tipo: 'cancelada', texto: 'Cancelada', dias: 0, cor: 'text-slate-400 border-white/10 bg-white/5' };
  }
  const v = String(vencimento || '').slice(0, 10);
  if (v && v < hoje) {
    const dias = Math.round((Date.parse(hoje) - Date.parse(v)) / 86400000);
    return { tipo: 'atraso', texto: `Em atraso há ${dias} ${dias === 1 ? 'dia' : 'dias'}`, dias, cor: 'text-red-400 border-red-500/50 bg-red-500/10' };
  }
  return { tipo: 'aberta', texto: 'Cobrança em aberto', dias: 0, cor: 'text-amber-400 border-amber-500/50 bg-amber-500/10' };
}

/** Link público da fatura (página de pagamento com PIX/boleto). */
export const linkDaFatura = (codigo?: string | null, identificador?: string | null) =>
  codigo && identificador ? `/cobranca/${encodeURIComponent(codigo)}/${encodeURIComponent(identificador)}` : null;
