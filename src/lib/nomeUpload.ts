/**
 * Nome gravado para cada arquivo de um envio (F-85 / OF-F81-4, F-161).
 *
 * F-161: o campo "Nome" se preenche SOZINHO com o nome do próprio arquivo (sem a extensão) — vídeo, imagem e áudio.
 *  - Nome não mexido pela pessoa: cada arquivo é salvo com o seu próprio nome (envio de vários também).
 *  - Nome digitado/alterado: um arquivo usa o nome digitado; vários usam o nome como prefixo numerado na ordem
 *    da seleção ("Academia 01", "Academia 02"…), em vez de todos ficarem com o mesmo nome.
 */
export const NOME_MAXIMO = 120;

/** "Promoção_Verão.final.MP4" -> "Promoção_Verão.final" (só a última extensão sai; nome sem ponto fica igual). */
export function nomeDoArquivo(arquivo: string): string {
  const limpo = String(arquivo ?? '').replace(/^.*[\\/]/, '').trim();
  const semExtensao = limpo.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return (semExtensao || limpo).replace(/\s+/g, ' ').trim().slice(0, NOME_MAXIMO);
}

export function nomeParaEnvio(base: string, indice: number, total: number): string {
  const nome = base.trim();
  if (total <= 1) return nome;
  const casas = Math.max(2, String(total).length);
  return `${nome} ${String(indice + 1).padStart(casas, '0')}`;
}

/** Nome final de um arquivo do envio (nunca vazio). */
export function nomeFinalDoArquivo(o: { digitado: string; alterado: boolean; arquivo: string; indice: number; total: number }): string {
  const proprio = nomeDoArquivo(o.arquivo) || o.arquivo;
  if (!o.alterado) return proprio;
  return nomeParaEnvio(o.digitado, o.indice, o.total) || proprio;
}
