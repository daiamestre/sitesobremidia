/**
 * F-351 (ordem do dono, 20/11/2026): "não quero fundo nos produtos". A foto do catálogo pede SEM FUNDO (passa-foto com s=1),
 * mas com a cota grátis do mês da Cloudflare esgotada ela chega com o fundo branco. Toda arte do Studio (prévia, capa, palco,
 * encarte e o vídeo exportado) passa por carregarImagem: ali o fundo é tirado no aparelho antes de desenhar.
 *
 * F-359 (dono, 24/11/2026, bravo: "não admito produto com fundo branco, nem nas capas nem na criação"): vale para TODA camada
 * de produto, venha a foto de onde vier (PNG da marca com fundo branco, link sem s=1), e para as miniaturas das telas.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pedeSemFundo } from '@/lib/tabloide/fotoPorLink';

const desenhar = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
const worker = fs.readFileSync('cloudflare/tabloide-ia/worker.js', 'utf8');

describe('F-351: produto sempre sem fundo nas artes', () => {
  it('o link do catálogo que pede sem fundo é reconhecido', () => {
    expect(pedeSemFundo('https://sobremidia-tabloide-ia.sobremidia.workers.dev/foto?u=https%3A%2F%2Fx.com%2Fa.jpg&s=1&c=1,2,3,4')).toBe(true);
    expect(pedeSemFundo('https://sobremidia-tabloide-ia.sobremidia.workers.dev/foto?u=https%3A%2F%2Fx.com%2Fa.png&c=1,2,3,4')).toBe(false);
    expect(pedeSemFundo('/studio/palco/x.webp')).toBe(false);
  });

  it('toda imagem das artes passa pela garantia de "sem fundo" antes de ser desenhada', () => {
    expect(desenhar).toMatch(/export function carregarImagem[\s\S]{0,200}if \(p\) return p;[\s\S]{0,200}if \(pedeSemFundo\(src\)\)[\s\S]{0,120}produtoSemFundo\(src, i\)/);
    // tira o fundo liso com o mesmo código do site e a MESMA inspeção da nuvem (recorte reprovado não entra)
    expect(desenhar).toMatch(/semFundoNoNavegador\(original, 1400, caixaDoLink\(src\)\)/);
    expect(desenhar).toMatch(/finalizarRecorte\(original, bruto\)/);
    // guardado no aparelho e um recorte por vez (não trava o tablet)
    expect(desenhar).toMatch(/'sm-produto-sem-fundo-v[0-9]+'/);
    expect(desenhar).toMatch(/filaDeRecortes/);
    // a foto que JÁ chegou sem fundo não é mexida
    expect(desenhar).toMatch(/if \(!\(forcar \|\| pedeSemFundo\(src\)\) \|\| !temFundo\(img\)\) return img;/);
  });

  it('o prepararDocumento (prévias, capas e vídeo) usa a garantia — e a do PRODUTO nas camadas de produto', () => {
    expect(desenhar).toMatch(/imagensDo\(d\)\.map\(async \(s\) => \{ const i = await \(deProduto\.has\(s\) \? carregarImagemDoProduto\(s\) : carregarImagem\(s\)\)/);
  });

  it('a foto ORIGINAL (com fundo) nunca fica guardada 30 dias no passa-foto', () => {
    expect(worker).toMatch(/'Cache-Control': 'public, max-age=3600', 'Content-Type': tipo, 'X-Passa-Foto': 'original'/);
  });
});

describe('F-359: produto NUNCA com fundo branco, venha a foto de onde vier', () => {
  it('toda camada de PRODUTO passa pelo recorte quando a borda é opaca, mesmo sem o pedido s=1 no link', () => {
    expect(desenhar).toContain("export const ehCamadaDeProduto = (nome: string) => /^Produto( \\d+)?$/.test(nome);");
    expect(desenhar).toMatch(/export function carregarImagemDoProduto[\s\S]{0,300}produtoSemFundo\(src, i, true\)/);
    expect(desenhar).toContain("c.tipo === 'imagem' && ehCamadaDeProduto(c.nome)");
  });

  it('as miniaturas de produto das telas de criação usam FotoDoProduto (mesmo recorte), sem caixinha branca', () => {
    for (const n of ['PalcoDeOfertas', 'ProdutosComFotos', 'GaleriaDeProdutos']) {
      const t = fs.readFileSync(`src/components/studio/${n}.tsx`, 'utf8');
      expect(t).toContain('<FotoDoProduto');
      expect(t).not.toMatch(/<img[^>]*src=\{(p|sel)\.imagem!?\.url\}/);
      expect(t).not.toMatch(/<img[^>]*src=\{p\.imagem_url\}/);
      // nenhuma caixinha BRANCA atrás da foto do produto (bg-white puro; bg-white/5 é o vidro escuro)
      for (const linha of t.split('\n')) if (/FotoDoProduto|imagem|foto/i.test(linha)) expect(linha).not.toMatch(/bg-white(?![/\-\w])/);
    }
    expect(fs.readFileSync('src/components/studio/FotoDoProduto.tsx', 'utf8')).toContain('carregarImagemDoProduto(src)');
  });
});
