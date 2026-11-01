// F-242 — Palco de Ofertas: balão legível (DE x POR vermelho, POR APENAS verde, R$ e valor brancos), 8 s por produto,
// o cliente escolhe o movimento e a troca do carrossel; NOME + MARCA + MEDIDA + PREÇO obrigatórios, "é promoção?", a foto
// escolhida fica guardada no catálogo; tela compacta (Seus produtos fechado) e textos centralizados em todo botão e balão.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { FUNDOS_DO_PALCO, ENTRADAS, SEGUNDOS_POR_PRODUTO, TRANSICOES_DO_CARROSSEL, palcoDoProduto, projetoDoCarrossel, seloDoPreco } from '@/lib/studio/palco';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const produto = { nome: 'Arroz Camil 5kg', preco: 24.9, precoDe: null as number | null, unidade: null, imagem: null };
const fundo = FUNDOS_DO_PALCO[0];

describe('balão de preço do palco', () => {
  it('fora de promoção: "POR APENAS" em verde; R$ e valor em branco, com contorno para ler no amarelo', () => {
    expect(seloDoPreco(produto, 0, 0, 200)).toMatchObject({ tipo: 'selo', nome: 'Preço', topo: 'POR APENAS', corTopo: '#0a8a3a', moeda: 'R$', valor: '24', sufixo: ',90', corValor: '#ffffff', contornoValor: { cor: '#c4001d' }, realista: true });
  });
  it('em promoção: "DE x POR" em vermelho, R$ e valor em branco', () => {
    expect(seloDoPreco({ ...produto, precoDe: 49.9 }, 0, 0, 200)).toMatchObject({ topo: 'DE 49,90 POR', corTopo: '#d90f1f', corValor: '#ffffff' });
  });
  it('sem preço, sem balão', () => { expect(seloDoPreco({ ...produto, preco: null }, 0, 0, 200)).toBeNull(); });
});

describe('movimento e tempo do palco', () => {
  it('cada produto fica 8 s, no documento e no vídeo', () => {
    expect(SEGUNDOS_POR_PRODUTO).toBe(8);
    expect(palcoDoProduto(produto, '9:16', { fundo }).video?.duracao).toBe(8);
    expect(projetoDoCarrossel([produto], '16:9', { fundo }).clipes[0].duracao).toBe(8);
  });
  it('o cliente escolhe de que lado entram o produto, o nome e o balão; sem escolha, fica o padrão', () => {
    const d = palcoDoProduto(produto, '16:9', { fundo, movimento: { produto: 'direita', nome: 'zoom', preco: 'descer' } });
    const c = (n: string) => d.camadas.find((x) => x.nome === n)!;
    expect(c('Produto').animacao).toMatchObject({ tipo: 'direita', depois: 'flutuar' });
    expect(c('Nome do produto').animacao).toMatchObject({ tipo: 'zoom' });
    expect(c('Preço').animacao).toMatchObject({ tipo: 'descer', depois: 'pulsar' });
    expect(palcoDoProduto(produto, '16:9', { fundo }).camadas.find((x) => x.nome === 'Produto')?.animacao).toMatchObject({ tipo: 'subir' });
  });
  it('o lado da troca do carrossel chega ao vídeo; as opções existem', () => {
    expect(projetoDoCarrossel([produto, produto], '9:16', { fundo, movimento: { transicao: 'deslizar-direita' } }).clipes[0].transicao.tipo).toBe('deslizar-direita');
    expect(projetoDoCarrossel([produto, produto], '9:16', { fundo }).clipes[0].transicao.tipo).toBe('deslizar-esquerda');
    expect(ENTRADAS.map((e) => e.id)).toEqual(expect.arrayContaining(['subir', 'descer', 'esquerda', 'direita']));
    expect(TRANSICOES_DO_CARROSSEL.map((e) => e.id)).toEqual(expect.arrayContaining(['deslizar-esquerda', 'deslizar-direita', 'deslizar-cima']));
  });
  it('o botão fica com o texto centrado na caixa dele', () => {
    const d = palcoDoProduto(produto, '16:9', { fundo });
    const b = d.camadas.find((x) => x.nome === 'Botão')!, t = d.camadas.find((x) => x.nome === 'Botão — texto')!;
    expect(t).toMatchObject({ alinhamento: 'center' });
    expect(t.x + t.w / 2).toBeCloseTo(b.x + b.w / 2, 3);
    expect(t.y + t.h / 2).toBeCloseTo(b.y + b.h / 2, 3);
  });
});

describe('produtos obrigatórios', () => {
  it('nome + marca + medida + preço; carnes e frutas não têm marca; código de barras já traz', async () => {
    const { faltasDoProduto } = await import('@/components/studio/ProdutosComFotos');
    const p = (nome: string, preco: number | null = 9.9, unidade: string | null = null, codigo?: string) => ({ nome, preco, unidade, codigo });
    expect(faltasDoProduto(p('Arroz Camil 5kg'))).toEqual([]);
    expect(faltasDoProduto(p('Coca-Cola Original 2L'))).toEqual([]);
    expect(faltasDoProduto(p('Picanha', 69.9, 'KG'))).toEqual([]);
    expect(faltasDoProduto(p('Arroz Camil'))).toEqual(['medida (kg, g, L, ml ou un)']);
    expect(faltasDoProduto(p('Arroz 5kg'))).toEqual(['marca']);
    expect(faltasDoProduto(p('Arroz Camil 5kg', null))).toEqual(['preço']);
    expect(faltasDoProduto(p('7891234567890', null, null, '7891234567890'))).toEqual(['preço']);
  });
});

describe('as telas', () => {
  const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
  const painel = fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8');
  it('o palco tem a edição do produto, tocar no nome/preço/foto, a fila, e o movimento', () => {
    expect(palco).toMatch(/<PalcoEditavel /);
    for (const c of ['palco-nome', 'palco-promocao', 'palco-preco', 'palco-trocar-foto', 'palco-fila', 'palco-mov-transicao']) expect(palco, c).toContain(c);
  });
  it('"Seus produtos" começa fechado, com exemplos, e a foto escolhida é gravada no catálogo', () => {
    expect(painel).toMatch(/aberto: abertoInicial = false/);
    expect(painel).toContain('NOME + MARCA + MEDIDA');
    expect(painel).toMatch(/salvarNoCatalogo\(produto\.nome, pronta, 'ESCOLHA', true\)/);
    expect(painel).toContain('produto-promocao');
  });
  it('a janela de foto é uma só no Cartaz Digital e no Studio', () => {
    expect(fs.readFileSync('src/components/tabloide/TabloideEditor.tsx', 'utf8')).toMatch(/from '\.\/TrocarFoto'/);
    expect(painel).toMatch(/from '@\/components\/tabloide\/TrocarFoto'/);
  });
  it('todo texto e balão centraliza pela medida real da letra', () => {
    const d = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(d).toMatch(/measureText\('H'\)\.actualBoundingBoxAscent/);
    expect(d).toMatch(/textosDoSelo\(ctx, c, r \* 0\.96, false\)/);
  });
});
