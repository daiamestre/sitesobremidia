/**
 * F-308 (pedido do dono, 12/11/2026): o modelo é só o começo — a pessoa troca TUDO, inclusive o FUNDO da arte (outro fundo
 * da galeria, imagem dela, só cor) e escolhe o MOVIMENTO do fundo. No palco de ofertas e no editor de encartes/modelos.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { imagem } from '@/lib/studio/documento';
import { CONTINUAS, MOVIMENTOS_DO_FUNDO, estadoNoTempo, movimentoDoFundo } from '@/lib/studio/animacao';
import { FUNDOS_DO_PALCO, palcoDoProduto, srcSemLogo } from '@/lib/studio/palco';
import { ENCARTES_OFICIAIS } from '@/lib/studio/encartesOficiais';

const produto = { nome: 'Arroz Tio João 5kg', preco: 27.9, precoDe: null, unidade: null, imagem: { url: 'https://x/a.png', fonte: 'OPENFOODFACTS' as const } };

describe('F-308: movimento do fundo', () => {
  it('todo movimento do fundo cobre a tela inteira o tempo todo (nunca aparece borda)', () => {
    for (const fmt of [[1080, 1920], [1920, 1080]] as const) {
      const c = { ...imagem('Fundo oficial', 'x.webp', 0, 0, fmt[0], fmt[1]), bloqueada: true };
      for (const m of MOVIMENTOS_DO_FUNDO.filter((x) => x.id)) {
        const a = { ...c, animacao: movimentoDoFundo(m.id) };
        for (let t = 0; t <= 8; t += 0.1) {
          const e = estadoNoTempo(a, t, 8);
          expect(e.escala, `${m.id} ${t}`).toBeGreaterThanOrEqual(1);
          expect(Math.abs(e.dx), `${m.id} ${t}`).toBeLessThanOrEqual(((e.escala - 1) * c.w) / 2 + 0.01);
          expect(Math.abs(e.dy), `${m.id} ${t}`).toBeLessThanOrEqual(((e.escala - 1) * c.h) / 2 + 0.01);
          expect(e.rot).toBe(0);
          expect(e.alfa).toBeGreaterThan(0.8);
        }
      }
    }
  });
  it('o movimento do fundo é contínuo (o vídeo inteiro) e "Parado" tira o movimento', () => {
    for (const m of MOVIMENTOS_DO_FUNDO.filter((x) => x.id)) expect(CONTINUAS).toContain(m.id);
    expect(movimentoDoFundo(null)).toBeNull();
  });
});

describe('F-308: trocar o fundo no palco', () => {
  it('fundo trocado entra no lugar do fundo do modelo e a logo vira camada visível (a do fundo antigo saiu junto)', () => {
    const f = FUNDOS_DO_PALCO[0];
    const d = palcoDoProduto(produto, '9:16', { fundo: f, ajustes: { '9:16': { 'Fundo oficial': { src: 'https://pub/fundo-meu.webp', visivel: true } as never } } });
    expect((d.camadas.find((c) => c.nome === 'Fundo oficial') as { src: string }).src).toBe('https://pub/fundo-meu.webp');
    const logo = d.camadas.find((c) => c.nome === 'Logo do palco');
    if (logo) expect(logo.opacidade).toBe(1);
  });
  it('"Só cor" esconde a imagem do fundo; o movimento escolhido fica no fundo', () => {
    const f = FUNDOS_DO_PALCO[0];
    const d = palcoDoProduto(produto, '16:9', { fundo: f, ajustes: { '16:9': { 'Fundo oficial': { visivel: false, animacao: movimentoDoFundo('fundo-deslizar') } as never } } });
    const c = d.camadas.find((x) => x.nome === 'Fundo oficial')!;
    expect(c.visivel).toBe(false);
    expect(c.animacao?.tipo).toBe('fundo-deslizar');
  });
  it('todo fundo da galeria existe sem a logo gravada, em pé e deitado', () => {
    for (const f of FUNDOS_DO_PALCO) for (const fo of ['9:16', '16:9'] as const) expect(fs.existsSync(`public${srcSemLogo(f, fo)}`), `${f.id} ${fo}`).toBe(true);
  });
  it('a lateral e o passo a passo do palco mostram o painel do fundo', () => {
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('data-testid="palco-secao-fundo"');
    expect(palco).toContain('data-testid="assistente-fundo"');
    expect(palco).toContain('<PainelDoFundo');
  });
});

describe('F-308: trocar o fundo no editor de encartes e modelos', () => {
  it('os fundos dos encartes oficiais existem (galeria de fundos)', () => {
    for (const e of ENCARTES_OFICIAIS) for (const l of Object.values(e.formatos)) if (l) expect(fs.existsSync(`public${l.fundoLimpo}`), l.fundoLimpo).toBe(true);
  });
  it('o cartão "Fundo" (tocar fora dos elementos) abre o painel do fundo', () => {
    const editor = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(editor).toContain('fundoDaArte={painelDoFundo}');
    expect(fs.readFileSync('src/components/studio/editor/Paineis.tsx', 'utf8')).toContain("if (aba === 'fundo' || !c) return fundoDaArte ?");
    const painel = fs.readFileSync('src/components/studio/editor/PainelDoFundo.tsx', 'utf8');
    for (const t of ['fundo-enviar', 'fundo-so-cor', 'fundo-opcao', 'fundo-mov-']) expect(painel).toContain(t);
  });
});
