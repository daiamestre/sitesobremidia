/**
 * F-290 — pedidos do dono: movimento LISO (por seno, sem salto), DOIS movimentos juntos, saída no fim, tamanho do produto
 * por produto, troca de cena por produto (com os efeitos novos) e régua que NÃO muda quando o dedo está rolando a lateral.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { estadoNoTempo, SAIDAS, ANIMACOES } from '@/lib/studio/animacao';
import { imagem } from '@/lib/studio/documento';
import { chaveDoProdutoNoPalco, fundosDoSegmento, palcoDoProduto, projetoDoCarrossel, transicaoDoProduto, TRANSICOES_DO_CARROSSEL } from '@/lib/studio/palco';
import { TRANSICOES } from '@/lib/studio/video/efeitos';
import { Faixa } from '@/components/studio/editor/Paineis';

const base = imagem('Produto', '/x.png', 100, 100, 400, 400);
const prod = (nome: string) => ({ nome, preco: 9.9, precoDe: null, unidade: null, imagem: null });

describe('F-290 animações', () => {
  it('pulsar é liso: de um quadro para o outro a escala muda pouco (sem salto)', () => {
    const c = { ...base, animacao: { tipo: 'zoom' as const, atraso: 0, duracao: 0.5, depois: 'pulsar' as const } };
    let anterior = estadoNoTempo(c, 1, 8).escala;
    for (let t = 1 + 1 / 60; t < 7; t += 1 / 60) {
      const e = estadoNoTempo(c, t, 8).escala;
      expect(Math.abs(e - anterior)).toBeLessThan(0.01);
      anterior = e;
    }
  });
  it('dois movimentos juntos: pulsar (escala) E balançar (giro) ao mesmo tempo', () => {
    const c = { ...base, animacao: { tipo: 'subir' as const, atraso: 0, duracao: 0.5, depois: 'pulsar' as const, depois2: 'balancar' as const } };
    const giros = [2, 2.3, 2.6].map((t) => estadoNoTempo(c, t, 8));
    expect(giros.some((e) => Math.abs(e.rot) > 0.5)).toBe(true);
    expect(giros.some((e) => Math.abs(e.escala - 1) > 0.01)).toBe(true);
  });
  it('saída no fim: some até o fim do tempo do elemento', () => {
    const c = { ...base, animacao: { tipo: 'surgir' as const, atraso: 0, duracao: 0.3, saida: { tipo: 'sumir' as const, duracao: 0.6 } } };
    expect(estadoNoTempo(c, 5, 8).alfa).toBeCloseTo(1);
    expect(estadoNoTempo(c, 8, 8).alfa).toBeCloseTo(0);
    expect(SAIDAS.length).toBeGreaterThanOrEqual(8);
    expect(ANIMACOES.map((a) => a.id)).toEqual(expect.arrayContaining(['quicar', 'virar', 'oscilar', 'tremer', 'respirar', 'girar-sempre', 'brilhar']));
  });
});

describe('F-290 palco', () => {
  const fundo = fundosDoSegmento('padaria')[0];
  it('o tamanho do PRODUTO vale só para aquele produto', () => {
    const ajustes = { '9:16': { [chaveDoProdutoNoPalco('Bolo de Coco Seven Boys 250g')]: { w: 900, h: 900 } } };
    const bolo = palcoDoProduto(prod('Bolo de Coco Seven Boys 250g'), '9:16', { fundo, ajustes } as never).camadas.find((c) => c.nome === 'Produto')!;
    const pao = palcoDoProduto(prod('Pão de Forma Wickbold 500g'), '9:16', { fundo, ajustes } as never).camadas.find((c) => c.nome === 'Produto')!;
    expect(bolo.w).toBe(900);
    expect(pao.w).not.toBe(900);
  });
  it('cada produto tem a sua troca de cena (e os efeitos novos existem no palco e no vídeo)', () => {
    const movimento = { transicao: 'dissolver' as const, transicoes: { 'bolo de coco seven boys 250g': 'flash' as const } };
    expect(transicaoDoProduto(movimento, 'Pão de Forma Wickbold 500g')).toBe('dissolver');
    const p = projetoDoCarrossel([prod('Pão de Forma Wickbold 500g'), prod('Bolo de Coco Seven Boys 250g')], '9:16', { fundo, movimento });
    expect(p.clipes.map((c) => c.transicao.tipo)).toEqual(['dissolver', transicaoDoProduto(movimento, 'Bolo de Coco Seven Boys 250g')]);
    for (const id of ['flash', 'luz', 'brilho', 'girar-tudo', 'desfocar']) {
      expect(TRANSICOES_DO_CARROSSEL.map((t) => t.id)).toContain(id);
      expect(TRANSICOES.map((t) => t.id)).toContain(id);
    }
  });
});

describe('F-290 régua à prova de rolagem', () => {
  it('dedo andando para cima/baixo (rolar) NÃO muda o valor; arrastar para o lado muda', () => {
    const mudou = vi.fn();
    render(<Faixa t="Tamanho" valor={50} min={0} max={100} onChange={mudou} />);
    const r = screen.getByRole('slider', { name: 'Tamanho' });
    r.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 28, right: 200, bottom: 28, x: 0, y: 0, toJSON: () => ({}) });
    r.setPointerCapture = () => undefined;
    fireEvent.pointerDown(r, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 10 });
    fireEvent.pointerMove(r, { pointerId: 1, pointerType: 'touch', clientX: 102, clientY: 60 });
    fireEvent.pointerMove(r, { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 90 });
    fireEvent.pointerUp(r, { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 90 });
    expect(mudou).not.toHaveBeenCalled();
    fireEvent.pointerDown(r, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 10 });
    fireEvent.pointerMove(r, { pointerId: 2, pointerType: 'touch', clientX: 160, clientY: 12 });
    expect(mudou).toHaveBeenCalled();
  });
});
