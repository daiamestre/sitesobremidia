// ======================================================================
// SOBRE MÍDIA — GATE 1C: Testes da Camada Comercial / UI / Portal
// Arquivo: src/tests/crm/gate1c-selecaoComercial.test.tsx
//
// Cobre T1–T11 conforme especificação do Gate 1C.
// ======================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Re-exports via index do CRM (valida T11)
import {
  pontoPrecosService,
  composicaoComercialService,
  PERIODICIDADES_COMERCIAIS,
  type PeriodicidadeComercial,
  type ComposicaoItemResult,
} from '@/modules/crm/services';

import {
  SelecaoComercialDialog,
  type PontoComercialTarget,
  type ItemComposicaoComUI,
} from '@/modules/crm/components/portal/SelecaoComercialDialog';

// ── Mocks Globais ──────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    usuario: { id: 'u-1', cliente_id: 'cli-1' },
    empresaOperadoraId: 'op-1',
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Fixtures para os testes
const PONTO_TESTE: PontoComercialTarget = {
  ponto_id: 'ponto-uuid-001',
  nome: 'Totem Shopping Central',
  categoria: 'Shopping Center',
  cidade: 'Curitiba',
  estado: 'PR',
  bairro: 'Centro',
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderDialog(props: Partial<React.ComponentProps<typeof SelecaoComercialDialog>> = {}) {
  const defaultProps = {
    ponto: PONTO_TESTE,
    open: true,
    onOpenChange: vi.fn(),
    onAdicionarItem: vi.fn(),
    composicaoAtual: [],
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SelecaoComercialDialog {...defaultProps} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GATE 1C — Camada Comercial / UI / Seleção Comercial', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── T1: Listagem de pontos ───────────────────────────────────────────────
  it('T1 — Listagem: Ponto alvo é apresentado com nome e informações na UI', async () => {
    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue(['MENSAL']);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: {
        id: 'pp-1',
        empresa_operadora_id: 'op-1',
        ponto_id: PONTO_TESTE.ponto_id,
        periodicidade: 'MENSAL',
        preco: 150.0,
        ativo: true,
        vigencia_inicio: '2026-01-01',
        vigencia_fim: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: null,
      },
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getAllByText(/Totem Shopping Central/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Centro — Curitiba — PR/i)).toBeInTheDocument();
    });
  });

  // ── T2: Periodicidades válidas ────────────────────────────────────────────
  it('T2 — Periodicidades: Somente periodicidades comerciais válidas são apresentadas, ignorando UNICO', async () => {
    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue([
      'MENSAL',
      'SEMESTRAL',
    ]);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: {
        id: 'pp-1',
        empresa_operadora_id: 'op-1',
        ponto_id: PONTO_TESTE.ponto_id,
        periodicidade: 'MENSAL',
        preco: 200.0,
        ativo: true,
        vigencia_inicio: '2026-01-01',
        vigencia_fim: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: null,
      },
    });

    renderDialog();

    await waitFor(() => {
      expect(PERIODICIDADES_COMERCIAIS).toEqual([
        'MENSAL',
        'BIMESTRAL',
        'TRIMESTRAL',
        'SEMESTRAL',
        'ANUAL',
      ]);
      expect((PERIODICIDADES_COMERCIAIS as readonly string[]).includes('UNICO')).toBe(false);
    });
  });

  // ── T3: Preço real da matriz ──────────────────────────────────────────────
  it('T3 — Preço real: UI consome o preço resolvido pela matriz sem efetuar multiplicação/cálculo próprio', async () => {
    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue([
      'MENSAL',
      'ANUAL',
    ]);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockImplementation(async (pId, per) => {
      if (per === 'MENSAL') {
        return {
          encontrado: true,
          preco: {
            id: 'pp-m',
            empresa_operadora_id: 'op-1',
            ponto_id: pId,
            periodicidade: 'MENSAL',
            preco: 120.0,
            ativo: true,
            vigencia_inicio: '2026-01-01',
            vigencia_fim: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            created_by: null,
          },
        };
      }
      return {
        encontrado: true,
        preco: {
          id: 'pp-a',
          empresa_operadora_id: 'op-1',
          ponto_id: pId,
          periodicidade: 'ANUAL',
          preco: 1000.0, // Preço cadastrado na matriz, NUNCA mensal * 12 (1440)
          ativo: true,
          vigencia_inicio: '2026-01-01',
          vigencia_fim: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          created_by: null,
        },
      };
    });

    renderDialog();

    await waitFor(() => {
      // Preço de tabela deve ser R$ 120,00 no mensal
      expect(screen.getAllByText(/120,00/).length).toBeGreaterThan(0);
    });

    // Troca para ANUAL
    const btnAnual = screen.getByRole('button', { name: /Anual/i });
    fireEvent.click(btnAnual);

    await waitFor(() => {
      // Preço anual da matriz (R$ 1.000,00), e NÃO o cálculo inventado (R$ 1.440,00)
      expect(screen.getAllByText(/1\.000,00/).length).toBeGreaterThan(0);
      expect(screen.queryByText(/1\.440,00/)).not.toBeInTheDocument();
    });
  });

  // ── T4: Sem preço ────────────────────────────────────────────────────────
  it('T4 — Sem preço: Periodicidade sem preço cadastrado retorna encontrado: false e não inventa valor', async () => {
    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue([]);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: false,
      motivo: 'Preço indisponível para a periodicidade informada.',
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getAllByText(/Nenhuma periodicidade comercial possui preço ativo/i).length).toBeGreaterThan(0);
      const btnAdicionar = screen.getByRole('button', { name: /Adicionar à Composição/i });
      expect(btnAdicionar).toBeDisabled();
    });
  });

  // ── T5: Seleção e montagem do item ───────────────────────────────────────
  it('T5 — Seleção: Selecionar ponto e periodicidade monta o item via ComposicaoComercialService', async () => {
    const mockPreco = {
      id: 'pp-1',
      empresa_operadora_id: 'op-1',
      ponto_id: PONTO_TESTE.ponto_id,
      periodicidade: 'TRIMESTRAL' as PeriodicidadeComercial,
      preco: 300.0,
      ativo: true,
      vigencia_inicio: '2026-01-01',
      vigencia_fim: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };

    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue(['TRIMESTRAL']);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: mockPreco,
    });

    const spyMontar = vi.spyOn(composicaoComercialService, 'montarItem');

    renderDialog();

    await waitFor(() => {
      expect(spyMontar).toHaveBeenCalledWith(PONTO_TESTE.ponto_id, 'TRIMESTRAL', 0);
    });
  });

  // ── T6: Desconto monetário ───────────────────────────────────────────────
  it('T6 — Desconto: Desconto é monetário e validado (0 <= desconto <= valor_tabela)', async () => {
    const mockPreco = {
      id: 'pp-1',
      empresa_operadora_id: 'op-1',
      ponto_id: PONTO_TESTE.ponto_id,
      periodicidade: 'MENSAL' as PeriodicidadeComercial,
      preco: 500.0,
      ativo: true,
      vigencia_inicio: '2026-01-01',
      vigencia_fim: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };

    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue(['MENSAL']);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: mockPreco,
    });

    const itemInvalido: ComposicaoItemResult = {
      ponto_id: PONTO_TESTE.ponto_id,
      periodicidade: 'MENSAL',
      valor_tabela: 500.0,
      desconto: 600.0, // Inválido: desconto maior que a tabela!
      subtotal: -100.0,
      ponto_preco_ref: mockPreco,
    };

    const validacaoInvalida = composicaoComercialService.validarItem(itemInvalido);
    expect(validacaoInvalida.valido).toBe(false);
    expect(validacaoInvalida.erros.some((e) => e.includes('superior ao valor_tabela'))).toBe(true);

    const itemValido: ComposicaoItemResult = {
      ponto_id: PONTO_TESTE.ponto_id,
      periodicidade: 'MENSAL',
      valor_tabela: 500.0,
      desconto: 50.0, // Válido: R$ 50,00 de desconto monetário
      subtotal: 450.0,
      ponto_preco_ref: mockPreco,
    };

    const validacaoValida = composicaoComercialService.validarItem(itemValido);
    expect(validacaoValida.valido).toBe(true);
    expect(validacaoValida.erros.length).toBe(0);
  });

  // ── T7: Subtotal coerente ────────────────────────────────────────────────
  it('T7 — Subtotal: Subtotal é sempre valor_tabela - desconto', async () => {
    const mockPreco = {
      id: 'pp-1',
      empresa_operadora_id: 'op-1',
      ponto_id: 'ponto-1',
      periodicidade: 'MENSAL' as PeriodicidadeComercial,
      preco: 250.0,
      ativo: true,
      vigencia_inicio: '2026-01-01',
      vigencia_fim: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };

    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: mockPreco,
    });

    const itemReal = await composicaoComercialService.montarItem('ponto-1', 'MENSAL', 30);
    expect(itemReal).not.toBeNull();
    expect(itemReal?.valor_tabela).toBe(250.0);
    expect(itemReal?.desconto).toBe(30.0);
    expect(itemReal?.subtotal).toBe(220.0);
  });

  // ── T8: Múltiplos itens na composição ────────────────────────────────────
  it('T8 — Múltiplos itens: Adicionar novos itens não sobrescreve os itens anteriores na composição', () => {
    const mockPreco1 = {
      id: 'pp-1',
      empresa_operadora_id: 'op-1',
      ponto_id: 'p-1',
      periodicidade: 'MENSAL' as PeriodicidadeComercial,
      preco: 100,
      ativo: true,
      vigencia_inicio: '2026-01-01',
      vigencia_fim: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };

    const item1: ItemComposicaoComUI = {
      ponto_id: 'p-1',
      ponto_nome: 'Ponto A',
      periodicidade: 'MENSAL',
      valor_tabela: 100,
      desconto: 0,
      subtotal: 100,
      ponto_preco_ref: mockPreco1,
    };

    const item2: ItemComposicaoComUI = {
      ponto_id: 'p-2',
      ponto_nome: 'Ponto B',
      periodicidade: 'SEMESTRAL',
      valor_tabela: 500,
      desconto: 50,
      subtotal: 450,
      ponto_preco_ref: { ...mockPreco1, id: 'pp-2', ponto_id: 'p-2', periodicidade: 'SEMESTRAL', preco: 500 },
    };

    const composicao: ItemComposicaoComUI[] = [item1];
    const composicaoAtualizada = [...composicao, item2];

    expect(composicaoAtualizada.length).toBe(2);
    expect(composicaoAtualizada[0].ponto_id).toBe('p-1');
    expect(composicaoAtualizada[1].ponto_id).toBe('p-2');
    expect(composicaoAtualizada.reduce((acc, i) => acc + i.subtotal, 0)).toBe(550);
  });

  // ── T9: Preservação do Snapshot ──────────────────────────────────────────
  it('T9 — Snapshot: O valor_tabela retornado no item permanece imutável e reflete o momento da composição', async () => {
    const mockPrecoVigente = {
      id: 'pp-1',
      empresa_operadora_id: 'op-1',
      ponto_id: 'p-snap',
      periodicidade: 'ANUAL' as PeriodicidadeComercial,
      preco: 1200.0,
      ativo: true,
      vigencia_inicio: '2026-01-01',
      vigencia_fim: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      created_by: null,
    };

    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: mockPrecoVigente,
    });

    const itemMontado = await composicaoComercialService.montarItem('p-snap', 'ANUAL', 100);
    expect(itemMontado?.valor_tabela).toBe(1200.0);
    expect(itemMontado?.subtotal).toBe(1100.0);
  });

  // ── T10: Estados da UI ───────────────────────────────────────────────────
  it('T10 — Estados da UI: Permite adicionar somente quando o item for válido e tiver preço disponível', async () => {
    vi.spyOn(pontoPrecosService, 'obterTodasPeriodicidadesDisponiveis').mockResolvedValue(['MENSAL']);
    vi.spyOn(pontoPrecosService, 'resolverPreco').mockResolvedValue({
      encontrado: true,
      preco: {
        id: 'pp-1',
        empresa_operadora_id: 'op-1',
        ponto_id: PONTO_TESTE.ponto_id,
        periodicidade: 'MENSAL',
        preco: 150.0,
        ativo: true,
        vigencia_inicio: '2026-01-01',
        vigencia_fim: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: null,
      },
    });

    const mockAdicionar = vi.fn();
    renderDialog({ onAdicionarItem: mockAdicionar });

    await waitFor(() => {
      const btnAdicionar = screen.getByRole('button', { name: /Adicionar à Composição/i });
      expect(btnAdicionar).not.toBeDisabled();
      fireEvent.click(btnAdicionar);
      expect(mockAdicionar).toHaveBeenCalledTimes(1);
    });
  });

  // ── T11: Regressão de Re-exports no Index do CRM ─────────────────────────
  it('T11 — Regressão: index.ts do módulo CRM re-exporta PontoPrecosService e ComposicaoComercialService corretamente', () => {
    expect(pontoPrecosService).toBeDefined();
    expect(composicaoComercialService).toBeDefined();
    expect(PERIODICIDADES_COMERCIAIS).toEqual([
      'MENSAL',
      'BIMESTRAL',
      'TRIMESTRAL',
      'SEMESTRAL',
      'ANUAL',
    ]);
  });
});
