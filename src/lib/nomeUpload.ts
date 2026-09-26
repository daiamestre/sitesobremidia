/**
 * Nome gravado para cada arquivo de um envio (F-85 / OF-F81-4).
 * Um arquivo: o nome digitado. Vários: o nome digitado vira prefixo numerado na ordem da seleção
 * ("Academia 01", "Academia 02"…), em vez de todos ficarem com o mesmo nome.
 */
export function nomeParaEnvio(base: string, indice: number, total: number): string {
  const nome = base.trim();
  if (total <= 1) return nome;
  const casas = Math.max(2, String(total).length);
  return `${nome} ${String(indice + 1).padStart(casas, '0')}`;
}
