/**
 * F-350 (pedido do dono, 20/11/2026): "o fundo está ficando PRETO" no vídeo feito no iPhone, e "blinde o sistema de vídeo
 * contra falhas e regressão". Causa: as brasas (filmagem em fundo preto, na tela inteira, logo acima do fundo) são misturadas
 * no modo "clarear"; o Safari ignora o modo de mistura ao desenhar um <video> direto no canvas e a filmagem cobria o fundo.
 *
 * Este teste trava, em TODO modelo de palco, nos dois formatos, em cada cena do vídeo (abertura, produtos, fechamento):
 *  - o fundo escolhido está lá, visível, embaixo de tudo, com o arquivo existente;
 *  - nada opaco cobre o fundo: os efeitos só entram por mistura que apaga o preto (chave/tela/clarear);
 *  - o fundo trocado pelo cliente (galeria) chega ao vídeo;
 *  - no Safari o vídeo do efeito passa pela "ponte" antes da mistura, e o recorte pela placa de vídeo só é usado se provar
 *    que o preto fica transparente.
 * A prova em navegador de verdade (Chrome e Safari/WebKit) é `node scripts/ops/testar-fundo-do-video.mjs`.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FUNDOS_DO_PALCO, palcoDoProduto, projetoDoCarrossel, srcSemLogo, vinhetaDoPalco, type OpcoesDoPalco } from '@/lib/studio/palco';
import { precisaDePonte } from '@/lib/studio/efeitosReais';
import type { Camada, Documento } from '@/lib/studio/documento';
import type { FormatoDoc } from '@/lib/studio/documento';

const prod = (nome: string, preco: number) => ({ nome, preco, precoDe: 9.99, unidade: 'UN', imagem: { url: 'https://x/y.png', fonte: 'OPENFOODFACTS' as const } });
const produtos = [prod('Arroz Camil 1kg', 4.99), prod('Feijão Camil 1kg', 6.49)];
const FORMATOS: FormatoDoc[] = ['9:16', '16:9'];
const MISTURAS_SEGURAS = new Set(['chave', 'screen', 'lighter', undefined]);
const efeitos = fs.readFileSync('src/lib/studio/efeitosReais.ts', 'utf8');

function conferirFundo(d: Documento, rotulo: string, srcEsperado?: string) {
  const i = d.camadas.findIndex((c) => c.nome === 'Fundo oficial' || c.nome === 'Fundo');
  expect(i, `${rotulo}: sem camada de fundo`).toBeGreaterThanOrEqual(0);
  const f = d.camadas[i] as Camada & { src?: string };
  expect(f.visivel, `${rotulo}: fundo invisível`).not.toBe(false);
  expect(f.opacidade ?? 1, `${rotulo}: fundo apagado`).toBeGreaterThan(0.9);
  if (f.tipo === 'imagem') {
    expect(fs.existsSync(`public${f.src}`), `${rotulo}: arquivo do fundo não existe (${f.src})`).toBe(true);
    if (srcEsperado) expect(f.src, `${rotulo}: o fundo escolhido não chegou`).toBe(srcEsperado);
  }
  // antes do fundo não há nada (ele é a base); depois dele, nada opaco de tela inteira
  for (const c of d.camadas.slice(0, i)) expect(c.visivel === false || c.tipo === 'efeito', `${rotulo}: "${c.nome}" embaixo do fundo`).toBe(true);
  const { w, h } = d.formato === '9:16' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
  for (const c of d.camadas.slice(i + 1)) {
    if (c.tipo === 'efeito') { expect(MISTURAS_SEGURAS.has(c.mistura), `${rotulo}: efeito "${c.nome}" com mistura opaca`).toBe(true); continue; }
    const cobreTudo = c.visivel !== false && c.x <= 0 && c.y <= 0 && c.x + c.w >= w && c.y + c.h >= h;
    if (cobreTudo && c.tipo === 'forma') expect((c.opacidade ?? 1) < 0.9 || !!(c as { degrade?: unknown }).degrade, `${rotulo}: "${c.nome}" tampa o fundo`).toBe(true);
    if (cobreTudo && c.tipo === 'imagem') expect((c.opacidade ?? 1) < 0.9, `${rotulo}: imagem "${c.nome}" tampa o fundo`).toBe(true);
  }
}

describe('F-350: blindagem — o fundo do vídeo nunca sai preto', () => {
  it('todo modelo, nos dois formatos, com todos os efeitos ligados: produto, abertura e fechamento com o fundo por baixo', () => {
    for (const fundo of FUNDOS_DO_PALCO) for (const formato of FORMATOS) {
      const o: OpcoesDoPalco = { fundo, textoBotao: fundo.botoes[0], loja: 'Mercado Teste', movimento: {} };
      const d = palcoDoProduto(produtos[0], formato, o);
      conferirFundo(d, `${fundo.id} ${formato} produto`);
      expect(d.camadas.some((c) => c.tipo === 'efeito'), `${fundo.id}: os efeitos reais deveriam estar ligados`).toBe(true);
      conferirFundo(vinhetaDoPalco('abertura', produtos[0], formato, o, 3.6), `${fundo.id} ${formato} abertura`);
      conferirFundo(vinhetaDoPalco('fechamento', produtos[0], formato, { ...o, logoDaLoja: { url: '/x.png' } }, 3.4), `${fundo.id} ${formato} fechamento`);
    }
  });

  it('o vídeo montado (todas as cenas da linha do tempo) leva o fundo, e o fundo TROCADO pelo cliente chega a todas', () => {
    for (const fundo of FUNDOS_DO_PALCO.slice(0, 6)) for (const formato of FORMATOS) {
      const outro = FUNDOS_DO_PALCO.find((f) => f.id !== fundo.id)!;
      const src = srcSemLogo(outro, formato);
      const ajustes = { [formato]: { 'Fundo oficial': { src, visivel: true } } } as OpcoesDoPalco['ajustes'];
      const p = projetoDoCarrossel(produtos, formato, { fundo, textoBotao: fundo.botoes[0], loja: 'Mercado Teste', movimento: {}, ajustes });
      const docs = p.clipes.map((c) => c.documento).filter(Boolean) as Documento[];
      expect(docs.length).toBeGreaterThanOrEqual(produtos.length);
      // as cenas dos produtos usam o fundo escolhido
      const dosProdutos = docs.filter((d) => d.camadas.some((c) => c.nome === 'Preço'));
      expect(dosProdutos.length).toBeGreaterThanOrEqual(produtos.length);
      for (const d of dosProdutos) conferirFundo(d, `${fundo.id} ${formato} vídeo com fundo trocado`, src);
      for (const d of docs) conferirFundo(d, `${fundo.id} ${formato} cena do vídeo`);
    }
  });

  it('em todo navegador o vídeo do efeito passa pela ponte antes da mistura (no iPhone, sem ela, o preto cobria o fundo)', () => {
    expect(precisaDePonte(document.createElement('video'))).toBe(true);
    expect(precisaDePonte(document.createElement('canvas'))).toBe(false);
    expect(precisaDePonte(new Image())).toBe(false);
    expect(efeitos).not.toMatch(/SAFARI/); // nada de adivinhar o navegador
    expect(efeitos).toMatch(/precisaDePonte\(q\.fonte\) \? pelaPonte\(/);
    expect(efeitos).toContain('ctx.drawImage(fonte, -dw / 2, y0, dw, dh)');
    expect(efeitos).not.toContain('ctx.drawImage(recortado ?? q.fonte');
  });

  it('o recorte do preto pela placa de vídeo só é usado depois de provar que o preto fica transparente', () => {
    expect(efeitos).toMatch(/return recorteTransparente\(r\) \? r : null;/);
    expect(efeitos).toMatch(/function recorteTransparente/);
  });

  it('a prévia tenta de novo a imagem do fundo que falhou ao carregar', () => {
    expect(fs.readFileSync('src/components/studio/PreviaDocumento.tsx', 'utf8')).toMatch(/faltam && vez < 4/);
  });

  it('a publicação roda esta blindagem antes de enviar o Studio ao ar', () => {
    const pub = fs.readFileSync('scripts/ops/publicar-main.mjs', 'utf8');
    expect(pub).toContain('blindagemFundoDoVideo350.test.ts');
    expect(pub).toMatch(/TESTES_DO_VIDEO/);
  });
});
