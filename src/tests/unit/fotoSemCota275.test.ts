/**
 * F-275 — foto oficial nunca fica sem foto nem com fundo:
 * - 2ª fonte (lojas que vendem o produto) liberada no passa-foto, igual à lista do leitor das lojas;
 * - link que pede o fundo tirado (s=1) é reconhecido, e a caixa de corte (c=) é lida para o recorte no navegador;
 * - selo de propaganda solto acima/abaixo da embalagem sai do recorte; itens lado a lado ficam;
 * - remédio que pede receita fica de fora (regra da farmácia: só isentos de prescrição).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { caixaDoLink, linkDaFoto, linkSemTransformacao, pedeSemFundo } from '@/lib/tabloide/fotoPorLink';
import { apagarSelosSoltos } from '@/lib/tabloide/recorte';

const foto = 'https://paguemenos.vteximg.com.br/arquivos/ids/1/aspirina.jpg';

describe('F-275 links da foto sem fundo', () => {
  it('reconhece o pedido de fundo tirado e a caixa de corte', () => {
    const l = linkDaFoto(foto, { left: 10, top: 20, width: 300, height: 400 }, true);
    expect(pedeSemFundo(l)).toBe(true);
    expect(pedeSemFundo(linkDaFoto(foto))).toBe(false);
    expect(pedeSemFundo(foto)).toBe(false);
    expect(caixaDoLink(l)).toEqual({ left: 10, top: 20, width: 300, height: 400 });
    expect(caixaDoLink(linkDaFoto(foto, null, true))).toBeNull();
    expect(linkSemTransformacao(l)).toBe(linkDaFoto(foto));
  });
});

describe('F-275 selos soltos', () => {
  const desenhar = (w: number, h: number, retangulos: Array<[number, number, number, number]>) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (const [x0, y0, x1, y1] of retangulos) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d[(y * w + x) * 4 + 3] = 255;
    return d;
  };
  const alfa = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

  it('apaga o selo abaixo da embalagem', () => {
    const d = desenhar(100, 100, [[10, 5, 90, 60], [20, 75, 60, 90]]);
    expect(apagarSelosSoltos(d, 100, 100)).toBe(1);
    expect(alfa(d, 100, 30, 80)).toBe(0);
    expect(alfa(d, 100, 50, 30)).toBe(255);
  });
  it('mantém garrafa e caixa lado a lado', () => {
    const d = desenhar(100, 100, [[5, 10, 40, 95], [55, 20, 95, 90]]);
    expect(apagarSelosSoltos(d, 100, 100)).toBe(0);
    expect(alfa(d, 100, 70, 50)).toBe(255);
  });
});

describe('F-275 2ª fonte da foto oficial', () => {
  const worker = fs.readFileSync('cloudflare/tabloide-ia/worker.js', 'utf8');
  const leitor = fs.readFileSync('scripts/ops/marca-varejo.mjs', 'utf8');
  it('as lojas do leitor estão liberadas no passa-foto', () => {
    expect(worker).toMatch(/HOSTS_LOJAS = \[/);
    expect(worker).toMatch(/\.\.\.HOSTS_LOJAS\]/);
    for (const conta of ['paguemenos', 'drogariaspacheco', 'drogariavenancio', 'drogal', 'savegnagoio', 'covabra', 'mambodelivery', 'divvino']) expect(worker).toContain(`'${conta}.vteximg.com.br'`);
    expect(leitor).toContain('robotsDe');
  });
  it('remédio com receita fica de fora', async () => {
    const { pedeReceita, daMarca } = await import('../../../scripts/ops/marca-varejo.mjs');
    expect(pedeReceita({ 'Prescrição Médica': ['Sem Retenção De Receita'] })).toBe(true);
    expect(pedeReceita({ 'Prescrição Médica': ['Sim'] })).toBe(true);
    expect(pedeReceita({ 'Prescrição Médica': ['Isento de Prescrição'] })).toBe(false);
    expect(pedeReceita({ 'Retenção Receita': ['SIM'] })).toBe(true);
    expect(pedeReceita({ 'Tipo de receita': ['N/A'] })).toBe(false);
    expect(pedeReceita({})).toBe(false);
    expect(daMarca('Johnnie Walker', 'Diageo', 'Whisky', { brand: 'JOHNNIE WALKER', productName: 'Whisky Johnnie Walker Red Label 1L' })).toBe(true);
    expect(daMarca('Aspirina', 'Bayer', 'Analgésicos', { brand: 'Bayer', productName: 'Aspirina 500mg 20 Comprimidos' })).toBe(true);
    expect(daMarca('Aspirina', 'Bayer', 'Analgésicos', { brand: 'Bayer', productName: 'Bepantol Derma' })).toBe(false);
    expect(daMarca('Sol', 'Heineken', 'Cerveja', { brand: 'Sol', productName: 'Protetor Sol de Verão' })).toBe(false);
  });
});

describe('F-276 removedor de fundo SOBRE MÍDIA e livro de soluções', () => {
  it('máscara da IA vira transparência com contorno limpo', async () => {
    const { aplicarMascara } = await import('@/lib/tabloide/removedorDeFundo');
    const px = new Uint8ClampedArray(4 * 4).fill(200);
    aplicarMascara(px, [0, 5, 128, 250]);
    expect([px[3], px[7], px[11], px[15]]).toEqual([0, 0, 128, 255]);
  });
  it('o preparo da foto usa nuvem → fundo liso → IA da SOBRE MÍDIA, sempre com inspeção', () => {
    const imagens = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(imagens).toMatch(/semFundoNoNavegador[\s\S]*removerFundoProfissional/);
    expect(imagens).toMatch(/finalizarRecorte\(url, bruto\)/);
    expect(imagens).toMatch(/recortarNaNuvem[\s\S]*recortarNoNavegador\(imagem\.url/);
    const removedor = fs.readFileSync('src/lib/tabloide/removedorDeFundo.ts', 'utf8');
    expect(removedor).toContain("studioludens/birefnet-lite-512"); // MIT, roda no navegador
    expect(removedor).toContain('TRANSFORMERS_CDN'); // carregado da CDN só quando precisa (fora do pacote do site)
  });
  it('o livro de soluções chega aos agentes', async () => {
    const { LIVRO_DE_SOLUCOES, resumoDoLivro } = await import('../../../supabase/functions/_shared/studio/core/solucoes.ts');
    const ids = LIVRO_DE_SOLUCOES.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['foto-do-produto', 'tirar-o-fundo', 'site-bloqueia-leitura', 'espaco-e-custo-das-fotos']));
    expect(resumoDoLivro()).toMatch(/Nunca: burlar robots\.txt/);
    expect(fs.readFileSync('supabase/functions/_shared/studio/core/core.ts', 'utf8')).toContain('resumoDoLivro()');
    expect(fs.readFileSync('supabase/functions/_shared/agente/ferramentas.ts', 'utf8')).toContain('resumoDoLivro()');
    expect(fs.readFileSync('scripts/studio/semear-conhecimento.mjs', 'utf8')).toContain("chave: 'livro-de-solucoes'");
  });
});
