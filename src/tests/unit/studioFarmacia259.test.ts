// F-259 — FARMÁCIA no Studio: encarte e palco iguais aos de mercado, com a arte da farmácia, a cesta de remédios isentos de
// prescrição e o aviso obrigatório "a persistirem os sintomas, o médico deverá ser consultado" (Lei 9.294/1996, art. 7º).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PASTAS_DE_ENCARTE, PASTA_ENCARTES_FARMACIA, documentoDoEncarteOficial, encartesDoSegmento, formatosDoEncarte, layoutDoEncarte } from '@/lib/studio/encartesOficiais';
import { AVISO_DE_REMEDIO, PASTA_PALCO_FARMACIA, fundosDoSegmento, palcoDoProduto, srcDoFundo, srcSemLogo } from '@/lib/studio/palco';
import { LOGO_OFERTAS_DE_FARMACIA } from '@/lib/studio/logos';
import { TAMANHO_DOC } from '@/lib/studio/documento';
import { CESTA_FARMACIA } from '@/lib/tabloide/encartes';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { faltasDoProduto, linhaDoCampo, CAMPOS_VAZIOS } from '@/lib/tabloide/produtoCompleto';

const cesta = lerLista(CESTA_FARMACIA).map((p, i) => ({ ...p, imagem: { url: `https://x/${i}.png`, fonte: 'MARCA' as const } }));
const dentro = (a: { x: number; y: number; w: number; h: number }, W: number, H: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= W + 1 && a.y + a.h <= H + 1;

// nomes como estão gravados no catálogo (nome_norm): a cesta de exemplo traz a foto oficial de cada um
const NO_CATALOGO = [
  '1g 2 comprimidos novalgina', '16 comprimidos multi naldecon', '30 adulto centrum comprimidos', '15ml gotas luftal', '8 limao mel sabor strepsils',
  '20ml 500 gotas mg ml novalgina', '60 capsulas centrum corpo energia mente', '24 comprimidos dia naldecon noite pack', '250mg gel luftal max',
  '10 500 comprimidos mg novalgina', '16 laranja sabor strepsils', '10ml 500 gotas infantil mg ml novalgina', '15ml gotas infantil luftal',
  '20 caps gel luftal', '1g efervescente novalgina', '16 limao mel sabor strepsils',
];

describe('cesta de exemplo da farmácia', () => {
  it('16 produtos completos (nome, marca, medida e preço), cada um com a foto oficial no catálogo', () => {
    expect(cesta).toHaveLength(16);
    for (const p of cesta) expect(faltasDoProduto(p), p.nome).toEqual([]);
    expect(cesta.map((p) => chaveCanonica(p.nome))).toEqual(NO_CATALOGO);
  });
  it('comprimidos e cápsulas contam como medida, e o campo guiado escreve "30 comprimidos"', () => {
    expect(faltasDoProduto({ nome: 'Naldecon Multi 16 Comprimidos', preco: 19.9, unidade: null, codigo: null })).toEqual([]);
    expect(faltasDoProduto({ nome: 'Centrum Mulher 60 Cápsulas', preco: 79.9, unidade: null, codigo: null })).toEqual([]);
    expect(linhaDoCampo({ ...CAMPOS_VAZIOS, nome: 'Centrum Adulto', marca: '', quantidade: '30', unidade: 'comprimidos', preco: '54,90' })).toBe('Centrum Adulto 30 comprimidos 54,90');
    expect(linhaDoCampo({ ...CAMPOS_VAZIOS, nome: 'Café', marca: 'Pilão', quantidade: '500', unidade: 'g', preco: '18,90' })).toBe('Café Pilão 500g 18,90');
  });
});

describe('encarte de farmácia', () => {
  const [e] = encartesDoSegmento('farmacia');
  it('é uma pasta própria, com a logo da farmácia; o mercado continua só com os dele', () => {
    expect(e.id).toBe('saude-em-oferta');
    expect(e.logoPadrao).toBe(LOGO_OFERTAS_DE_FARMACIA);
    expect(PASTAS_DE_ENCARTE.farmacia).toMatchObject({ chave: PASTA_ENCARTES_FARMACIA, nome: 'Encartes de Farmácia' });
    expect(encartesDoSegmento('mercado').map((x) => x.id)).toEqual(['mega-oferta-bicolor', 'semana-do-frango']);
  });
  it.each(['9:16', '16:9', '1:1', '4:5', 'a4', 'a4-h', 'a3'] as const)('%s: fundos existem e o aviso de remédio vai na faixa de baixo, sem bater nos produtos', (f) => {
    expect(formatosDoEncarte(e)).toContain(f);
    const l = layoutDoEncarte(e, f);
    expect(fs.existsSync(`public${l.fundo}`)).toBe(true);
    expect(fs.existsSync(`public${l.fundoLimpo}`)).toBe(true);
    const d = documentoDoEncarteOficial(e, cesta, { telefone: '(81) 99999-0000', endereco: 'Av. Agamenon Magalhães, 100 – Caruaru' }, f);
    const aviso = d.camadas.find((c) => c.nome === 'Aviso de remédio')!;
    expect(aviso).toMatchObject({ tipo: 'texto', texto: AVISO_DE_REMEDIO, alinhamento: 'center' });
    const { w: W, h: H } = TAMANHO_DOC[f];
    expect(dentro(aviso, W, H)).toBe(true);
    expect(aviso.y).toBeGreaterThanOrEqual(l.rodape.y + l.rodape.h - 1);
    for (const col of l.colunas) expect(col.y + col.h).toBeLessThanOrEqual(l.aviso!.y);
    // todo produto da cesta aparece com o balão (um objeto só)
    expect(d.camadas.filter((c) => c.nome.startsWith('Preço ')).length).toBeGreaterThan(0);
  });
});

describe('palco de ofertas da farmácia', () => {
  const fundos = fundosDoSegmento('farmacia');
  it('tem o fundo da farmácia (com e sem logo) e o mercado continua com o Alerta de Oferta', () => {
    expect(PASTA_PALCO_FARMACIA).toBe('palco-de-ofertas-farmacia');
    expect(fundos.map((f) => f.id)).toEqual(['saude-em-oferta']);
    expect(fundosDoSegmento('mercado').map((f) => f.id)).toEqual(['alerta-de-oferta']);
    for (const k of ['9:16', '16:9'] as const) {
      expect(fs.existsSync(`public${srcDoFundo(fundos[0], k)}`)).toBe(true);
      expect(fs.existsSync(`public${srcSemLogo(fundos[0], k)}`)).toBe(true);
    }
  });
  it.each(['9:16', '16:9'] as const)('%s: cada produto sai com nome, balão, botão e o aviso de remédio embaixo, sem cobrir o botão', (k) => {
    const d = palcoDoProduto(cesta[0], k, { fundo: fundos[0], textoBotao: 'FARMÁCIA' });
    const nomes = d.camadas.map((c) => c.nome);
    for (const n of ['Produto', 'Nome do produto', 'Preço', 'Botão', 'Aviso de remédio']) expect(nomes, n).toContain(n);
    const aviso = d.camadas.find((c) => c.nome === 'Aviso de remédio')!;
    const botao = d.camadas.find((c) => c.nome === 'Botão')!;
    const { w: W, h: H } = TAMANHO_DOC[k];
    expect(dentro(aviso, W, H)).toBe(true);
    expect(aviso.y).toBeGreaterThanOrEqual(botao.y + botao.h - 2);
  });
});

describe('telas', () => {
  it('as pastas novas abrem as mesmas telas do mercado, com a farmácia', () => {
    const pasta = fs.readFileSync('src/pages/studioai/PastaPage.tsx', 'utf8');
    expect(pasta).toContain('<PalcoDeOfertas key="farmacia" segmento="farmacia" />');
    expect(pasta).toContain('<PastaDeEncartes key="farmacia" segmento="farmacia" />');
    const cat = fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8');
    for (const t of ['Encartes de Farmácia', 'Palco de Ofertas – Farmácia', '<CapaDaPastaPalco segmento="farmacia" />']) expect(cat).toContain(t);
  });
});
