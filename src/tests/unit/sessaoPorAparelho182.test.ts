/**
 * F-182 — o login é por aparelho: sair (ou ser barrado) no painel NÃO pode derrubar o login dos Players da mesma conta.
 * O `signOut()` do Supabase, sem escopo, encerra a sessão em TODOS os aparelhos.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === 'tests' || nome === 'node_modules') continue;
      arquivos(p, saida);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(p);
  }
  return saida;
}

describe('F-182 · login em vários aparelhos', () => {
  it('todo "sair" do painel encerra só a sessão deste aparelho', () => {
    const chamadas: string[] = [];
    for (const arq of arquivos('src')) {
      const texto = readFileSync(arq, 'utf8');
      for (const m of texto.matchAll(/auth\.signOut\(([^)]*)\)/g)) chamadas.push(`${arq}: signOut(${m[1].trim()})`);
    }
    expect(chamadas.length).toBeGreaterThanOrEqual(6);
    for (const c of chamadas) {
      // "local" = só este aparelho; "others" = o botão manual "encerrar outras sessões" do perfil
      expect(c, `signOut sem escopo derruba todos os aparelhos: ${c}`).toMatch(/scope: 'local'|scope: 'others'/);
    }
  });

  it('o botão "Sair", o vigia de "lembrar acesso" e as recusas de acesso usam o escopo local', () => {
    expect(readFileSync('src/contexts/AuthContext.tsx', 'utf8').match(/signOut\(\{ scope: 'local' \}\)/g)).toHaveLength(4);
    expect(readFileSync('src/components/auth/VigiaDeAcessoSemLembrar.tsx', 'utf8')).toContain("signOut({ scope: 'local' })");
    expect(readFileSync('src/pages/Auth.tsx', 'utf8')).toContain("signOut({ scope: 'local' })");
  });

  it('"encerrar outras sessões" continua sendo uma ação manual e explícita do perfil', () => {
    const texto = readFileSync('src/services/perfil.service.ts', 'utf8');
    expect(texto).toContain("scope: 'others'");
    const quem = arquivos('src').filter((a) => readFileSync(a, 'utf8').includes('encerrarOutrasSessoes()') && !a.endsWith('perfil.service.ts'));
    expect(quem.map((q) => q.replace(/\\/g, '/'))).toEqual(['src/components/perfil/MeuPerfilBase.tsx']);
  });
});
