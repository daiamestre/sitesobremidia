import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// F-170 — olhinho da senha e "Lembrar acesso" em todos os logins, cartões menores, menu do Owner/ADM que não troca, Painel Principal.
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const rbac = vi.hoisted(() => ({ isOwner: true, isAdmin: false }));
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ ...rbac }) }));
vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 0 }) }));
vi.mock('@/services/corporateUsers.service', () => ({ corporateUsersService: { getMyPermissions: () => Promise.resolve([]) } }));
vi.mock('@/modules/crm/contexts/CrmSessionContext', () => ({
  useCrmSession: () => ({ userName: 'Sobre Mídia ADM', userEmail: 'a@b.com', userInitials: 'SA', userCargo: 'Administrador Geral', handleCrmLogout: vi.fn(), isLoggingOut: false }),
}));

import { CampoDeSenha } from '@/components/auth/CampoDeSenha';
import { CrmSidebar } from '@/modules/crm/components/Sidebar';
import { areaDoCrm } from '@/lib/areaDoCrm';
import { registrarLembrarAcesso, deveEncerrarSessaoEsquecida, limparMarcaDeAcessoTemporario } from '@/lib/lembrarAcesso';

beforeEach(() => { rbac.isOwner = true; rbac.isAdmin = false; limparMarcaDeAcessoTemporario(); });

describe('Olhinho da senha', () => {
  it('mostra e oculta a senha digitada', () => {
    let valor = 'segredo123';
    const { rerender } = render(<CampoDeSenha id="s" value={valor} onChange={(v) => { valor = v; }} />);
    const campo = document.getElementById('s') as HTMLInputElement;
    expect(campo.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campo.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(campo.type).toBe('password');
    rerender(<CampoDeSenha id="s" value={valor} onChange={() => undefined} />);
  });
  it('o olhinho é botão que não envia o formulário', () => {
    render(<form onSubmit={(e) => { e.preventDefault(); throw new Error('enviou'); }}><CampoDeSenha id="s2" value="" onChange={() => undefined} /></form>);
    expect(() => fireEvent.click(screen.getByTestId('olhinho-s2'))).not.toThrow();
  });
});

describe('Todos os logins têm olhinho e "Lembrar acesso"', () => {
  const auth = ler('src/pages/Auth.tsx');
  const rep = ler('src/pages/representantes/RepresentantesAuth.tsx');
  it('nenhum campo de senha dos logins é um input cru', () => {
    for (const [nome, src] of [['Auth', auth], ['RepresentantesAuth', rep], ['ResetPassword', ler('src/pages/ResetPassword.tsx')]] as const) {
      expect(src, nome).toContain('<CampoDeSenha');
      expect(src, nome).not.toMatch(/type="password"/);
    }
  });
  it('"Lembrar acesso" aparece em todos os cartões de entrada e vale de verdade', () => {
    expect(auth).toContain('Lembrar acesso');
    expect(auth).toContain('registrarLembrarAcesso(lembrarAcesso)');
    expect(rep).toContain('Lembrar acesso');
    expect(rep).toContain('registrarLembrarAcesso(rememberMe)');
    expect(ler('src/App.tsx')).toContain('<VigiaDeAcessoSemLembrar />');
  });
  it('sem "Lembrar acesso", fechar o navegador encerra a sessão; com ele, não', () => {
    registrarLembrarAcesso(true);
    expect(deveEncerrarSessaoEsquecida()).toBe(false);
    registrarLembrarAcesso(false); // entrou sem lembrar (cookie de "navegador aberto" ativo)
    expect(deveEncerrarSessaoEsquecida()).toBe(false);
    document.cookie = 'sm_navegador_aberto=; path=/; max-age=0'; // navegador fechado e aberto de novo
    expect(deveEncerrarSessaoEsquecida()).toBe(true);
    limparMarcaDeAcessoTemporario();
    expect(deveEncerrarSessaoEsquecida()).toBe(false);
  });
});

describe('Cartões de login voltam ao tamanho pequeno', () => {
  it('todo cartão de entrada/recuperação tem largura máxima própria (a regra global ".flex > *" esticava o cartão)', () => {
    for (const arq of ['src/pages/Auth.tsx', 'src/pages/representantes/RepresentantesAuth.tsx', 'src/pages/ForgotPassword.tsx', 'src/pages/ResetPassword.tsx', 'src/pages/ChangePassword.tsx']) {
      const src = ler(arq);
      const cartoes = src.match(/<Card [^>]*max-w-md/g) ?? [];
      expect(cartoes.length, arq).toBeGreaterThan(0);
      for (const c of cartoes) expect(c, arq).toContain("style={{ maxWidth: '28rem' }}");
    }
  });
});

describe('Menu do Owner/ADM não troca na Central de Cobranças', () => {
  it('areaDoCrm', () => {
    expect(areaDoCrm('/financeiro/cobrancas', true)).toBe('/workspace');
    expect(areaDoCrm('/workspace/corporate', false)).toBe('/workspace');
    expect(areaDoCrm('/representantes/dashboard', true)).toBe('/representantes');
    expect(areaDoCrm('/financeiro/cobrancas', false)).toBe('/representantes');
  });

  function menu(pathname: string) {
    return render(<MemoryRouter initialEntries={[pathname]}><CrmSidebar /></MemoryRouter>);
  }
  it('Owner em /financeiro/cobrancas vê o MESMO menu completo do painel principal', () => {
    menu('/financeiro/cobrancas');
    for (const item of ['Gestor de Mídias', 'Representantes', 'Pontos Parceiros', 'Gestão de Contratos', 'Valor da Mídia para Anunciantes', 'Central de Cobranças']) {
      expect(screen.getByText(item), item).toBeTruthy();
    }
  });
  it('ADM também; e o menu é igual ao de /workspace', () => {
    rbac.isOwner = false; rbac.isAdmin = true;
    const { unmount } = menu('/financeiro/cobrancas');
    const nomes = (c: HTMLElement) => [...c.querySelectorAll('a')].map((a) => a.textContent?.trim());
    const emFinanceiro = nomes(document.body);
    unmount();
    menu('/workspace/corporate');
    expect(nomes(document.body)).toEqual(emFinanceiro);
  });
  it('representante continua com o menu de representantes', () => {
    rbac.isOwner = false; rbac.isAdmin = false;
    menu('/financeiro/cobrancas');
    expect(screen.queryByText('Gestor de Mídias')).toBeNull();
    expect(screen.queryByText('Valor da Mídia para Anunciantes')).toBeNull();
  });
});

describe('Gestor de Mídias do Owner/ADM e o código da empresa', () => {
  const dash = ler('src/components/dashboard/Sidebar.tsx');
  it('Painel Principal acima do Dashboard, só para Owner/ADM', () => {
    expect(dash).toContain("label: 'Painel Principal', path: '/workspace/corporate'");
    expect(dash.indexOf("label: 'Painel Principal'")).toBeLessThan(dash.indexOf('...menuItems,'));
    expect(dash).toContain('podeTelasParceiras ? [{ icon: Building2');
  });
  it('nenhum menu mostra o código interno da empresa', () => {
    expect(dash).not.toContain('profile.company_name');
    expect(dash).toContain('rotuloDoPerfil(perfilNome, isOwner)');
    expect(ler('src/contexts/AuthContext.tsx')).toContain('        company_name: null,');
    expect(ler('src/components/perfil/MeuPerfilBase.tsx')).not.toContain("{usuario?.empresa_operadora_id || '—'}");
  });
});
