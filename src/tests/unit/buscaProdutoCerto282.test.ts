/**
 * F-282 — REGRA DO DONO: o produto da foto é o que o cliente escreveu; sem sabor/variante = o TRADICIONAL e mais vendido da marca.
 * Casos reais que deram errado (09/11/2026): arroz recebia foto de feijão, leite 1 L recebia leite em pó, café recebia cápsula.
 */
import { describe, expect, it } from 'vitest';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { melhorOficial, naoEhProduto, ordenarOficiais, type ProdutoOficial } from '@/lib/tabloide/buscaProduto';

const NOMES = [
  'Arroz 7 Grãos Integrais Camil 1kg', 'Arroz Culinária Italiana Camil 1kg', 'Arroz Integral Parboilizado Camil 1kg',
  'Feijão Carioca Tipo 1 Camil 1kg', 'Feijão Fradinho Camil 500g', 'Feijão Preto Tipo 1 Camil 1kg', 'Feijão Rosinha Camil 500g',
  'Leite Condensado Piracanjuba', 'Leite Condensado Zero Lactose 395g Piracanjuba', 'Leite Desnatado +Cálcio 1L Piracanjuba',
  'Leite em Pó Integral 25kg Piracanjuba', 'Como é feito o leite em pó? Piracanjuba', 'Leite UHT: segurança e praticidade para seu dia a dia Piracanjuba',
  'Café Solúvel Cafeteria 40g Pilão', 'Cápsulas Tradicional 7 10un Pilão', 'Cappuccino Tradicional 200G Pilão', 'Intenso Vácuo 500g Pilão',
  'Extra Forte Vácuo 500g Pilão', 'Tradicional Vácuo 500g Pilão', 'Tradicional Vácuo 250g Pilão', 'Cafeteria Espresso 500g Pilão',
];
const linhas: ProdutoOficial[] = NOMES.map((nome, i) => ({ nome, nome_norm: chaveCanonica(nome), imagem_url: `https://x/${i}.png` }));
const escolha = (pedido: string) => melhorOficial(pedido, linhas)?.nome ?? null;

describe('F-282 o produto certo pelo que o cliente escreveu', () => {
  it('arroz nunca recebe feijão (e sem o arroz tipo 1 no catálogo, nenhum aleatório da marca)', () => {
    expect(escolha('Arroz Tipo 1 Camil 1kg')).toBeNull();
    for (const l of ordenarOficiais('Arroz Tipo 1 Camil 1kg', linhas)) expect(l.nome).not.toMatch(/feij/i);
  });
  it('feijão recebe feijão; sem dizer a cor, o carioca (tradicional)', () => {
    expect(escolha('Feijão Carioca Camil 1kg')).toBe('Feijão Carioca Tipo 1 Camil 1kg');
    expect(escolha('Feijão Camil 1kg')).toBe('Feijão Carioca Tipo 1 Camil 1kg');
    expect(escolha('Feijão Preto Camil 1kg')).toBe('Feijão Preto Tipo 1 Camil 1kg');
  });
  it('leite integral 1L nunca recebe leite em pó, condensado ou desnatado', () => {
    expect(escolha('Leite Integral Piracanjuba 1L')).toBeNull();
    expect(escolha('Leite Piracanjuba 1L')).toBeNull(); // só há o desnatado de 1L: variante não pedida
    expect(escolha('Leite Desnatado Piracanjuba 1L')).toBe('Leite Desnatado +Cálcio 1L Piracanjuba');
    expect(escolha('Leite Condensado Piracanjuba')).toBe('Leite Condensado Piracanjuba');
  });
  it('café sem detalhe = o tradicional em pó do peso pedido (nada de cápsula, solúvel ou cappuccino)', () => {
    expect(escolha('Café Pilão 500g')).toBe('Tradicional Vácuo 500g Pilão');
    expect(escolha('Café Pilão 250g')).toBe('Tradicional Vácuo 250g Pilão');
    expect(escolha('Café Pilão Extra Forte 500g')).toBe('Extra Forte Vácuo 500g Pilão');
    expect(escolha('Café Solúvel Pilão 40g')).toBe('Café Solúvel Cafeteria 40g Pilão');
  });
  it('título de artigo nunca é produto', () => {
    expect(naoEhProduto('Como é feito o leite em pó? Piracanjuba')).toBe(true);
    expect(naoEhProduto('Leite UHT: segurança e praticidade para seu dia a dia Piracanjuba')).toBe(true);
    expect(naoEhProduto('Tradicional Vácuo 500g Pilão')).toBe(false);
  });
});

describe('F-283 trocar foto: só o produto e os relacionados; nada aleatório', () => {
  const comMarca: ProdutoOficial[] = [
    ['Feijão Carioca Tipo 1 Camil 1kg', 'Camil'], ['Feijão Preto Tipo 1 Camil 1kg', 'Camil'], ['Arroz Branco Tipo 1 Camil 5kg', 'Camil'],
    ['Arroz Integral Parboilizado Camil 1kg', 'Camil'], ['Arroz Branco Tipo 1 Camil 2kg', 'Camil'], ['Arroz Tipo 1 Tio João 1kg', 'Tio João'],
  ].map(([nome, marca], i) => ({ nome, nome_norm: chaveCanonica(nome), imagem_url: `https://y/${i}.png`, credito: `Imagem oficial ${marca} (via Loja)` }));
  it('Arroz Tipo 1 Camil 1kg: só arroz Camil (2 kg e 5 kg antes do integral); nunca feijão nem outra marca', async () => {
    const { relacionadosDaMarca } = await import('@/lib/tabloide/buscaProduto');
    const nomes = relacionadosDaMarca('Arroz Tipo 1 Camil 1kg', comMarca).map((l) => l.nome);
    expect(nomes.every((n) => /arroz/i.test(n) && /camil/i.test(n))).toBe(true);
    expect(nomes.slice(0, 2)).toEqual(expect.arrayContaining(['Arroz Branco Tipo 1 Camil 2kg', 'Arroz Branco Tipo 1 Camil 5kg']));
    expect(nomes[nomes.length - 1]).toBe('Arroz Integral Parboilizado Camil 1kg');
  });
  it('produto embalado nunca recebe foto de banco de imagens; fresco só com a IA confirmando', async () => {
    const { fotosAceitas } = await import('@/lib/tabloide/imagens');
    const c = (fonte: string, conferido?: boolean) => ({ url: `https://z/${fonte}${conferido}`, miniatura: '', legenda: '', fonte, conferido }) as never;
    const embalado = fotosAceitas('Arroz Tipo 1 Camil 1kg', [c('WIKIMEDIA'), c('OPENVERSE', true), c('PEXELS', true), c('OPENFOODFACTS')]);
    expect(embalado.map((x: { fonte: string }) => x.fonte)).toEqual(['OPENFOODFACTS']);
    const fresco = fotosAceitas('Picanha kg', [c('WIKIMEDIA'), c('PEXELS', true), c('PIXABAY', false)]);
    expect(fresco.map((x: { fonte: string }) => x.fonte)).toEqual(['PEXELS']);
  });
});
