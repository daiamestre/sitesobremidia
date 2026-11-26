/**
 * F-361 (dono, 24–25/11/2026): "o NOME do produto fica SEMPRE ACIMA do produto, nunca por cima, a uma distância mínima, e
 * acompanha o produto (produto menor = nome desce junto)". Conta feita na hora do desenho (nomeAcimaDoProduto), sem nunca
 * passar da logo nem encostar no balão; nome arrastado à mão pelo cliente não é mexido.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nomeAcimaDoProduto, type Imagens } from '@/lib/studio/desenhar';
import type { Camada, Documento } from '@/lib/studio/documento';

const base = { rot: 0, opacidade: 1, visivel: true, bloqueada: false };
const foto = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;
const imagem = (nome: string, src: string, x: number, y: number, w: number, h: number) =>
  ({ ...base, id: nome, nome, tipo: 'imagem', src, x, y, w, h, zoom: 1, focoX: 50, focoY: 100, espelhar: false, brilho: 100, contraste: 100, saturacao: 100, desfoque: 0, raio: 0, ajuste: 'conter' }) as Camada;
const nome = (y: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id: 'Nome do produto', nome: 'Nome do produto', tipo: 'texto', texto: 'BOLO DE COCO', fonte: 'poppins', italico: false, tamanho: 60, cor: '#fff', alinhamento: 'center', entrelinha: 1, espacamento: 0, maiusculas: true, x: 100, y, w: 880, h: 100, acimaDoProduto: true, ...extra }) as Camada;
const doc = (camadas: Camada[]): Documento => ({ versao: 2, formato: 'story' as Documento['formato'], fundo: '#000', camadas });
const N = (d: Documento) => d.camadas.find((c) => c.nome === 'Nome do produto') as Camada & { tamanho: number };

describe('F-361: nome do produto sempre ACIMA do produto, acompanhando o topo real da foto', () => {
  // caixa do produto 290..890 (600 de altura), pé no tampo (focoY 100)
  const produto = (_alturaDaFoto: number) => imagem('Produto', 'p.png', 240, 290, 600, 600);
  const mapa = (alt: number): Imagens => new Map([['p.png', foto(600, alt)], ['logo.png', foto(800, 200)]]);

  it('produto BAIXO: o nome DESCE e fica colado acima do topo real', () => {
    const d = doc([nome(150), produto(150)]);
    nomeAcimaDoProduto(d, mapa(150)); // topo real = 890 - 150 = 740
    const n = N(d);
    expect(n.y + n.h).toBeLessThanOrEqual(740);
    expect(740 - (n.y + n.h)).toBeLessThanOrEqual(20);
  });

  it('produto ALTO: o nome SOBE (nunca fica por cima) e para no fim da logo', () => {
    const logo = imagem('Logo do palco', 'logo.png', 140, 0, 800, 200); // fim da logo = 200
    const d = doc([logo, nome(250), imagem('Produto', 'p.png', 240, 200, 600, 690)]);
    nomeAcimaDoProduto(d, new Map([['p.png', foto(600, 520)], ['logo.png', foto(800, 200)]])); // topo real = 890 - 520 = 370
    const n = N(d);
    expect(n.y + n.h).toBeLessThanOrEqual(370); // não cobre o produto
    expect(n.y).toBeGreaterThanOrEqual(200); // não passa da logo
  });

  it('nunca encosta no balão de preço que fica ao lado do produto', () => {
    const balao = { ...base, id: 'Preço', nome: 'Preço', tipo: 'selo', x: 800, y: 600, w: 250, h: 250 } as unknown as Camada;
    const d = doc([nome(150), produto(150), balao]);
    nomeAcimaDoProduto(d, mapa(150));
    const n = N(d);
    expect(n.y + n.h).toBeLessThanOrEqual(600);
  });

  it('nome arrastado à mão (sem acimaDoProduto) e nome ao LADO (deitado) não mudam', () => {
    const solto = doc([nome(150, { acimaDoProduto: undefined }), produto(150)]);
    nomeAcimaDoProduto(solto, mapa(150));
    expect(N(solto).y).toBe(150);
    const lado = doc([nome(300, { x: 900, w: 300 }), imagem('Produto', 'p.png', 240, 290, 600, 600)]);
    nomeAcimaDoProduto(lado, mapa(150));
    expect(N(lado).y).toBe(300);
  });

  it('calcular de novo não acumula (parte sempre da posição original)', () => {
    const d = doc([nome(150), produto(150)]);
    nomeAcimaDoProduto(d, mapa(150));
    const y1 = N(d).y;
    nomeAcimaDoProduto(d, mapa(150));
    expect(N(d).y).toBe(y1);
  });

  it('o palco marca o nome para seguir o produto, menos quando o cliente moveu o nome', () => {
    const palco = fs.readFileSync('src/lib/studio/palco.ts', 'utf8');
    expect(palco).toMatch(/c\.nome === 'Nome do produto' && c\.tipo === 'texto' && !\('y' in resto\) && !\('x' in resto\)/);
    expect(fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8')).toMatch(/nomeAcimaDoProduto\(d, mapa\);\s*return mapa;/);
  });
});
