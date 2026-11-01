// F-252 — REGRA DO DONO: a foto que entra no produto vira a foto dele pelo nome salvo, sempre sem fundo e com o produto inteiro.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { caixaOpaca } from '@/lib/tabloide/recorte';
import { guardarFotoDoProduto } from '@/lib/tabloide/imagens';

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc, functions: { invoke: vi.fn() } } }));

/** Imagem RGBA w×h, transparente, com o retângulo [x0,x1)×[y0,y1) opaco. */
function imagem(w: number, h: number, x0: number, y0: number, x1: number, y1: number, fundo = 0) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = x >= x0 && x < x1 && y >= y0 && y < y1 ? 255 : fundo;
  return d;
}

describe('identificar se a imagem tem fundo', () => {
  it('PNG sem fundo: acha a caixa do produto, sem sobras', () => {
    expect(caixaOpaca(imagem(100, 80, 20, 10, 70, 60), 100, 80)).toEqual({ x: 20, y: 10, w: 50, h: 50 });
  });
  it('produto que toca a borda em alguns pontos continua sem fundo', () => {
    expect(caixaOpaca(imagem(100, 100, 40, 0, 60, 100), 100, 100)).toEqual({ x: 40, y: 0, w: 20, h: 100 });
  });
  it('foto com fundo (borda opaca) não passa como sem fundo', () => {
    expect(caixaOpaca(imagem(100, 100, 0, 0, 100, 100), 100, 100)).toBeNull();
    expect(caixaOpaca(imagem(100, 100, 20, 20, 80, 80, 255), 100, 100)).toBeNull();
  });
  it('imagem toda transparente não vira produto', () => {
    expect(caixaOpaca(new Uint8ClampedArray(400), 10, 10)).toBeNull();
  });
});

describe('recorte profissional na nuvem', () => {
  it('o produto pode encostar em toda a borda: a lata inteira não é recusada', () => {
    const d = imagem(100, 100, 0, 0, 100, 100);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [99, 99], [98, 99], [99, 98]]) d[(y * 100 + x) * 4 + 3] = 0;
    expect(caixaOpaca(d, 100, 100)).toBeNull();
    expect(caixaOpaca(imagem(100, 100, 2, 2, 98, 98), 100, 100, true)).toEqual({ x: 2, y: 2, w: 96, h: 96 });
  });
  it('recorte que não tirou nada, ou que apagou o produto, não vale', () => {
    expect(caixaOpaca(imagem(100, 100, 0, 0, 100, 100), 100, 100, true)).toBeNull();
    expect(caixaOpaca(imagem(100, 100, 0, 0, 5, 5), 100, 100, true)).toBeNull();
  });
  it('o Worker recorta com a ligação de imagens, só com o segredo e só foto https', () => {
    const w = fs.readFileSync('cloudflare/tabloide-ia/worker.js', 'utf8');
    expect(w).toMatch(/segment: 'foreground'/);
    expect(w.indexOf("corpo.acao === 'recortar'")).toBeGreaterThan(w.indexOf("env.SEGREDO"));
    expect(fs.readFileSync('scripts/ops/publicar-worker-ia.mjs', 'utf8')).toContain("type: 'images', name: 'IMAGES'");
    const f = fs.readFileSync('supabase/functions/produto-imagem/index.ts', 'utf8');
    expect(f).toMatch(/acao === 'recortar'\) return json\(await recortar\(/);
  });
  it('a busca automática passa pelo mesmo recorte e pela mesma inspeção', () => {
    const i = fs.readFileSync('src/lib/tabloide/imagens.ts', 'utf8');
    expect(i.slice(i.indexOf('export async function completarImagens'))).toContain('await prepararImagem(');
  });
});

describe('a foto vira a foto do produto', () => {
  it('sem fundo: grava pelo nome e pelo código de barras', async () => {
    rpc.mockClear();
    expect(await guardarFotoDoProduto('Bolacha Recheada', { url: 'https://x/b.png', fonte: 'UPLOAD', recortada: true }, '7891000100103')).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(['tabloide_catalogo_salvar', expect.objectContaining({ p_nome: 'Bolacha Recheada', p_url: 'https://x/b.png', p_fonte: 'UPLOAD' })]);
  });
  it('foto enviada que ficou com fundo não vira a foto do produto', async () => {
    rpc.mockClear();
    expect(await guardarFotoDoProduto('Bolacha Recheada', { url: 'https://x/b.jpg', fonte: 'UPLOAD' })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('no banco: vira oficial só se o produto não tem foto; a oficial que existe não é trocada por anunciante', () => {
    const s = fs.readFileSync('supabase/migrations/20261358_catalogo_foto_oficial.sql', 'utf8');
    expect(s).toMatch(/v_alvo IS NOT NULL AND NOT EXISTS \(/);
    expect(s).toMatch(/nome_norm = p_nome_norm AND cliente_id IS NULL/);
    expect(s).toMatch(/ROLLBACK/);
  });
  it('todo caminho de trocar a foto usa a mesma regra, inclusive a galeria do editor', () => {
    const e = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(e).toMatch(/void trocarProduto\(camadaSel, \{ url: publicUrl, fonte: 'UPLOAD' \}, ''\)/);
    for (const f of ['src/pages/studioai/EditorPage.tsx', 'src/components/studio/ProdutosComFotos.tsx', 'src/components/tabloide/TabloideEditor.tsx']) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t, f).toContain('await prepararFotoDoProduto(');
      expect(t, f).toContain('guardarFotoDoProduto(');
    }
  });
});
