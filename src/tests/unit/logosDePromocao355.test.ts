/**
 * F-355 (pedido do dono, 20/11/2026) — as logos de promoção que o dono manda entram na galeria de logos do Studio
 * (o "Trocar logo" da criação de vídeo, dos palcos e dos encartes) para TODOS os usuários, com miniatura.
 * REGRA DO DONO: a logo entra EXATAMENTE como ele mandou, o mesmo arquivo, sem recorte nem mudança, em NENHUMA logo.
 */
import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGOS_DE_PROMOCAO } from '@/lib/studio/logosDePromocao';
import { LOGOS_OFICIAIS, gravarLogoDoEncarte, lerLogoDoEncarte, logosDaPasta } from '@/lib/studio/logos';
import { FUNDOS_DO_PALCO, projetoDoCarrossel } from '@/lib/studio/palco';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

describe('F-355: logos de promoção do dono na galeria', () => {
  it('a lista bate com o manifesto e cada logo existe, com miniatura, como o dono mandou', async () => {
    const manifesto = JSON.parse(fs.readFileSync('public/studio/logos/promocao/lista.json', 'utf8')) as Array<{ id: string; largura: number; altura: number }>;
    expect(LOGOS_DE_PROMOCAO.map((l) => l.id)).toEqual(manifesto.map((m) => `promocao-${m.id}`));
    expect(LOGOS_DE_PROMOCAO.length).toBeGreaterThan(0);
    for (const l of LOGOS_DE_PROMOCAO) {
      const item = manifesto.find((x) => `promocao-${x.id}` === l.id)!;
      const m = await sharp(`public${l.url}`).metadata();
      expect({ w: m.width, h: m.height }, l.id).toEqual({ w: l.largura, h: l.altura });
      expect(fs.existsSync(`public${l.miniatura}`), l.id).toBe(true);
      // REGRA DO DONO: o MESMO arquivo que ele mandou, byte por byte (nada recortado, nada mudado, por fora ou por dentro)
      const orig = `../logos-de-promocao-originais/${item.id}${l.url.slice(l.url.lastIndexOf('.'))}`;
      if (fs.existsSync(orig)) expect(fs.readFileSync(`public${l.url}`).equals(fs.readFileSync(orig)), l.id).toBe(true);
      expect(l.url, l.id).toMatch(/-[0-9a-f]{8}\.[a-z]+$/); // nome novo a cada troca: o aparelho nunca mostra a versão antiga
      // o nome traz a marca do próprio conteúdo: se alguém mexer no arquivo, a marca não bate
      const { createHash } = await import('node:crypto');
      expect(l.url, l.id).toContain(createHash('sha256').update(fs.readFileSync(`public${l.url}`)).digest('hex').slice(0, 8));
    }
  });
  it('a receita não recorta nem muda a logo (nenhuma IA de recorte, nenhum ajuste de cor)', () => {
    const r = fs.readFileSync('scripts/studio/logos-de-promocao.mjs', 'utf8');
    expect(r).not.toMatch(/BiRefNet|mascara|sem-fundo|trim\(|removeAlpha/);
    expect(r).toContain('fs.writeFileSync(`${PASTA}/${nomeArq}`, original)');
    expect(fs.existsSync('scripts/studio/tirar-preto-da-logo.mjs')).toBe(false);
  });
  it('a escolha guardada antes (endereço antigo) volta na versão atual', () => {
    const l = LOGOS_DE_PROMOCAO[0];
    const antigo = l.url.replace(/-[0-9a-f]{8}(\.[a-z]+)$/, '.webp');
    gravarLogoDoEncarte('palco-x', { ...l, id: 'velho', url: antigo });
    expect(lerLogoDoEncarte('palco-x')?.url).toBe(l.url);
    gravarLogoDoEncarte('palco-x', null);
  });
  it('aparecem para todos, primeiro na galeria (oficiais), e servem de logo do início do vídeo', () => {
    expect(LOGOS_OFICIAIS.slice(0, LOGOS_DE_PROMOCAO.length)).toEqual(LOGOS_DE_PROMOCAO);
    expect(logosDaPasta(null).slice(0, LOGOS_DE_PROMOCAO.length)).toEqual(LOGOS_DE_PROMOCAO);
    const l = LOGOS_DE_PROMOCAO[0];
    const p = projetoDoCarrossel([{ nome: 'Leite', preco: 4.79, precoDe: null, unidade: 'UN', imagem: { url: '/x.png', fonte: 'MARCA' } }], '9:16', { fundo: FUNDOS_DO_PALCO[0], textoBotao: 'OFERTAS', loja: 'Loja', movimento: {}, logoDoPalco: l });
    expect((p.clipes[0].documento!.camadas.find((c) => c.nome === 'Logo do início') as { src: string }).src).toBe(l.url);
  });
});
