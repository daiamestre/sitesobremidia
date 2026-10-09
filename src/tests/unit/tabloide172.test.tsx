/**
 * F-172 — Tabloide Digital: leitura de "produto + preço", grade, temas por segmento, escolha da foto,
 * desenho do cartaz e ligação nos menus/rotas.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { lerLinha, lerLista, lerValor, mesclarListas, paraLinha, chaveDoProduto, formatarPreco } from '@/lib/tabloide/parseProdutos';
import { montarPaginas, melhorGrade, medidasDoFormato } from '@/lib/tabloide/grade';
import { FORMATOS, SEGMENTOS, TEMAS, temasDoSegmento, temaPorId, segmentoPorId, formatoPorId } from '@/lib/tabloide/temas';
import { emojiDoProduto, ehFresco, escolherMelhor, type CandidatoImagem } from '@/lib/tabloide/imagens';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';

const fonte = (p: string) => readFileSync(p, 'utf8');

describe('F-172 · leitura de produto e preço', () => {
  it('entende os jeitos comuns de digitar', () => {
    expect(lerLinha('Picanha kg R$ 49,90')).toMatchObject({ nome: 'Picanha', preco: 49.9, unidade: 'KG' });
    expect(lerLinha('Arroz 5kg 25,90')).toMatchObject({ nome: 'Arroz 5kg', preco: 25.9, unidade: null });
    expect(lerLinha('Coca-Cola 2L - 9,99')).toMatchObject({ nome: 'Coca-Cola 2L', preco: 9.99 });
    expect(lerLinha('Pão francês 12,90/kg')).toMatchObject({ nome: 'Pão francês', preco: 12.9, unidade: 'KG' });
    expect(lerLinha('Água 500ml 3')).toMatchObject({ nome: 'Água 500ml', preco: 3 });
  });

  it('lê oferta "de X por Y"', () => {
    const p = lerLinha('Leite integral de 6,50 por 4,99')!;
    expect(p).toMatchObject({ nome: 'Leite integral', precoDe: 6.5, preco: 4.99 });
  });

  it('produto sem preço continua na lista (mostra CONSULTE)', () => {
    expect(lerLinha('Bolo de cenoura')).toMatchObject({ nome: 'Bolo de cenoura', preco: null });
  });

  it('ignora linhas vazias e valores com milhar', () => {
    expect(lerLista('\n  \nArroz 25,90\n\nFeijão 7,49\n')).toHaveLength(2);
    expect(lerValor('1.299,90')).toBe(1299.9);
    expect(lerValor('9.99')).toBe(9.99);
    expect(lerLinha('Geladeira R$ 2.499,00')?.preco).toBe(2499);
  });

  it('formata o preço no estilo de tabloide', () => {
    expect(formatarPreco(1299.9)).toEqual({ inteiro: '1.299', centavos: '90' });
    expect(formatarPreco(9)).toEqual({ inteiro: '9', centavos: '00' });
  });

  it('ao remontar, quem já tinha foto mantém a foto', () => {
    const antes = lerLista('Arroz 5kg 25,90');
    antes[0].imagem = { url: 'https://x/arroz.jpg', fonte: 'OPENFOODFACTS' };
    const depois = mesclarListas(antes, lerLista('Arroz 5kg 26,90\nFeijão 7,49'));
    expect(depois[0].imagem?.url).toBe('https://x/arroz.jpg');
    expect(depois[0].preco).toBe(26.9);
    expect(depois[1].imagem).toBeNull();
  });

  it('a linha volta para texto e é lida de novo igual', () => {
    for (const l of ['Picanha kg R$ 49,90', 'Leite de 6,50 por 4,99', 'Arroz 5kg R$ 25,90']) {
      const p = lerLinha(l)!;
      const q = lerLinha(paraLinha(p))!;
      expect([q.nome, q.preco, q.precoDe, q.unidade]).toEqual([p.nome, p.preco, p.precoDe, p.unidade]);
    }
    expect(chaveDoProduto('Pão Francês!')).toBe('pao frances');
  });
});

describe('F-172 · grade e formatos', () => {
  const tv = formatoPorId('tv-h');
  const vertical = formatoPorId('story');
  const lista = (n: number) => lerLista(Array.from({ length: n }, (_, i) => `Produto ${i + 1} ${i + 5},90`).join('\n'));

  it('automática: 8 produtos na TV ficam em 4×2 e em pé ficam em 2×4', () => {
    expect(melhorGrade(8, medidasDoFormato(tv).corpoL, medidasDoFormato(tv).corpoA)).toEqual({ cols: 4, rows: 2 });
    expect(melhorGrade(8, medidasDoFormato(vertical).corpoL, medidasDoFormato(vertical).corpoA)).toEqual({ cols: 2, rows: 4 });
  });

  it('automática: poucos produtos não viram cartões altos e estreitos', () => {
    const [{ celulas }] = montarPaginas(lista(5), tv, 'auto', 0);
    expect(celulas).toHaveLength(5);
    expect(Math.min(...celulas.map((c) => c.w / c.h))).toBeGreaterThan(0.75);
  });

  it('tudo cabe dentro da área dos produtos, sem cartões se sobrepondo', () => {
    for (const f of FORMATOS) {
      const m = medidasDoFormato(f);
      for (const n of [1, 3, 7, 12, 20]) {
        for (const d of [0, 1, 2]) {
          const [{ celulas }] = montarPaginas(lista(n), f, 'auto', d);
          for (const c of celulas) {
            expect(c.x).toBeGreaterThanOrEqual(m.corpoX - 1);
            expect(c.y).toBeGreaterThanOrEqual(m.corpoY - 1);
            expect(c.x + c.w).toBeLessThanOrEqual(m.corpoX + m.corpoL + 1);
            expect(c.y + c.h).toBeLessThanOrEqual(m.corpoY + m.corpoA + 1);
          }
          for (let i = 0; i < celulas.length; i++) for (let j = i + 1; j < celulas.length; j++) {
            const a = celulas[i]; const b = celulas[j];
            const seCruzam = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
            expect(seCruzam).toBe(false);
          }
        }
      }
    }
  });

  it('mais de 20 produtos viram várias páginas equilibradas', () => {
    const paginas = montarPaginas(lista(30), tv, 'auto', 0);
    expect(paginas).toHaveLength(2);
    expect(paginas[0].celulas.length + paginas[1].celulas.length).toBe(30);
  });

  it('grade fixa respeita colunas e destaques ficam no topo', () => {
    const [{ celulas, cols }] = montarPaginas(lista(6), tv, '3x2', 1);
    expect(cols).toBe(3);
    const destaque = celulas.filter((c) => c.destaque);
    expect(destaque).toHaveLength(1);
    expect(destaque[0].y).toBeLessThan(Math.min(...celulas.filter((c) => !c.destaque).map((c) => c.y)));
  });

  it('lista vazia gera uma página vazia', () => {
    expect(montarPaginas([], tv, 'auto', 0)).toHaveLength(1);
  });
});

describe('F-172 · segmentos e temas', () => {
  it('todo segmento tem tema próprio e exemplo digitável', () => {
    for (const s of SEGMENTOS) {
      expect(temasDoSegmento(s.id).length, s.nome).toBeGreaterThan(0);
      const lidos = lerLista(s.exemplo);
      expect(lidos.length, s.nome).toBeGreaterThanOrEqual(4);
      expect(lidos.every((p) => p.preco !== null), s.nome).toBe(true);
    }
  });

  it('ids de tema são únicos e há datas comemorativas', () => {
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(TEMAS.length);
    expect(TEMAS.filter((t) => t.grupo === 'data').length).toBeGreaterThanOrEqual(5);
    expect(temaPorId('não existe').id).toBe(TEMAS[0].id);
    expect(segmentoPorId('farmacia').nome).toBe('Farmácia');
  });
});

describe('F-172 · foto do produto', () => {
  const cand = (fonteImg: CandidatoImagem['fonte'], url: string): CandidatoImagem => ({ url, miniatura: url, fonte: fonteImg, credito: 'x', legenda: 'x' });

  it('produto de embalagem prefere a foto da embalagem; fresco prefere foto de banco de imagens', () => {
    const todos = [cand('PEXELS', 'p'), cand('OPENFOODFACTS', 'o'), cand('PIXABAY', 'x')];
    expect(escolherMelhor('Coca-Cola 2L', todos)?.fonte).toBe('OPENFOODFACTS');
    expect(escolherMelhor('Picanha kg', todos)?.fonte).toBe('PEXELS');
    expect(escolherMelhor('Qualquer', [])).toBeNull();
    expect(ehFresco('Tomate kg')).toBe(true);
    expect(ehFresco('Arroz 5kg')).toBe(false);
  });

  it('sem foto boa, desenha o emoji do produto (ou do segmento)', () => {
    expect(emojiDoProduto('Dipirona 500mg')).toBe('💊');
    expect(emojiDoProduto('Picanha')).toBe('🥩');
    expect(emojiDoProduto('Coisa estranha', '🐶')).toBe('🐶');
  });
});

describe('F-172 · cartaz', () => {
  it('desenha título, produtos, preços e o aviso de imagens ilustrativas', () => {
    const produtos = lerLista('Picanha kg R$ 49,90\nLeite de 6,50 por 4,99\nBolo de cenoura');
    produtos[0].imagem = { url: 'https://images.openfoodfacts.org/a.jpg', fonte: 'OPENFOODFACTS' };
    const [pagina] = montarPaginas(produtos, formatoPorId('tv-h'), 'auto', 0);
    render(
      <TabloideCanvas formato={formatoPorId('tv-h')} tema={temaPorId('ofertao')} segmento={segmentoPorId('mercado')} titulo="Ofertão da semana"
        subtitulo="Só hoje" validade="Válido até 15/11" empresa="Mercado Bom Preço" pagina={pagina} numeroPagina={1} totalPaginas={1} />,
    );
    expect(screen.getByText('OFERTÃO DA SEMANA')).toBeTruthy();
    expect(screen.getAllByTestId('tabloide-cartao')).toHaveLength(3);
    expect(screen.getByText('49')).toBeTruthy();
    expect(screen.getByText(',90')).toBeTruthy();
    expect(screen.getByText('CONSULTE')).toBeTruthy();
    expect(screen.getByText(/Mercado Bom Preço\s+•\s+Válido até 15\/11/)).toBeTruthy();
    expect(screen.getByText(/Imagens meramente ilustrativas.*Open Food Facts/)).toBeTruthy();
    // produto com foto usa <img> com CORS liberado (precisa para exportar em PNG)
    expect(document.querySelector('img[crossorigin="anonymous"]')).toBeTruthy();
  });
});

describe('F-172 · ligação no sistema', () => {
  it('rotas e menus do Tabloide existem para o anunciante e para a equipe', () => {
    const app = fonte('src/App.tsx');
    expect(app).toContain('path="tabloide" element={<TabloidePage />}');
    expect(app).toContain('path="tabloide" element={<Tabloide />}');
    expect(fonte('src/components/dashboard/Sidebar.tsx')).toContain("path: '/dashboard/tabloide'");
    const portal = fonte('src/modules/crm/layout/CustomerPortalLayout.tsx');
    expect(portal).toContain("path: '/portal/tabloide'");
    expect(portal).toContain("paths.add('/portal/tabloide')");
  });

  it('a busca de fotos exige login e guarda as chaves só no servidor', () => {
    const fn = fonte('supabase/functions/produto-imagem/index.ts');
    expect(fn).toContain("Deno.env.get('PEXELS_API_KEY')");
    expect(fn).toContain("Deno.env.get('PIXABAY_API_KEY')");
    expect(fn).toContain('Open Food Facts');
    const cfg = fonte('supabase/config.toml');
    expect(/\[functions\.produto-imagem\][^\[]*verify_jwt\s*=\s*false/.test(cfg)).toBe(false);
    const front = fonte('src/lib/tabloide/imagens.ts') + fonte('src/components/tabloide/TabloideEditor.tsx');
    expect(front).not.toMatch(/PEXELS_API_KEY|PIXABAY_API_KEY/);
  });

  it('a migração isola por empresa e por anunciante', () => {
    const sql = fonte('supabase/migrations/20261318_tabloide_digital.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('get_user_tenant_id()');
    expect(sql).toContain('is_central_privileged()');
  });
});
