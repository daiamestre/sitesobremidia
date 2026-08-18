import { describe, it, expect, vi, beforeEach } from 'vitest';
import { representantesGerenciaService, RepresentantesGerenciaService } from '@/services/representantesGerencia.service';
import { supabase } from '@/integrations/supabase/client';

// ─── Testes: RepresentantesGerenciaService — Gestão de Representantes ─────────

describe('RepresentantesGerenciaService', () => {
  let rpcMock: ReturnType<typeof vi.fn>;
  let service: RepresentantesGerenciaService;

  beforeEach(() => {
    rpcMock = vi.fn();
    vi.mocked(supabase.rpc).mockImplementation(rpcMock);
    service = new RepresentantesGerenciaService();
  });

  const ok = (data: unknown) => ({ data, error: null });
  const err = (message: string) => ({ data: null, error: new Error(message) });

  it('listarRepresentantes chama RPC com filtros corretos (tenant vem do auth no backend)', async () => {
    const payload = {
      p_empresa_operadora_id: null,
      p_status: 'ATIVO',
      p_busca: 'Jairan',
      p_representante_id: null,
    };
    rpcMock.mockResolvedValueOnce(ok([{ id: 'rep-1' }]));

    const result = await service.listarRepresentantes({ status: 'ATIVO', busca: 'Jairan' });

    expect(rpcMock).toHaveBeenCalledWith('listar_representantes_gerencia', payload);
    expect(result).toEqual([{ id: 'rep-1' }]);
  });

  it('listarRepresentantes retorna [] quando o banco retorna null (sem quebrar a UI)', async () => {
    rpcMock.mockResolvedValueOnce(ok(null));
    const result = await service.listarRepresentantes();
    expect(result).toEqual([]);
  });

  it('listarRepresentantes lança erro quando a RPC falha (ex.: sem permissão 42501)', async () => {
    rpcMock.mockResolvedValueOnce(err('new row violates row-level security policy'));
    await expect(service.listarRepresentantes()).rejects.toThrow('row-level security');
  });

  it('obterDesempenho passa período e ordenação para a RPC', async () => {
    rpcMock.mockResolvedValueOnce(ok([{ representante_id: 'rep-1', receita_mensal: 15000 }]));

    const result = await service.obterDesempenho({
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-17',
      ordenar: 'clientes',
    });

    expect(rpcMock).toHaveBeenCalledWith('get_desempenho_representantes', {
      p_periodo_inicio: '2026-08-01',
      p_periodo_fim: '2026-08-17',
      p_representante_id: null,
      p_empresa_operadora_id: null,
      p_ordenar: 'clientes',
    });
    expect(result).toHaveLength(1);
  });

  it('obterDesempenhoDetalhe exige representanteId e devolve null quando RPC falha', async () => {
    rpcMock.mockResolvedValueOnce(ok(null));
    const result = await service.obterDesempenhoDetalhe('rep-1');
    expect(result).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('get_desempenho_representante_detalhe', {
      p_representante_id: 'rep-1',
      p_periodo_inicio: null,
      p_periodo_fim: null,
    });
  });

  it('editarRepresentante retorna success true quando a RPC confirma', async () => {
    rpcMock.mockResolvedValueOnce(ok({ success: true }));
    const res = await service.editarRepresentante('rep-1', {
      cpfCnpj: '12345678000199',
      razaoSocial: 'Alpha Mídia LTDA',
      comissaoPorcentagem: 12.5,
    });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('gerenciar_representante', expect.objectContaining({
      p_acao: 'EDITAR',
      p_representante_id: 'rep-1',
      p_comissao_porcentagem: 12.5,
    }));
  });

  it('editarRepresentante devolve { success: false, error } sem lançar em falha de RPC', async () => {
    rpcMock.mockResolvedValueOnce(err('permission denied'));
    const res = await service.editarRepresentante('rep-1', {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('permission denied');
  });

  it('ativar/desativar chamam gerenciar_representante com ações corretas', async () => {
    rpcMock.mockResolvedValueOnce(ok({ success: true }));
    await service.ativarRepresentante('rep-1');
    expect(rpcMock).toHaveBeenLastCalledWith('gerenciar_representante', expect.objectContaining({ p_acao: 'ATIVAR' }));

    rpcMock.mockResolvedValueOnce(ok({ success: true }));
    await service.desativarRepresentante('rep-1');
    expect(rpcMock).toHaveBeenLastCalledWith('gerenciar_representante', expect.objectContaining({ p_acao: 'DESATIVAR' }));
  });

  it('reassinarCliente permite desvincular com representanteId null (remover da carteira)', async () => {
    rpcMock.mockResolvedValueOnce(ok({ success: true }));
    const res = await service.reassinarCliente('cli-1', null);
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('reassinar_cliente_representante', {
      p_cliente_id: 'cli-1',
      p_representante_id: null,
    });
  });

  it('serviço exportado é instância única do serviço', () => {
    expect(representantesGerenciaService).toBeInstanceOf(RepresentantesGerenciaService);
  });
});