/**
 * F-279 — regra do dono: sabor é OPCIONAL; o produto sempre entra no encarte (o aviso vermelho só aparece depois, se faltar
 * algo); "É integral?" no cartão; e as listas de EXEMPLO vêm completas (nenhuma acende o aviso vermelho).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { CESTA_FARMACIA, CESTA_PADRAO, ENCARTES } from '@/lib/tabloide/encartes';
import { SEGMENTOS_DE_OFERTA } from '@/lib/studio/segmentosDeOferta';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { CAMPOS_VAZIOS, faltasDoProduto, linhaDoCampo } from '@/lib/tabloide/produtoCompleto';

describe('F-279 produtos sem bloqueio', () => {
  const cestas: Array<[string, string]> = [['mercado', CESTA_PADRAO], ['farmácia', CESTA_FARMACIA], ...ENCARTES.map((e): [string, string] => [e.id, e.produtos]), ...SEGMENTOS_DE_OFERTA.map((s): [string, string] => [s.id, s.cesta])];
  for (const [nome, cesta] of cestas) {
    it(`exemplo completo: ${nome}`, () => {
      const ps = lerLista(cesta);
      expect(ps.length).toBeGreaterThan(0);
      for (const p of ps) expect(faltasDoProduto(p), `${nome}: ${p.nome}`).toEqual([]);
    });
  }
  it('sabor opcional e integral no nome', () => {
    expect(linhaDoCampo({ ...CAMPOS_VAZIOS, nome: 'Leite', marca: 'Piracanjuba', quantidade: '1', unidade: 'L', preco: '5,49', integral: true })).toBe('Leite Integral Piracanjuba 1L 5,49');
    expect(linhaDoCampo({ ...CAMPOS_VAZIOS, nome: 'Pão Integral', marca: 'Wickbold', quantidade: '400', preco: '9,99', integral: true })).toBe('Pão Integral Wickbold 400g 9,99');
  });
  it('o cartão e a lista não bloqueiam; dúvida entre parecidos não deixa sem foto', () => {
    const novo = fs.readFileSync('src/components/tabloide/NovoProduto.tsx', 'utf8');
    expect(novo).not.toContain('errosDoCampo(c)');
    expect(novo).toContain('data-testid="novo-integral"');
    expect(novo).toContain('(opcional)');
    expect(fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8')).not.toMatch(/if \(ruins\.length\) \{ toast\.error/);
    expect(fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8')).toContain('const melhor = l ?? melhorOficial(alvo, lista);'); // F-282: só o confiável
  });
});

describe('F-280 alerta vermelho leva aos produtos', () => {
  it('F-285: quem decide a foto é o sistema (sem "confira a foto"); tocar no aviso abre a lista; tocar no produto tira o aviso dele', () => {
    const img = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(img).toContain('    if (imagem) oficiais.set(p.id, imagem);');
    expect(img).not.toContain('aoDuvidar?.(p.nome, parecidos)');
    expect(fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8')).toContain('marcarVisto(p)');
    const aviso = fs.readFileSync('src/components/tabloide/AvisoDeProdutos.tsx', 'utf8');
    expect(aviso).toContain('aoTocar');
    const lista = fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8');
    expect(lista).toContain('aoTocar={irParaCorrigir}');
    expect(lista).toContain("shadow-[0_0_14px_rgba(239,68,68,.9)] motion-safe:animate-pulse");
    expect(lista).toContain('data-atencao');
  });
  it('o motivo diz para conferir a foto', async () => {
    const { revisarProdutos } = await import('@/lib/tabloide/produtoCompleto');
    const r = revisarProdutos('', [{ nome: 'Café Pilão 500g', preco: 19.9, unidade: null, codigo: null }], [], { 'Café Pilão 500g': 27 });
    expect(r.itens[0].motivo).toMatch(/confira a foto/);
  });
});
