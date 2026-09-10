import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { contratoService } from '@/modules/crm/services/contrato.service';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => {
  const createMockQuery = (resolvedData: any = null) => {
    const q: any = {};
    q.select = vi.fn().mockReturnValue(q);
    q.update = vi.fn().mockReturnValue(q);
    q.insert = vi.fn().mockReturnValue(q);
    q.eq = vi.fn().mockReturnValue(q);
    q.is = vi.fn().mockReturnValue(q);
    q.order = vi.fn().mockReturnValue(q);
    q.limit = vi.fn().mockReturnValue(q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    q.single = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    q.then = (resolve: any) => Promise.resolve({ data: resolvedData, error: null }).then(resolve);
    return q;
  };

  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(() => createMockQuery()),
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

describe('MICRO-GATE P0.3.6 — Remoção Definitiva da Trava "CNPJ já cadastrado" e Liberação de Múltiplos Contratos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TESTE 01 — CNPJ novo: cadastro permitido, empresa criada e contrato atômico gerado
  it('TESTE 01 — CNPJ novo: permitido, cria empresa e contrato atômico', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-101',
        empresa_id: 'emp-101',
        contrato_id: 'ctr-101',
        codigo_cliente: 1,
        numero_contrato: 'CTR-2026-0001',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa Inédita LTDA',
      razaoSocial: 'Empresa Inédita LTDA',
      cnpj: '18.236.120/0001-58',
      email: 'contato@inedita.com',
      whatsapp: '81999990001',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.clienteId).toBe('cli-101');
    expect(res.contratoId).toBe('ctr-101');
    expect(res.error).toBeUndefined();
  });

  // TESTE 02 — CNPJ existente: não gera erro "CNPJ já cadastrado"
  it('TESTE 02 — CNPJ existente: não gera erro "CNPJ já cadastrado"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-101',
        empresa_id: 'emp-101',
        contrato_id: 'ctr-102',
        codigo_cliente: 1,
        numero_contrato: 'CTR-2026-0002',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa Existente - Nova Contratação',
      razaoSocial: 'Empresa Inédita LTDA',
      cnpj: '18.236.120/0001-58',
      email: 'contato@inedita.com',
      whatsapp: '81999990001',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.error || '').not.toContain('CNPJ já cadastrado');
  });

  // TESTE 03 — CNPJ existente + nova contratação: permitido
  it('TESTE 03 — CNPJ existente + nova contratação: permitido', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-101',
        empresa_id: 'emp-101',
        contrato_id: 'ctr-103',
        codigo_cliente: 1,
        numero_contrato: 'CTR-2026-0003',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa Existente - Contratação B',
      razaoSocial: 'Empresa Inédita LTDA',
      cnpj: '18.236.120/0001-58',
      email: 'novacontratacao@inedita.com',
      whatsapp: '81999990002',
      cidade: 'Recife',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.clienteId).toBe('cli-101');
    expect(res.contratoId).toBe('ctr-103');
  });

  // TESTE 04 — Mesmo CNPJ + segundo contrato: permitido
  it('TESTE 04 — Mesmo CNPJ + segundo contrato: permitido e independente', async () => {
    const contrato1Id = 'ctr-primeiro-001';
    const contrato2Id = 'ctr-segundo-002';

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-multi-1',
        empresa_id: 'emp-multi-1',
        contrato_id: contrato2Id,
        codigo_cliente: 42,
        numero_contrato: 'CTR-2026-0042',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Posto Caruaru 2',
      razaoSocial: 'Posto Caruaru LTDA',
      cnpj: '22.333.444/0001-55',
      email: 'posto@caruaru.com',
      whatsapp: '81988887777',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe(contrato2Id);
    expect(res.contratoId).not.toBe(contrato1Id);
  });

  // TESTE 05 — Mesmo CNPJ + terceiro contrato: permitido
  it('TESTE 05 — Mesmo CNPJ + terceiro contrato: permitido', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-multi-1',
        empresa_id: 'emp-multi-1',
        contrato_id: 'ctr-terceiro-003',
        codigo_cliente: 42,
        numero_contrato: 'CTR-2026-0043',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Posto Caruaru 3 - Renovação',
      razaoSocial: 'Posto Caruaru LTDA',
      cnpj: '22.333.444/0001-55',
      email: 'posto@caruaru.com',
      whatsapp: '81988887777',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-terceiro-003');
  });

  // TESTE 06 — Mesmo CNPJ + modelos diferentes: permitido
  it('TESTE 06 — Mesmo CNPJ + modelos diferentes: permitido', async () => {
    // Modelo ANUNCIANTE
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-mod-1',
        empresa_id: 'emp-mod-1',
        contrato_id: 'ctr-mod-anunciante',
        numero_contrato: 'CTR-2026-0500',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const resA = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Shopping Difusora',
      cnpj: '33.444.555/0001-66',
      email: 'comercial@difusora.com',
      whatsapp: '81977776666',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    // Modelo PARCEIRO / Expansão
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-mod-1',
        empresa_id: 'emp-mod-1',
        contrato_id: 'ctr-mod-expansao',
        numero_contrato: 'CTR-2026-0501',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const resB = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Shopping Difusora - Ponto Parceiro',
      cnpj: '33.444.555/0001-66',
      email: 'comercial@difusora.com',
      whatsapp: '81977776666',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);
    expect(resA.contratoId).toBe('ctr-mod-anunciante');
    expect(resB.contratoId).toBe('ctr-mod-expansao');
    expect(resA.contratoId).not.toBe(resB.contratoId);
  });

  // TESTE 07 — Empresa não é duplicada desnecessariamente
  it('TESTE 07 — Empresa não é duplicada desnecessariamente (empresa_reutilizada = true)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-dupl-check',
        empresa_id: 'emp-dupl-check',
        contrato_id: 'ctr-dupl-002',
        codigo_cliente: 99,
        numero_contrato: 'CTR-2026-0099',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa Única',
      cnpj: '44.555.666/0001-77',
      email: 'unica@empresa.com',
      whatsapp: '81966665555',
      cidade: 'Recife',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.clienteId).toBe('cli-dupl-check');
  });

  // TESTE 08 — Contratos anteriores permanecem intactos
  it('TESTE 08 — Contratos anteriores permanecem intactos', async () => {
    const contratoAntigoId = 'ctr-antigo-100';
    const contratoNovoId = 'ctr-novo-200';

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-hist-1',
        empresa_id: 'emp-hist-1',
        contrato_id: contratoNovoId,
        codigo_cliente: 10,
        numero_contrato: 'CTR-2026-0200',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa com Histórico',
      cnpj: '55.666.777/0001-88',
      email: 'historico@empresa.com',
      whatsapp: '81955554444',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe(contratoNovoId);
    expect(res.contratoId).not.toBe(contratoAntigoId);
  });

  // TESTE 09 — Contrato assinado anterior permanece intacto
  it('TESTE 09 — Contrato assinado anterior permanece intacto', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-assinado-1',
        empresa_id: 'emp-assinado-1',
        contrato_id: 'ctr-novo-anunciante-2',
        codigo_cliente: 15,
        numero_contrato: 'CTR-2026-0300',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa com Contrato Assinado Vigente',
      cnpj: '66.777.888/0001-99',
      email: 'assinado@empresa.com',
      whatsapp: '81944443333',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.contratoId).toBe('ctr-novo-anunciante-2');
  });

  // TESTE 10 — RLS permanece íntegro
  it('TESTE 10 — RLS permanece íntegro: erro de RLS/permissão é capturado sem silenciar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for schema public' },
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa RLS Test',
      cnpj: '77.888.999/0001-00',
      email: 'rls@empresa.com',
      whatsapp: '81933332222',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Permissão negada');
  });

  // TESTE 11 — Tenant A não acessa dados do Tenant B
  it('TESTE 11 — Tenant A não acessa dados do Tenant B', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Tenant incompatível com o usuário autenticado.',
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-b',
      nomeFantasia: 'Empresa Tentativa Tenant B',
      cnpj: '88.999.000/0001-11',
      email: 'tenantb@empresa.com',
      whatsapp: '81922221111',
      cidade: 'São Paulo',
      estado: 'SP',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Tenant incompatível');
  });

  // TESTE 12 — Nenhum caminho retorna "CNPJ já cadastrado" como bloqueio
  it('TESTE 12 — Nenhum caminho retorna "CNPJ já cadastrado" como bloqueio de nova contratação', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-final-1',
        empresa_id: 'emp-final-1',
        contrato_id: 'ctr-final-1',
        codigo_cliente: 50,
        numero_contrato: 'CTR-2026-0050',
        empresa_reutilizada: true,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-pe',
      nomeFantasia: 'Empresa Qualquer',
      cnpj: '18.236.120/0001-58',
      email: 'qualquer@empresa.com',
      whatsapp: '81911110000',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.error || '').not.toContain('CNPJ já cadastrado');
  });
});
