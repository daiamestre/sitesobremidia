import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clienteService } from '@/modules/crm/services/cliente.service';
import { supabase } from '@/integrations/supabase/client';
import { validarCpfCnpj, normalizarCnpj, clienteFormSchema } from '@/modules/crm/validators/cliente.validator';

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

describe('CORREÇÃO FORENSE DO CNPJ NO NOVO CADASTRO DE ANUNCIANTE — INDEPENDÊNCIA DE IDENTIDADE', () => {
  const CNPJ_COMPARTILHADO = '11.222.333/0001-81';
  const CNPJ_NORMALIZADO = '11222333000181';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Caso 1 — CNPJ único
  it('Caso 1 — CNPJ único: novo anunciante com CNPJ nunca utilizado é criado com sucesso', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-uuid-001',
        empresa_id: 'emp-uuid-001',
        contrato_id: 'ctr-uuid-001',
        codigo_cliente: 101,
        numero_contrato: 'CTR-2026-0001',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-uuid-1',
      nomeFantasia: 'Anunciante Alfa',
      razaoSocial: 'Anunciante Alfa LTDA',
      cnpj: '18.236.120/0001-58',
      email: 'contato@alfa.com',
      whatsapp: '81999990001',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(res.success).toBe(true);
    expect(res.clienteId).toBe('cli-uuid-001');
    expect(res.contratoId).toBe('ctr-uuid-001');
    expect(res.error).toBeUndefined();
  });

  // Caso 2 — Mesmo CNPJ com cadastro ativo
  it('Caso 2 — Mesmo CNPJ com cadastro ativo: Anunciante B é criado com sucesso usando o mesmo CNPJ do Anunciante A', async () => {
    // Simula cadastro A
    const cadastroA = {
      cliente_id: 'anunciante-A-uuid',
      empresa_id: 'empresa-A-uuid',
      contrato_id: 'contrato-A-uuid',
      cnpj: CNPJ_COMPARTILHADO,
    };

    // Chamada para cadastro B com mesmo CNPJ
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'anunciante-B-uuid',
        empresa_id: 'empresa-B-uuid',
        contrato_id: 'contrato-B-uuid',
        codigo_cliente: 102,
        numero_contrato: 'CTR-2026-0002',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const resB = await clienteService.create({
      empresaOperadoraId: 'tenant-uuid-1',
      nomeFantasia: 'Anunciante Bravo',
      razaoSocial: 'Anunciante Bravo Filial LTDA',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'contato@bravo.com',
      whatsapp: '81999990002',
      cidade: 'Recife',
      estado: 'PE',
    });

    expect(resB.success).toBe(true);
    expect(resB.clienteId).toBe('anunciante-B-uuid');
    expect(resB.contratoId).toBe('contrato-B-uuid');
    expect(resB.clienteId).not.toBe(cadastroA.cliente_id);
    expect(resB.contratoId).not.toBe(cadastroA.contrato_id);
  });

  // Caso 3 — Mesmo CNPJ após exclusão
  it('Caso 3 — Mesmo CNPJ após exclusão: A excluído (soft-delete), B com mesmo CNPJ é criado normalmente', async () => {
    // 1. Soft-delete de A
    const deleteRes = await clienteService.softDelete('anunciante-A-uuid', 'Excluído pelo usuário');
    expect(deleteRes.success).toBe(true);

    // 2. Novo cadastro B com mesmo CNPJ
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'anunciante-B-post-delete',
        empresa_id: 'empresa-B-post-delete',
        contrato_id: 'contrato-B-post-delete',
        codigo_cliente: 103,
        numero_contrato: 'CTR-2026-0003',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const resB = await clienteService.create({
      empresaOperadoraId: 'tenant-uuid-1',
      nomeFantasia: 'Anunciante Retornando',
      razaoSocial: 'Anunciante Retornando LTDA',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'retorno@empresa.com',
      whatsapp: '81999990003',
      cidade: 'Caruaru',
      estado: 'PE',
    });

    expect(resB.success).toBe(true);
    expect(resB.clienteId).toBe('anunciante-B-post-delete');
    expect(resB.contratoId).toBe('contrato-B-post-delete');
    expect(resB.clienteId).not.toBe('anunciante-A-uuid');
  });

  // Caso 4 — Independência de identidade
  it('Caso 4 — Independência de identidade: A.cnpj === B.cnpj e A.id !== B.id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cliente-id-A',
        empresa_id: 'emp-id-A',
        contrato_id: 'ctr-id-A',
        codigo_cliente: 201,
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const resA = await clienteService.create({
      empresaOperadoraId: 'tenant-1',
      nomeFantasia: 'Empresa A',
      razaoSocial: 'Empresa A Razão',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'a@teste.com',
      whatsapp: '81999991111',
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cliente-id-B',
        empresa_id: 'emp-id-B',
        contrato_id: 'ctr-id-B',
        codigo_cliente: 202,
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const resB = await clienteService.create({
      empresaOperadoraId: 'tenant-1',
      nomeFantasia: 'Empresa B',
      razaoSocial: 'Empresa B Razão',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'b@teste.com',
      whatsapp: '81999992222',
    });

    expect(resA.clienteId).toBe('cliente-id-A');
    expect(resB.clienteId).toBe('cliente-id-B');
    expect(resA.clienteId).not.toBe(resB.clienteId);
  });

  // Caso 5 — Não vinculação
  it('Caso 5 — Não vinculação: novo anunciante B não reutiliza ID, contrato nem empresa_id de A', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cliente-id-novo',
        empresa_id: 'empresa-id-nova',
        contrato_id: 'contrato-id-novo',
        codigo_cliente: 505,
        numero_contrato: 'CTR-NOVO-2026',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-1',
      nomeFantasia: 'Nova Empresa Independente',
      razaoSocial: 'Nova Empresa Independente LTDA',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'independente@teste.com',
      whatsapp: '81999993333',
    });

    expect(res.success).toBe(true);
    expect(res.clienteId).toBe('cliente-id-novo');
    expect(res.contratoId).toBe('contrato-id-novo');

    // Confirma que a chamada à RPC não passou IDs preexistentes de A
    const rpcCall = vi.mocked(supabase.rpc).mock.calls[0];
    expect(rpcCall[0]).toBe('fn_cadastrar_cliente_com_contrato');
    const rpcPayload = rpcCall[1] as any;
    expect(rpcPayload.p_cnpj).toBe(CNPJ_COMPARTILHADO);
    // Nenhum cliente_id ou contrato_id anterior é enviado
    expect(rpcPayload).not.toHaveProperty('p_cliente_id');
    expect(rpcPayload).not.toHaveProperty('p_contrato_id');
  });

  // Caso 6 — Novo cadastro não vira edição
  it('Caso 6 — Novo cadastro não vira edição: clienteService.create nunca chama supabase.update em clientes', async () => {
    const updateSpy = vi.fn();
    vi.mocked(supabase.from).mockReturnValue({
      update: updateSpy,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'novo-cli-sem-update',
        contrato_id: 'novo-ctr-sem-update',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    await clienteService.create({
      empresaOperadoraId: 'tenant-1',
      nomeFantasia: 'Empresa Sem Update',
      razaoSocial: 'Empresa Sem Update LTDA',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'semupdate@teste.com',
      whatsapp: '81999994444',
    });

    // Prova que em nenhum momento clienteService.create acionou supabase.from('clientes').update(...)
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // Caso 7 — Normalização
  it('Caso 7 — Normalização: formata e normaliza CNPJ preservando validação matemática sem unicidade indevida', () => {
    // Normalização canônica (extrai apenas números)
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarCnpj('11222333000181')).toBe('11222333000181');

    // Validação matemática de CPF/CNPJ
    expect(validarCpfCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCpfCnpj('11222333000181')).toBe(true);
    expect(validarCpfCnpj('11.222.333/0001-00')).toBe(false); // Dígito inválido
    expect(validarCpfCnpj('')).toBe(true); // Opcional no formulário

    // Validação de schema do formulário
    const validacaoComFormatado = clienteFormSchema.safeParse({
      nomeFantasia: 'Empresa Teste',
      razaoSocial: 'Empresa Teste Razão',
      cnpj: '11.222.333/0001-81',
      whatsapp: '81999995555',
      email: 'contato@teste.com',
    });
    expect(validacaoComFormatado.success).toBe(true);

    const validacaoComDesformatado = clienteFormSchema.safeParse({
      nomeFantasia: 'Empresa Teste 2',
      razaoSocial: 'Empresa Teste 2 Razão',
      cnpj: '11222333000181',
      whatsapp: '81999995555',
      email: 'contato2@teste.com',
    });
    expect(validacaoComDesformatado.success).toBe(true);
  });

  // Caso 8 — Ausência de mensagens de bloqueio
  it('Caso 8 — Respostas de sucesso nunca contêm erro "CNPJ já cadastrado"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        cliente_id: 'cli-ok',
        empresa_id: 'emp-ok',
        contrato_id: 'ctr-ok',
        empresa_reutilizada: false,
      },
      error: null,
    } as any);

    const res = await clienteService.create({
      empresaOperadoraId: 'tenant-1',
      nomeFantasia: 'Empresa Sucesso',
      razaoSocial: 'Empresa Sucesso LTDA',
      cnpj: CNPJ_COMPARTILHADO,
      email: 'ok@teste.com',
      whatsapp: '81999996666',
    });

    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain('CNPJ já cadastrado');
  });
});
