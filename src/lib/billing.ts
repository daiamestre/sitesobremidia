/**
 * Utilitários unificados para geração de URLs públicas e regras de negócio de Cobrança
 */

/**
 * Gera a URL pública definitiva e inviolável de uma cobrança.
 * @param cobranca Objeto de cobrança (conta_receber)
 * @returns string contendo a URL pública real ou string vazia se inválido
 */
export function getPublicBillingUrl(cobranca: any): string {
  if (!cobranca) return '';

  // OBRIGATÓRIO: Usar apenas o código operacional, pois o número do documento
  // pode conter barras (ex: CTR-8001/08/2026) que quebram o React Router.
  const codigo = cobranca.codigo_operacional;
  const identificador = cobranca.public_identifier;

  if (!codigo || !identificador) return '';
  if (identificador === 'demo' || codigo === 'demo') return '';

  return `${window.location.origin}/cobranca/${encodeURIComponent(codigo)}/${identificador}`;
}
