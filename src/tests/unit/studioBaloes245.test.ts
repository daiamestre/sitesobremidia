// F-245 — cada encarte com o seu balão de preço (catálogo de estilos) e contatos com ícones, como na referência do dono.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ESTILOS_DE_BALAO, etiquetaDePreco } from '@/lib/studio/palco';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, layoutDoEncarte } from '@/lib/studio/encartesOficiais';

const caixa = { x: 100, y: 100, w: 300, h: 140 };
const mega = ENCARTES_OFICIAIS.find((e) => e.id === 'mega-oferta-bicolor')!;
const frango = ENCARTES_OFICIAIS.find((e) => e.id === 'semana-do-frango')!;
const produto = (i: number) => ({ nome: `Produto ${i} 1kg`, preco: 2 + i, precoDe: null, unidade: null, imagem: null });

describe('catálogo de balões', () => {
  it('cada encarte usa o seu estilo', () => {
    expect(layoutDoEncarte(frango, '9:16').colunas.every((c) => c.etiqueta === ESTILOS_DE_BALAO['oval-vermelho'])).toBe(true);
    expect(layoutDoEncarte(mega, '9:16').colunas.map((c) => c.etiqueta)).toEqual([ESTILOS_DE_BALAO['placa-amarela'], ESTILOS_DE_BALAO['placa-vermelha']]);
  });
  it('o balão oval é um objeto só: aro, cor e valor nele mesmo', () => {
    const [c] = etiquetaDePreco(caixa, { preco: 12.99, precoDe: null, unidade: null }, ESTILOS_DE_BALAO['oval-vermelho']);
    expect(c).toMatchObject({ tipo: 'selo', formato: 'oval', aroFora: '#ffffff', borda: '#ffd21f', valor: '12', sufixo: ',99', corValor: '#ffffff', corMoeda: '#ffd21f' });
  });
  it('na promoção mostra o "de"; sem preço, sem balão', () => {
    const [c] = etiquetaDePreco(caixa, { preco: 12.99, precoDe: 19.9, unidade: null }, ESTILOS_DE_BALAO['oval-vermelho']);
    expect(c).toMatchObject({ topo: 'DE 19,90' });
    expect(etiquetaDePreco(caixa, { preco: null, precoDe: null, unidade: null }, ESTILOS_DE_BALAO['oval-vermelho'])).toEqual([]);
  });
});

describe.each(ENCARTES_OFICIAIS)('contatos do encarte $id', (e) => {
  it('telefone com o ícone verde e endereço com o ícone de localização, dentro da faixa', () => {
    expect(fs.existsSync('public/studio/encartes-oficiais/icone-whatsapp.svg')).toBe(true);
    expect(fs.existsSync('public/studio/encartes-oficiais/icone-local.svg')).toBe(true);
    for (const f of ['9:16', '16:9'] as const) {
      const r = layoutDoEncarte(e, f).rodape;
      const d = documentoDoEncarteOficial(e, [produto(1), produto(2)], { telefone: '(11) 99999-1234', endereco: 'Avenida Brasil, 1500 – Centro – São Paulo/SP' }, f);
      for (const n of ['Ícone do telefone', 'Ícone do endereço', 'Telefone', 'Endereço']) {
        const c = d.camadas.find((x) => x.nome === n)!;
        expect(c, `${f} ${n}`).toBeTruthy();
        expect(c.y >= r.y - 1 && c.y + c.h <= r.y + r.h + 1, `${f} ${n} y=${c.y} h=${c.h}`).toBe(true);
        expect(c.x >= r.x - 1 && c.x + c.w <= r.x + r.w + 1, `${f} ${n} x=${c.x} w=${c.w}`).toBe(true);
      }
    }
  });
  it('só com o telefone, ou só com o endereço, mostra apenas o que foi preenchido', () => {
    const so = documentoDoEncarteOficial(e, [produto(1)], { telefone: '(11) 99999-1234' });
    expect(so.camadas.some((c) => c.nome === 'Telefone')).toBe(true);
    expect(so.camadas.some((c) => c.nome === 'Ícone do endereço')).toBe(false);
    const nada = documentoDoEncarteOficial(e, [produto(1)]);
    expect(nada.camadas.some((c) => c.nome.startsWith('Ícone'))).toBe(false);
  });
});
