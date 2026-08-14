import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mocks principais da plataforma
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { CrmSessionProvider, useCrmSession } from '@/modules/crm/contexts/CrmSessionContext';
import { CrmSidebar } from '@/modules/crm/components/Sidebar';
import { CrmHeader } from '@/modules/crm/components/Header';
import CrmDashboardHome from '@/modules/crm/pages/CrmDashboardHome';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { propostaService } from '@/modules/crm/services/proposta.service';
import { contratoService } from '@/modules/crm/services/contrato.service';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useRbac', () => ({
  useRbac: vi.fn(),
}));

vi.mock('@/modules/crm/services/cliente.service', () => ({
  clienteService: { findAll: vi.fn().mockResolvedValue([]) }
}));

vi.mock('@/modules/crm/services/proposta.service', () => ({
  propostaService: { findAll: vi.fn().mockResolvedValue([]) }
}));

vi.mock('@/modules/crm/services/contrato.service', () => ({
  contratoService: { findAll: vi.fn().mockResolvedValue([]) }
}));

const mockSignOut = vi.fn().mockResolvedValue({ error: null });

describe('FASE 10.2.1 — Saneamento, Segurança e Regressão Anti-Mocks no CRM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: 'usr-999', email: 'mariana.ferreira@sobremidia.com.br' },
      empresaOperadoraId: 'tenant-123',
      representante: { id: 'rep-001', nome: 'Mariana Ferreira' },
      isAuthenticated: true,
      signOut: mockSignOut,
    });
    (useRbac as any).mockReturnValue({
      role: 'REPRESENTANTE',
    });
  });

  it('1. [CrmSessionContext] Deve derivar sessão real do usuário logado e não utilizar defaults fakes', () => {
    const TestConsumer = () => {
      const { userName, userEmail, userInitials, isAuthenticated } = useCrmSession();
      return (
        <div>
          <span data-testid="userName">{userName}</span>
          <span data-testid="userEmail">{userEmail}</span>
          <span data-testid="userInitials">{userInitials}</span>
          <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
        </div>
      );
    };

    render(
      <MemoryRouter>
        <CrmSessionProvider>
          <TestConsumer />
        </CrmSessionProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('userName').textContent).toBe('Mariana Ferreira');
    expect(screen.getByTestId('userEmail').textContent).toBe('mariana.ferreira@sobremidia.com.br');
    expect(screen.getByTestId('userInitials').textContent).toBe('MF');
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');

    // Validação de Regressão Anti-Mocks
    expect(screen.getByTestId('userName').textContent).not.toBe('Carlos Eduardo');
    expect(screen.getByTestId('userInitials').textContent).not.toBe('CE');
  });

  it('2. [CrmSessionContext] handleCrmLogout deve executar rotina completa destrutiva de logout', async () => {
    const TestConsumer = () => {
      const { handleCrmLogout } = useCrmSession();
      return <button onClick={handleCrmLogout}>Encerrar Sessão</button>;
    };

    render(
      <MemoryRouter>
        <CrmSessionProvider>
          <TestConsumer />
        </CrmSessionProvider>
      </MemoryRouter>
    );

    const btn = screen.getByText('Encerrar Sessão');
    await userEvent.click(btn);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('3. [Regressão Anti-Mocks no Sidebar] Não deve conter Carlos Eduardo, nem CE', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <CrmSessionProvider>
            <CrmSidebar />
          </CrmSessionProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.queryByText(/Carlos Eduardo/i)).toBeNull();
    expect(screen.queryByText(/^CE$/)).toBeNull();
    expect(screen.getByText('Mariana Ferreira')).toBeInTheDocument();
    expect(screen.getByText('Representante Comercial')).toBeInTheDocument();
  });

  it('4. [Regressão Anti-Mocks no Header] Não deve exibir avatar fixo CE', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <CrmSessionProvider>
            <CrmHeader />
          </CrmSessionProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.queryByText(/^CE$/)).toBeNull();
    expect(screen.queryByText(/Carlos Eduardo/i)).toBeNull();
    expect(screen.getByText('MF')).toBeInTheDocument();
  });

  it('5. [Dashboard & Empty State] Deve exibir EmptyDashboard quando houver 0 clientes, propostas e contratos, sem renderizar números fakes 142.800 ou 32 Ativos', async () => {
    render(
      <MemoryRouter>
        <CrmSessionProvider>
          <CrmDashboardHome />
        </CrmSessionProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Bem-vindo ao CRM, Mariana Ferreira!/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Ainda não existem clientes ativamente cadastrados/i)).toBeInTheDocument();

    // Verificação estrita de ausência dos MOCKS problemáticos apontados pelo usuário
    expect(screen.queryByText(/142\.800/)).toBeNull();
    expect(screen.queryByText(/32 Ativos/i)).toBeNull();
    expect(screen.queryByText(/7\.410,00/)).toBeNull();
    expect(screen.queryByText(/Carlos Eduardo/)).toBeNull();
  });

  it('6. [Dashboard] Deve renderizar totais reais quando os serviços retornarem dados válidos', async () => {
    (clienteService.findAll as any).mockResolvedValue([
      { id: 'c-1', status: 'ACTIVE', empresas: [{ nome_fantasia: 'Empresa Real 1' }] },
      { id: 'c-2', status: 'PROSPECT', empresas: [{ nome_fantasia: 'Empresa Real 2' }] }
    ]);

    (propostaService.findAll as any).mockResolvedValue([
      { id: 'p-1', valor_final: 10000 },
      { id: 'p-2', valor_final: 15000 }
    ]);

    (contratoService.findAll as any).mockResolvedValue([
      { id: 'ctr-1', valor_mensal: 5000, status_documento: 'Vigente', cliente: { empresa: { nome_fantasia: 'Empresa Real 1' } } }
    ]);

    render(
      <MemoryRouter>
        <CrmSessionProvider>
          <CrmDashboardHome />
        </CrmSessionProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Bem-vindo ao CRM, Mariana Ferreira!/i)).toBeNull();
    });

    // Prova que exibiu métrica real calculada: 10.000 + 15.000 = 25.000 (R$ 25.000,00)
    expect(screen.getAllByText(/R\$ 25\.000,00/)[0]).toBeInTheDocument();
    
    // Prova que exibiu contagem de 1 Contrato Ativo ao invés do mock "32 Ativos"
    expect(screen.getByText('1 Ativos')).toBeInTheDocument();
    expect(screen.queryByText(/32 Ativos/i)).toBeNull();
    expect(screen.queryByText(/142\.800/)).toBeNull();
  });
});
