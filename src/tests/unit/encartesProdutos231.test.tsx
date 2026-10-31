// F-231 — encartes de mercado no Studio (motor do Cartaz Digital), fotos de produto com marca e medida certas e
// leitura por código de barras.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import { codigoValido, medidaConflita, medidasCanonicas, nomeDoProduto, respeitarMarcaEMedida } from '../../../supabase/functions/produto-imagem/regras.ts';
import { lerLinha, lerLista, paraLinha } from '@/lib/tabloide/parseProdutos';
import { montarPaginas } from '@/lib/tabloide/grade';
import { configPadrao, normalizarConfig, propsDasPaginas } from '@/lib/tabloide/cartaz';
import { formatoPorId, TEMAS } from '@/lib/tabloide/temas';
import { ENCARTES, ENCARTE_FORMATO, ENCARTE_GRADE, configDoEncarte } from '@/lib/tabloide/encartes';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';

const palavras = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b\d+([.,]\d+)?\s*(kg|g|ml|l)\b/g, ' ').split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !['com', 'para', 'tipo'].includes(p));

describe('fotos de produto: marca e medida valem como regra', () => {
  it('a mesma medida em qualquer escrita', () => {
    expect(medidasCanonicas('Arroz 5 kg')).toEqual(['g5000']);
    expect(medidasCanonicas('Coca-Cola 2 litros')).toEqual(['ml2000']);
    expect(medidasCanonicas('Leite 1L')).toEqual(medidasCanonicas('Leite 1000 ml'));
    expect(medidasCanonicas('Óleo 900ml')).toEqual(['ml900']);
  });
  it('medida diferente não serve (5 kg × 1 kg; leite 1 L × leite em pó 800 g); produto sem medida fica', () => {
    expect(medidaConflita('Arroz Camil 5kg', 'Arroz Tipo 1 Camil 1kg')).toBe(true);
    expect(medidaConflita('Arroz Camil 5kg', 'Arroz Tipo 1 Camil 5 kg')).toBe(false);
    expect(medidaConflita('Leite Integral 1L', 'Leite Pó Integral Pacote 800g')).toBe(true);
    expect(medidaConflita('Leite Integral 1L', 'Leite Integral Caixa 1000ml')).toBe(false);
    expect(medidaConflita('Leite Integral 1L', 'Leite Integral')).toBe(false);
  });
  it('a marca digitada filtra; a palavra que diz o produto também ("Óleo de Soja Liza" nunca vira óleo de algodão)', () => {
    const achados = [
      { nome: 'Arroz Tipo 1 Camil 5kg', marcas: 'Camil' },
      { nome: 'Arroz Tipo 1 Tio João 5kg', marcas: 'Tio João' },
      { nome: 'Arroz Camil 1kg', marcas: 'Camil' },
    ];
    expect(respeitarMarcaEMedida('Arroz Camil 5kg', palavras('Arroz Camil 5kg'), achados).map((x) => x.nome)).toEqual(['Arroz Tipo 1 Camil 5kg']);
    const oleos = [{ nome: 'Óleo De Algodão Tipo 1 Liza 900ml', marcas: 'LIZA' }, { nome: 'Óleo de Girassol Liza 900ml', marcas: 'Liza' }];
    expect(respeitarMarcaEMedida('Óleo de Soja Liza 900ml', palavras('Óleo de Soja Liza 900ml'), oleos)).toEqual([]);
    const certo = [...oleos, { nome: 'Óleo de Soja Liza 900ml', marcas: 'Liza' }];
    expect(respeitarMarcaEMedida('Óleo de Soja Liza 900ml', palavras('Óleo de Soja Liza 900ml'), certo).map((x) => x.nome)).toEqual(['Óleo de Soja Liza 900ml']);
  });
  it('o nome que vem do código de barras leva marca e medida sem repetir', () => {
    expect(nomeDoProduto('Refrigerante Coca Cola Original Garrafa 2l', 'COCA-COLA', '2l')).toBe('Refrigerante Coca Cola Original Garrafa 2l');
    expect(nomeDoProduto('Arroz parboilizado', 'Camil', '1 kg')).toBe('Arroz parboilizado Camil 1kg');
  });
});

describe('código de barras (pistola, câmera ou digitado)', () => {
  it('confere o dígito verificador (EAN-13, EAN-8, GTIN-14)', () => {
    expect(codigoValido('7894900027013')).toBe(true);
    expect(codigoValido('7894900027014')).toBe(false);
    expect(codigoValido('96385074')).toBe(true);
    expect(codigoValido('123')).toBe(false);
  });
  it('a linha com o código vira produto pelo código (nunca preço); o nome certo chega depois', () => {
    const p = lerLinha('7894900027013 9,99')!;
    expect(p).toMatchObject({ codigo: '7894900027013', preco: 9.99, nome: 'Código 7894900027013' });
    expect(paraLinha(p)).toBe('7894900027013 R$ 9,99');
    expect(lerLinha('7894900027013')).toMatchObject({ codigo: '7894900027013', preco: null });
    expect(lerLinha('Arroz Camil 5kg 25,90')?.codigo).toBeUndefined();
    expect(lerLinha('Refrigerante Coca-Cola 2l 9,99')).toMatchObject({ nome: 'Refrigerante Coca-Cola 2l', preco: 9.99 });
  });
  it('o editor tem o campo do leitor (pistola) e a câmera do tablet', () => {
    const editor = fs.readFileSync('src/components/tabloide/TabloideEditor.tsx', 'utf8');
    expect(editor).toMatch(/<LeitorDeCodigo aoLer=\{adicionarCodigo\} \/>/);
    const leitor = fs.readFileSync('src/components/tabloide/LeitorDeCodigo.tsx', 'utf8');
    expect(leitor).toMatch(/BarcodeDetector/);
    expect(leitor).toMatch(/codigoValido/);
    const fotos = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(fotos).toMatch(/chaveDoCodigo\(codigo\)/); // o código bipado fica no catálogo da empresa (o próximo bipe é instantâneo)
  });
});

describe('encartes de mercado (Studio)', () => {
  it('12 encartes, cada um com tema válido, 15 produtos e 3 destaques com "de/por"', () => {
    expect(ENCARTES).toHaveLength(12);
    for (const e of ENCARTES) {
      expect(TEMAS.some((t) => t.id === e.temaId), e.id).toBe(true);
      const ps = lerLista(e.produtos);
      expect(ps, e.id).toHaveLength(15);
      expect(ps.slice(0, 3).every((p) => p.precoDe != null && p.preco != null && p.precoDe > p.preco), e.id).toBe(true);
      expect(e.arte).toMatch(/no text/);
      expect(e.arte).toMatch(/no logo/);
    }
  });
  it('folha A4 em pé: 3 produtos grandes em cima e a grade 4 × 3 — tudo numa página', () => {
    const e = ENCARTES[0];
    const ps = lerLista(e.produtos);
    const [pagina, ...resto] = montarPaginas(ps, formatoPorId(ENCARTE_FORMATO), ENCARTE_GRADE, 3);
    expect(resto).toHaveLength(0);
    expect(pagina.celulas).toHaveLength(15);
    expect(pagina.celulas.filter((c) => c.destaque)).toHaveLength(3);
    expect([pagina.cols, pagina.rows]).toEqual([4, 3]);
  });
  it('o modelo liga título 3D, frase, 3 destaques e a caixa "Sua logo aqui" (some quando a loja envia a logo)', () => {
    const e = ENCARTES[3];
    const cfg = configDoEncarte(e, configPadrao());
    expect(cfg).toMatchObject({ titulo: e.titulo, destaques: 3, logoAqui: true, cabecalhoEmTexto: true, texto: e.produtos });
    const props = propsDasPaginas({ formatoId: ENCARTE_FORMATO, temaId: e.temaId, segmentoId: e.segmento, grade: ENCARTE_GRADE, produtos: lerLista(e.produtos), config: cfg }, []);
    expect(props[0]).toMatchObject({ logoAqui: true, titulo: e.titulo });
    const { getByTestId } = render(<TabloideCanvas {...props[0]} />);
    expect(getByTestId('tabloide-logo-aqui').textContent).toBe('Sua logo aqui');
    const comLogo = propsDasPaginas({ formatoId: ENCARTE_FORMATO, temaId: e.temaId, segmentoId: e.segmento, grade: ENCARTE_GRADE, produtos: [], config: { ...cfg, logoMarcaUrl: 'https://x/logo.png' } }, []);
    expect(comLogo[0].logoAqui).toBe(false);
  });
  it('rascunho salvo guarda 3 destaques, a arte da faixa e a caixa da logo', () => {
    const cfg = normalizarConfig({ destaques: 3, logoAqui: true, faixaArte: { url: '/studio/encartes/x.webp?v=1', largura: 1536, altura: 512 } });
    expect(cfg).toMatchObject({ destaques: 3, logoAqui: true, faixaArte: { url: '/studio/encartes/x.webp?v=1', largura: 1536, altura: 512 } });
    expect(normalizarConfig({ faixaArte: { url: 'javascript:alert(1)', largura: 1, altura: 1 } }).faixaArte).toBeNull();
  });
  it('o Studio mostra os encartes e abre o editor do Cartaz Digital já montado (mesmas opções)', () => {
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toMatch(/path="encarte\/:encarteId" element=\{<StudioEncarte \/>\}/);
    expect(fs.readFileSync('src/pages/studioai/EncartePage.tsx', 'utf8')).toMatch(/<TabloideEditor[\s\S]*encarte=\{encarte\}/);
    expect(fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8')).toMatch(/<EncartesDoStudio \/>/);
    // a arte é planejada pelos agentes do Creative Core e criada na Cloudflare; o robô tenta de novo a cada 3 h
    const script = fs.readFileSync('scripts/studio/gerar-artes-encartes.mjs', 'utf8');
    expect(script).toMatch(/planejarComCore/);
    expect(script).toMatch(/@cf\/leonardo\/lucid-origin/);
    expect(fs.readFileSync('.github/workflows/studio-fotos.yml', 'utf8')).toMatch(/gerar-artes-encartes\.mjs/);
  });
});
