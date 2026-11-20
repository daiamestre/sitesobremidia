/**
 * F-355 (pedido do dono, 20/11/2026) — as logos de promoção que o dono manda entram na galeria de logos do Studio
 * (o "Trocar logo" da criação de vídeo, dos palcos e dos encartes) para TODOS os usuários, com miniatura.
 * REGRA DO DONO: a logo entra EXATAMENTE como ele mandou (o fundo dela fica); só sai o fundo quando ele pede (--sem-fundo).
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGOS_DE_PROMOCAO } from '@/lib/studio/logosDePromocao';
import { LOGOS_OFICIAIS, logosDaPasta } from '@/lib/studio/logos';
import { FUNDOS_DO_PALCO, projetoDoCarrossel } from '@/lib/studio/palco';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

describe('F-355: logos de promoção do dono na galeria', () => {
  it('a lista bate com o manifesto e cada logo existe, com miniatura, como o dono mandou', async () => {
    const manifesto = JSON.parse(fs.readFileSync('public/studio/logos/promocao/lista.json', 'utf8')) as Array<{ id: string; semFundo?: boolean; largura: number; altura: number }>;
    expect(LOGOS_DE_PROMOCAO.map((l) => l.id)).toEqual(manifesto.map((m) => `promocao-${m.id}`));
    expect(LOGOS_DE_PROMOCAO.length).toBeGreaterThan(0);
    for (const l of LOGOS_DE_PROMOCAO) {
      const item = manifesto.find((x) => `promocao-${x.id}` === l.id)!;
      const m = await sharp(`public${l.url}`).metadata();
      expect({ w: m.width, h: m.height }, l.id).toEqual({ w: l.largura, h: l.altura });
      expect(fs.existsSync(`public${l.miniatura}`), l.id).toBe(true);
      if (!item.semFundo) {
        // como o dono mandou: do tamanho do original, com o fundo dele (sem transparência nos cantos)
        const o = await sharp(`../logos-de-promocao-originais/${item.id}.png`).metadata().catch(() => null);
        if (o) expect({ w: o.width, h: o.height }, l.id).toEqual({ w: l.largura, h: l.altura });
        continue;
      }
      // pedido sem fundo: os cantos são transparentes
      const { data, info } = await sharp(`public${l.url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const alfa = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
      expect([alfa(0, 0), alfa(info.width - 1, 0), alfa(0, info.height - 1), alfa(info.width - 1, info.height - 1)], l.id).toEqual([0, 0, 0, 0]);
    }
  });
  it('aparecem para todos, primeiro na galeria (oficiais), e servem de logo do início do vídeo', () => {
    expect(LOGOS_OFICIAIS.slice(0, LOGOS_DE_PROMOCAO.length)).toEqual(LOGOS_DE_PROMOCAO);
    expect(logosDaPasta(null).slice(0, LOGOS_DE_PROMOCAO.length)).toEqual(LOGOS_DE_PROMOCAO);
    const l = LOGOS_DE_PROMOCAO[0];
    const p = projetoDoCarrossel([{ nome: 'Leite', preco: 4.79, precoDe: null, unidade: 'UN', imagem: { url: '/x.png', fonte: 'MARCA' } }], '9:16', { fundo: FUNDOS_DO_PALCO[0], textoBotao: 'OFERTAS', loja: 'Loja', movimento: {}, logoDoPalco: l });
    expect((p.clipes[0].documento!.camadas.find((c) => c.nome === 'Logo do início') as { src: string }).src).toBe(l.url);
  });
});
