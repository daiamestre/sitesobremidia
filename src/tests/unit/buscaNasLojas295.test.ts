/**
 * F-295 — o próprio sistema procura o produto que o cliente escreveu (sem PC e sem Claude): leitura do jeito que o cliente fala,
 * escolha do produto EXATO nas lojas (regras dos agentes) e o fluxo do encarte usando a busca antes das outras fontes.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { escolherDaLoja, itensDaResposta, nomeParaBusca, termoDaLoja, type ItemDaLoja } from '@/lib/tabloide/buscaNasLojas';
import { lerLinha } from '@/lib/tabloide/parseProdutos';

const item = (titulo: string, extra: Partial<ItemDaLoja> = {}): ItemDaLoja => ({ titulo, marca: '', foto: `https://x.vteximg.com.br/${encodeURIComponent(titulo)}.jpg`, loja: 'Loja', pagina: '', codigo: null, secao: 'mercearia', ...extra });

describe('F-295: o cliente escreve do jeito que fala', () => {
  it('"pacote com 10", "tipo 1" e "6 unidades" não viram preço; "marca" sai do nome', () => {
    const p = lerLinha('polpa de acerola marca Caruaru pacote com 10 de 400g')!;
    expect(p.preco).toBeNull();
    expect(p.nome).toBe('polpa de acerola Caruaru pacote com 10 de 400g');
    expect(lerLinha('arroz camil tipo 1 pacote de 5kg')!.preco).toBeNull();
    expect(lerLinha('Papel higiênico Neve 12 rolos 19,90')!.preco).toBe(19.9);
    expect(lerLinha('Iogurte Nestlé 6 unidades')!.preco).toBeNull();
  });
  it('número solto no fim continua sendo preço', () => {
    expect(lerLinha('Coca-Cola 2L 10')!.preco).toBe(10);
    expect(lerLinha('Arroz Camil tipo 1 5kg 24,90')!.preco).toBe(24.9);
    expect(lerLinha('Leite integral de 6,50 por 4,99')!.preco).toBe(4.99);
  });
  it('a busca usa só o que identifica o produto', () => {
    expect(nomeParaBusca('polpa de acerola marca Caruaru pacote com 10 de 400g')).toBe('polpa de acerola caruaru 400g');
    expect(termoDaLoja('polpa de acerola marca Caruaru pacote com 10 de 400g')).toBe('polpa acerola caruaru');
    expect(termoDaLoja('Arroz Camil Tipo 1 5kg')).toBe('arroz camil 1');
  });
});

describe('F-295: o produto EXATO nas lojas (regras dos agentes)', () => {
  it('marca diferente ou medida diferente nunca entra', () => {
    const itens = [item('Polpa Fruta Brasfrut 100g Acerola'), item('Polpa de Fruta Icefruit Acerola 400g')];
    expect(escolherDaLoja('polpa de acerola marca Caruaru pacote com 10 de 400g', itens)).toBeNull();
    expect(escolherDaLoja('Polpa de Acerola Brasfrut 400g', itens)).toBeNull();
  });
  it('acha o exato da marca e da medida', () => {
    const itens = [item('Polpa de Fruta Icefruit Acerola com Mamão 400g'), item('Polpa de Fruta Icefruit Acerola 400g'), item('Polpa de Fruta Caruaru Acerola 400g')];
    expect(escolherDaLoja('polpa de acerola marca Caruaru pacote com 10 de 400g', itens)?.titulo).toBe('Polpa de Fruta Caruaru Acerola 400g');
    expect(escolherDaLoja('Polpa Icefruit Acerola 400g', itens)?.titulo).toBe('Polpa de Fruta Icefruit Acerola 400g');
  });
  it('a quantidade de unidades tem de bater quando os dois dizem', () => {
    const itens = [item('Fralda Pampers Confort Sec G 92 Unidades'), item('Fralda Pampers Confort Sec G 46 Unidades')];
    expect(escolherDaLoja('Fralda Pampers Confort Sec G 46 unidades', itens)?.titulo).toBe('Fralda Pampers Confort Sec G 46 Unidades');
    expect(escolherDaLoja('Fralda Pampers Confort Sec G 30 unidades', itens)).toBeNull();
  });
  it('pediu um sabor e veio outro junto: é outro produto', () => {
    expect(escolherDaLoja('Polpa de acerola Icefruit 400g', [item('Polpa de Fruta Icefruit Acerola com Mamão 400g')])).toBeNull();
    expect(escolherDaLoja('Suco Del Valle uva 1L', [item('Suco Del Valle Uva e Maçã 1L'), item('Suco Del Valle Uva 1L')])?.titulo).toBe('Suco Del Valle Uva 1L');
  });
  it('arroz nunca recebe feijão, e kit/fardo não serve como foto de uma embalagem', () => {
    const itens = [item('Feijão Carioca Camil Tipo 1 1kg'), item('Kit 3 Arroz Camil Tipo 1 5kg'), item('Arroz Branco Camil Tipo 1 5kg')];
    expect(escolherDaLoja('Arroz Camil Tipo 1 5kg', itens)?.titulo).toBe('Arroz Branco Camil Tipo 1 5kg');
    expect(escolherDaLoja('Feijão Camil 5kg', itens)).toBeNull();
  });
  it('carne só da seção de açougue (nada de petisco de cachorro)', () => {
    const itens = [item('Petisco Picanha Bovina Para Cães 65g', { secao: '/pet/petiscos/' }), item('Picanha Bovina Friboi kg', { secao: '/acougue/bovinos/' })];
    expect(escolherDaLoja('Picanha Friboi', itens)?.titulo).toBe('Picanha Bovina Friboi kg');
  });
  it('lê a resposta do Worker no formato das lojas VTEX', () => {
    const r = [{ l: 'Atacadão', d: [{ productName: 'Polpa X', brand: 'Caruaru', link: 'https://loja/p', categories: ['/Congelados/Polpas/'], items: [{ nameComplete: 'Polpa de Acerola Caruaru 400g', ean: '7891234567895', images: [{ imageUrl: 'http://atacadaobr.vteximg.com.br/arquivos/ids/1/a.jpg?v=1' }] }] }] }];
    const [it] = itensDaResposta(r);
    expect(it).toMatchObject({ titulo: 'Polpa de Acerola Caruaru 400g', marca: 'Caruaru', loja: 'Atacadão', codigo: '7891234567895', foto: 'https://atacadaobr.vteximg.com.br/arquivos/ids/1/a.jpg' });
  });
});

describe('F-295: só imagem oficial e de qualidade', () => {
  it('sem a fragrância escrita vale o tradicional (Omo ≠ Omo Lavanda)', () => {
    expect(escolherDaLoja('Sabão em pó Omo 1,6kg', [item('Sabão em Pó Omo Lavanda 1.6kg')])).toBeNull();
    expect(escolherDaLoja('Sabão em pó Omo Lavanda 1,6kg', [item('Sabão em Pó Omo Lavanda 1.6kg')])?.titulo).toBe('Sabão em Pó Omo Lavanda 1.6kg');
  });
  it('embalado sem foto aprovada não recebe imagem inventada pela IA nem foto com fundo: vira pedido', () => {
    const s = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(s).toMatch(/if \(!vivas\.length && embalado\)/);
    expect(s).toMatch(/if \(embalado && !final\.recortada\)/);
    expect(s).toMatch(/LADO_MINIMO_DA_FOTO = 600/);
    expect(fs.readFileSync('supabase/functions/produto-imagem/index.ts', 'utf8')).toMatch(/nitida=false/);
  });
  it('os agentes trocam a imagem de IA pela oficial e continuam procurando quem só tem IA', () => {
    const s = fs.readFileSync('scripts/ops/pedidos-de-foto.mjs', 'utf8');
    expect(s).toMatch(/fonte <> 'IA'/);
    expect(s).toMatch(/WHERE tabloide_catalogo\.fonte = 'IA'/);
  });
});

describe('F-295: estrutura no ar', () => {
  it('o encarte procura nas lojas antes das outras fontes e grava no catálogo', () => {
    const s = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(s.indexOf('procurarNasLojas(p.nome)')).toBeGreaterThan(0);
    expect(s.indexOf('procurarNasLojas(p.nome)')).toBeLessThan(s.indexOf('buscarCandidatos(p.nome)'));
  });
  it('o Worker tem a rota /procurar só com as lojas da lista, e as fotos delas passam pelo passa-foto', () => {
    const w = fs.readFileSync('cloudflare/tabloide-ia/worker.js', 'utf8');
    expect(w).toMatch(/pathname === '\/procurar'/);
    expect(w).toMatch(/www\.gbarbosa\.com\.br/);
    for (const h of ['atacadaobr.vteximg.com.br', 'gbarbosa.vteximg.com.br', 'prezunic.vteximg.com.br']) expect(w).toContain(h);
  });
  it('os agentes também rodam na nuvem (GitHub), sem o PC ligado', () => {
    const y = fs.readFileSync('.github/workflows/pedidos-de-foto.yml', 'utf8');
    expect(y).toMatch(/cron:/);
    expect(y).toContain('scripts/ops/pedidos-de-foto.mjs');
  });
});
