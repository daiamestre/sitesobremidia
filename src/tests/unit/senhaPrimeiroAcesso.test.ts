import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-104 — senha do primeiro acesso: a senha salva tem de ser a digitada e funcionar no próximo login.
const ler = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), 'utf8');

describe('Troca de senha do primeiro acesso (F-104)', () => {
  const troca = ler('src', 'pages', 'ChangePassword.tsx');
  const login = ler('src', 'pages', 'Auth.tsx');

  it('campos de senha sem maiúscula/correção automática do teclado (celular/tablet)', () => {
    expect((troca.match(/autoCapitalize="none"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((troca.match(/autoCorrect="off"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(login).toMatch(/id="login-password"[\s\S]{0,200}autoCapitalize="none"/);
  });

  it('informa ao navegador a conta (username) para substituir a senha temporária salva', () => {
    expect(troca).toContain('autoComplete="username"');
    expect(login).toMatch(/id="login-email"[\s\S]{0,120}autoComplete="username"/);
    expect(login).toMatch(/id="login-password"[\s\S]{0,120}autoComplete="current-password"/);
  });

  it('prova a senha nova com login real ANTES de concluir a troca', () => {
    const iUpdate = troca.indexOf('supabase.auth.updateUser({ password: novaSenha })');
    const iProva = troca.indexOf('signInWithPassword({ email: emailConta, password: novaSenha })');
    const iConcluir = troca.indexOf("rpc('concluir_troca_senha_obrigatoria')");
    expect(iUpdate).toBeGreaterThan(0);
    expect(iProva).toBeGreaterThan(iUpdate);
    expect(iConcluir).toBeGreaterThan(iProva);
  });

  it('login usa o e-mail sem espaços e em minúsculas', () => {
    expect(login).toContain('signIn(loginEmail.trim().toLowerCase(), loginPassword)');
  });
});
