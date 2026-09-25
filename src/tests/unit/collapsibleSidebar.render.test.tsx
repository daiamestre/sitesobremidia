import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const stableAuth = {
  user: { id: 'u1', email: 'a@b.com', name: 'Anunciante Teste' },
  usuario: { cargo: 'Anunciante', cliente_id: 'c1', nome: 'Anunciante Teste' },
  signOut: vi.fn(),
};
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => stableAuth }));
vi.mock('@/hooks/useCentral', () => ({ useCentralUnread: () => ({ total: 3 }) }));
vi.mock('@/modules/crm/hooks/useClienteModalidade', () => ({
  useClienteModalidade: () => ({ modalidade: 'ANUNCIANTE', cliente: { nome_fantasia: 'Cliente X' }, isLoading: false, hasActiveContract: true }),
}));

import CustomerPortalLayout from '@/modules/crm/layout/CustomerPortalLayout';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <Routes>
        <Route path="/portal" element={<CustomerPortalLayout />}>
          <Route index element={<div>conteudo</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const desktopAside = (container: HTMLElement) =>
  [...container.querySelectorAll('aside')].find((a) => a.className.includes('xl:flex')) as HTMLElement;

describe('Menu lateral recolhível (Fase 1 — responsividade)', () => {
  beforeEach(() => localStorage.clear());

  it('Portal: menu fixo só a partir de 1280 px; abaixo disso o botão ☰ abre por cima', () => {
    const { container } = renderPortal();
    const aside = desktopAside(container);
    expect(aside.className).toContain('hidden xl:flex');
    expect(aside.className).toContain('w-64');
    expect(screen.getByRole('button', { name: 'Menu' }).className).toContain('xl:hidden');
  });

  it('Portal: recolher deixa só os ícones (com dica) e a escolha fica guardada', () => {
    const { container, unmount } = renderPortal();
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu lateral' }));
    const aside = desktopAside(container);
    expect(aside.className).toContain('w-[72px]');
    expect(aside.querySelector('a[title="Minhas Campanhas"]')).not.toBeNull();
    expect([...aside.querySelectorAll('span.truncate')].length).toBe(0);
    unmount();

    // recarregou: continua recolhido
    const again = renderPortal();
    expect(desktopAside(again.container).className).toContain('w-[72px]');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu lateral' }));
    expect(desktopAside(again.container).className).toContain('w-64');
  });

  it('useSidebarCollapsed: cada layout tem a sua escolha', () => {
    localStorage.setItem('sidebar-collapsed:workspace', '1');
    let ws = false, crm = true;
    function Probe() {
      [ws] = useSidebarCollapsed('workspace');
      [crm] = useSidebarCollapsed('crm');
      return null;
    }
    render(<Probe />);
    expect(ws).toBe(true);
    expect(crm).toBe(false);
  });
});
