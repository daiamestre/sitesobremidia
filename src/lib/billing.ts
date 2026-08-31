/**
 * Utilitários unificados para geração de URLs públicas e regras de apresentação de Cobrança
 * GATE 6.5 — URL PÚBLICA HUMANIZADA + CABEÇALHO PROFISSIONAL
 * GATE 6.7 — CABEÇALHO CANÔNICO ANUNCIANTE (billing_origin_type, estabelecimento, competência, serviço)
 */

const MESES_PORTUGUES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MESES_TITULO = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Normaliza qualquer texto para um slug de URL limpo, seguro e determinístico
 */
export function slugify(text: string | null | undefined): string {
  if (!text) return 'estabelecimento';
  
  const normalized = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // substitui caracteres especiais por hífen
    .replace(/-+/g, '-') // normaliza múltiplos hífens para apenas 1
    .replace(/^-+|-+$/g, ''); // remove hífens no início e fim

  return normalized || 'estabelecimento';
}

/**
 * Extrai o mês da competência ou vencimento para montar o slug da fatura (ex: 'fatura-julho')
 */
export function getFaturaSlug(competenciaOrVencimento: string | Date | null | undefined): string {
  if (!competenciaOrVencimento) {
    return 'fatura-mensal';
  }

  try {
    let mesIndex = 0;
    if (typeof competenciaOrVencimento === 'string') {
      // Trata strings 'YYYY-MM-DD' ou 'YYYY-MM'
      const parts = competenciaOrVencimento.split('-');
      if (parts.length >= 2) {
        mesIndex = parseInt(parts[1], 10) - 1;
      } else {
        const d = new Date(competenciaOrVencimento);
        mesIndex = isNaN(d.getTime()) ? 0 : d.getUTCMonth();
      }
    } else if (competenciaOrVencimento instanceof Date) {
      mesIndex = isNaN(competenciaOrVencimento.getTime()) ? 0 : competenciaOrVencimento.getMonth();
    }

    if (mesIndex >= 0 && mesIndex < 12) {
      return `fatura-${MESES_PORTUGUES[mesIndex]}`;
    }
  } catch (_e) {
    // fallback seguro
  }

  return 'fatura-mensal';
}

/**
 * Extrai o título do mês com acentuação e caixa alta profissional (ex: 'Fatura Julho', 'Fatura Março')
 */
export function getFaturaTitle(competenciaOrVencimento: string | Date | null | undefined): string {
  if (!competenciaOrVencimento) {
    return 'Fatura Mensal';
  }

  try {
    let mesIndex = 0;
    if (typeof competenciaOrVencimento === 'string') {
      const parts = competenciaOrVencimento.split('-');
      if (parts.length >= 2) {
        mesIndex = parseInt(parts[1], 10) - 1;
      } else {
        const d = new Date(competenciaOrVencimento);
        mesIndex = isNaN(d.getTime()) ? 0 : d.getUTCMonth();
      }
    } else if (competenciaOrVencimento instanceof Date) {
      mesIndex = isNaN(competenciaOrVencimento.getTime()) ? 0 : competenciaOrVencimento.getMonth();
    }

    if (mesIndex >= 0 && mesIndex < 12) {
      return `Fatura ${MESES_TITULO[mesIndex]}`;
    }
  } catch (_e) {
    // fallback seguro
  }

  return 'Fatura Mensal';
}

/**
 * Gera o caminho relativo humanizado da cobrança no formato:
 * /cobranca/{estabelecimento-slug}/{fatura-slug}/{codigo-cobranca}
 */
export function getHumanizedPublicBillingPath(cobranca: any): string {
  if (!cobranca) return '';

  const codigo = cobranca.codigo_operacional || cobranca.public_identifier || cobranca.id;
  if (!codigo || codigo === 'demo') return '';

  // Gate 6.7: prioriza establishment_name (canônico) e depois fallbacks legados
  const nomeEstabelecimento = cobranca.establishment_name || cobranca.cliente_nome || cobranca.clienteNome || cobranca.cliente_nome_fantasia || cobranca.cliente_razao_social || cobranca.estabelecimento || 'cliente';
  // Se RPC já forneceu establishment_slug canônico, usar diretamente (evita re-slugify divergente)
  const estabSlug = cobranca.establishment_slug ? String(cobranca.establishment_slug) : slugify(nomeEstabelecimento);

  const refDate = cobranca.competencia || cobranca.competencia_date || cobranca.competenciaDate || cobranca.vencimento || cobranca.data_vencimento || cobranca.dataVencimento;
  const faturaSlug = cobranca.invoice_month
    ? `fatura-${MESES_PORTUGUES[Math.max(0, Math.min(11, Number(cobranca.invoice_month) - 1))]}`
    : getFaturaSlug(refDate);

  return `/cobranca/${estabSlug}/${faturaSlug}/${encodeURIComponent(codigo)}`;
}

/**
 * Gera a URL pública definitiva, limpa e humanizada da cobrança para compartilhamento.
 */
export function getPublicBillingUrl(cobranca: any): string {
  const path = getHumanizedPublicBillingPath(cobranca);
  if (!path) return '';

  const origin = typeof window !== 'undefined' && window.location?.origin 
    ? window.location.origin 
    : 'https://sitesobremidia.vercel.app';

  return `${origin}${path}`;
}

// ============================================================================
// GATE 6.7 — CABEÇALHO CANÔNICO ANUNCIANTE
// ============================================================================
export const ISSUER_NAME_CANONICAL = 'Sobre Mídia Designer Ltda';
export const SERVICE_NAME_CANONICAL_ANUNCIANTE = 'Aluguel de Software de Mídia';

export interface BillingPresentation {
  issuerName: string;
  establishmentName: string;
  establishmentSlug: string;
  invoiceTitle: string;
  invoiceSlug: string;
  serviceName: string;
  billingOriginType: string;
  codigoOperacional: string;
  publicIdentifier: string;
}

/**
 * Camada de apresentação determinística — Gate 6.7
 * Resolve o cabeçalho comercial a partir dos dados canônicos da cobrança (DB/RPC)
 * Nunca inferir por descrição/texto livre. Fonte: billing_origin_type + estabelecimento + competência.
 */
export function resolveBillingPresentation(data: any): BillingPresentation {
  if (!data) {
    return {
      issuerName: ISSUER_NAME_CANONICAL,
      establishmentName: 'Cliente',
      establishmentSlug: 'estabelecimento',
      invoiceTitle: 'Fatura Mensal',
      invoiceSlug: 'fatura-mensal',
      serviceName: SERVICE_NAME_CANONICAL_ANUNCIANTE,
      billingOriginType: 'GERAL',
      codigoOperacional: '',
      publicIdentifier: '',
    };
  }

  const billingOriginType = String(data.billing_origin_type || data.billingOriginType || data.billing_owner_type || '').toUpperCase() || 'ANUNCIANTE';
  const isAnunciante = billingOriginType === 'ANUNCIANTE';

  // Estabelecimento: fonte canônica é establishment_name (RPC) ou cliente_nome (fallback Gate 6.5)
  const rawEstab = data.establishment_name || data.cliente_nome || data.clienteNome || data.empresa_nome || 'Cliente';
  // Normalizar apenas apresentação visual (sem alterar valor canônico do banco): trim + preserve case, but ensure not empty
  const establishmentName = String(rawEstab).trim() || 'Cliente';
  const establishmentSlug = data.establishment_slug ? String(data.establishment_slug) : slugify(establishmentName);

  // Mês da fatura: prioriza invoice_month (RPC estruturado) ou competencia/vencimento
  let invoiceTitle = 'Fatura Mensal';
  let invoiceSlug = 'fatura-mensal';
  if (data.invoice_month) {
    const m = Math.max(1, Math.min(12, Number(data.invoice_month)));
    if (m >= 1 && m <= 12) {
      invoiceTitle = `Fatura ${MESES_TITULO[m - 1]}`;
      invoiceSlug = `fatura-${MESES_PORTUGUES[m - 1]}`;
    }
  } else {
    const refDate = data.competencia || data.competencia_date || data.vencimento || data.data_vencimento;
    invoiceTitle = getFaturaTitle(refDate);
    invoiceSlug = getFaturaSlug(refDate);
  }

  // Serviço contratado: para ANUNCIANTE sempre canônico, nunca descrição livre
  const serviceName = isAnunciante
    ? SERVICE_NAME_CANONICAL_ANUNCIANTE
    : (data.service_name || data.servico_faturado || data.servicoFaturado || SERVICE_NAME_CANONICAL_ANUNCIANTE);

  return {
    issuerName: ISSUER_NAME_CANONICAL,
    establishmentName,
    establishmentSlug,
    invoiceTitle,
    invoiceSlug,
    serviceName: String(serviceName).trim() || SERVICE_NAME_CANONICAL_ANUNCIANTE,
    billingOriginType: isAnunciante ? 'ANUNCIANTE' : billingOriginType,
    codigoOperacional: String(data.codigo_operacional || data.public_identifier || ''),
    publicIdentifier: String(data.public_identifier || data.codigo_operacional || ''),
  };
}
