import { describe, it, expect } from 'vitest';
import { MIN_SENHA, validarSenhaNova, forcaSenha } from '@/lib/passwordPolicy';

/**
 * BUG P0 — contrato único de senha (primeiro acesso).
 * Regra efetiva = Supabase Auth: mínimo 6 caracteres, sem classes obrigatórias.
 * FORÇA é informativa e NUNCA bloqueia.
 */

describe('passwordPolicy — VALIDADE', () => {
  it('MIN_SENHA é 6 (contrato Supabase Auth)', () => {
    expect(MIN_SENHA).toBe(6);
  });

  // ---- VÁLIDAS: exatamente 6 caracteres em combinações diversas ----
  const validas = [
    ['abc123', 'letras+números'],
    ['abcdef', 'só letras'],
    ['123456', 'só números'],
    ['a1!a1!', 'com especiais'],
    ['senha!', 'letras+especial'],
    ['1a2b3c', 'intercalada'],
    ['ab cd1', 'espaço interno'],
    ['ÁéÍóú1', 'unicode'],
    ['abc123def0', '10 caracteres'],
    ['Abc123!@#$x', '12 caracteres complexas'],
  ] as const;

  it.each(validas)('aceita "%s" (%s)', (senha) => {
    const r = validarSenhaNova(senha);
    expect(r.valida).toBe(true);
    expect(r.motivo).toBeUndefined();
  });

  // ---- INVÁLIDAS ----
  const invalidas: Array<[string, string]> = [
    ['', 'vazia'],
    ['a', '1 char'],
    ['abc12', '5 chars'],
    ['     ', 'só espaços'],
    [' abc123', 'espaço inicial'],
    ['abc123 ', 'espaço final'],
  ];

  it.each(invalidas)('rejeita "%s" (%s)', (senha) => {
    const r = validarSenhaNova(senha);
    expect(r.valida).toBe(false);
    expect(r.motivo).toBeTruthy();
  });
});

describe('passwordPolicy — FORÇA (informativa, nunca bloqueia)', () => {
  it('senha válida de 6 caracteres simples é VÁLIDA mesmo sendo "fraca"/"média"', () => {
    const r = validarSenhaNova('abc123');
    expect(r.valida).toBe(true); // validade independe da força
    expect(['fraca', 'média']).toContain(forcaSenha('abc123').rotulo);
  });

  it('barra nunca impede: força não participa da validação', () => {
    // força máxima ≠ requisito; força mínima ≠ rejeição
    const fraca = validarSenhaNova('654321');
    const forte = validarSenhaNova('Xk9$mPq2#wL5@Zn8');
    expect(fraca.valida).toBe(true);
    expect(forte.valida).toBe(true);
  });

  it('escala crescente: vazia < simples < média < forte', () => {
    const s = (v: string) => forcaSenha(v).score;
    expect(s('')).toBeLessThanOrEqual(s('abc123'));
    expect(s('abc123')).toBeLessThan(s('abcdefgh12'));
    expect(s('abcdefgh12')).toBeLessThan(s('Abcdefgh12!'));
  });

  it('rótulos pertencem ao conjunto fechado', () => {
    for (const v of ['', 'abc123', 'abcdefgh12', 'Abcdefgh12!']) {
      expect(['fraca', 'média', 'forte']).toContain(forcaSenha(v).rotulo);
    }
  });
});
