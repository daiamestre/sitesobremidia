/**
 * F-288 — REGRA DO DONO: toda logo CRIADA POR NÓS (farmácia e todos os segmentos) é 100% editável — textos, ícones soltos dos
 * lados, círculo (ícone da galeria ou logo do cliente) e cores —, com a galeria de ícones por segmento e a edição na LATERAL DIREITA.
 * A logo enviada pelo cliente (pronta, imagem única) continua uma camada só.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { camadasDaLogoDoSegmento, ehCamadaDaLogo, ehSegmentoComLogoEditavel } from '@/lib/studio/logoEditavel';
import { GALERIA_DE_ICONES } from '@/lib/studio/galeriaDeIcones';
import { SEGMENTOS_DE_OFERTA } from '@/lib/studio/segmentosDeOferta';
import { fundosDoSegmento, palcoDoProduto } from '@/lib/studio/palco';

const RAIZ = path.resolve(__dirname, '../../..');
const existe = (src: string) => fs.existsSync(path.join(RAIZ, 'public', src));
const produto = { nome: 'Dipirona 1 g 10 Comprimidos', preco: 7.49, precoDe: null, unidade: null, imagem: null };

describe('F-288 logo 100% editável', () => {
  const segmentos = ['farmacia', ...SEGMENTOS_DE_OFERTA.map((s) => s.id)] as const;

  it.each(segmentos)('%s: base, ícones dos lados, círculo e 3 textos em camadas, com os arquivos no lugar', (seg) => {
    expect(ehSegmentoComLogoEditavel(seg)).toBe(true);
    const c = camadasDaLogoDoSegmento(seg, { x: 0, y: 0, w: 1000, h: 700 });
    const nomes = c.map((x) => x.nome);
    expect(nomes).toEqual(expect.arrayContaining(['Logo – base', 'Logo – ícone esquerdo', 'Logo – ícone direito', 'Logo no círculo', 'Logo – OFERTAS', 'Logo – faixa', 'Logo – frase']));
    for (const x of c) {
      expect(ehCamadaDaLogo(x.nome)).toBe(true);
      if (x.tipo === 'imagem') expect(existe(x.src), x.src).toBe(true);
      if (x.tipo === 'texto') expect(x.caber, `${x.nome} encolhe para caber`).toBe(true);
    }
  });

  it('o palco da farmácia usa a logo em camadas (textos trocáveis: OFERTAS, DE FARMÁCIA, SAÚDE COM DESCONTO)', () => {
    const d = palcoDoProduto(produto, '9:16', { fundo: fundosDoSegmento('farmacia')[0] });
    const textos = d.camadas.filter((c) => c.tipo === 'texto' && c.nome.startsWith('Logo – ')).map((c) => (c.tipo === 'texto' ? c.texto : ''));
    expect(textos).toEqual(['OFERTAS', 'DE FARMÁCIA', 'SAÚDE COM DESCONTO']);
  });

  it('texto novo criado pelo cliente entra na arte e as mudanças valem', () => {
    const f = fundosDoSegmento('farmacia')[0];
    const novo = { tipo: 'texto', nome: 'Logo – texto 1', texto: 'DROGARIA DO BAIRRO', x: 10, y: 10, w: 500, h: 60, rot: 0, opacidade: 1, visivel: true, bloqueada: false, fonte: 'anton', italico: false, tamanho: 50, cor: '#fff', alinhamento: 'center', entrelinha: 1, espacamento: 0, maiusculas: false };
    const d = palcoDoProduto(produto, '9:16', { fundo: f, ajustes: { '9:16': { 'Logo – texto 1': novo as never, 'Logo – OFERTAS': { texto: 'PROMOÇÃO' } as never } } });
    expect(d.camadas.find((c) => c.nome === 'Logo – texto 1')).toMatchObject({ texto: 'DROGARIA DO BAIRRO' });
    expect(d.camadas.find((c) => c.nome === 'Logo – OFERTAS')).toMatchObject({ texto: 'PROMOÇÃO' });
  });

  it('galeria de ícones por segmento, com os arquivos gerados', () => {
    const grupos = GALERIA_DE_ICONES.map((g) => g.id);
    expect(grupos).toEqual(expect.arrayContaining(['farmacia', 'saude', 'hortifruti', 'academia', 'mercado', 'black-friday', 'padaria', 'adega', 'acougue', 'pet', 'beleza', 'eletronicos', 'moda']));
    for (const g of GALERIA_DE_ICONES) for (const i of g.icones) expect(existe(i.src), i.src).toBe(true);
  });

  it('edição na LATERAL DIREITA também no tablet em pé (palco e encartes)', () => {
    const palco = fs.readFileSync(path.join(RAIZ, 'src/components/studio/PalcoDeOfertas.tsx'), 'utf8');
    expect(palco).toMatch(/min-\[540px\]:grid-cols-\[minmax\(0,1fr\)_/);
    expect(palco).toContain('<PainelDaLogo');
    expect(palco).toContain('<EditarBotao');
    const editor = fs.readFileSync(path.join(RAIZ, 'src/pages/studioai/EditorPage.tsx'), 'utf8');
    expect(editor).toContain('<PainelDaLogo');
    expect(editor).toMatch(/min-\[700px\]:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  });
});
