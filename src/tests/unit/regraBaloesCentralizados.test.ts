// REGRA DO DONO (F-247/F-249), OBRIGATÓRIA EM TODO O SISTEMA: em todo balão de preço e em todo botão, de todo encarte existente
// ou criado depois, o texto e o valor ficam ORGANIZADOS e CENTRALIZADOS dentro do balão ou do botão.
// Todo balão é UM objeto e todo texto dele sai de arranjoDoBalao. Este teste percorre tudo o que está em ENCARTES_OFICIAIS,
// ESTILOS_DE_BALAO e FUNDOS_DO_PALCO: encarte novo entra sozinho aqui e, se nascer fora da regra, reprova.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { arranjoDoBalao, type FormatoDoBalao, type Medir } from '@/lib/studio/balao';
import { ESTILOS_DE_BALAO, FUNDOS_DO_PALCO, etiquetaDePreco, palcoDoProduto, seloDoPreco } from '@/lib/studio/palco';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, formatosDoEncarte } from '@/lib/studio/encartesOficiais';

// medida aproximada de letra: basta para conferir a geometria do arranjo
const medir: Medir = (t, tam) => ({ largura: t.length * tam * 0.5, sobe: tam * 0.75, desce: 0 });

function conferir(c: Parameters<typeof arranjoDoBalao>[0], rotulo: string) {
  const a = arranjoDoBalao(c, medir);
  const fim = a.sufixo ? a.sufixo.x + a.sufixo.w : a.valor.x + a.valor.w;
  const inicio = a.moeda ? a.moeda.x : a.valor.x;
  expect(Math.abs((inicio + fim) / 2), `${rotulo}: conjunto fora do centro`).toBeLessThanOrEqual(c.w * 0.02);
  expect(fim - inicio, `${rotulo}: conjunto maior que o balão`).toBeLessThanOrEqual(c.w);
  const topoValor = a.valor.y - a.valor.tamanho * 0.75;
  const topoBloco = a.topo ? a.topo.y - a.topo.tamanho * 0.75 : topoValor;
  const fimBloco = a.base ? a.base.y : a.valor.y;
  expect(Math.abs((topoBloco + fimBloco) / 2), `${rotulo}: bloco fora do centro na altura`).toBeLessThanOrEqual(c.h * 0.05);
  expect(topoBloco, `${rotulo}: saiu por cima`).toBeGreaterThanOrEqual(-c.h / 2);
  expect(fimBloco, `${rotulo}: saiu por baixo`).toBeLessThanOrEqual(c.h / 2);
  if (a.topo) {
    expect(Math.abs(a.topo.x + a.topo.w / 2), `${rotulo}: texto de cima fora do centro`).toBeLessThan(1);
    expect(a.topo.y, `${rotulo}: texto de cima sobre o valor`).toBeLessThanOrEqual(topoValor + 0.5);
  }
  if (a.base) expect(Math.abs(a.base.x + a.base.w / 2), `${rotulo}: texto de baixo fora do centro`).toBeLessThan(1);
}

describe('REGRA: texto e valor centralizados em todo balão', () => {
  it.each(['circulo', 'oval', 'placa'] as FormatoDoBalao[])('balão %s, em qualquer tamanho, preço e texto', (formato) => {
    for (const [w, h] of formato === 'circulo' ? [[300, 300], [120, 120], [216, 216]] : [[300, 130], [190, 80], [120, 70], [460, 200]]) {
      for (const [valor, sufixo] of [['4', ',99'], ['129', ',90'], ['1299', ',00']]) {
        for (const topo of ['', 'POR APENAS', 'DE 15,99']) for (const base of ['', 'KG']) {
          conferir({ w, h, formato, topo, moeda: 'R$', valor, sufixo, base }, `${formato} ${w}x${h} ${valor} "${topo}" "${base}"`);
        }
      }
    }
  });

  it.each(Object.keys(ESTILOS_DE_BALAO) as Array<keyof typeof ESTILOS_DE_BALAO>)('o estilo %s é um objeto só', (id) => {
    const cs = etiquetaDePreco({ x: 10, y: 10, w: 300, h: 130 }, { preco: 12.99, precoDe: 19.9, unidade: 'KG' }, ESTILOS_DE_BALAO[id]);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ tipo: 'selo', nome: 'Preço', w: 300, h: 130, moeda: 'R$', valor: '12', sufixo: ',99', topo: 'DE 19,90', base: 'KG' });
  });

  it.each(ENCARTES_OFICIAIS.map((e) => [e.id, e] as const))('encarte %s: todo preço é um balão de um objeto só, em todos os tamanhos', (_id, e) => {
    const lista = Array.from({ length: 20 }, (_, i) => ({ nome: `Produto ${i} 1kg`, preco: 3.99 + i * 7, precoDe: i % 2 ? 90 + i : null, unidade: null, imagem: null }));
    for (const f of formatosDoEncarte(e)) for (const quantos of [4, 16, 20]) {
      const d = documentoDoEncarteOficial(e, lista, { quantos }, f);
      expect(d.camadas.some((c) => c.nome.startsWith('Preço —')), `${f}: texto de preço solto`).toBe(false);
      const baloes = d.camadas.filter((c) => /^Preço \d+$/.test(c.nome));
      expect(baloes, `${f} ${quantos}`).toHaveLength(quantos);
      for (const b of baloes) {
        expect(b.tipo).toBe('selo');
        if (b.tipo === 'selo') conferir({ ...b, w: b.w, h: b.h }, `${e.id} ${f} ${quantos} ${b.nome}`);
      }
    }
  });

  it('o balão do palco passa pelo mesmo arranjo', () => {
    const s = seloDoPreco({ preco: 12.99, precoDe: 24.9, unidade: 'KG' }, 0, 0, 216)!;
    expect(s.tipo).toBe('selo');
    if (s.tipo === 'selo') conferir(s, 'palco');
  });

  it('todo balão de todo modelo é desenhado por essa conta, sem texto posicionado à mão', () => {
    const d = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(d).toMatch(/const arr = arranjoDoBalao\(/);
    expect(d.match(/textosDoSelo\(ctx, c, /g)).toHaveLength(3); // realista, clássico e oval/placa
  });

  it('nos encartes A4 e no Cartaz Digital, a placa fica no centro do espaço dela', () => {
    expect(fs.readFileSync('src/lib/tabloide/selo3d.ts', 'utf8')).toMatch(/const x0 = \(largura - caixaL\) \/ 2;/);
    expect(fs.readFileSync('src/components/tabloide/TabloideCanvas.tsx', 'utf8')).toMatch(/alinhar = 'center'/);
  });
});

describe('REGRA: texto centralizado em todo botão', () => {
  it('o botão é um objeto só: o texto faz parte dele e é centralizado, em todos os fundos e formatos', () => {
    for (const fundo of FUNDOS_DO_PALCO) for (const f of ['9:16', '16:9'] as const) {
      const d = palcoDoProduto({ nome: 'Arroz Camil 5kg', preco: 9.9, precoDe: null, unidade: null, imagem: null }, f, { fundo });
      const b = d.camadas.find((c) => c.nome === 'Botão')!;
      expect(b).toMatchObject({ tipo: 'texto', alinhamento: 'center', fundo: { cheio: true } });
      expect(d.camadas.some((c) => c.nome === 'Botão — texto')).toBe(false);
      // a margem igual em cima e embaixo faz a altura do botão fechar com a do texto
      if (b.tipo === 'texto') expect(b.h).toBeCloseTo(b.tamanho * b.entrelinha + b.fundo!.margem * 1.1, 0);
    }
  });
  it('todo texto (botões, pílulas e cartões) se centraliza pela altura real da letra', () => {
    expect(fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8')).toMatch(/measureText\('H'\)\.actualBoundingBoxAscent/);
  });
});
