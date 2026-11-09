// F-256 — REGRA DO DONO: o cliente escreve nome, peso e preço, e o sistema traz exatamente o produto descrito.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { diferenca, lerBusca, ordenarOficiais, palavrasFortes, produtoExato, type ProdutoOficial } from '@/lib/tabloide/buscaProduto';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { explicarFaltas, revisarProdutos } from '@/lib/tabloide/produtoCompleto';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const of = (nome: string): ProdutoOficial => ({ nome, nome_norm: chaveCanonica(nome), imagem_url: `https://x/${chaveCanonica(nome).replace(/\s/g, '-')}.png` });
const base = ['Maizena Tradicional Vitarella 350g', 'Maizena Integral Vitarella 350g', 'Maizena Leite Vitarella 350g', 'Maria Tradicional Vitarella 350g', 'Cream Cracker Tradicional Vitarella 350g', 'Cream Cracker Tradicional Vitarella 400g', 'Molho de Tomate Tradicional Cepêra 300g', 'Guaraná Dolly', 'Maizena Isabela 400g'].map(of);

describe('entende o que foi escrito', () => {
  it('peso e volume em qualquer forma', () => {
    expect(lerBusca('Arroz 5 kg')).toMatchObject({ medida: 5000, unidade: 'g' });
    expect(lerBusca('Arroz 5000 gramas')).toMatchObject({ medida: 5000, unidade: 'g' });
    expect(lerBusca('Coca 2 litros')).toMatchObject({ medida: 2000, unidade: 'ml' });
    expect(lerBusca('Coca 1,5l')).toMatchObject({ medida: 1500, unidade: 'ml' });
    expect(lerBusca('Leite 200 ml')).toMatchObject({ medida: 200, unidade: 'ml' });
  });
  it('a consulta ao banco não exige a palavra do tipo', () => {
    expect(palavrasFortes(lerBusca('Biscoito Maizena Vitarella 350g')).sort()).toEqual(['maizena', 'vitarella']);
  });
});

describe('traz exatamente o produto descrito', () => {
  it('com ou sem a palavra do tipo, e o tradicional quando não diz o sabor', () => {
    expect(produtoExato('Biscoito Maizena Vitarella 350g', base)?.nome).toBe('Maizena Tradicional Vitarella 350g');
    expect(produtoExato('Maizena Vitarella 350 gramas', base)?.nome).toBe('Maizena Tradicional Vitarella 350g');
  });
  it('o sabor escrito manda', () => {
    expect(produtoExato('Maizena Integral Vitarella 350g', base)?.nome).toBe('Maizena Integral Vitarella 350g');
  });
  it('o peso escrito manda: nunca outro tamanho', () => {
    expect(produtoExato('Cream Cracker Vitarella 400g', base)?.nome).toBe('Cream Cracker Tradicional Vitarella 400g');
    expect(produtoExato('Cream Cracker Vitarella 500g', base)).toBeNull();
    expect(diferenca(lerBusca('Maizena Vitarella 0,35kg'), chaveCanonica('Maizena Tradicional Vitarella 350g'))).toBe(0);
  });
  it('produto que não existe na marca não vira outro', () => {
    expect(produtoExato('Maizena Chocolate Vitarella 350g', base)).toBeNull();
    expect(produtoExato('Coca-Cola 2L', base)).toBeNull();
  });
  it('sem dizer a marca há dúvida: o cliente escolhe na lista, com as duas marcas', () => {
    expect(produtoExato('Maizena', base)).toBeNull();
    expect(ordenarOficiais('Maizena', base).map((l) => l.nome)).toEqual(expect.arrayContaining(['Maizena Isabela 400g', 'Maizena Tradicional Vitarella 350g']));
  });
  // F-285: o nome oficial sem o peso vale quando TODAS as palavras batem (o peso do cliente completa o nome)
  it('o nome oficial sem peso vale para quem pediu o peso, se todas as palavras batem', () => {
    expect(produtoExato('Guaraná Dolly 2L', base)?.nome).toBe('Guaraná Dolly');
    expect(ordenarOficiais('Guaraná Dolly 2L', base).map((l) => l.nome)).toEqual(['Guaraná Dolly']);
    expect(produtoExato('Guaraná Dolly', base)?.nome).toBe('Guaraná Dolly');
  });
  it('a mesma foto não aparece duas vezes na lista', () => {
    expect(ordenarOficiais('Maizena Tradicional Vitarella', [base[0], { ...base[0], nome: 'Outro nome' }])).toHaveLength(1);
  });
});

describe('o caminho no sistema', () => {
  const i = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
  it('a imagem da marca vem antes das fontes externas; só a escolha do anunciante vale mais', () => {
    const c = i.slice(i.indexOf('export async function completarImagens'));
    expect(c.indexOf('await produtoDaMarca(p.nome)')).toBeLessThan(c.indexOf('await buscarCandidatos(p.nome)'));
    expect(c).toContain("achada?.doCliente || achada?.fonte === 'MARCA'");
  });
  it('a imagem da marca não passa pelo recorte', () => {
    expect(i).toMatch(/fonte: 'MARCA', credito: l\.credito \?\? undefined, recortada: true/);
  });
  it('a janela de trocar foto mostra as imagens oficiais primeiro e leva o nome do produto', () => {
    const t = fs.readFileSync('src/components/tabloide/TrocarFoto.tsx', 'utf8');
    expect(t).toContain('Imagem oficial da marca');
    expect(t).toContain('aoEscolher(imagemDaMarca(l), l.nome)');
  });
});

describe('aviso de produto incompleto', () => {
  const texto = ['Arroz Camil 5kg 24,90', 'Feijão Turquesa 1kg', 'Café 8,90', 'Coca-Cola 2L 9,99'].join('\n');
  it('diz qual produto está incompleto e o que falta', () => {
    const r = revisarProdutos(texto, []);
    expect(r.total).toBe(4);
    expect(r.itens.map((i) => i.nome)).toEqual(['Feijão Turquesa 1kg', 'Café']);
    expect(r.itens[0].motivo).toBe('falta o preço');
    expect(r.itens[1].motivo).toBe('falta a medida (kg, g, L, ml ou un) e a marca');
  });
  it('produto da lista conta uma vez só, mesmo escrito na caixa', () => {
    const r = revisarProdutos('Café 8,90', [{ nome: 'Café', preco: 8.9, unidade: null, codigo: null }]);
    expect(r.total).toBe(1);
  });
  it('produto completo que o sistema não achou também avisa', () => {
    expect(revisarProdutos('Arroz Camil 5kg 24,90', [], ['Arroz Camil 5kg']).itens[0].motivo).toMatch(/não achamos a imagem/);
  });
  it('fruta não precisa de marca; código de barras não precisa de nome', () => {
    expect(revisarProdutos('Banana kg 5,99\n7891000100103 9,99', []).itens).toEqual([]);
  });
  it('nome que já é a marca não pede marca', () => {
    expect(revisarProdutos('Coca-Cola 2L 9,99\nNescau 400g 7,99', []).itens).toEqual([]);
  });
  // F-279/F-282: sabor é opcional — com vários parecidos entra o tradicional confiável e o aviso pede para conferir a foto
  it('produto que bate com vários pede para conferir a foto', () => {
    expect(revisarProdutos('Molho de Tomate Cepêra 300g 4,99', [], [], { 'Molho de Tomate Cepêra 300g': 5 }).itens[0].motivo).toMatch(/confira a foto: .*achamos 5 parecidos/);
  });
  it('em dúvida, sem um oficial confiável, segue para as outras fontes (nunca um aleatório da marca)', () => {
    const img = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(img).toContain('const melhor = l ?? melhorOficial(alvo, lista);');
    expect(img).not.toContain('if (emDuvida.has(p.id)) { resolver(p.id, null); continue; }');
  });
  it('a frase junta as faltas', () => {
    expect(explicarFaltas(['preço', 'marca'])).toBe('falta o preço e a marca');
  });
  it('o aviso é vermelho, pulsa e aparece nas duas telas de produtos', () => {
    const a = fs.readFileSync('src/components/tabloide/AvisoDeProdutos.tsx', 'utf8');
    expect(a).toContain('text-red-500');
    expect(a).toContain('animate-pulse');
    for (const f of ['src/components/studio/ProdutosComFotos.tsx', 'src/components/tabloide/TabloideEditor.tsx']) expect(fs.readFileSync(f, 'utf8'), f).toContain('<AvisoDeProdutos');
  });
});
