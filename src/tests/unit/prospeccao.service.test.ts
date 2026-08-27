import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prospeccaoService,
  montarRegrasComerciais,
  type NovoPontoParceiroPayload,
} from '@/services/prospeccao.service';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/services/corporateUsers.service', () => ({
  corporateUsersService: {
    provisionarUsuarioDireto: vi.fn().mockResolvedValue({
      success: true,
      email: 'gestor@x.com',
      senha_inicial: 'Abc!2345defg#hij',
    }),
    criarUsuario: vi.fn().mockResolvedValue({
      success: true,
      email: 'gestor@x.com',
      senha_inicial: 'Abc!2345defg#hij',
    }),
  },
}));

const PAYLOAD_BASE: NovoPontoParceiroPayload = {
  nome: 'Padaria São José',
  categoria: 'Padaria',
  quantidadeTelas: 2,
  modeloComercial: 'COMISSIONADO',
  percentualComissao: 8,
};

describe('prospeccao.service — regras comerciais (missão §16-§19)', () => {
  it('PERMUTA registra descrição/contrapartida/período e NÃO gera comissão', () => {
    const r = montarRegrasComerciais({
      ...PAYLOAD_BASE,
      modeloComercial: 'PERMUTA',
      permutaDescricao: 'Divulgação por cesta de produtos',
      permutaContrapartida: 'Cesta mensal',
      permutaPeriodo: '12 meses',
      percentualComissao: null,
    });
    expect(r.some((l) => l.startsWith('MODELO COMERCIAL: PERMUTA'))).toBe(true);
    expect(r.some((l) => l.includes('Descricao: Divulgação por cesta de produtos'))).toBe(true);
    expect(r.some((l) => l.includes('Contrapartida: Cesta mensal'))).toBe(true);
    expect(r.some((l) => l.startsWith('COMISSAO:'))).toBe(false);
  });

  it('COMISSIONADO registra percentual informado (não fixa 8% ou 10%)', () => {
    const r8 = montarRegrasComerciais({ ...PAYLOAD_BASE, percentualComissao: 8 });
    const r10 = montarRegrasComerciais({ ...PAYLOAD_BASE, percentualComissao: 10 });
    const r9 = montarRegrasComerciais({ ...PAYLOAD_BASE, percentualComissao: 9 });
    expect(r8).toContain('COMISSAO: 8%');
    expect(r10).toContain('COMISSAO: 10%');
    expect(r9).toContain('COMISSAO: 9%');
  });
});

describe('prospeccao.service — seleção de pontos (missão §9-§10)', () => {
  beforeEach(() => rpcMock.mockReset());

  it('selecionarPontos delega à RPC server-side com cliente e lista de ids', async () => {
    rpcMock.mockResolvedValueOnce({ data: { vinculados: 3, selecionados: 3 }, error: null });
    const r = await prospeccaoService.selecionarPontos('cli-1', ['p1', 'p2', 'p3']);
    expect(rpcMock).toHaveBeenCalledWith('selecionar_pontos_prospeccao', {
      p_cliente_id: 'cli-1',
      p_ponto_ids: ['p1', 'p2', 'p3'],
    });
    expect(r.vinculados).toBe(3);
  });

  it('selecionarPontos PROPAGA erro de escopo da RPC (IDOR bloqueado no backend)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Cliente não pertence à sua carteira.' },
    });
    await expect(prospeccaoService.selecionarPontos('cli-alheio', ['p1'])).rejects.toThrow(
      'Cliente não pertence à sua carteira.'
    );
  });
});

describe('prospeccao.service — cadastro de PONTO PARCEIRO (missão §11-§15)', () => {
  beforeEach(() => rpcMock.mockReset());

  it('criarPontoParceiro grava na tabela `pontos` e retorna código EST- gerado pelo trigger', async () => {
    const insertMock = vi.fn().mockResolvedValue({
      data: [{ id: 'uuid-1', codigo_publico: 'EST-000001' }],
      error: null,
    });
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      insert: insertMock,
    } as never);

    const r = await prospeccaoService.criarPontoParceiro(PAYLOAD_BASE);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const arg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.nome).toBe('Padaria São José');
    expect(arg.quantidade_telas).toBe(2);
    expect(arg.disponibilidade).toBe('DISPONIVEL');
    expect(String(arg.regras_comerciais)).toContain('MODELO COMERCIAL: COMISSIONADO');
    expect(r.codigo_publico).toBe('EST-000001');
  });

  it('propaga erro (ex.: CNPJ/validação) sem mascarar', async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({ insert: insertMock } as never);
    await expect(prospeccaoService.criarPontoParceiro(PAYLOAD_BASE)).rejects.toThrow('boom');
  });
});

describe('prospeccao.service — provisionamento de GESTOR (missão §20-§22)', () => {
  beforeEach(() => rpcMock.mockReset());

  it('usa o mecanismo oficial com perfil GESTOR fixo, SEM clienteId e com metadados de prospecção', async () => {
    const { corporateUsersService } = await import('@/services/corporateUsers.service');
    // perfis query
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'perfil-gestor-uuid' }, error: null });
    const eqAtivo = vi.fn(() => ({ maybeSingle }));
    const eqNome = vi.fn(() => ({ eq: eqAtivo }));
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      select: () => ({ eq: eqNome }),
    } as never);

    const r = await prospeccaoService.provisionarGestor({
      nome: 'Maria Silva',
      email: 'maria@g.com',
      telefone: '81999999999',
      empresa: 'Agência X',
    });

    expect(corporateUsersService.provisionarUsuarioDireto).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Maria Silva',
        email: 'maria@g.com',
        perfilId: 'perfil-gestor-uuid',
        clienteId: null,
        dadosExtra: expect.objectContaining({ tipo_prospect: 'GESTOR_DE_MIDIAS', empresa: 'Agência X' }),
      })
    );
    expect(r.senha_inicial).toBe('Abc!2345defg#hij');
  });

  it('falha claramente se o perfil GESTOR não existir', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqAtivo = vi.fn(() => ({ maybeSingle }));
    const eqNome = vi.fn(() => ({ eq: eqAtivo }));
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      select: () => ({ eq: eqNome }),
    } as never);
    await expect(prospeccaoService.provisionarGestor({ nome: 'X', email: 'x@y.z' })).rejects.toThrow(
      /GESTOR/
    );
  });
});

describe('prospeccao.service — KPIs do dashboard (missão §25)', () => {
  it('mapeia os 4 indicadores da RPC', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { meus_anunciantes: 7, pontos_disponiveis: 4, gestores_ativos: 2, pontos_vinculados: 11 },
      error: null,
    });
    const k = await prospeccaoService.getKpis();
    expect(k).toEqual({
      meus_anunciantes: 7,
      pontos_disponiveis: 4,
      gestores_ativos: 2,
      pontos_vinculados: 11,
    });
  });
});
