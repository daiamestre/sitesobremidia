import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  descontoDoItem, hojeBrasilia, ofertaParaWidget, ofertaVigente, partesPreco, precoBR, validadeTexto,
  type OfertaWidgetDados,
} from '@/lib/ofertaWidget';
import { OfferWidgetView } from '@/components/player/OfferWidget';
import type { Oferta } from '@/types/customerPortal';

// 25/09/2026 23:30 em Brasília = 26/09 02:30 UTC
const NOITE_25_BRT = new Date('2026-09-26T02:30:00Z');

const dados = (p: Partial<OfertaWidgetDados> = {}): OfertaWidgetDados => ({
  id: 'o1', titulo: 'Semana do Café', descricao: null, status: 'PUBLISHED',
  data_inicio: '2026-09-20', data_fim: '2026-09-25', vigente: true,
  itens: [{ nome: 'Café Tradicional 500g', marca: 'Serra', unidade: 'UN', imagem_url: null, preco_original: 19.9, preco_oferta: 14.9, desconto: 0, destaque: true }],
  ...p,
});

describe('W7 — widget de Oferta (dados do cadastro, nunca copiados)', () => {
  it('validade pelo dia de Brasília, não pelo UTC do aparelho', () => {
    expect(hojeBrasilia(NOITE_25_BRT)).toBe('2026-09-25');
    expect(ofertaVigente(dados(), NOITE_25_BRT)).toBe(true);
    expect(ofertaVigente(dados(), new Date('2026-09-26T03:00:00Z'))).toBe(false); // 00:00 do dia 26 em Brasília
    expect(ofertaVigente(dados({ status: 'DRAFT' }), NOITE_25_BRT)).toBe(false);
    expect(ofertaVigente(dados({ status: 'ARCHIVED' }), NOITE_25_BRT)).toBe(false);
    expect(ofertaVigente(dados({ data_inicio: '2026-09-26', data_fim: '2026-09-30' }), NOITE_25_BRT)).toBe(false);
  });

  it('converte a oferta do cadastro: só produtos ativos, destaques primeiro, até 6', () => {
    const item = (nome: string, destaque = false, ativo = true) => ({
      id: nome, oferta_id: 'o1', produto_id: nome, preco_original: 10, preco_oferta: 8, desconto_porcentagem: 20, destaque, created_at: '',
      produto: { nome, marca: null, unidade_medida: 'UN', imagem_url: null, ativo } as never,
    });
    const o = { id: 'o1', titulo: 'T', descricao: null, status: 'APPROVED', data_inicio: '2026-09-25', data_fim: '2026-09-25',
      itens: [item('B'), item('A'), item('Z', true), item('Inativo', false, false), item('C'), item('D'), item('E'), item('F')] } as unknown as Oferta;
    const w = ofertaParaWidget(o, NOITE_25_BRT);
    expect(w.itens.map((i) => i.nome)).toEqual(['Z', 'A', 'B', 'C', 'D', 'E']);
    expect(w.vigente).toBe(true);
  });

  it('formata preço, desconto e validade', () => {
    expect(precoBR(14.9)).toBe('R$ 14,90');
    expect(partesPreco(1234.5)).toEqual({ inteiro: '1.234', centavos: '50' });
    expect(descontoDoItem({ desconto: 0, preco_original: 19.9, preco_oferta: 14.9 })).toBe(25);
    expect(descontoDoItem({ desconto: 30, preco_original: 10, preco_oferta: 9 })).toBe(30);
    expect(validadeTexto('2026-09-30', NOITE_25_BRT)).toBe('Válido até 30/09');
    expect(validadeTexto('2026-09-25', NOITE_25_BRT)).toBe('Válido só hoje');
  });

  it('mostra de/por e o preço; fora da validade não mostra preço nenhum', () => {
    const { unmount } = render(<OfferWidgetView dados={dados()} config={{}} agora={NOITE_25_BRT} />);
    expect(screen.getByTestId('offer-widget')).toBeTruthy();
    expect(screen.getByText('Café Tradicional 500g')).toBeTruthy();
    expect(screen.getByText('R$ 19,90')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText(',90')).toBeTruthy();
    expect(screen.getByText('-25%')).toBeTruthy();
    expect(screen.getByText('Válido só hoje')).toBeTruthy();
    unmount();

    render(<OfferWidgetView dados={dados()} config={{}} agora={new Date('2026-09-26T03:00:00Z')} />);
    expect(screen.getByTestId('offer-widget-encerrada')).toBeTruthy();
    expect(screen.queryByText('14')).toBeNull();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
});
