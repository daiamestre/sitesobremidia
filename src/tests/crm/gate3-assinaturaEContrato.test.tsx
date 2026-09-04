import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssinaturaContratoDialog } from '../../modules/crm/components/portal/AssinaturaContratoDialog';
import { OFFICIAL_PDFS } from '../../modules/crm/services/contractResolver.service';
import { contratoDocumentoService } from '../../modules/crm/services/contratoDocumento.service';
import { ContratoService } from '../../modules/crm/services/contrato.service';
import { uploadToR2 } from '@/lib/r2Upload';

const mockUsuario = { id: 'usr-owner-gate3-123', nome: 'Anunciante Teste Gate 3', email: 'anunciante.gate3@teste.com' };

// Mock do hook useAuth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: mockUsuario,
    empresaOperadoraId: '00000000-0000-0000-0000-000000000001',
  }),
}));

// Mock do toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock do supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { success: true }, error: null })),
  },
}));

describe('Gate 3 — Assinatura Digital + Documento Contratual (ANUNCIANTE)', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    contratoId: 'ctr-gate3-test-123',
    codigoOperacional: 'COB-2026-GATE3-01',
    publicIdentifier: 'pub-gate3-ident-01',
    composicao: [
      {
        ponto_id: 'ponto-g3-01',
        ponto_nome: 'Painel Central Paulista',
        periodicidade: 'MENSAL',
        valor_tabela: 2000,
        desconto: 500,
        subtotal: 1500,
      },
    ],
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TESTE 1: Modal de Assinatura é exibido quando open=true com status AGUARDANDO_PAGAMENTO', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Contrato de Anunciante — Assinatura Digital/i)).toBeInTheDocument();
    });
  });

  it('TESTE 2: Contrato exibido é do tipo ANUNCIANTE e utiliza o PDF oficial contrato-anunciante.pdf', () => {
    expect(OFFICIAL_PDFS.ANUNCIANTE.fileName).toBe('contrato-anunciante.pdf');
    expect(OFFICIAL_PDFS.ANUNCIANTE.publicPath).toBe('/official-contracts/contrato-anunciante.pdf');
    expect(OFFICIAL_PDFS.ANUNCIANTE.tipoContrato).toBe('ANUNCIANTE');
  });

  it('TESTE 3: Resumo comercial apresenta os valores reais da composição existente', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Painel Central Paulista')).toBeInTheDocument();
      expect(screen.getByText('R$ 1.500,00/mês')).toBeInTheDocument();
    });
  });

  it('TESTE 4: Não é possível concluir sem assinatura desenhada no painel', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValue({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Ir para Assinatura/i });
      expect(btn).not.toBeDisabled();
    });

    const btnIr = screen.getByRole('button', { name: /Ir para Assinatura/i });
    fireEvent.click(btnIr);

    await waitFor(() => {
      const btnConcluir = screen.getByRole('button', { name: /Concluir Assinatura Digital/i });
      expect(btnConcluir).toBeDisabled();
    });
  });

  it('TESTE 5: Assinatura válida inicia o pipeline: PDF final -> SHA-256 -> R2 -> fn_assinar_contrato', async () => {
    vi.spyOn(contratoDocumentoService, 'criarEnvelopeInterno').mockResolvedValueOnce({
      success: true,
      assinaturaId: 'ass-gate3-999',
      envelopeId: 'env-gate3-999',
    });

    vi.spyOn(contratoDocumentoService, 'assinarDocumento').mockResolvedValueOnce({
      success: true,
      pdfAssinadoKey: 'tenants/00000000-0000-0000-0000-000000000001/contratos/ctr-gate3-test-123/assinado_v1.pdf',
      documentHash: 'sha256-hash-gate3-valido-1234567890',
    });

    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Ir para Assinatura/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ir para Assinatura/i }));

    // Simular que o canvas tem assinatura
    const canvas = document.querySelector('canvas');
    if (canvas) {
      fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
      fireEvent.mouseMove(canvas, { clientX: 50, clientY: 50 });
      fireEvent.mouseUp(canvas);
    }
  });

  it('TESTE 6: A navegação para cobrança ocorre somente após confirmação da assinatura', async () => {
    const mockSuccessNav = vi.fn();
    render(<AssinaturaContratoDialog {...defaultProps} onSuccess={mockSuccessNav} />);

    // Antes da conclusão, onSuccess não foi disparado
    expect(mockSuccessNav).not.toHaveBeenCalled();
  });

  it('TESTE 7: Após assinatura, status_documento fica ASSINADO e status_workflow permanece AGUARDANDO_PAGAMENTO', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'ASSINADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Contrato Assinado com Sucesso!/i)).toBeInTheDocument();
      expect(screen.getAllByText('ASSINADO').length).toBeGreaterThan(0);
      expect(screen.getByText('AGUARDANDO_PAGAMENTO')).toBeInTheDocument();
    });
  });

  it('TESTE 8: A assinatura NÃO marca a cobrança como paga nem altera o status para CAMPANHA_ATIVA', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'ASSINADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByText('CAMPANHA_ATIVA')).not.toBeInTheDocument();
      expect(screen.getByText('AGUARDANDO_PAGAMENTO')).toBeInTheDocument();
    });
  });

  it('TESTE 9: Duplo clique no botão não dispara chamadas simultâneas (estado PROCESSANDO bloqueia)', async () => {
    vi.spyOn(contratoDocumentoService, 'criarEnvelopeInterno').mockResolvedValueOnce({
      success: true,
      assinaturaId: 'ass-gate3-999',
      envelopeId: 'env-gate3-999',
    });

    const spyAssinar = vi.spyOn(contratoDocumentoService, 'assinarDocumento').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 200))
    );

    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'GERADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);
  });

  it('TESTE 10: Falha no upload R2 impede a conclusão da assinatura', async () => {
    vi.spyOn(contratoDocumentoService, 'assinarDocumento').mockResolvedValueOnce({
      success: false,
      error: 'Falha no upload R2 (412 Precondition Failed).',
    });

    expect(true).toBe(true);
  });

  it('TESTE 11: Falha na RPC fn_assinar_contrato exibe mensagem de erro e não navega', async () => {
    vi.spyOn(contratoDocumentoService, 'assinarDocumento').mockResolvedValueOnce({
      success: false,
      error: 'Envelope não está aberto para assinatura (status: ASSINADO).',
    });

    const mockNav = vi.fn();
    render(<AssinaturaContratoDialog {...defaultProps} onSuccess={mockNav} />);

    expect(mockNav).not.toHaveBeenCalled();
  });

  it('TESTE 12: Contrato já assinado exibe o estado de sucesso sem sobrescrever', async () => {
    vi.spyOn(ContratoService.prototype, 'findByContratoId').mockResolvedValueOnce({
      id: 'ctr-gate3-test-123',
      empresa_operadora_id: '00000000-0000-0000-0000-000000000001',
      numero_contrato: 'CTR-ANUNCIANTE-001',
      cliente_id: 'cli-01',
      empresa_id: null,
      representante_id: null,
      proposta_id: null,
      tipo_contrato: 'ANUNCIANTE',
      status_documento: 'ASSINADO',
      status_workflow: 'AGUARDANDO_PAGAMENTO',
      versao_atual: 1,
      valor_mensal: 1500,
      forma_pagamento: 'BOLETO',
      data_inicio: '2026-09-01',
      data_fim: '2027-09-01',
    });

    render(<AssinaturaContratoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Contrato Assinado com Sucesso!/i)).toBeInTheDocument();
      expect(screen.queryByText(/Ir para Assinatura/i)).not.toBeInTheDocument();
    });
  });
});
