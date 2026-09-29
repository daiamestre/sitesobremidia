import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// F-113: o assistente busca as telas dos pontos (useQuery) — monta com o provedor de dados, como o site.
const Provedor = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
import { IntelligentCommercialWizard } from '@/modules/crm/components/forms/IntelligentCommercialWizard';
import NovoClienteWizardPage from '@/modules/crm/pages/NovoClienteWizardPage';

// Mocks
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'usr-test-123', email: 'owner@sobremidia.com.br' },
    empresaOperadoraId: 'emp-op-123',
    representante: { id: 'rep-123' },
    isOwner: true,
    perfilNome: 'OWNER',
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/modules/crm/services/cliente.service', () => ({
  clienteService: {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true, clienteId: 'cli-123' }),
  },
}));

vi.mock('@/modules/crm/services/contrato.service', () => {
  class MockContratoService {
    fetchTemplates = vi.fn().mockResolvedValue([]);
    ensureContractForCadastro = vi.fn().mockResolvedValue({ success: true, contratoId: 'ctr-123' });
  }
  return {
    ContratoService: MockContratoService,
    contratoService: new MockContratoService(),
  };
});

vi.mock('@/modules/crm/services/contratoDocumento.service', () => ({
  contratoDocumentoService: {
    obterTemplatePadraoVigente: vi.fn().mockResolvedValue({
      id: 'tpl-123',
      codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
      nome: 'Contrato Oficial',
      versao: 1,
      conteudo_html: '<p>Contrato</p>',
      tipo_contrato: 'ANUNCIANTE',
    }),
    gerarDocumentoContrato: vi.fn().mockResolvedValue({ success: true, objectKey: 'obj-key' }),
  },
  renderizarPreviewContrato: vi.fn().mockReturnValue('<p>Contrato Renderizado</p>'),
}));

describe('P0 Regression Defense — Wizard Component Initialization & TDZ Prevention', () => {
  it('instantiates IntelligentCommercialWizard without ReferenceError (TDZ)', () => {
    expect(() => {
      render(
        <Provedor><MemoryRouter initialEntries={['/workspace/clientes/novo/anunciante']}>
          <IntelligentCommercialWizard />
        </MemoryRouter></Provedor>
      );
    }).not.toThrow();

    // Verify wizard rendered step 1 header
    expect(screen.getByText(/Novo Cliente/i)).toBeInTheDocument();
  });

  it('renders NovoClienteWizardPage cleanly and exposes initial form fields', () => {
    const { container } = render(
      <Provedor><MemoryRouter initialEntries={['/workspace/clientes/novo/anunciante']}>
        <NovoClienteWizardPage />
      </MemoryRouter></Provedor>
    );

    expect(container).toBeDefined();
    // Inputs are mounted with initial empty values from formData state
    const nomeInput = container.querySelector('input[name="nomeFantasia"]');
    expect(nomeInput).toBeInTheDocument();
  });
});
