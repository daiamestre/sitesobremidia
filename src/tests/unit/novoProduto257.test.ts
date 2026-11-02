// F-257 — REGRA DO DONO: um campo só, com todas as perguntas; a linha vai para a caixa de produtos, que continua editável.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { CAMPOS_VAZIOS, errosDoCampo, faltasDoProduto, linhaDoCampo } from '@/lib/tabloide/produtoCompleto';
import { lerLinha } from '@/lib/tabloide/parseProdutos';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const c = (x: Partial<typeof CAMPOS_VAZIOS>) => ({ ...CAMPOS_VAZIOS, ...x });
const completo = c({ nome: 'Biscoito Maizena', marca: 'Vitarella', sabor: 'Tradicional', quantidade: '350', unidade: 'g', preco: '5,99' });

describe('monta a linha do produto', () => {
  it('sem promoção', () => {
    const l = linhaDoCampo(completo);
    expect(l).toBe('Biscoito Maizena Tradicional Vitarella 350g 5,99');
    expect(lerLinha(l)).toMatchObject({ nome: 'Biscoito Maizena Tradicional Vitarella 350g', preco: 5.99, precoDe: null });
  });
  it('com promoção de 49 por 39', () => {
    const l = linhaDoCampo({ ...completo, promocao: true, de: '49', preco: '39' });
    expect(l).toBe('Biscoito Maizena Tradicional Vitarella 350g de 49,00 por 39,00');
    expect(lerLinha(l)).toMatchObject({ preco: 39, precoDe: 49 });
  });
  it('litros e vendido por quilo', () => {
    expect(lerLinha(linhaDoCampo(c({ nome: 'Refrigerante', marca: 'Coca-Cola', quantidade: '2', unidade: 'L', preco: '9,99' })))).toMatchObject({ nome: 'Refrigerante Coca-Cola 2L', preco: 9.99 });
    const p = lerLinha(linhaDoCampo(c({ nome: 'Picanha', unidade: 'kg', preco: '49,90' })))!;
    expect(p).toMatchObject({ nome: 'Picanha', preco: 49.9 });
    expect(faltasDoProduto(p)).toEqual([]);
  });
  it('o que sai do campo passa no aviso de produto completo', () => {
    expect(faltasDoProduto(lerLinha(linhaDoCampo(completo))!)).toEqual([]);
  });
});

describe('diz o que falta', () => {
  it('campo vazio pede tudo', () => {
    expect(errosDoCampo(CAMPOS_VAZIOS).join(' ')).toMatch(/nome do produto.*peso ou o volume.*preço/);
  });
  it('produto completo passa', () => {
    expect(errosDoCampo(completo)).toEqual([]);
  });
  it('fruta e carne não pedem marca; o resto pede', () => {
    expect(errosDoCampo(c({ nome: 'Banana', unidade: 'kg', preco: '4,99' }))).toEqual([]);
    expect(errosDoCampo({ ...completo, marca: '' }).join()).toMatch(/marca/);
  });
  it('promoção pede o preço antigo, e ele tem de ser maior', () => {
    expect(errosDoCampo({ ...completo, promocao: true }).join()).toMatch(/preço antigo/);
    expect(errosDoCampo({ ...completo, promocao: true, de: '3,00' }).join()).toMatch(/maior/);
  });
  it('peso tem de ser número', () => {
    expect(errosDoCampo({ ...completo, quantidade: 'muito' }).join()).toMatch(/número/);
  });
});

describe('as telas', () => {
  it('o campo fica em cima da caixa editável, no Studio e no Cartaz Digital', () => {
    for (const [f, caixa] of [['src/components/studio/ProdutosComFotos.tsx', 'id="encartes-texto"'], ['src/components/tabloide/TabloideEditor.tsx', 'id="tabloide-texto"']]) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t.indexOf('<NovoProduto'), f).toBeGreaterThan(0);
      expect(t.indexOf('<NovoProduto'), f).toBeLessThan(t.indexOf(caixa));
    }
  });
});
