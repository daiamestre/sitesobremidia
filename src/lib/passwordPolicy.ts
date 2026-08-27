/**
 * SOBRE MÍDIA — Contrato único de política de senhas
 *
 * FONTE DA VERDADE: Supabase Auth (GoTrue)
 *   password_min_length        = 6
 *   password_required_characters = null  (nenhuma classe obrigatória)
 *   security_update_password_require_current_password = false
 *
 * REGRA: frontend e backend usam EXATAMENTE este contrato.
 * A FORÇA da senha é apenas informativa e NUNCA bloqueia o envio
 * (separação explícita entre VALIDADE e FORÇA — bug P0 do primeiro acesso).
 */

export const MIN_SENHA = 6;

export interface ResultadoValidacaoSenha {
  valida: boolean;
  /** Mensagem pronta para exibição quando inválida */
  motivo?: string;
}

/**
 * Validação EFETIVA (idêntica ao que o GoTrue aceitará).
 * Regras:
 *   - mínimo de MIN_SENHA caracteres;
 *   - sem espaços nas extremidades (erro comum de digitação/colagem);
 *   - quaisquer caracteres são aceitos (letras, números, símbolos, unicode).
 */
export function validarSenhaNova(senha: string): ResultadoValidacaoSenha {
  if (!senha || senha.length === 0) {
    return { valida: false, motivo: 'Informe a nova senha.' };
  }
  if (senha.length < MIN_SENHA) {
    return { valida: false, motivo: `A senha deve ter pelo menos ${MIN_SENHA} caracteres.` };
  }
  if (senha !== senha.trim()) {
    return { valida: false, motivo: 'A senha não pode começar nem terminar com espaços.' };
  }
  return { valida: true };
}

export type ForcaRotulo = 'fraca' | 'média' | 'forte';

export interface ForcaSenha {
  score: number; // 0..4
  rotulo: ForcaRotulo;
  cor: 'bg-rose-500' | 'bg-amber-500' | 'bg-emerald-500';
}

/**
 * Força INFORMATIVA — nunca usada como critério de validade.
 * 0-1 fraca · 2-3 média · 4 forte
 */
export function forcaSenha(senha: string): ForcaSenha {
  if (!senha) return { score: 0, rotulo: 'fraca', cor: 'bg-rose-500' };

  let score = 0;
  if (senha.length >= MIN_SENHA) score++;
  if (senha.length >= 10) score++;
  if (/[a-z]/i.test(senha) && /\d/.test(senha)) score++;
  if (/[^A-Za-z0-9]/.test(senha)) score++;

  const rotulo: ForcaRotulo = score <= 1 ? 'fraca' : score <= 3 ? 'média' : 'forte';
  const cor = score <= 1 ? 'bg-rose-500' : score <= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  return { score, rotulo, cor };
}
