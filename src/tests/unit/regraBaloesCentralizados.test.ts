// REGRA DO DONO (F-247), OBRIGATÓRIA EM TODO O SISTEMA: em todo balão de preço e em todo botão, de todo encarte existente
// ou criado depois, o texto e o valor ficam ORGANIZADOS e CENTRALIZADOS dentro do balão ou do botão.
// Este teste percorre tudo o que está em ENCARTES_OFICIAIS, ESTILOS_DE_BALAO e FUNDOS_DO_PALCO: encarte novo entra sozinho aqui
// e, se nascer fora da regra, reprova.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import type { Camada } from '@/lib/studio/documento';
import { ESTILOS_DE_BALAO, FUNDOS_DO_PALCO, etiquetaDePreco, palcoDoProduto } from '@/lib/studio/palco';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, formatosDoEncarte } from '@/lib/studio/encartesOficiais';

const achar = (cs: Camada[], n: string) => cs.find((c) => c.nome === n);
/** Confere que R$ + valor + centavos estão centrados no balão, e de/valor no meio da altura. */
function conferir(balao: Camada, rs: Camada, valor: Camada, cent: Camada, de: Camada | undefined, rotulo: string) {
  const margem = balao.w * 0.03;
  const meioX = balao.x + balao.w / 2, meioY = balao.y + balao.h / 2;
  const conjuntoX = (rs.x + (cent.x + cent.w)) / 2;
  expect(Math.abs(conjuntoX - meioX), `${rotulo}: conjunto fora do centro na largura`).toBeLessThanOrEqual(margem);
  const topo = de ? de.y : valor.y;
  const blocoY = (topo + valor.y + valor.h) / 2;
  expect(Math.abs(blocoY - meioY), `${rotulo}: bloco fora do centro na altura`).toBeLessThanOrEqual(balao.h * 0.06);
  if (de) {
    expect(de, rotulo).toMatchObject({ alinhamento: 'center' });
    expect(Math.abs(de.x + de.w / 2 - meioX), `${rotulo}: "de" fora do centro`).toBeLessThanOrEqual(margem);
    expect(de.y + de.h, `${rotulo}: "de" em cima do valor`).toBeLessThanOrEqual(valor.y + 1);
  }
  for (const c of [rs, valor, cent]) expect(c.x >= balao.x && c.x + c.w <= balao.x + balao.w + 1, `${rotulo}: ${c.nome} saiu do balão`).toBe(true);
}

describe('REGRA: texto e valor centralizados em todo balão', () => {
  it.each(Object.keys(ESTILOS_DE_BALAO) as Array<keyof typeof ESTILOS_DE_BALAO>)('estilo %s, em qualquer tamanho e preço', (id) => {
    for (const [w, h] of [[300, 130], [190, 80], [120, 70], [460, 200]]) {
      for (const p of [{ preco: 4.99, precoDe: null }, { preco: 129.9, precoDe: null }, { preco: 12.99, precoDe: 19.9 }, { preco: 1299, precoDe: 1599 }]) {
        const b = { x: 50, y: 60, w, h };
        const cs = etiquetaDePreco(b, { ...p, unidade: null }, ESTILOS_DE_BALAO[id]);
        const r = `${id} ${w}x${h} ${p.preco}/${p.precoDe}`;
        conferir(achar(cs, 'Preço')!, achar(cs, 'Preço — R$')!, achar(cs, 'Preço — valor')!, achar(cs, 'Preço — centavos')!, achar(cs, 'Preço — de'), r);
      }
    }
  });

  it.each(ENCARTES_OFICIAIS.map((e) => [e.id, e] as const))('encarte %s, em todos os tamanhos', (_id, e) => {
    const lista = Array.from({ length: 20 }, (_, i) => ({ nome: `Produto ${i} 1kg`, preco: 3.99 + i * 7, precoDe: i % 2 ? 90 + i : null, unidade: null, imagem: null }));
    for (const f of formatosDoEncarte(e)) for (const quantos of [4, 16, 20]) {
      const d = documentoDoEncarteOficial(e, lista, { quantos }, f);
      for (let n = 1; n <= quantos; n++) {
        const nome = (x: string) => achar(d.camadas, `${x} ${n}`);
        conferir(nome('Preço')!, nome('Preço — R$')!, nome('Preço — valor')!, nome('Preço — centavos')!, nome('Preço — de'), `${e.id} ${f} ${quantos} produto ${n}`);
      }
    }
  });

  it('o balão redondo e o selo de todos os modelos usam o mesmo arranjo centralizado', () => {
    const d = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(d.match(/textosDoSelo\(ctx, c, /g)).toHaveLength(2); // realista e clássico
    expect(d).toMatch(/let x = -w\.total \/ 2;/); // o conjunto parte do centro
  });

  it('nos encartes A4 e no Cartaz Digital, a placa fica no centro do espaço dela', () => {
    expect(fs.readFileSync('src/lib/tabloide/selo3d.ts', 'utf8')).toMatch(/const x0 = \(largura - caixaL\) \/ 2;/);
    expect(fs.readFileSync('src/components/tabloide/TabloideCanvas.tsx', 'utf8')).toMatch(/alinhar = 'center'/);
  });
});

describe('REGRA: texto centralizado em todo botão', () => {
  it('botões do palco, em todos os fundos e formatos', () => {
    for (const fundo of FUNDOS_DO_PALCO) for (const f of ['9:16', '16:9'] as const) {
      const d = palcoDoProduto({ nome: 'Arroz Camil 5kg', preco: 9.9, precoDe: null, unidade: null, imagem: null }, f, { fundo });
      const b = achar(d.camadas, 'Botão')!, t = achar(d.camadas, 'Botão — texto')!;
      expect(t).toMatchObject({ alinhamento: 'center' });
      expect(t.x + t.w / 2).toBeCloseTo(b.x + b.w / 2, 2);
      expect(t.y + t.h / 2).toBeCloseTo(b.y + b.h / 2, 2);
    }
  });
  it('todo texto (botões, pílulas e cartões) se centraliza pela altura real da letra', () => {
    expect(fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8')).toMatch(/measureText\('H'\)\.actualBoundingBoxAscent/);
  });
});
