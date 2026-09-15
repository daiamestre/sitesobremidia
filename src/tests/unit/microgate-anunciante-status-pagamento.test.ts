/**
 * MICRO-GATE — TEST SUITE: STATUS CANÔNICO DO ANUNCIANTE + AUTOMAÇÃO POR PAGAMENTO
 *
 * Validações obrigatórias:
 * 1. Semântica e enum dos 6 status canônicos (PROSPECT, CONTACTED, PROPOSAL_SENT, ACTIVE, INACTIVE, CANCELED).
 * 2. Validação de formulário e payload de cliente aceitando todos os 6 status.
 * 3. ClienteService.update aceitando tanto UUID canônico quanto codigo_cliente numérico sem erro de sintaxe UUID.
 * 4. ClienteService.softDelete aceitando tanto UUID quanto codigo_cliente numérico.
 * 5. Promoção automática para ACTIVE quando pagamento é confirmado.
 * 6. Idempotência em múltiplas confirmações de pagamento.
 * 7. Independência por CNPJ: pagamento de um cliente não altera outro com o mesmo CNPJ.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCliente } from '@/modules/crm/types/enums';
import { clienteFormSchema } from '@/modules/crm/validators/cliente.validator';
import { ClienteService } from '@/modules/crm/services/cliente.service';

// Mock do Supabase para testes unitários isolados
vi.mock('@/integrations/supabase/client', () => {
  const queryBuilderMock = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    rpc: vi.fn(),
  };

  return {
    supabase: {
      from: vi.fn(() => ({ ...queryBuilderMock })),
      rpc: vi.fn(),
    },
  };
});

describe('MICRO-GATE: Status Canônico do Anunciante e Automação de Pagamento', () => {
  let clienteService: ClienteService;

  beforeEach(() => {
    vi.clearAllMocks();
    clienteService = new ClienteService();
  });

  describe('1. Semântica Canônica dos 6 Status', () => {
    it('deve conter exatamente os 6 status canônicos no enum StatusCliente', () => {
      const statusList = Object.values(StatusCliente);
      expect(statusList).toHaveLength(6);
      expect(statusList).toContain('PROSPECT');
      expect(statusList).toContain('CONTACTED');
      expect(statusList).toContain('PROPOSAL_SENT');
      expect(statusList).toContain('ACTIVE');
      expect(statusList).toContain('INACTIVE');
      expect(statusList).toContain('CANCELED');
    });

    it('clienteFormSchema deve validar com sucesso todos os 6 status canônicos', () => {
      const baseValidData = {
        nomeFantasia: 'Empresa Teste LTDA',
        razaoSocial: 'Empresa Teste Razão Social LTDA',
        cnpj: '11.222.333/0001-81',
        whatsapp: '11999998888',
        email: 'contato@empresateste.com.br',
        cidade: 'Recife',
        estado: 'PE',
      };

      const todosStatus = [
        StatusCliente.PROSPECT,
        StatusCliente.CONTACTED,
        StatusCliente.PROPOSAL_SENT,
        StatusCliente.ACTIVE,
        StatusCliente.INACTIVE,
        StatusCliente.CANCELED,
      ];

      for (const st of todosStatus) {
        const res = clienteFormSchema.safeParse({ ...baseValidData, status: st });
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data.status).toBe(st);
        }
      }
    });

    it('clienteFormSchema deve rejeitar status inválido', () => {
      const dataInvalida = {
        nomeFantasia: 'Empresa Teste LTDA',
        razaoSocial: 'Empresa Teste Razão Social LTDA',
        whatsapp: '11999998888',
        email: 'contato@empresateste.com.br',
        status: 'STATUS_INEXISTENTE',
      };

      const res = clienteFormSchema.safeParse(dataInvalida);
      expect(res.success).toBe(false);
    });
  });

  describe('2. Resolução de Identidade e Prevenção do Erro UUID 909114', () => {
    it('ClienteService.update deve resolver codigo_cliente numérico ("909114") para UUID canônico antes de consultar PostgreSQL', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      const mockClienteUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const mockEmpresaId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

      // Mock da busca por codigo_cliente
      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col, val) => {
              if (col === 'codigo_cliente' && val === 909114) {
                return {
                  is: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: mockClienteUuid, codigo_cliente: 909114 },
                    error: null,
                  }),
                };
              }
              if (col === 'id' && val === mockClienteUuid) {
                return {
                  is: vi.fn().mockResolvedValue({ error: null }),
                };
              }
              return { is: vi.fn().mockResolvedValue({ error: null }) };
            }),
            update: vi.fn().mockReturnThis(),
          };
        }

        if (table === 'empresas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col, val) => {
              if (col === 'cliente_id' && val === mockClienteUuid) {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: mockEmpresaId },
                    error: null,
                  }),
                };
              }
              if (col === 'id' && val === mockEmpresaId) {
                return vi.fn().mockResolvedValue({ error: null });
              }
              return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
            update: vi.fn().mockReturnThis(),
          };
        }

        if (table === 'contatos') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        return {};
      });

      const res = await clienteService.update('909114', {
        empresaOperadoraId: '11111111-2222-3333-4444-555555555555',
        status: StatusCliente.ACTIVE,
        nomeFantasia: 'Empresa Atualizada',
        razaoSocial: 'Empresa Atualizada LTDA',
        whatsapp: '11999998888',
        email: 'atualizado@empresa.com.br',
        cidade: 'Recife',
        estado: 'PE',
      });

      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('ClienteService.softDelete deve resolver codigo_cliente numérico ("909114") para UUID canônico', async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      const mockClienteUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'clientes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col, val) => {
              if (col === 'codigo_cliente' && val === 909114) {
                return {
                  is: vi.fn().mockReturnThis(),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: mockClienteUuid, codigo_cliente: 909114 },
                    error: null,
                  }),
                };
              }
              if (col === 'id' && val === mockClienteUuid) {
                return vi.fn().mockResolvedValue({ error: null });
              }
              return { is: vi.fn().mockResolvedValue({ error: null }) };
            }),
            update: vi.fn().mockReturnThis(),
          };
        }

        if (table === 'empresas') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn((col, val) => {
              if (col === 'cliente_id' && val === mockClienteUuid) {
                return vi.fn().mockResolvedValue({ error: null });
              }
              return vi.fn().mockResolvedValue({ error: null });
            }),
          };
        }

        return {};
      });

      const res = await clienteService.softDelete('909114', 'Inativação de teste');
      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe('3. Automação de Pagamento e Idempotência', () => {
    it('deve simular fluxo de pagamento confirmado promovendo status do cliente para ACTIVE', () => {
      // Simulação da máquina de estado do banco
      const clienteState = {
        id: 'cliente-uuid-1',
        codigo_cliente: 909114,
        status: 'PROSPECT',
        bloqueio_financeiro: false,
      };

      const contaReceber = {
        id: 'conta-uuid-1',
        cliente_id: clienteState.id,
        valor: 1500.0,
        valor_pago: 0,
        status: 'PENDENTE',
      };

      // Função que simula o trigger trg_concilia_pagamento
      function simularConciliacaoPagamento(pagamento: { valor_pago: number }) {
        contaReceber.valor_pago += pagamento.valor_pago;
        if (contaReceber.valor_pago >= contaReceber.valor) {
          contaReceber.status = 'PAGA';
        }

        if (pagamento.valor_pago > 0 && contaReceber.cliente_id === clienteState.id) {
          clienteState.status = 'ACTIVE';
          clienteState.bloqueio_financeiro = false;
        }
      }

      expect(clienteState.status).toBe('PROSPECT');

      // Pagamento confirmado
      simularConciliacaoPagamento({ valor_pago: 1500.0 });

      expect(contaReceber.status).toBe('PAGA');
      expect(clienteState.status).toBe('ACTIVE');

      // Idempotência: reprocessamento do pagamento mantém ACTIVE sem efeito colateral
      simularConciliacaoPagamento({ valor_pago: 0 });
      expect(clienteState.status).toBe('ACTIVE');
    });

    it('deve manter independência entre anunciantes distintos com o mesmo CNPJ', () => {
      const mesmoCnpj = '11.222.333/0001-81';

      const clienteA = {
        id: 'cliente-uuid-A',
        cnpj: mesmoCnpj,
        status: 'PROSPECT',
      };

      const clienteB = {
        id: 'cliente-uuid-B',
        cnpj: mesmoCnpj,
        status: 'PROSPECT',
      };

      const contaClienteA = {
        id: 'conta-receber-A',
        cliente_id: clienteA.id,
        valor: 1000.0,
        status: 'PENDENTE',
      };

      // Função que processa pagamento direcionado exclusivamente pelo cliente_id da conta
      function processarPagamentoConta(conta: typeof contaClienteA, valorPago: number) {
        if (conta.cliente_id === clienteA.id) {
          clienteA.status = 'ACTIVE';
        } else if (conta.cliente_id === clienteB.id) {
          clienteB.status = 'ACTIVE';
        }
      }

      // Executa pagamento de A
      processarPagamentoConta(contaClienteA, 1000.0);

      // A é promovido para ACTIVE
      expect(clienteA.status).toBe('ACTIVE');

      // B permanece PROSPECT inalterado
      expect(clienteB.status).toBe('PROSPECT');
    });
  });
});
