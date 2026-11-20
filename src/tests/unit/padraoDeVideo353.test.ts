/**
 * F-353 (pedido do dono, 20/11/2026) — o PADRÃO de criação de vídeo igual ao concorrente:
 *  - passo a passo: 1) logo da promoção, fundo, balão, começo e frases · 2) loja · 3) produtos · 4) locutor e música → Criar;
 *  - sem fogo no fundo e no preço (nem nos vídeos salvos antes);
 *  - toda logo do início cai e bate no fundo com o mesmo som; começa com a logo da promoção ou com a do cliente;
 *  - som de dinheiro a cada produto (opcional); frases do início e do fim em letra 3D;
 *  - balões de preço novos (estrela OFERTA!!! da referência e variações), escolhidos no passo a passo e trocados na edição.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESTILOS_DE_BALAO, FUNDOS_DO_PALCO, palcoDoProduto, projetoDoCarrossel, vinhetaDoPalco } from '@/lib/studio/palco';
import { impactoResolvido } from '@/lib/studio/impacto';
import { FOGO_PROIBIDO } from '@/lib/studio/desenhar';
import { fraseEm3D } from '@/lib/studio/logo3d';
import { inicios } from '@/lib/studio/video/linha';

const prod = (nome: string, preco: number) => ({ nome, preco, precoDe: null as number | null, unidade: 'UN', imagem: { url: 'https://x/y.png', fonte: 'MARCA' as const } });
const produtos = [prod('Costela Ponta de Agulha KG', 23.99), prod('Leite Italac', 4.79), prod('Mussarela 100g', 3.99)];
const o = { fundo: FUNDOS_DO_PALCO[0], textoBotao: 'OFERTAS', loja: 'Mercado Bom Preço', movimento: {} };
const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');

describe('F-353: padrão de vídeo do dono', () => {
  it('sem fogo no fundo e no preço, em todos os modelos', () => {
    const i = impactoResolvido({ chamas: true, explosao: true }, 'mercado');
    expect(i.chamas).toBe(false);
    expect(i.explosao).toBe(false);
    for (const f of FUNDOS_DO_PALCO) {
      const d = palcoDoProduto(produtos[0], '9:16', { ...o, fundo: f });
      expect(d.camadas.some((c) => FOGO_PROIBIDO.has(c.nome)), f.id).toBe(false);
      expect(d.efeitos?.chamas ?? false).toBe(false);
      expect(d.efeitos?.explosao ?? false).toBe(false);
    }
    // os salvos antes: o desenho ignora as camadas de fogo
    expect(fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8')).toContain("if (c.tipo === 'efeito' && FOGO_PROIBIDO.has(c.nome)) return;");
  });

  it('o vídeo começa com a logo da promoção (ou a do cliente) caindo, com o MESMO som de impacto', () => {
    for (const inicio of ['promocao', 'loja'] as const) {
      const p = projetoDoCarrossel(produtos, '9:16', { ...o, logoDaLoja: { url: '/minha.png' }, movimento: { impacto: { inicio } } });
      const ab = p.clipes[0].documento!;
      const logo = ab.camadas.find((c) => c.nome === 'Logo do início') as { src: string; animacao: { tipo: string } };
      expect(logo.animacao.tipo).toBe('cair-do-ceu');
      expect(logo.src).toBe(inicio === 'loja' ? '/minha.png' : o.fundo.logoPadrao.url);
      expect((p.sons ?? []).filter((s) => s.som === 'impacto')).toHaveLength(1);
    }
  });

  it('som de dinheiro a cada produto (opcional)', () => {
    const p = projetoDoCarrossel(produtos, '9:16', o);
    const ini = inicios(p.clipes);
    const caixas = (p.sons ?? []).filter((s) => s.som === 'caixa');
    for (let k = 1; k <= produtos.length; k++) expect(caixas.some((s) => Math.abs(s.em - (ini[k] + 0.25)) < 0.01), `produto ${k}`).toBe(true);
    const sem = projetoDoCarrossel(produtos, '9:16', { ...o, movimento: { impacto: { dinheiro: false } } });
    expect((sem.sons ?? []).filter((s) => s.som === 'caixa').length).toBeLessThan(caixas.length);
  });

  it('as frases do início e do fim em letra 3D profissional', () => {
    const cfg = fraseEm3D('Vem pra cá\neconomizar!');
    expect(cfg.linhas.map((l) => l.texto)).toEqual(['VEM PRA CÁ', 'ECONOMIZAR!']);
    expect(cfg.fonte).toBe('archivo');
    const fe = vinhetaDoPalco('fechamento', produtos[0], '9:16', { ...o, movimento: { impacto: { textoFechamento: 'VEM PRA CÁ\nECONOMIZAR!' } } }, 3.4);
    expect(decodeURIComponent((fe.camadas.find((c) => c.nome === 'Frase do fechamento') as { src: string }).src)).toContain('ECONOMIZAR!');
  });

  it('balões novos da referência: a estrela OFERTA!!! e variações, um objeto só, escolhidos e trocados', () => {
    const estrelas = Object.entries(ESTILOS_DE_BALAO).filter(([, c]) => (c as { formato?: string }).formato === 'estrela');
    expect(estrelas.length).toBeGreaterThanOrEqual(6);
    const d = palcoDoProduto(produtos[0], '9:16', { ...o, movimento: { balao: 'estrela-oferta' } });
    const preco = d.camadas.find((c) => c.nome === 'Preço');
    expect(preco).toMatchObject({ tipo: 'selo', formato: 'estrela', topo: 'OFERTA!!!', valor: '23', sufixo: ',99' });
    expect(palco).toContain('<EscolhaDoBalao atual={movimento.balao ?? null}');
    expect(palco).toContain('data-testid="palco-secao-balao"');
  });

  it('o passo a passo: logo e fundo → loja → produtos → locutor e música (sem etapa de edição)', () => {
    const ids = [...palco.matchAll(/^ {8}id: '([a-z]+)', titulo: '([^']+)'/gm)].map((m) => [m[1], m[2]]);
    expect(ids).toEqual([['visual', 'Logo e fundo'], ['loja', 'Sua empresa'], ['produtos', 'Produtos'], ['locucao', 'Locutor e música']]);
  });
});

describe('F-354: produto com verso ou variações (2 ou 3 fotos lado a lado)', () => {
  const img = (u: string) => ({ url: u, fonte: 'MARCA' as const });
  it('uma foto: o produto sozinho, como sempre', () => {
    const d = palcoDoProduto(produtos[1], '9:16', o);
    expect(d.camadas.filter((c) => /^Produto( [23])?$/.test(c.nome))).toHaveLength(1);
  });
  it('três fotos: lado a lado, levemente sobrepostas, dentro do espaço do produto, cada uma editável', () => {
    const p = { ...produtos[1], imagem: img('/semi.png'), imagensExtras: [img('/integral.png'), img('/desnatado.png')] };
    for (const fundo of [FUNDOS_DO_PALCO[0], null]) {
      const d = palcoDoProduto(p, '9:16', { ...o, fundo });
      const fotos = d.camadas.filter((c) => /^Produto( [23])?$/.test(c.nome)) as Array<{ nome: string; src: string; x: number; w: number }>;
      expect(fotos.map((f) => f.nome)).toEqual(['Produto', 'Produto 2', 'Produto 3']);
      expect(fotos.map((f) => f.src)).toEqual(['/semi.png', '/integral.png', '/desnatado.png']);
      // em ordem, da esquerda para a direita, encostando (sobreposição leve)
      expect(fotos[1].x).toBeGreaterThan(fotos[0].x);
      expect(fotos[1].x).toBeLessThan(fotos[0].x + fotos[0].w);
      expect(fotos[2].x + fotos[2].w - fotos[0].x).toBeLessThanOrEqual(1080);
    }
    // e entra no vídeo
    const v = projetoDoCarrossel([p], '9:16', o);
    expect(v.clipes.some((c) => c.documento?.camadas.some((x) => x.nome === 'Produto 3'))).toBe(true);
  });
  it('a lista de produtos tem o "+foto" (verso ou variação) e tira a foto a mais com um toque', () => {
    const lista = fs.readFileSync('src/components/studio/ProdutosComFotos.tsx', 'utf8');
    expect(lista).toContain('data-testid="produto-mais-foto"');
    expect(lista).toContain('data-testid="produto-foto-extra"');
    expect(lista).toMatch(/prepararFotoDoProduto\(imagem, produto\.nome\)/);
  });
});
