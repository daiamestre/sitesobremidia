/**
 * F-146 — Tela inicial: o conteúdo passava por cima do cabeçalho ao rolar; só "Área Corporativa" tinha a borda azulada
 * (parecia sempre selecionada). Agora todas têm a borda azul e a que o usuário toca fica verde antes de abrir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Index from '@/pages/Index';

function Destino() {
  const l = useLocation();
  return <span data-testid="destino">{l.pathname + l.search}</span>;
}

const abrir = () => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="*" element={<Destino />} />
    </Routes>
  </MemoryRouter>,
);

describe('F-146 — tela inicial', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('o cabeçalho fica acima do conteúdo que rola', () => {
    abrir();
    const cabecalho = screen.getByTestId('cabecalho-inicio');
    expect(cabecalho.className).toContain('sticky');
    expect(cabecalho.className).toContain('z-40');
    expect(cabecalho.className).not.toMatch(/\brelative\b/);
    expect(document.querySelector('main')!.className).toContain('z-10');
  });

  it('as quatro opções começam iguais, com a borda azulada, e nenhuma selecionada', () => {
    abrir();
    const opcoes = screen.getAllByTestId('opcao-acesso');
    expect(opcoes).toHaveLength(4);
    const classes = opcoes.map((o) => (o.firstElementChild as HTMLElement).className.replace(/\s+/g, ' ').trim());
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toContain('border-primary/50');
    expect(opcoes.every((o) => o.dataset.escolhido === 'nao')).toBe(true);
  });

  it('ao tocar, só a opção escolhida fica verde e depois abre o acesso dela', async () => {
    abrir();
    const opcoes = screen.getAllByTestId('opcao-acesso');
    fireEvent.click(opcoes[2]); // Gestor de Mídias
    expect(opcoes.map((o) => o.dataset.escolhido)).toEqual(['nao', 'nao', 'sim', 'nao']);
    const cartao = opcoes[2].firstElementChild as HTMLElement;
    expect(cartao.className).toContain('border-emerald-400');
    expect(cartao.style.boxShadow).toContain('16,185,129');
    expect((opcoes[3].firstElementChild as HTMLElement).className).toContain('border-primary/50');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByTestId('destino')).toHaveTextContent('/auth?tab=login&role=gestor');
  });
});
