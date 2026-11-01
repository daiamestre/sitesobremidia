// F-234 — versão em VÍDEO de cada modelo (coreografia coerente de todos os elementos), subpastas Imagens/Vídeos e o
// PALCO DE OFERTAS de mercado (um produto de cada vez, com nome e preço, virando carrossel no editor de vídeo).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { coreografia, estadoNoTempo } from '@/lib/studio/animacao';
import { modeloParaDocumento } from '@/lib/studio/documento';
import { MODELOS } from '@/lib/studio/modelos';
import { palcoDoProduto, projetoDoCarrossel, SEGUNDOS_POR_PRODUTO } from '@/lib/studio/palco';
import { duracaoTotal } from '@/lib/studio/video/linha';

describe('versão em vídeo de cada modelo (coreografia)', () => {
  it('TODOS os modelos ganham movimento coerente: foto em panorâmica, textos um após o outro na ordem de leitura', () => {
    for (const m of MODELOS) {
      for (const f of ['16:9', '9:16'] as const) {
        const d = coreografia(modeloParaDocumento(m, f));
        const vivas = d.camadas.filter((c) => c.visivel && !c.bloqueada);
        expect(vivas.every((c) => c.animacao), `${m.id} ${f}`).toBe(true);
        // ninguém entra junto: atrasos dos textos são todos diferentes e crescem de cima para baixo
        const textos = vivas.filter((c) => c.tipo === 'texto').sort((a, b) => a.y - b.y);
        const atrasos = textos.map((c) => c.animacao!.atraso);
        expect(new Set(atrasos).size, `${m.id} ${f}`).toBe(atrasos.length);
        expect(d.video!.duracao).toBeGreaterThanOrEqual(8);
      }
    }
  });
  it('o selo entra com zoom e fica pulsando; a entrada e o efeito contínuo se somam sem salto', () => {
    const d = coreografia(modeloParaDocumento(MODELOS[0], '16:9'));
    const s = d.camadas.find((c) => c.tipo === 'selo');
    if (!s) return;
    expect(s.animacao).toMatchObject({ tipo: 'zoom', depois: 'pulsar' });
    const fim = s.animacao!.atraso + s.animacao!.duracao;
    expect(estadoNoTempo(s, fim - 0.01).escala).toBeCloseTo(1, 1);
    expect(new Set([0.2, 0.5, 0.8].map((x) => estadoNoTempo(s, fim + x).escala.toFixed(3))).size).toBeGreaterThan(1);
  });
});

describe('palco de ofertas (mercado)', () => {
  const produto = { nome: 'Coca-Cola 2L', preco: 9.99, precoDe: 12.99, unidade: null, imagem: { url: 'https://x/coca.png', fonte: 'OPENFOODFACTS' as const } };
  it('um produto no palco: título, logo, pedestal, produto inteiro flutuando, nome e preço pulsando', () => {
    for (const f of ['9:16', '16:9'] as const) {
      const d = palcoDoProduto(produto, f);
      const nome = (n: string) => d.camadas.find((c) => c.nome === n)!;
      expect(nome('Título')).toMatchObject({ tipo: 'texto', texto: 'SUPER OFERTAS' });
      expect(nome('Produto')).toMatchObject({ tipo: 'imagem', src: 'https://x/coca.png', ajuste: 'conter' });
      expect(nome('Produto').animacao).toMatchObject({ tipo: 'zoom', depois: 'flutuar' });
      expect(nome('Nome do produto')).toMatchObject({ texto: 'Coca-Cola 2L' });
      expect(nome('Preço')).toMatchObject({ tipo: 'selo', valor: '9', sufixo: ',99', topo: 'DE 12,99 POR', corTopo: '#d90f1f', corValor: '#ffffff' });
      expect(nome('Preço').animacao).toMatchObject({ depois: 'pulsar' });
      expect(d.video?.duracao).toBe(SEGUNDOS_POR_PRODUTO);
      expect(d.camadas.some((c) => c.nome === 'Sua logo')).toBe(true);
    }
    expect(palcoDoProduto(produto, '9:16', { logoUrl: 'https://x/logo.png' }).camadas.find((c) => c.nome === 'Logo')).toMatchObject({ tipo: 'imagem', ajuste: 'conter' });
  });
  it('o carrossel vira um projeto do editor de vídeo: um clipe por produto, deslizando, com nome e preço de cada vez', () => {
    const p = projetoDoCarrossel([produto, { ...produto, nome: 'Café Pilão 500g', preco: 18.9, precoDe: null }], '9:16');
    expect(p.clipes).toHaveLength(2);
    expect(p.clipes.map((c) => c.tipo)).toEqual(['arte', 'arte']);
    expect(p.clipes[1].documento!.camadas.find((c) => c.nome === 'Nome do produto')).toMatchObject({ texto: 'Café Pilão 500g' });
    expect(p.clipes[0].transicao.tipo).toBe('deslizar-esquerda');
    expect(duracaoTotal(p)).toBeCloseTo(2 * SEGUNDOS_POR_PRODUTO - 0.5, 5);
  });
  it('as telas: subpastas Imagens/Vídeos, pasta do palco no catálogo e na página de pasta, e o editor abrindo o vídeo animado', () => {
    const pasta = fs.readFileSync('src/pages/studioai/PastaPage.tsx', 'utf8');
    expect(pasta).toContain('subpasta-${id}');
    expect(pasta).toMatch(/<CartaoVideo /);
    expect(pasta).toMatch(/pastaId === PASTA_PALCO\) return <PalcoDeOfertas \/>/);
    expect(fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8')).toMatch(/<CapaDaPastaPalco \/>/);
    expect(fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8')).toMatch(/params\.get\('video'\) && !temAnimacao\(d\) \? coreografia\(d\) : d/);
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toMatch(/CHAVE_PROJETO_DO_CORE/); // "Criar vídeo do carrossel" abre o editor de vídeo com os clipes
    expect(palco).toMatch(/<PainelDeProdutos /); // os mesmos produtos (com fotos reais) dos encartes
  });
});

describe('F-237 — fundo OFICIAL do Palco de Ofertas (arte do dono)', () => {
  it('o produto entra no palco da arte: inteiro, pé no tampo, centrado; nome na faixa do palco; botão no lugar do "YOUR LOGO"', async () => {
    const { FUNDOS_DO_PALCO, palcoDoProduto: palco, srcDoFundo } = await import('@/lib/studio/palco');
    const f = FUNDOS_DO_PALCO[0];
    expect(f.id).toBe('alerta-de-oferta');
    for (const formato of ['9:16', '16:9'] as const) {
      expect(fs.existsSync(`public${srcDoFundo(f, formato)}`), formato).toBe(true);
      const d = palco({ nome: 'Arroz Camil 5kg', preco: 25.9, precoDe: null, unidade: null, imagem: { url: 'https://x/a.png', fonte: 'OPENFOODFACTS' } }, formato, { fundo: f, textoBotao: 'ALERTAS' });
      const nome = (n: string) => d.camadas.find((c) => c.nome === n)!;
      expect(nome('Fundo oficial')).toMatchObject({ tipo: 'imagem', src: srcDoFundo(f, formato), bloqueada: true });
      const pr = nome('Produto');
      expect(pr).toMatchObject({ ajuste: 'conter', focoY: 100, focoX: 50 });
      // centrado no palco e com o pé encostando no tampo
      const W = formato === '9:16' ? 1080 : 1920, H = formato === '9:16' ? 1920 : 1080;
      expect(Math.abs(pr.x + pr.w / 2 - W / 2)).toBeLessThan(W * 0.02);
      expect((pr.y + pr.h) / H).toBeCloseTo(f.produto[formato].y + f.produto[formato].h, 3);
      expect(nome('Botão — texto')).toMatchObject({ texto: 'ALERTAS' });
      expect(nome('Botão').animacao?.atraso).toBe(0); // cobre o "YOUR LOGO" desde o 1º quadro
      // F-238: nome em branco por cima/à esquerda; etiqueta de preço sem nada escrito em cima do valor
      expect(nome('Nome do produto')).toMatchObject({ cor: '#ffffff', texto: 'Arroz Camil 5kg' });
      expect(nome('Nome do produto').y + nome('Nome do produto').h).toBeLessThanOrEqual(formato === '9:16' ? pr.y + 1 : H);
      // F-239: balão AMARELO realista na lateral, pulsando; R$ + valor + centavos centralizados dentro dele
      const balao = nome('Preço');
      expect(balao).toMatchObject({ tipo: 'selo', realista: true, cor: '#FFC400', moeda: 'R$', valor: '25', sufixo: ',90', topo: 'POR APENAS', corTopo: '#0a8a3a', corValor: '#ffffff' });
      expect(balao.animacao).toMatchObject({ tipo: 'zoom', depois: 'pulsar' });
      // F-240: tamanho normal (proporcional ao produto) e do outro lado do nome; deitado, o nome fica colado à esquerda do produto
      expect(balao.w).toBeLessThanOrEqual(Math.min(pr.w, pr.h) * 1.05);
      expect(balao.x + balao.w / 2).toBeGreaterThan(pr.x + pr.w / 2);
      if (formato === '16:9') {
        const n = nome('Nome do produto');
        expect(n).toMatchObject({ alinhamento: 'right' });
        expect(pr.x - (n.x + n.w)).toBeLessThan(W * 0.02);
        expect(n.x + n.w).toBeLessThanOrEqual(pr.x);
        expect(balao.x - (pr.x + pr.w)).toBeLessThan(W * 0.04);
      }
      // nenhum texto (nome do produto, botão) passa por cima do balão
      for (const c of d.camadas.filter((x) => x.tipo === 'texto')) {
        const cruza = c.x < balao.x + balao.w && c.x + c.w > balao.x && c.y < balao.y + balao.h && c.y + c.h > balao.y;
        expect(cruza, c.nome).toBe(false);
      }
    }
  });
});
