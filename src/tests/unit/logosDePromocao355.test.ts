/**
 * F-355 (pedido do dono, 20/11/2026) — as logos de promoção que o dono manda entram na galeria de logos do Studio
 * (o "Trocar logo" da criação de vídeo, dos palcos e dos encartes) para TODOS os usuários, sem fundo, com miniatura.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGOS_DE_PROMOCAO } from '@/lib/studio/logosDePromocao';
import { LOGOS_OFICIAIS, logosDaPasta } from '@/lib/studio/logos';
import { FUNDOS_DO_PALCO, projetoDoCarrossel } from '@/lib/studio/palco';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

describe('F-355: logos de promoção do dono na galeria', () => {
  it('a lista bate com o manifesto e cada logo existe, sem fundo, com miniatura', async () => {
    const manifesto = JSON.parse(fs.readFileSync('public/studio/logos/promocao/lista.json', 'utf8')) as Array<{ id: string }>;
    expect(LOGOS_DE_PROMOCAO.map((l) => l.id)).toEqual(manifesto.map((m) => `promocao-${m.id}`));
    expect(LOGOS_DE_PROMOCAO.length).toBeGreaterThan(0);
    for (const l of LOGOS_DE_PROMOCAO) {
      const m = await sharp(`public${l.url}`).metadata();
      expect({ w: m.width, h: m.height, alfa: m.hasAlpha }, l.id).toEqual({ w: l.largura, h: l.altura, alfa: true });
      expect(fs.existsSync(`public${l.miniatura}`), l.id).toBe(true);
      // sem fundo: os cantos são transparentes
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
