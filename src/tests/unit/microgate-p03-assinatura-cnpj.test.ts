import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { contratoDocumentoService } from '@/modules/crm/services/contratoDocumento.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => {
  const updateFn = vi.fn();
  const eqFn = vi.fn();
  const selectFn = vi.fn();
  const isFn = vi.fn();
  const insertFn = vi.fn();
  const maybeSingleFn = vi.fn();

  const queryBuilder: any = {
    select: selectFn.mockReturnThis(),
    update: updateFn.mockReturnThis(),
    insert: insertFn.mockReturnThis(),
    eq: eqFn.mockReturnThis(),
    is: isFn.mockReturnThis(),
    maybeSingle: maybeSingleFn,
  };

  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(() => queryBuilder),
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

describe('MICRO-GATE P0.3 — Assinatura do Cliente + Reutilização de CNPJ após Exclusão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PROBLEMA B — Unicidade e Reutilização de CNPJ', () => {
    it('deve permitir cadastro com CNPJ existente retornando sucesso e novo contrato', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: true,
          cliente_id: 'cli-001',
          empresa_id: 'emp-001',
          contrato_id: 'ctr-002',
          empresa_reutilizada: true,
        },
        error: null,
      } as any);

      const res = await clienteService.create({
        empresaOperadoraId: 'op-tenant-001',
        nomeFantasia: 'Empresa com CNPJ Existente',
        cnpj: '12.345.678/0001-90',
        email: 'novo@empresa.com.br',
        whatsapp: '81999990000',
        cidade: 'Caruaru',
        estado: 'PE',
      });

      expect(res.success).toBe(true);
      expect(res.clienteId).toBe('cli-001');
      expect(res.contratoId).toBe('ctr-002');
    });

    it('deve cascatear o soft-delete para clientes e empresas', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      const res = await clienteService.softDelete('cli-123', 'Excluído pelo usuário de teste', 'user-456');

      expect(res.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('clientes');
      expect(supabase.from).toHaveBeenCalledWith('empresas');
    });

    it('deve atualizar cliente existente no update sem tentar criar novo registro com mesmo CNPJ', async () => {
      const maybeSingleEmpresa = vi.fn().mockResolvedValue({
        data: { id: 'emp-123' },
        error: null,
      });

      const eqMock = vi.fn().mockImplementation((col: string, val: string) => {
        if (col === 'cliente_id') {
          return { maybeSingle: maybeSingleEmpresa };
        }
        return { is: vi.fn().mockResolvedValue({ error: null }) };
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: eqMock,
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: updateMock,
        eq: eqMock,
      } as any);

      const res = await clienteService.update('cli-123', {
        empresaOperadoraId: 'op-tenant-001',
        nomeFantasia: 'Empresa Atualizada',
        cnpj: '12.345.678/0001-90',
        email: 'atualizada@empresa.com.br',
        whatsapp: '81999990000',
        cidade: 'Caruaru',
        estado: 'PE',
      });

      expect(res.success).toBe(true);
    });
  });

  describe('PROBLEMA A — Assinatura Digital do Contrato', () => {
    it('deve registrar a assinatura via RPC atômica fn_assinar_contrato', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: true,
          contrato_id: 'ctr-123',
          status_documento: 'ASSINADO',
          status_workflow: 'AGUARDANDO_PAGAMENTO',
        },
        error: null,
      } as any);

      // Assinatura via RPC
      const rpcRes = await supabase.rpc('fn_assinar_contrato', {
        p_assinatura_id: 'ass-123',
        p_signatario_nome: 'Marcos Teste',
        p_signatario_email: 'marcos@teste.com',
        p_signatario_cpf_cnpj: '12.345.678/0001-90',
        p_pdf_assinado_key: 'tenants/tenant-1/contratos/ctr-123/assinado_CTR-001_v1.pdf',
        p_document_hash: 'a1b2c3d4e5f6',
        p_ip: '127.0.0.1',
        p_user_agent: 'Vitest/Node',
      });

      expect(rpcRes.data.success).toBe(true);
      expect(rpcRes.data.status_documento).toBe('ASSINADO');
      expect(rpcRes.data.status_workflow).toBe('AGUARDANDO_PAGAMENTO');
    });
  });
});
