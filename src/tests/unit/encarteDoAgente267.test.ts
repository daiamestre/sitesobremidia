// F-267 (MG-AUT-08) — a Central monta o encarte/palco OFICIAL com os produtos e preços da pessoa e anima uma arte.
import { describe, it, expect } from 'vitest';
import { encarteDaConversa, linkArteParaVideo, PASTAS_DO_STUDIO } from '../../../supabase/functions/_shared/agente/studio';
import { lerLinha } from '@/lib/tabloide/parseProdutos';
import { PASTA_PALCO, PASTA_PALCO_FARMACIA } from '@/lib/studio/palco';
import { PASTA_ENCARTES_FARMACIA } from '@/lib/studio/encartesOficiais';
import { PASTA_ENCARTES } from '@/components/studio/EncartesDoStudio';
import { CHAVE_DA_PASTA, produtosDoLink } from '@/pages/studioai/PastaPage';
import { CHAVE_PRODUTOS_DA_FARMACIA, CHAVE_PRODUTOS_DO_ENCARTE } from '@/components/studio/ProdutosComFotos';

const FALA = 'Monte um encarte de supermercado com Arroz Tio João 5kg 24,90, Feijão Kicaldo 1kg de 9,49 por 7,99 e Óleo Soya 900ml 8,49';

describe('Central → encarte oficial', () => {
  it('as pastas da Central são as pastas reais do Studio', () => {
    expect(PASTAS_DO_STUDIO).toEqual({ encarte: { mercado: PASTA_ENCARTES, farmacia: PASTA_ENCARTES_FARMACIA }, palco: { mercado: PASTA_PALCO, farmacia: PASTA_PALCO_FARMACIA } });
    expect(CHAVE_DA_PASTA).toMatchObject({ [PASTA_ENCARTES]: CHAVE_PRODUTOS_DO_ENCARTE, [PASTA_PALCO]: CHAVE_PRODUTOS_DO_ENCARTE,
      [PASTA_ENCARTES_FARMACIA]: CHAVE_PRODUTOS_DA_FARMACIA, [PASTA_PALCO_FARMACIA]: CHAVE_PRODUTOS_DA_FARMACIA });
    // F-277: cada segmento novo guarda a sua lista (a mesma no encarte e no palco dele)
    expect(CHAVE_DA_PASTA['encartes-de-adega']).toBe('studio-encarte-produtos-adega');
    expect(CHAVE_DA_PASTA['palco-de-ofertas-adega']).toBe('studio-encarte-produtos-adega');
  });

  it('as linhas geradas são lidas pelo Studio com o preço EXATO (normal e "de/por")', () => {
    const r = encarteDaConversa({ tipo: 'encarte', segmento: 'mercado', produtos: [
      { nome: 'Arroz Tio João 5kg', preco: '24,90' }, { nome: 'Feijão Kicaldo 1kg', preco: '9,49', preco_promocional: '7,99' }, { nome: 'Óleo Soya 900ml', preco: '8,49' }] }, FALA);
    expect(r.erros).toEqual([]);
    expect(r.link).toMatch(/^\/studio\/pasta\/encartes-de-mercado\?produtos=/);
    const lidos = r.linhas.map((l) => lerLinha(l)!);
    expect(lidos.map((p) => p.nome)).toEqual(['Arroz Tio João 5kg', 'Feijão Kicaldo 1kg', 'Óleo Soya 900ml']);
    expect(lidos.map((p) => [p.preco, p.precoDe ?? null])).toEqual([[24.9, null], [7.99, 9.49], [8.49, null]]);
    expect(decodeURIComponent(r.link!.split('produtos=')[1]).split('\n')).toEqual(r.linhas);
  });

  it('recusa preço inventado, pede o que falta e respeita farmácia/palco', () => {
    expect(encarteDaConversa({ segmento: 'mercado', produtos: [{ nome: 'Arroz', preco: '19,90' }] }, FALA).erros.join(' ')).toMatch(/não foi escrito/);
    expect(encarteDaConversa({ segmento: 'mercado', produtos: [{ nome: 'Arroz Tio João 5kg' }] }, FALA).perguntar.join(' ')).toMatch(/preço de "Arroz/);
    expect(encarteDaConversa({ segmento: 'mercado', produtos: [] }, FALA).perguntar.join(' ')).toMatch(/produtos e os preços/);
    const f = encarteDaConversa({ tipo: 'palco', segmento: 'farmácia', produtos: [{ nome: 'Dorflex 10 comprimidos', preco: '12,90' }] }, 'palco da farmácia com Dorflex 10 comprimidos 12,90');
    expect(f.link).toMatch(/^\/studio\/pasta\/palco-de-ofertas-farmacia\?/);
  });

  it('a pasta grava a lista vinda do link na MESMA chave que já usa (e ignora pasta desconhecida)', () => {
    sessionStorage.clear();
    expect(produtosDoLink(PASTA_ENCARTES_FARMACIA, 'Dorflex 12,90\n\nNovalgina 1g 15,90')).toBe(true);
    expect(sessionStorage.getItem(CHAVE_PRODUTOS_DA_FARMACIA)).toBe('Dorflex 12,90\nNovalgina 1g 15,90');
    expect(produtosDoLink('outra-pasta', 'X 1,00')).toBe(false);
    expect(produtosDoLink(PASTA_ENCARTES, null)).toBe(false);
  });
});

describe('Central → arte em vídeo', () => {
  it('link do editor de vídeo com a arte e a duração (5 a 60 s); id inválido é recusado', () => {
    expect(linkArteParaVideo('8b0c7f8e-1234-4abc-9def-001122334455', 15)).toEqual({ link: '/studio/video?midia=8b0c7f8e-1234-4abc-9def-001122334455&duracao=15', erro: null, duracao_s: 15 });
    expect(linkArteParaVideo('8b0c7f8e-1234-4abc-9def-001122334455', 500).duracao_s).toBe(60);
    expect(linkArteParaVideo('../../etc', 15).link).toBeNull();
  });
});
