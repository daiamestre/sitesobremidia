import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { prospeccaoService } from '@/services/prospeccao.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('GATE 4 — Cadastro Atômico com Contrato Obrigatório', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Anunciante — fn_cadastrar_cliente_com_contrato', () => {
    it('deve realizar o cadastro do cliente e criar o contrato de Anunciante atomicamente', async () => {
      const mockRpcResponse = {
        data: {
          success: true,
          cliente_id: 'cli-uuid-123',
          empresa_id: 'emp-uuid-456',
          contato_id: 'cnt-uuid-789',
          contrato_id: 'ctr-uuid-999',
          codigo_cliente: 105,
          numero_contrato: 'CTR-2026-0005',
        },
        error: null,
      };

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse as any);

      const res = await clienteService.create({
        empresaOperadoraId: 'op-tenant-001',
        nomeFantasia: 'Anunciante Gate4 Ltda',
        email: 'contato@anunciantegate4.com.br',
        whatsapp: '81999990000',
        cidade: 'Recife',
        estado: 'PE',
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'fn_cadastrar_cliente_com_contrato',
        expect.objectContaining({
          p_empresa_operadora_id: 'op-tenant-001',
          p_nome_fantasia: 'Anunciante Gate4 Ltda',
          p_email: 'contato@anunciantegate4.com.br',
          p_whatsapp: '81999990000',
        })
      );

      expect(res.success).toBe(true);
      expect(res.clienteId).toBe('cli-uuid-123');
      expect(res.contratoId).toBe('ctr-uuid-999');
    });

    it('deve falhar se o tenant (empresaOperadoraId) estiver ausente no payload', async () => {
      const res = await clienteService.create({
        empresaOperadoraId: '',
        nomeFantasia: 'Sem Tenant',
        email: 'sem@tenant.com',
        whatsapp: '81999990000',
        cidade: 'Recife',
        estado: 'PE',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('empresaOperadoraId (tenant) ausente');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('deve falhar se a RPC retornar erro ou rollback por falha de contrato', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: false,
          error: 'Falha ao criar o contrato atômico do anunciante.',
        },
        error: null,
      } as any);

      const res = await clienteService.create({
        empresaOperadoraId: 'op-tenant-001',
        nomeFantasia: 'Anunciante Erro',
        email: 'erro@anunciante.com',
        whatsapp: '81999990000',
        cidade: 'Recife',
        estado: 'PE',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Falha ao criar o contrato atômico do anunciante.');
    });
  });

  describe('Ponto Parceiro — fn_cadastrar_ponto_parceiro_com_contrato', () => {
    it('deve cadastrar o ponto e criar o contrato de Parceria atomicamente', async () => {
      const mockRpcResponse = {
        data: {
          success: true,
          id: 'ponto-uuid-101',
          ponto_id: 'ponto-uuid-101',
          codigo_publico: 'EST-000099',
          contrato_id: 'ctr-parceiro-888',
          numero_contrato: 'CTR-2026-0006',
        },
        error: null,
      };

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse as any);

      const res = await prospeccaoService.criarPontoParceiro({
        nome: 'Ponto Parceiro Gate 4',
        categoria: 'Academia',
        cidade: 'Recife',
        estado: 'PE',
        quantidadeTelas: 3,
        modeloComercial: 'COMISSIONADO',
        percentualComissao: 10,
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'fn_cadastrar_ponto_parceiro_com_contrato',
        expect.objectContaining({
          p_dados: expect.objectContaining({
            nome: 'Ponto Parceiro Gate 4',
            categoria: 'Academia',
            quantidade_telas: 3,
            modelo_comercial: 'COMISSIONADO',
          }),
        })
      );

      expect(res.id).toBe('ponto-uuid-101');
      expect(res.codigo_publico).toBe('EST-000099');
      expect(res.contrato_id).toBe('ctr-parceiro-888');
    });

    it('deve lançar exceção se a RPC atômica do ponto retornar erro', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: false,
          error: 'Falha ao criar o contrato atômico do ponto parceiro.',
        },
        error: null,
      } as any);

      await expect(
        prospeccaoService.criarPontoParceiro({
          nome: 'Ponto Erro',
          cidade: 'Recife',
          estado: 'PE',
          modeloComercial: 'LOCACAO',
        })
      ).rejects.toThrow('Falha ao criar o contrato atômico do ponto parceiro.');
    });
  });
});
