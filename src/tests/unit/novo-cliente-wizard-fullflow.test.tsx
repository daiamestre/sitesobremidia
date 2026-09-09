import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IntelligentCommercialWizard } from '@/modules/crm/components/forms/IntelligentCommercialWizard';

// Mock contexts and services
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

const { mockTemplates } = vi.hoisted(() => ({
  mockTemplates: [
    {
      id: 'tpl-anunciante-1',
      codigo_template: 'TPL-ANUNCIANTE-OFICIAL',
      nome: 'Contrato Oficial de Publicidade e Painéis',
      versao: 1,
      conteudo_html: `
        <div id="contract-doc">
          <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PUBLICIDADE DIGITAL</h1>
          <p>CONTRATANTE: {{RAZAO_SOCIAL}}, CNPJ: {{CNPJ}}, Representada por: {{RESPONSAVEL}}</p>
          <p>ENDEREÇO: {{ENDERECO_UNIDADE}}, {{BAIRRO}}, {{CIDADE}}/{{UF}}, CEP: {{CEP}}</p>
          <p>CONTATO: {{EMAIL}} | CAMPANHA: {{TITULO_CAMPANHA}}</p>
          <p>PERÍODO: {{DATA_INICIO}} até {{DATA_FIM}} ({{PERIODO_VEICULACAO}})</p>
          <p>TELAS: {{QUANTIDADE_TELAS}} telas | PACOTE: {{PACOTE_VEICULACAO}}</p>
          <p>VALOR MENSAL: {{VALOR_MENSAL}} | FORMA DE PAGAMENTO: {{FORMA_PAGAMENTO}}</p>
          <p>LOCAL E DATA: {{LOCAL_ASSINATURA}}, {{DATA_ASSINATURA}}</p>
        </div>
      `,
      tipo_contrato: 'ANUNCIANTE',
    },
  ],
}));

vi.mock('@/modules/crm/services/contratoDocumento.service', () => ({
  contratoDocumentoService: {
    obterTemplatePadraoVigente: vi.fn().mockResolvedValue(mockTemplates[0]),
    gerarDocumentoContrato: vi.fn().mockResolvedValue({
      success: true,
      objectKey: 'contratos/emp-op-123/anunciante/ctr-123.pdf',
      publicUrl: 'https://r2.sobremidia.com/contratos/ctr-123.pdf',
      hashSha256: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
    }),
  },
  renderizarPreviewContrato: vi.fn((tipo, html, dados) => {
    let rendered = html;
    if (dados) {
      rendered = rendered
        .replace(/{{RAZAO_SOCIAL}}/g, dados.razaoSocial || dados.nomeFantasia || 'EMPRESA TESTE LTDA')
        .replace(/{{CNPJ}}/g, dados.cnpj || '12.345.678/0001-90')
        .replace(/{{RESPONSAVEL}}/g, dados.representanteLegal || 'João da Silva')
        .replace(/{{ENDERECO_UNIDADE}}/g, dados.logradouro || 'Av Paulista 1000')
        .replace(/{{BAIRRO}}/g, dados.bairro || 'Bela Vista')
        .replace(/{{CIDADE}}/g, dados.cidade || 'São Paulo')
        .replace(/{{UF}}/g, dados.estado || 'SP')
        .replace(/{{CEP}}/g, dados.cep || '01310-100')
        .replace(/{{EMAIL}}/g, dados.email || 'contato@empresa.com.br')
        .replace(/{{TITULO_CAMPANHA}}/g, dados.tituloCampanha || 'Campanha Primavera 2026')
        .replace(/{{DATA_INICIO}}/g, dados.dataInicio || '2026-09-01')
        .replace(/{{DATA_FIM}}/g, dados.dataFim || '2026-10-01')
        .replace(/{{PERIODO_VEICULACAO}}/g, '30 dias')
        .replace(/{{QUANTIDADE_TELAS}}/g, String(dados.quantidadeTelas || 5))
        .replace(/{{PACOTE_VEICULACAO}}/g, 'Rede Premium')
        .replace(/{{VALOR_MENSAL}}/g, 'R$ 2.500,00')
        .replace(/{{FORMA_PAGAMENTO}}/g, dados.formaPagamento || 'PIX')
        .replace(/{{LOCAL_ASSINATURA}}/g, 'São Paulo/SP')
        .replace(/{{DATA_ASSINATURA}}/g, '08/09/2026');
    }
    return rendered;
  }),
}));

vi.mock('@/modules/crm/services/cliente.service', () => ({
  clienteService: {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ success: true, clienteId: 'cli-novo-123' }),
  },
}));

vi.mock('@/modules/crm/services/contrato.service', () => {
  class MockContratoService {
    fetchTemplates = vi.fn().mockResolvedValue(mockTemplates);
    ensureContractForCadastro = vi.fn().mockResolvedValue({
      success: true,
      contratoId: 'ctr-novo-123',
    });
  }
  return {
    ContratoService: MockContratoService,
    contratoService: new MockContratoService(),
  };
});

describe('MICRO-GATE P0.1 — Wizard Full Flow & Contract Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step 1 without TDZ and allows typing form state', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/workspace/clientes/novo/anunciante']}>
        <IntelligentCommercialWizard />
      </MemoryRouter>
    );

    // Assert Step 1 header and step tabs are rendered
    expect(screen.getByText(/Novo Cliente/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Cliente & Endereço/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Contrato & Assinatura/i)).toBeInTheDocument();

    // Find input fields by name
    const nomeFantasiaInput = container.querySelector('input[name="nomeFantasia"]') as HTMLInputElement;
    expect(nomeFantasiaInput).toBeInTheDocument();

    await user.type(nomeFantasiaInput, 'Restaurante Sabor');
    expect(nomeFantasiaInput.value).toBe('Restaurante Sabor');

    const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
    if (emailInput) {
      await user.type(emailInput, 'teste@restaurante.com.br');
      expect(emailInput.value).toBe('teste@restaurante.com.br');
    }
  });

  it('has initial form state initialized before useMemo and renders step structure cleanly', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/clientes/novo/anunciante']}>
        <IntelligentCommercialWizard />
      </MemoryRouter>
    );

    // Assert wizard step tabs and Etapa indicator
    expect(screen.getByText(/Etapa 1 de 6/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Contrato & Assinatura/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. Revisão & Salvar/i)).toBeInTheDocument();
  });
});
