/**
 * F-351 (ordem do dono, 20/11/2026): "não quero fundo nos produtos". A foto do catálogo pede SEM FUNDO (passa-foto com s=1),
 * mas com a cota grátis do mês da Cloudflare esgotada ela chega com o fundo branco. Toda arte do Studio (prévia, capa, palco,
 * encarte e o vídeo exportado) passa por carregarImagem: ali o fundo é tirado no aparelho antes de desenhar.
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
    expect(desenhar).toContain("'sm-produto-sem-fundo-v1'");
    expect(desenhar).toMatch(/filaDeRecortes/);
    // a foto que JÁ chegou sem fundo não é mexida
    expect(desenhar).toMatch(/if \(!pedeSemFundo\(src\) \|\| !temFundo\(img\)\) return img;/);
  });

  it('o prepararDocumento (prévias, capas e vídeo) usa o carregarImagem com a garantia', () => {
    expect(desenhar).toMatch(/imagensDo\(d\)\.map\(async \(s\) => \{ const i = await carregarImagem\(s\)/);
  });

  it('a foto ORIGINAL (com fundo) nunca fica guardada 30 dias no passa-foto', () => {
    expect(worker).toMatch(/'Cache-Control': 'public, max-age=3600', 'Content-Type': tipo, 'X-Passa-Foto': 'original'/);
  });
});
