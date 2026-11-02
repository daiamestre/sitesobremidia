// F-253 — REGRA DO DONO: nenhum recorte com defeito é entregue. O sistema inspeciona contra a foto original, conserta o que dá e
// reprova o resto; o aprovado sai com contorno limpo, sem halo, e nítido.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { acabamento, inspecionar, realcar, repararMordidas, MENSAGEM_DO_DEFEITO } from '@/lib/tabloide/qualidadeRecorte';
import { fotoEmTamanhoReal, guardarFotoDoProduto } from '@/lib/tabloide/imagens';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(async () => ({ data: null, error: null })), functions: { invoke: vi.fn() } } }));

const W = 120, H = 120;
/** Foto: fundo liso com um produto de `cor` no retângulo; recorte: a mesma área opaca. */
function cena(fundo: number[], cor: number[], x0 = 20, y0 = 20, x1 = 100, y1 = 100) {
  const foto = new Uint8ClampedArray(W * H * 4), rec = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dentro = x >= x0 && x < x1 && y >= y0 && y < y1, i = (y * W + x) * 4;
    const c = dentro ? cor : fundo;
    foto.set([c[0], c[1], c[2], 255], i);
    rec.set(dentro ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0], i);
  }
  return { foto, rec };
}
const alfa = (d: Uint8ClampedArray, x: number, y: number) => d[(y * W + x) * 4 + 3];
const apagar = (d: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d[(y * W + x) * 4 + 3] = 0; };

describe('consertar antes de entregar', () => {
  it('embalagem branca em fundo branco: o pedaço que o recorte comeu volta', () => {
    const { foto, rec } = cena([255, 255, 255], [250, 250, 250]);
    apagar(rec, 45, 20, 70, 38);
    expect(repararMordidas(foto, rec, W, H)).toBeGreaterThan(0);
    expect(alfa(rec, 60, 30)).toBe(255);
    expect(alfa(rec, 60, 10)).toBe(0);
  });
  it('reentrância com borda de verdade (pescoço da garrafa) continua como está', () => {
    const { foto, rec } = cena([255, 255, 255], [180, 20, 20]);
    for (let y = 20; y < 38; y++) for (let x = 45; x < 70; x++) foto.set([255, 255, 255, 255], (y * W + x) * 4);
    apagar(rec, 45, 20, 70, 38);
    expect(repararMordidas(foto, rec, W, H)).toBe(0);
    expect(alfa(rec, 60, 30)).toBe(0);
  });
  it('um risco no meio do produto não sobrevive', () => {
    const { foto, rec } = cena([255, 255, 255], [250, 250, 250]);
    apagar(rec, 45, 20, 70, 38);
    apagar(rec, 20, 60, 100, 61);
    repararMordidas(foto, rec, W, H);
    expect(alfa(rec, 60, 60)).toBe(255);
  });
  it('peça solta perto do produto (etiqueta, tira) não fica', () => {
    const { foto, rec } = cena([255, 255, 255], [200, 30, 30], 30, 30, 100, 100);
    for (let y = 2; y < 22; y++) for (let x = 40; x < 80; x++) rec.set([200, 30, 30, 255], (y * W + x) * 4);
    repararMordidas(foto, rec, W, H);
    expect(alfa(rec, 60, 10)).toBe(0);
    expect(alfa(rec, 60, 60)).toBe(255);
  });
  it('dois produtos de tamanho parecido continuam os dois', () => {
    const { foto, rec } = cena([255, 255, 255], [200, 30, 30], 5, 30, 50, 100);
    for (let y = 30; y < 100; y++) for (let x = 65; x < 110; x++) { rec.set([20, 30, 200, 255], (y * W + x) * 4); foto.set([20, 30, 200, 255], (y * W + x) * 4); }
    repararMordidas(foto, rec, W, H);
    expect(alfa(rec, 30, 60)).toBe(255);
    expect(alfa(rec, 85, 60)).toBe(255);
  });
  it('furo no meio do pacote volta; o vazio da alça, que mostra o fundo da foto, fica', () => {
    const janela = cena([255, 255, 255], [200, 30, 30]);
    for (let y = 50; y < 70; y++) for (let x = 50; x < 70; x++) janela.foto.set([90, 60, 40, 255], (y * W + x) * 4);
    apagar(janela.rec, 50, 50, 70, 70);
    repararMordidas(janela.foto, janela.rec, W, H);
    expect(alfa(janela.rec, 60, 60)).toBe(255);
    const alca = cena([255, 255, 255], [200, 30, 30]);
    for (let y = 50; y < 70; y++) for (let x = 50; x < 70; x++) alca.foto.set([255, 255, 255, 255], (y * W + x) * 4);
    apagar(alca.rec, 50, 50, 70, 70);
    repararMordidas(alca.foto, alca.rec, W, H);
    expect(alfa(alca.rec, 60, 60)).toBe(0);
  });
  it('a sujeira solta do fundo sai', () => {
    const { foto, rec } = cena([255, 255, 255], [200, 30, 30]);
    rec.set([200, 30, 30, 255], (5 * W + 5) * 4);
    repararMordidas(foto, rec, W, H);
    expect(alfa(rec, 5, 5)).toBe(0);
  });
});

describe('acabamento e nitidez', () => {
  it('o halo do fundo some: a beirada ganha a cor do miolo do produto', () => {
    const { foto, rec } = cena([255, 255, 255], [200, 30, 30]);
    // a foto traz o fundo branco misturado na beirada do produto
    for (let x = 20; x < 100; x++) foto.set([240, 200, 200, 255], (20 * W + x) * 4);
    acabamento(foto, rec, W, H);
    for (let y = 18; y < 26; y++) {
      const i = (y * W + 60) * 4;
      if (rec[i + 3]) expect(rec[i + 1], `linha ${y}`).toBeLessThan(60);
    }
  });
  it('o contorno recolhe um pouco e fica suave, nunca maior que o produto', () => {
    const { foto, rec } = cena([255, 255, 255], [200, 30, 30]);
    acabamento(foto, rec, W, H);
    expect(alfa(rec, 19, 60)).toBe(0);
    expect(alfa(rec, 60, 60)).toBe(255);
    const borda = [18, 19, 20, 21, 22].map((x) => alfa(rec, x, 60));
    expect(borda).toEqual([...borda].sort((a, b) => a - b));
  });
  it('a nitidez realça a borda da imagem e não toca no que é transparente', () => {
    const { rec } = cena([0, 0, 0], [100, 100, 100], 0, 0, 60, 120);
    for (let y = 0; y < H; y++) for (let x = 30; x < 60; x++) rec.set([180, 180, 180, 255], (y * W + x) * 4);
    realcar(rec, W, H, 0.8);
    expect(rec[(60 * W + 30) * 4]).toBeGreaterThan(180);
    expect(rec[(60 * W + 29) * 4]).toBeLessThan(100);
    expect(rec[(60 * W + 80) * 4]).toBe(0);
  });
});

describe('reprovar', () => {
  it('produto liso e inteiro passa', () => {
    expect(inspecionar(cena([255, 255, 255], [200, 30, 30]).rec, W, H)).toMatchObject({ aprovado: true, defeitos: [] });
  });
  it('produto cortado pela foto é reprovado', () => {
    expect(inspecionar(cena([255, 255, 255], [200, 30, 30], 0, 20, 100, 100).rec, W, H).defeitos).toContain('foto-cortada');
  });
  it('contorno rasgado é reprovado', () => {
    const { rec } = cena([255, 255, 255], [200, 30, 30]);
    for (let x = 20; x < 100; x += 2) apagar(rec, x, 20, x + 1, 26 + ((x * 7) % 11));
    for (let y = 20; y < 100; y += 2) apagar(rec, 90 + ((y * 5) % 9), y, 100, y + 1);
    expect(inspecionar(rec, W, H).defeitos).toContain('contorno-irregular');
  });
  it('o recorte que levou um pedaço do produto é reprovado; o vazio com a cor do fundo, como ao lado do gargalo, não', () => {
    const rasgo = cena([255, 255, 255], [200, 30, 30]);
    apagar(rasgo.rec, 45, 20, 75, 40);
    expect(inspecionar(rasgo.rec, W, H, rasgo.foto).defeitos).toContain('produto-mordido');
    const gargalo = cena([255, 255, 255], [200, 30, 30]);
    for (let y = 20; y < 40; y++) for (let x = 45; x < 75; x++) gargalo.foto.set([255, 255, 255, 255], (y * W + x) * 4);
    apagar(gargalo.rec, 45, 20, 75, 40);
    expect(inspecionar(gargalo.rec, W, H, gargalo.foto).defeitos).not.toContain('produto-mordido');
  });
  it('sobrou pouco, ou o fundo não saiu', () => {
    expect(inspecionar(cena([255, 255, 255], [200, 30, 30], 50, 50, 56, 56).rec, W, H).defeitos).toContain('sobrou-pouco');
    expect(inspecionar(cena([255, 255, 255], [200, 30, 30], 0, 0, 120, 120).rec, W, H).defeitos).toContain('nao-tirou-fundo');
  });
  it('todo defeito tem uma explicação para o cliente', () => {
    for (const d of ['foto-cortada', 'contorno-irregular', 'produto-mordido', 'sobrou-pouco', 'nao-tirou-fundo'] as const) expect(MENSAGEM_DO_DEFEITO[d].length).toBeGreaterThan(10);
  });
});

describe('o caminho completo', () => {
  it('foto do Open Food Facts vai no tamanho original', () => {
    expect(fotoEmTamanhoReal('https://images.openfoodfacts.org/images/products/789/100/010/0103/front_pt.34.400.jpg')).toMatch(/front_pt\.34\.full\.jpg$/);
    expect(fotoEmTamanhoReal('https://x.r2.dev/a.400.jpg')).toBe('https://x.r2.dev/a.400.jpg');
  });
  it('a IA de visão também confere se é o produto e se ele está em pé; a foto enviada pelo cliente só responde pelo contorno', () => {
    const f = fs.readFileSync('supabase/functions/produto-imagem/index.ts', 'utf8');
    for (const x of ['eh_o_produto', 'em_pe', 'only a barcode']) expect(f).toContain(x);
    const i = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(i.indexOf("imagemDe.fonte === 'UPLOAD'")).toBeLessThan(i.indexOf('data?.eh_o_produto === false'));
    expect(i.indexOf("data?.completo === false")).toBeLessThan(i.indexOf("imagemDe.fonte === 'UPLOAD'"));
  });
  it('foto reprovada ou com fundo não vira a foto do produto, seja qual for a fonte', async () => {
    expect(await guardarFotoDoProduto('Bolacha', { url: 'https://x/b.jpg', fonte: 'OPENFOODFACTS' })).toBe(false);
    expect(await guardarFotoDoProduto('Bolacha', { url: 'https://x/b.jpg', fonte: 'UPLOAD', recusa: 'x' })).toBe(false);
  });
  it('o recorte só é entregue depois da inspeção e da IA de visão; o recorte antigo de fundo liso saiu de cena', () => {
    const i = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(i).toMatch(/await finalizarRecorte\(origem, recorte\)/);
    expect(i).toContain('const reprovado = await reprovadoPelaIA(png, imagem, nome)');
    expect(i).not.toContain('recortarImagem(');
    expect(fs.readFileSync('src/lib/studio/api.ts', 'utf8')).not.toContain('recortarImagem(');
    const r = fs.readFileSync('src/lib/tabloide/recorte.ts', 'utf8');
    const f = r.slice(r.indexOf('export async function finalizarRecorte'));
    expect(f.indexOf('repararMordidas(')).toBeLessThan(f.indexOf('inspecionar('));
    expect(f.indexOf('if (!inspecao.aprovado)')).toBeLessThan(f.indexOf('acabamento('));
  });
  it('o script do catálogo usa as mesmas contas do site', () => {
    const s = fs.readFileSync('scripts/ops/recorte-do-catalogo.mjs', 'utf8');
    expect(s).toContain("from '../../src/lib/tabloide/qualidadeRecorte.ts'");
    expect(s).toMatch(/!ins\.aprovado/);
  });
});
