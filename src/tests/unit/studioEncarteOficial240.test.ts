// F-240 — ENCARTE OFICIAL "Mega Oferta" (fundo do dono): produtos organizados sozinhos nos lados vermelho e azul, logo do
// cliente no lugar do "SUA LOGO AQUI" (solta quando é recortada, em cartão quando tem fundo), telefone e endereço no
// rodapé amarelo; abre no editor do Studio só no formato dele.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ENCARTES_OFICIAIS, MAX_POR_COLUNA, dividirProdutos, documentoDoEncarteOficial, maxDeProdutos } from '@/lib/studio/encartesOficiais';

const e = ENCARTES_OFICIAIS[0];
const produto = (i: number) => ({ nome: `Produto ${i} 1kg`, preco: 2 + i, precoDe: i % 2 ? 5 + i : null, unidade: null, imagem: { url: `https://x/${i}.png`, fonte: 'OPENFOODFACTS' as const } });
const cruza = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('encarte oficial Mega Oferta', () => {
  it('os fundos existem (com a caixa "SUA LOGO AQUI" e sem ela)', () => {
    expect(e.id).toBe('mega-oferta-bicolor');
    expect(fs.existsSync(`public${e.fundo}`)).toBe(true);
    expect(fs.existsSync(`public${e.fundoLimpo}`)).toBe(true);
  });

  it('divide os produtos alternando entre o lado vermelho e o azul, até o máximo', () => {
    expect(dividirProdutos([1, 2, 3, 4, 5], 2)).toEqual([[1, 3, 5], [2, 4]]);
    expect(maxDeProdutos(e)).toBe(2 * MAX_POR_COLUNA);
    const muitos = Array.from({ length: 30 }, (_, i) => i);
    expect(dividirProdutos(muitos, 2).flat()).toHaveLength(maxDeProdutos(e));
  });

  it('cada produto fica dentro do seu lado, sem passar da curva nem entrar no rodapé, e nada se sobrepõe', () => {
    for (const n of [1, 2, 5, 9, 16]) {
      const d = documentoDoEncarteOficial(e, Array.from({ length: n }, (_, i) => produto(i)));
      const placas = d.camadas.filter((c) => c.nome.startsWith('Placa '));
      expect(placas, `${n}`).toHaveLength(n);
      for (const p of placas) {
        const col = e.colunas.find((c) => p.x >= c.x - 0.5 && p.x + p.w <= c.x + c.w + 0.5);
        expect(col, `${n} ${p.nome}`).toBeTruthy();
        expect(p.y).toBeGreaterThanOrEqual(col!.y - 0.5);
        expect(p.y + p.h).toBeLessThanOrEqual(e.rodape.y);
      }
      for (let i = 0; i < placas.length; i++) for (let j = i + 1; j < placas.length; j++) expect(cruza(placas[i], placas[j]), `${n}: ${placas[i].nome} × ${placas[j].nome}`).toBe(false);
      // a etiqueta de cada produto fica dentro da placa dele
      for (const p of placas) {
        const k = p.nome.split(' ')[1];
        const etq = d.camadas.find((c) => c.nome === `Preço ${k}`)!;
        expect(etq.x >= p.x && etq.x + etq.w <= p.x + p.w + 0.5 && etq.y >= p.y && etq.y + etq.h <= p.y + p.h + 0.5, `${n} preço ${k}`).toBe(true);
      }
    }
  });

  it('logo: sem logo mostra o fundo com "SUA LOGO AQUI"; recortada fica solta; com fundo vai num cartão', () => {
    const sem = documentoDoEncarteOficial(e, [produto(1)]);
    expect(sem.camadas[0]).toMatchObject({ src: e.fundo, bloqueada: true });
    expect(sem.camadas.some((c) => c.nome.startsWith('Sua logo'))).toBe(false);
    const solta = documentoDoEncarteOficial(e, [produto(1)], { logo: { url: 'data:image/png;base64,x', largura: 400, altura: 400, recortada: true } });
    expect(solta.camadas[0]).toMatchObject({ src: e.fundoLimpo });
    expect(solta.camadas.find((c) => c.nome === 'Sua logo')).toMatchObject({ tipo: 'imagem', ajuste: 'conter' });
    expect(solta.camadas.some((c) => c.nome === 'Sua logo — cartão')).toBe(false);
    const cartao = documentoDoEncarteOficial(e, [produto(1)], { logo: { url: 'data:image/png;base64,x', largura: 600, altura: 300, recortada: false } });
    const moldura = cartao.camadas.find((c) => c.nome === 'Sua logo — cartão')!;
    expect(moldura).toMatchObject({ tipo: 'forma', cor: '#ffffff' });
    // o cartão respeita a proporção da logo e fica dentro do espaço do "SUA LOGO AQUI"
    expect(moldura.w / moldura.h).toBeCloseTo(2, 1);
    expect(moldura.x >= e.logo.x && moldura.x + moldura.w <= e.logo.x + e.logo.w + 0.5 && moldura.y >= e.logo.y - 0.5 && moldura.y + moldura.h <= e.logo.y + e.logo.h + 0.5).toBe(true);
  });

  it('rodapé amarelo: telefone e endereço que o cliente digitou', () => {
    const d = documentoDoEncarteOficial(e, [produto(1)], { telefone: '(11) 99999-1234', endereco: 'Av. Brasil, 1500 – Centro' });
    const tel = d.camadas.find((c) => c.nome === 'Telefone')!, end = d.camadas.find((c) => c.nome === 'Endereço')!;
    expect(tel).toMatchObject({ texto: '(11) 99999-1234' });
    expect(end).toMatchObject({ texto: 'Av. Brasil, 1500 – Centro' });
    for (const c of [tel, end]) expect(c.y >= e.rodape.y && c.y + c.h <= e.rodape.y + e.rodape.h + 1, c.nome).toBe(true);
    expect(documentoDoEncarteOficial(e, [produto(1)]).camadas.some((c) => c.nome === 'Telefone' || c.nome === 'Endereço')).toBe(false);
  });

  it('as telas: cartão na pasta Encartes de Mercado e o editor abrindo a arte pronta só no formato dela', () => {
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toMatch(/<EncarteOficialCartao /);
    const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(editor).toMatch(/lerArtePronta\(\)/);
    expect(editor).toMatch(/somente \? \[somente\]/);
  });
});
