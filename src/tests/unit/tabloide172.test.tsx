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
import { ehFresco, escolherMelhor, fotosAceitas, type CandidatoImagem } from '@/lib/tabloide/imagens';
import { TabloideCanvas, descontoPct } from '@/components/tabloide/TabloideCanvas';
import { claridade, coresDoSelo, dividirTitulo, larguraDoPreco } from '@/lib/tabloide/selo3d';
import { analisarFundo, caixaDoConteudo, recortarFundo } from '@/lib/tabloide/recorte';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { DATAS, pascoa, proximasDatas } from '@/lib/tabloide/datas';
import { ajustarElemento, duplicarElemento, novoElemento, validarAlfa } from '@/lib/tabloide/selos';

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

  it('nunca usa desenho/emoji: sem foto real o cartão mostra espaço neutro', () => {
    expect(fonte('src/lib/tabloide/imagens.ts')).not.toContain('emojiDoProduto');
    expect(fonte('src/components/tabloide/TabloideCanvas.tsx')).not.toMatch(/emojiDoProduto|EmojiProduto/);
    expect(fonte('src/components/tabloide/TabloideCanvas.tsx')).toContain('tabloide-sem-foto');
  });

  it('a IA de visão confirma ou reprova; embalagem de catálogo e Wikimedia passam pelo filtro de nome', () => {
    const c = (f: CandidatoImagem['fonte'], u: string, conferido?: boolean): CandidatoImagem => ({ ...cand(f, u), conferido });
    const lista = [c('OPENFOODFACTS', 'a', false), c('PEXELS', 'c', true), c('WIKIMEDIA', 'b', true), c('OPENVERSE', 'o', true), c('WIKIMEDIA', 'w')];
    expect(fotosAceitas('Vassoura', lista).map((x) => x.url)).toEqual(['b', 'w', 'o', 'c']);
    expect(fotosAceitas('Vassoura', [c('OPENFOODFACTS', 'a', false), c('PEXELS', 'c', false)])).toEqual([]);
    const semConferencia = [c('OPENVERSE', 'o'), c('PEXELS', 'p'), c('WIKIMEDIA', 'w'), c('OPENFOODFACTS', 'f')];
    expect(fotosAceitas('Coca-Cola 2L', semConferencia).map((x) => x.url)).toEqual(['f', 'w']);
    expect(fotosAceitas('Tomate kg', semConferencia).map((x) => x.url)).toEqual(['w', 'p', 'f']);
  });

  it('só vale foto que carrega de verdade; senão tenta a próxima e por fim a IA', () => {
    const img = fonte('src/lib/tabloide/imagens.ts');
    expect(img).toContain('export function fotoCarrega');
    expect(img).toContain('await fotoCarrega(c.miniatura || c.url)');
    expect(img.slice(img.indexOf('if (!vivas.length)'))).toContain('gerarImagemIA(p.nome)');
  });

  it('legenda com pessoa ou mão é descartada antes da conferência, e o Worker confere o produto (pessoa e mão saem pela legenda)', () => {
    const fn = fonte('supabase/functions/produto-imagem/index.ts');
    expect(fn).toContain('const temGente');
    expect(fn).toContain('.filter((c) => !temGente(c.legenda))');
    const worker = fonte('cloudflare/tabloide-ia/worker.js');
    expect(worker).toContain('clear close-up product photo of');
    expect(worker).toContain("corpo.acao === 'conferir'");
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
    // F-173: título vira selo 3D e o preço vira selo desenhado (ambos com rótulo para leitor de tela)
    expect(screen.getByLabelText('OFERTÃO DA SEMANA')).toBeTruthy();
    expect(screen.getAllByTestId('tabloide-cartao')).toHaveLength(3);
    expect(screen.getByLabelText('R$ 49,90 KG')).toBeTruthy();
    expect(screen.getByLabelText('R$ 4,99')).toBeTruthy();
    expect(screen.getByLabelText('Consulte o preço')).toBeTruthy();
    expect(screen.getByText('PICANHA')).toBeTruthy();
    expect(screen.getByText('-23%')).toBeTruthy();
    expect(screen.getByText('Só hoje')).toBeTruthy();
    expect(screen.getByText(/Mercado Bom Preço\s+•\s+Válido até 15\/11/)).toBeTruthy();
    expect(screen.getByText(/Imagens meramente ilustrativas.*Open Food Facts/)).toBeTruthy();
    // produto com foto usa <img> com CORS liberado (precisa para exportar em PNG)
    expect(document.querySelector('img[crossorigin="anonymous"]')).toBeTruthy();
  });
});

describe('F-173 · selo 3D, desconto e recorte de fundo', () => {
  it('divide o título em duas linhas equilibradas, sem deixar "DA/DO" pendurado em cima', () => {
    expect(dividirTitulo('Super ofertas da semana')).toEqual(['SUPER OFERTAS', 'DA SEMANA']);
    expect(dividirTitulo('Oferta do dia')).toEqual(['OFERTA', 'DO DIA']);
    expect(dividirTitulo('Promoção')).toEqual(['PROMOÇÃO']);
    expect(dividirTitulo('  ')).toEqual([]);
  });

  it('as cores do selo sempre têm contraste (placa escura ou clara)', () => {
    expect(coresDoSelo('#d90f1f', '#fff')).toMatchObject({ placa: '#d90f1f', texto: '#ffffff', faixa: '#ffc800' });
    const claro = coresDoSelo('#facc15', '#18181b');
    expect(claro).toMatchObject({ placa: '#facc15', texto: '#18181b', faixa: '#18181b', textoFaixa: '#facc15' });
    for (const t of TEMAS) {
      const c = coresDoSelo(t.preco, t.precoCor);
      expect(Math.abs(claridade(c.placa) - claridade(c.texto.startsWith('#') ? c.texto : '#ffffff')), t.id).toBeGreaterThan(0.3);
    }
  });

  it('calcula o desconto do "de/por"', () => {
    expect(descontoPct({ preco: 6.99, precoDe: 8.99 })).toBe(22);
    expect(descontoPct({ preco: 10, precoDe: null })).toBeNull();
    expect(descontoPct({ preco: 10, precoDe: 9 })).toBeNull();
    expect(larguraDoPreco({ inteiro: '1.299', centavos: '90', unidade: null }, 100)).toBeGreaterThan(larguraDoPreco({ inteiro: '9', centavos: '99', unidade: null }, 100));
  });

  /** Imagem de teste: fundo liso com um retângulo (o "produto") no meio. */
  function imagem(w: number, h: number, fundo: [number, number, number], produto: [number, number, number] | null, caixa = { x: 10, y: 8, w: 20, h: 24 }) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dentro = produto && x >= caixa.x && x < caixa.x + caixa.w && y >= caixa.y && y < caixa.y + caixa.h;
      const c = dentro ? produto! : fundo;
      data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
    return { data, width: w, height: h };
  }

  it('tira o fundo branco e acha a caixa do produto', () => {
    const p = imagem(40, 40, [255, 255, 255], [200, 20, 30]);
    const caixa = recortarFundo(p);
    expect(caixa).toEqual({ x: 10, y: 8, w: 20, h: 24 });
    expect(p.data[3]).toBe(0); // canto ficou transparente
    expect(p.data[(20 * 40 + 20) * 4 + 3]).toBe(255); // meio do produto continua inteiro
  });

  it('não mexe em foto com cenário nem em produto branco sobre fundo branco', () => {
    // cenário: bordas com cores diferentes
    const cena = imagem(40, 40, [255, 255, 255], null);
    for (let i = 0; i < 40 * 40; i++) { const v = (i * 37) % 255; cena.data.set([v, 255 - v, (v * 3) % 255, 255], i * 4); }
    expect(recortarFundo(cena)).toBeNull();
    expect(analisarFundo(cena).uniformidade).toBeLessThan(0.82);
    // produto quase branco: o recorte comeria tudo
    expect(recortarFundo(imagem(40, 40, [255, 255, 255], [250, 250, 250]))).toBeNull();
    // só um contorno fino sobrando
    const fino = imagem(40, 40, [255, 255, 255], [0, 0, 0], { x: 5, y: 5, w: 30, h: 1 });
    expect(recortarFundo(fino)).toBeNull();
  });

  it('produto de marca só recebe foto real; o recorte e o selo próprio estão ligados no editor', () => {
    const img = fonte('src/lib/tabloide/imagens.ts');
    expect(img).toContain("c.fonte === 'OPENFOODFACTS'");
    expect(img).toContain('prepararImagem');
    const editor = fonte('src/components/tabloide/TabloideEditor.tsx');
    // F-179: o envio de logo passou para o painel Temas (um caminho só)
    expect(fonte('src/components/tabloide/PainelTemas.tsx')).toContain('testid="logo-enviar"');
    expect(editor).toContain('tabloide-exemplo');
    const fn = fonte('supabase/functions/produto-imagem/index.ts');
    expect(fn).toContain('search.openfoodfacts.org');
    expect(fn).toContain('openbeautyfacts.org');
  });
});

describe('F-174 · imagem criada por IA quando não há foto real', () => {
  it('o serviço de IA só atende com o segredo e nunca escreve marca ou texto', () => {
    const worker = fonte('cloudflare/tabloide-ia/worker.js');
    expect(worker).toContain("req.headers.get('x-segredo') !== env.SEGREDO");
    expect(worker).toContain("status: 401");
    expect(worker).toContain('generic and unbranded');
    expect(worker).toContain('No words, no letters');
    expect(worker).toContain('pure white background');
  });

  it('nenhuma chave da Cloudflare vai para a função do Supabase nem para o site', () => {
    const fn = fonte('supabase/functions/produto-imagem/index.ts');
    expect(fn).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(fn).not.toContain('api.cloudflare.com');
    expect(fn).toContain("Deno.env.get('TABLOIDE_IA_URL')");
    expect(fn).toContain('tabloide_ia_registrar');
    const front = fonte('src/lib/tabloide/imagens.ts') + fonte('src/components/tabloide/TabloideEditor.tsx') + fonte('src/components/tabloide/TabloideCanvas.tsx');
    expect(front).not.toMatch(/CLOUDFLARE|TABLOIDE_IA_SEGREDO|TABLOIDE_IA_URL|workers\.dev/);
    const publicar = fonte('scripts/ops/publicar-worker-ia.mjs');
    expect(publicar).not.toMatch(/cfat_|[0-9a-f]{32}/);
  });

  it('há limite diário por pessoa e por empresa, e a foto do catálogo aceita a fonte IA', () => {
    const sql = fonte('supabase/migrations/20261320_tabloide_imagem_ia.sql');
    expect(sql).toContain("'IA'");
    expect(sql).toContain('v_meu >= 25');
    expect(sql).toContain('v_empresa >= 120');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.tabloide_ia_registrar\(\) FROM PUBLIC, anon/);
  });

  it('a IA só entra para produto sem foto real, e o editor tem o botão "Criar com IA"', () => {
    const img = fonte('src/lib/tabloide/imagens.ts');
    expect(img.indexOf('if (!vivas.length) {')).toBeGreaterThan(0);
    expect(img.slice(img.indexOf('if (!vivas.length) {'))).toContain('gerarImagemIA(p.nome)');
    expect(fonte('src/components/tabloide/TabloideEditor.tsx')).toContain('tabloide-criar-ia');
    expect(fonte('src/components/tabloide/TabloideCanvas.tsx')).toContain("IA: 'criadas por IA'");
  });

  it('acha a caixa do conteúdo em foto com sombra (para aproximar o produto)', () => {
    const w = 100; const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fino = x >= 45 && x < 50 && y >= 20 && y < 80;
      data.set(fino ? [60, 120, 200, 255] : [250, 250, 250, 255], (y * w + x) * 4);
    }
    expect(caixaDoConteudo({ data, width: w, height: h })).toEqual({ x: 45, y: 20, w: 5, h: 60 });
    expect(caixaDoConteudo({ data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h })).toBeNull();
  });

  it('recorte que comeria o rótulo branco do produto (buraco no meio) não vale', () => {
    const w = 60; const h = 60;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const corpo = x >= 15 && x < 45 && y >= 5 && y < 55;
      const rotulo = x >= 20 && x < 40 && y >= 20 && y < 40;
      const fresta = x === 30 && y >= 40 && y < 55; // fresta branca que liga o rótulo ao fundo
      const cor = corpo && !(rotulo || fresta) ? [30, 30, 40, 255] : [255, 255, 255, 255];
      data.set(cor, (y * w + x) * 4);
    }
    expect(recortarFundo({ data, width: w, height: h })).toBeNull();
  });

  it('produto pequeno no quadro (caso das imagens de IA) ainda é recortado', () => {
    // produto ocupa ~6% da imagem
    const w = 100; const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dentro = x >= 40 && x < 60 && y >= 35 && y < 65;
      data.set(dentro ? [30, 90, 60, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    }
    expect(recortarFundo({ data, width: w, height: h })).toEqual({ x: 40, y: 35, w: 20, h: 30 });
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

describe('F-177 · catálogo compartilhado e chave canônica do nome', () => {
  it('o mesmo produto digitado de jeitos diferentes vira a mesma chave', () => {
    expect(chaveCanonica('Coca-Cola 2L')).toBe(chaveCanonica('2 litros Coca Cola'));
    expect(chaveCanonica('Coca-Cola 2L')).toBe(chaveCanonica('coca cola 2 lt'));
    expect(chaveCanonica('Arroz Camil 5kg')).toBe(chaveCanonica('Arroz Camil 5 kg'));
    expect(chaveCanonica('Feijão Carioca Camil 1kg')).toBe(chaveCanonica('feijao carioca camil 1 quilo'));
    expect(chaveCanonica('Óleo de Soja Liza 900ml')).toBe(chaveCanonica('oleo soja liza 900 ml'));
    expect(chaveCanonica('Leite Integral 1,5L')).toBe(chaveCanonica('leite integral 1.5 litros'));
  });

  it('produtos diferentes NÃO se confundem (outra marca, outro tamanho)', () => {
    expect(chaveCanonica('Coca-Cola 2L')).not.toBe(chaveCanonica('Coca-Cola 600ml'));
    expect(chaveCanonica('Arroz Camil 5kg')).not.toBe(chaveCanonica('Arroz Tio João 5kg'));
    expect(chaveCanonica('Feijão Carioca 1kg')).not.toBe(chaveCanonica('Feijão Preto 1kg'));
    expect(chaveCanonica('')).toBe('');
  });

  it('"Arroz 5 kg 25,90" mantém a medida no nome (a chave do catálogo depende disso)', () => {
    expect(lerLinha('Arroz Camil 5 kg 25,90')).toMatchObject({ nome: 'Arroz Camil 5 kg', preco: 25.9, unidade: null });
    expect(lerLinha('Picanha kg R$ 49,90')).toMatchObject({ nome: 'Picanha', unidade: 'KG' });
    expect(chaveCanonica(lerLinha('Arroz Camil 5 kg 25,90')!.nome)).toBe(chaveCanonica(lerLinha('Arroz Camil 5kg 25,90')!.nome));
  });

  it('a foto achada vale para a empresa toda; foto enviada fica só do anunciante; só a central troca a de todos', () => {
    const sql = fonte('supabase/migrations/20261321_tabloide_catalogo_compartilhado.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.tabloide_catalogo_salvar');
    expect(sql).toContain("p_origem = 'ESCOLHA' AND v_priv");
    expect(sql).toContain("p_fonte = 'UPLOAD' OR p_origem = 'UPLOAD'");
    expect(sql).toContain("p_origem = 'SEMENTE' AND NOT v_priv");
    expect(sql).toContain('DROP POLICY IF EXISTS tabloide_catalogo_insert');
    expect(sql).toContain('DROP POLICY IF EXISTS tabloide_catalogo_update');
  });

  it('o editor consulta o catálogo ANTES de buscar fora e só mostra "procurando" para produto novo', () => {
    const img = fonte('src/lib/tabloide/imagens.ts');
    expect(img.indexOf('await buscarNoCatalogo(faltam')).toBeGreaterThan(0);
    expect(img.indexOf('await buscarNoCatalogo(faltam')).toBeLessThan(img.indexOf('await buscarCandidatos(p.nome)'));
    expect(img).toContain('aoSaberNovos?.(buscar.map((p) => p.nome))');
    const editor = fonte('src/components/tabloide/TabloideEditor.tsx');
    expect(editor).toContain('Produto novo para o sistema: procurando a foto de');
    expect(editor).not.toContain('Procurando as fotos dos produtos');
    expect(img).toContain('chaveCanonica');
  });
});

describe('F-177 · biblioteca de selos 3D, camadas e datas', () => {
  it('F-179: os selos simples desenhados em código saíram (ficam só as logos enviadas)', () => {
    const lib = fonte('src/lib/tabloide/selos.ts');
    expect(lib).not.toContain('CATALOGO_INICIAL');
    expect(lib).not.toContain('CATEGORIAS');
  });

  function pixels(w: number, h: number, pintar: (x: number, y: number) => [number, number, number, number]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pintar(x, y), (y * w + x) * 4);
    return { data, width: w, height: h };
  }

  it('valida o canal alfa de verdade: transparente passa; fundo opaco e quadriculado desenhado NÃO passam', () => {
    const ok = pixels(100, 40, (x, y) => (x > 20 && x < 80 && y > 8 && y < 32 ? [200, 20, 30, 255] : [0, 0, 0, 0]));
    expect(validarAlfa(ok)).toMatchObject({ transparente: true, cantosLivres: true });
    const branco = pixels(100, 40, (x, y) => (x > 20 && x < 80 && y > 8 && y < 32 ? [200, 20, 30, 255] : [255, 255, 255, 255]));
    expect(validarAlfa(branco).transparente).toBe(false);
    const quadriculado = pixels(100, 40, (x, y) => (x > 20 && x < 80 && y > 8 && y < 32 ? [200, 20, 30, 255] : (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? [255, 255, 255, 255] : [203, 213, 225, 255]));
    expect(validarAlfa(quadriculado)).toMatchObject({ transparente: false, cantosLivres: false });
    expect(validarAlfa(pixels(100, 40, () => [0, 0, 0, 0])).transparente).toBe(false); // vazio total não é arte
  });

  it('a camada: tamanho/posição ficam em limites, duplicar cria outra e a biblioteca não é tocada', () => {
    const selo = { id: 's1', nome: 'Black Friday', imagem_url: 'https://x/bf.png', largura: 1080, altura: 400 };
    const e = novoElemento(selo);
    expect(e).toMatchObject({ seloId: 's1', ar: 400 / 1080, cx: 0.5, cy: 0.5 });
    expect(ajustarElemento({ ...e, w: 5, cx: 2, cy: -1, rot: 400 })).toMatchObject({ w: 0.95, cx: 1, cy: 0, rot: 180 });
    expect(ajustarElemento({ ...e, w: 0.001 }).w).toBe(0.06);
    const copia = duplicarElemento(e);
    expect(copia.id).not.toBe(e.id);
    expect(copia.seloId).toBe(e.seloId);
    expect(copia.cx).toBeGreaterThan(e.cx);
  });

  it('o cartaz desenha as camadas (posição, tamanho e giro) e a exportação não leva a borda de seleção', () => {
    const [pagina] = montarPaginas(lerLista('Arroz 5kg 25,90'), formatoPorId('tv-h'), 'auto', 0);
    const e = novoElemento({ id: 's1', nome: 'Oferta Relâmpago', imagem_url: 'https://x/o.png', largura: 1080, altura: 400 }, { cx: 0.8, cy: 0.1, w: 0.3, rot: -8 });
    const base = { formato: formatoPorId('tv-h'), tema: temaPorId('ofertao'), segmento: segmentoPorId('mercado'), titulo: 'Ofertas do Dia', subtitulo: '', validade: '', empresa: 'Loja', pagina, numeroPagina: 1, totalPaginas: 1, elementos: [e] };
    const { unmount } = render(<TabloideCanvas {...base} />);
    const img = document.querySelector('[data-testid="tabloide-elemento"]') as HTMLImageElement;
    expect(img.style.transform).toBe('rotate(-8deg)');
    expect(img.style.width).toBe(`${0.3 * 1920}px`);
    expect(img.style.outline).toBe('');
    expect(img.getAttribute('crossorigin')).toBe('anonymous');
    unmount();
    render(<TabloideCanvas {...base} selecionadoId={e.id} aoPonteiroElemento={() => undefined} />);
    expect((document.querySelector('[data-testid="tabloide-elemento"]') as HTMLImageElement).style.outline).toContain('dashed');
  });

  it('o banco isola os selos por empresa e anunciante, aceita só PNG/WebP e exige estado de aprovação', () => {
    const sql = fonte('supabase/migrations/20261322_tabloide_selos.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('get_user_tenant_id()');
    expect(sql).toContain("CHECK (mime IN ('image/png', 'image/webp'))");
    expect(sql).toContain("CHECK (estado IN ('APROVADO', 'REVISAO', 'REPROVADO'))");
    expect(sql).toContain('transparente         boolean');
    expect(sql).toContain("CHECK (imagem_url ~ '^https://')");
    expect(sql).toMatch(/cliente_id IS NULL AND public\.is_central_privileged\(\)/);
  });

  it('imagem enviada pelo usuário nunca entra como "verificada": a origem e a licença ficam como declaradas por quem enviou', () => {
    const selos = fonte('src/lib/tabloide/selos.ts');
    expect(selos).toContain('Declarada por quem enviou (não verificada');
    expect(selos).toContain('origem: opcoes.daEmpresa ? ORIGEM_CENTRAL : ORIGEM_UPLOAD');
    // F-179 (pedido do dono): o envio é aceito na hora, sem fila de revisão
    expect(selos).toContain("estado: 'APROVADO'");
  });

  it('a barra lateral tem os botões do modelo (F-179: Produtos, Temas, Datas, Sua Logo, Empresa, Fontes, Postar, Encarte, Portal)', () => {
    const editor = fonte('src/components/tabloide/TabloideEditor.tsx');
    for (const r of ['Produtos', 'Temas', 'Datas', 'Sua Logo', 'Empresa', 'Fontes', 'Postar', 'Encarte', 'Portal']) expect(editor).toContain(`rotulo: '${r}'`);
    expect(editor).toContain('data-testid="tabloide-barra"');
    expect(editor).toContain('data-testid="tabloide-imprimir"');
    expect(editor).toContain('data-testid="tabloide-modelo"');
    expect(editor).toContain('data-testid="tabloide-grade"');
  });

  it('calendário: Páscoa, domingos de maio/agosto e Black Friday caem nos dias certos; sempre vem a próxima ocorrência', () => {
    expect(pascoa(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(pascoa(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
    const maes = DATAS.find((d) => d.id === 'maes')!.em(2026);
    expect([maes.getMonth(), maes.getDate(), maes.getDay()]).toEqual([4, 10, 0]);
    const pais = DATAS.find((d) => d.id === 'pais')!.em(2026);
    expect([pais.getMonth(), pais.getDate(), pais.getDay()]).toEqual([7, 9, 0]);
    const bf = DATAS.find((d) => d.id === 'blackfriday')!.em(2026);
    expect([bf.getMonth(), bf.getDate(), bf.getDay()]).toEqual([10, 27, 5]);
    const prox = proximasDatas(new Date(2026, 9, 10));
    expect(prox[0].item.id).toBe('criancas');
    expect(prox[0].dias).toBe(2);
    expect(prox.every((p, i) => i === 0 || p.dias >= prox[i - 1].dias)).toBe(true);
    expect(prox.find((p) => p.item.id === 'mulher')!.data.getFullYear()).toBe(2027);
    for (const d of DATAS) expect(temaPorId(d.temaId).id, d.id).toBe(d.temaId);
  });
});
