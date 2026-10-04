/**
 * F-135 — Exclusão honesta.
 * O banco não devolve erro quando a regra de acesso impede a exclusão: ele só apaga 0 linhas. Antes o painel dizia
 * "excluído" mesmo assim. Todas as exclusões passam a conferir quantas linhas saíram e a traduzir os erros comuns.
 */
export const NADA_EXCLUIDO = 'Nada foi excluído: você não tem permissão para excluir este item ou ele já foi removido.';

type ErroDoBanco = { code?: string; message?: string; details?: string } | null | undefined;

/** Mensagem clara, em português, para um erro de exclusão. */
export function mensagemDeExclusao(erro: ErroDoBanco | Error | unknown): string {
  const e = (erro || {}) as { code?: string; message?: string };
  const texto = String(e.message || '');
  if (e.code === '23503' || /violates foreign key|foreign key constraint/i.test(texto)) {
    return 'Este item está em uso em outro lugar do sistema e não pode ser excluído agora. Retire-o de onde está sendo usado e tente de novo.';
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(texto)) {
    return 'Você não tem permissão para excluir este item.';
  }
  return texto || 'Não foi possível excluir. Tente novamente.';
}

/** Lança erro se o banco recusou ou se nenhuma linha foi apagada. Use com `.delete({ count: 'exact' })`. */
export function conferirExclusao(resultado: { error: ErroDoBanco; count?: number | null }): void {
  if (resultado.error) throw new Error(mensagemDeExclusao(resultado.error));
  if (resultado.count === 0) throw new Error(NADA_EXCLUIDO);
}
