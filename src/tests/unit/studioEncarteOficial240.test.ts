// F-240/F-241 — ENCARTE OFICIAL "Mega Oferta" (fundo do dono, em pé e deitado): produtos organizados sozinhos nos lados
// vermelho e azul, logo do cliente no lugar do "SUA LOGO AQUI" (solta quando é recortada, em cartão quando tem fundo),
// telefone e endereço no rodapé amarelo; abre no editor do Studio só nos formatos dele.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, formatosDoEncarte, layoutDoEncarte } from '@/lib/studio/encartesOficiais';
import { TAMANHO_DOC } from '@/lib/studio/documento';

const FORMATOS = ['9:16', '16:9'] as const;
const produto = (i: number) => ({ nome: `Produto ${i} 1kg`, preco: 2 + i, precoDe: i % 2 ? 5 + i : null, unidade: null, imagem: { url: `https://x/${i}.png`, fonte: 'OPENFOODFACTS' as const } });
const cruza = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('F-243 — Semana do Frango', () => {
  const f = ENCARTES_OFICIAIS.find((x) => x.id === 'semana-do-frango')!;
  it('está na lista junto do Mega Oferta, nos dois formatos', () => {
    expect(ENCARTES_OFICIAIS.map((x) => x.id)).toEqual(['mega-oferta-bicolor', 'semana-do-frango', 'saude-em-oferta']);
    expect(formatosDoEncarte(f)).toEqual(expect.arrayContaining(['9:16', '16:9']));
  });
  it('no cartão amarelo o nome é escuro; no azul é branco; os dois com o balão oval do encarte', () => {
    const d = documentoDoEncarteOficial(f, [produto(1), produto(2)], {}, '9:16');
    expect(d.camadas.find((c) => c.nome === 'Nome do produto 1')).toMatchObject({ cor: '#ffffff' });
    expect(d.camadas.find((c) => c.nome === 'Nome do produto 2')).toMatchObject({ cor: '#6e0010', sombra: null });
    for (const n of [1, 2]) expect(d.camadas.find((c) => c.nome === `Preço ${n}`)).toMatchObject({ tipo: 'selo', formato: 'oval', borda: '#ffd21f' });
  });
  it('a grade do azul e a do cartão não batem no título, nas moedas nem no rodapé', () => {
    for (const k of ['9:16', '16:9'] as const) {
      const l = layoutDoEncarte(f, k);
      expect(l.colunas[0].y + l.colunas[0].h).toBeLessThanOrEqual(l.rodape.y);
      expect(l.colunas[0].x + l.colunas[0].w).toBeLessThan(l.colunas[1].x);
    }
  });
});

describe.each(ENCARTES_OFICIAIS)('encarte oficial $id', (e) => {
  it('tem os dois formatos e os fundos existem (com a caixa "SUA LOGO AQUI" e sem ela)', () => {
    expect(formatosDoEncarte(e)).toEqual(expect.arrayContaining(['9:16', '16:9']));
    for (const f of FORMATOS) {
      const l = layoutDoEncarte(e, f);
      expect(fs.existsSync(`public${l.fundo}`), f).toBe(true);
      expect(fs.existsSync(`public${l.fundoLimpo}`), f).toBe(true);
      expect(documentoDoEncarteOficial(e, [produto(1)], {}, f).formato).toBe(f);
    }
  });

  it('cada produto fica dentro do seu lado, sem passar da curva nem entrar no rodapé, e nada se sobrepõe (em pé e deitado)', () => {
    for (const f of FORMATOS) {
      const l = layoutDoEncarte(e, f);
      for (const n of [2, 4, 6, 8, 10, 12, 16, 20]) {
        const d = documentoDoEncarteOficial(e, Array.from({ length: n }, (_, i) => produto(i)), { quantos: n }, f);
        const placas = d.camadas.filter((c) => c.nome.startsWith('Placa '));
        expect(placas, `${f} ${n}`).toHaveLength(n);
        for (const p of placas) {
          const col = l.colunas.find((c) => p.x >= c.x - 0.5 && p.x + p.w <= c.x + c.w + 0.5);
          expect(col, `${f} ${n} ${p.nome}`).toBeTruthy();
          expect(p.y).toBeGreaterThanOrEqual(col!.y - 0.5);
          expect(p.y + p.h).toBeLessThanOrEqual(l.rodape.y);
          // cartão com formato bom (nem tira fina nem coluna estreita)
          expect(p.w / p.h, `${f} ${n} ${p.nome}`).toBeGreaterThan(0.35);
          expect(p.w / p.h, `${f} ${n} ${p.nome}`).toBeLessThan(3);
        }
        for (let i = 0; i < placas.length; i++) for (let j = i + 1; j < placas.length; j++) expect(cruza(placas[i], placas[j]), `${f} ${n}: ${placas[i].nome} × ${placas[j].nome}`).toBe(false);
        for (const p of placas) {
          const k = p.nome.split(' ')[1];
          const etq = d.camadas.find((c) => c.nome === `Preço ${k}`)!;
          expect(etq.x >= p.x && etq.x + etq.w <= p.x + p.w + 0.5 && etq.y >= p.y && etq.y + etq.h <= p.y + p.h + 0.5, `${f} ${n} preço ${k}`).toBe(true);
        }
      }
    }
  });

  it('logo: sem logo mostra o fundo com "SUA LOGO AQUI"; recortada fica solta; com fundo vai num cartão', () => {
    for (const f of FORMATOS) {
      const l = layoutDoEncarte(e, f);
      const sem = documentoDoEncarteOficial(e, [produto(1)], {}, f);
      expect(sem.camadas[0]).toMatchObject({ src: l.fundo, bloqueada: true });
      expect(sem.camadas.some((c) => c.nome.startsWith('Sua logo'))).toBe(false);
      const solta = documentoDoEncarteOficial(e, [produto(1)], { logo: { url: 'data:image/png;base64,x', largura: 400, altura: 400, recortada: true } }, f);
      expect(solta.camadas[0]).toMatchObject({ src: l.fundoLimpo });
      expect(solta.camadas.find((c) => c.nome === 'Sua logo')).toMatchObject({ tipo: 'imagem', ajuste: 'conter' });
      expect(solta.camadas.some((c) => c.nome === 'Sua logo — cartão')).toBe(false);
      const cartao = documentoDoEncarteOficial(e, [produto(1)], { logo: { url: 'data:image/png;base64,x', largura: 600, altura: 300, recortada: false } }, f);
      const moldura = cartao.camadas.find((c) => c.nome === 'Sua logo — cartão')!;
      expect(moldura).toMatchObject({ tipo: 'forma', cor: '#ffffff' });
      expect(moldura.w / moldura.h).toBeCloseTo(2, 1);
      expect(moldura.x >= l.logo.x && moldura.x + moldura.w <= l.logo.x + l.logo.w + 0.5 && moldura.y >= l.logo.y - 0.5 && moldura.y + moldura.h <= l.logo.y + l.logo.h + 0.5, f).toBe(true);
    }
  });

  it('rodapé amarelo: telefone e endereço dentro da faixa (em pé um embaixo do outro, deitado lado a lado)', () => {
    for (const f of FORMATOS) {
      const l = layoutDoEncarte(e, f);
      const d = documentoDoEncarteOficial(e, [produto(1)], { telefone: '(11) 99999-1234', endereco: 'Av. Brasil, 1500 – Centro – São Paulo/SP' }, f);
      const tel = d.camadas.find((c) => c.nome === 'Telefone')!, end = d.camadas.find((c) => c.nome === 'Endereço')!;
      expect(tel).toMatchObject({ texto: '(11) 99999-1234' });
      expect(end).toMatchObject({ texto: 'Av. Brasil, 1500 – Centro – São Paulo/SP' });
      for (const c of [tel, end]) {
        expect(c.y >= l.rodape.y - 0.5 && c.y + c.h <= l.rodape.y + l.rodape.h + 1, `${f} ${c.nome}`).toBe(true);
        expect(c.x >= 0 && c.x + c.w <= TAMANHO_DOC[f].w, `${f} ${c.nome}`).toBe(true);
      }
      expect(cruza(tel, end), f).toBe(false);
      if (f === '16:9') expect(end.x).toBeGreaterThan(tel.x + tel.w - 1);
      expect(documentoDoEncarteOficial(e, [produto(1)], {}, f).camadas.some((c) => c.nome === 'Telefone' || c.nome === 'Endereço')).toBe(false);
    }
  });

  it('as telas: cartão na pasta com TV em pé/deitada e o editor abrindo a arte pronta só nos formatos dela', () => {
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toMatch(/<EncarteOficialCartao /);
    expect(fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8')).toMatch(/enderecoDaArtePronta\(\{ docs,/);
    const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(editor).toMatch(/lerArtePronta\(\)/);
    expect(editor).toMatch(/formatos=\{publicando === 'video' \? undefined : formatosDeTela\}/);
  });
});
