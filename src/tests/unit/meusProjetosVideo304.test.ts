/**
 * F-304 (pedido do dono, 12/11/2026):
 * - a Biblioteca de Loop é só de owner/ADM (os outros usuários gravam os próprios vídeos);
 * - depois de criar o vídeo, o usuário decide: Salvar em Meus Projetos · Salvar e publicar numa tela · Baixar no aparelho;
 * - em Meus Projetos aparece o vídeo pronto (capa) com Continuar editando e Baixar no aparelho.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('F-304: Meus Projetos e Biblioteca de Loop', () => {
  it('Biblioteca de Loop só para owner/ADM (menu e página)', () => {
    const menu = fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8');
    expect(menu).toContain("...(interno ? [{ nome: 'Biblioteca de Loop', to: '/studio/biblioteca-de-loop', icone: Repeat }] : [])");
    expect(menu).toContain('interno={saldo.data?.paga === false}');
    const pagina = fs.readFileSync('src/pages/studioai/BibliotecaDeLoopPage.tsx', 'utf8');
    expect(pagina).toContain('if (saldo.data?.paga !== false) return <Navigate to="/studio" replace />;');
  });
  it('depois de criar o vídeo: Salvar em Meus Projetos, Salvar e publicar numa tela, Baixar no aparelho', () => {
    const editor = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(editor).toContain('data-testid="video-salvar-projetos"');
    expect(editor).toContain('data-testid="video-salvar-publicar"');
    expect(editor).toContain('data-testid="video-baixar"');
    expect(editor).toContain('dados: { ...(p as unknown as Record<string, unknown>), videoPronto: pronto }');
    expect(editor).toContain('setPublicando(true);');
    expect(editor).not.toContain('>Salvar na galeria</button>');
  });
  it('Meus Projetos mostra o vídeo pronto e deixa baixar', () => {
    const projetos = fs.readFileSync('src/pages/studioai/ProjetosPage.tsx', 'utf8');
    expect(projetos).toContain('vídeo pronto');
    expect(projetos).toContain('data-testid="projeto-baixar"');
  });
});
