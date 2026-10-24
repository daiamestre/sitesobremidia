/**
 * F-213 — launcher: seletor de mídias por pastas (sem esmagar), prévia rápida com tocar/pausar e volume, cartões das 4
 * telas com lista de reprodução, cor do app que acompanha o fundo (também com capa) e o botão "Upload".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
let respostas: Record<string, unknown[]> = {};
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'like', 'eq', 'order', 'limit', 'ilike', 'in', 'is']) {
    q[m] = (...args: unknown[]) => { chamadas.push({ tabela, metodo: m, args }); return q; };
  }
  (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: respostas[tabela] ?? [], error: null, count: (respostas[tabela] ?? []).length });
  return q;
}
const rpcResposta: Record<string, unknown> = {};
const rpcChamadas: unknown[][] = [];
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (t: string) => consulta(t),
  rpc: (nome: string, args: unknown) => { rpcChamadas.push([nome, args]); return Promise.resolve({ data: rpcResposta[nome] ?? [], error: null }); },
} }));

import { buscarMidiasDaPasta, buscarPastas, type ItemDeFundo } from '@/services/launcher.service';
import { paletaDaLauncher, rgbParaHsv } from '@/lib/temaLauncher';
import { CartaoDaVitrine, segundosDoItem } from '@/components/launcher/CartaoDaVitrine';
import { PreviaRapidaDeMidia } from '@/components/launcher/PreviaRapidaDeMidia';

const hue = (hex: string) => rgbParaHsv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))[0];

beforeEach(() => { chamadas.length = 0; respostas = {}; });

describe('F-213 cor do app', () => {
  it('a cor escolhida vira a cor dos botões (verde fica verde, vivo e legível); sem cor = tema padrão', () => {
    expect(paletaDaLauncher(null)).toBeNull();
    expect(paletaDaLauncher('xyz')).toBeNull();
    const verde = paletaDaLauncher('#064E3B')!;
    expect(Math.abs(hue(verde.botaoInicio) - hue('#064E3B'))).toBeLessThan(4);
    expect(rgbParaHsv(...([1, 3, 5].map((i) => parseInt(verde.botaoInicio.slice(i, i + 2), 16)) as [number, number, number]))[2]).toBeGreaterThan(0.7);
    const cinza = paletaDaLauncher('#2B2B2B')!;
    expect(rgbParaHsv(...([1, 3, 5].map((i) => parseInt(cinza.botaoInicio.slice(i, i + 2), 16)) as [number, number, number]))[1]).toBeLessThan(0.5);
    expect(verde.veu).toMatch(/^#[0-9A-F]{8}$/);
  });
  it('a mesma conta existe no aparelho (prévia igual à TV)', () => {
    const kt = readFileSync(resolve(__dirname, '../../../native-android-player/app/src/main/java/com/antigravity/player/launcher/TemaDaLauncher.kt'), 'utf-8');
    expect(kt).toContain('if (s < 0.12f) s else maxOf(s, 0.62f)');
    expect(kt).toContain('hsv(h, viva, 0.78f)');
  });
  it('trocar de cor tira a capa; escolher capa mantém a cor do app', () => {
    const src = readFileSync(resolve(__dirname, '../../modules/corporate/pages/LauncherPage.tsx'), 'utf-8');
    expect(src).toContain("setCfg({ ...cfg, fundo_cor: c, capa_media_id: null })");
    expect(src).toContain('const proxima: ConfigLauncher = { ...cfg, capa_media_id: m[0].id };');
    expect(src).not.toContain('capa_media_id: m[0].id, fundo_cor: null');
    expect(src).toContain('data-testid="previa-botao-player"');
  });
});

describe('F-213 seletor de mídias', () => {
  const seletor = readFileSync(resolve(__dirname, '../../components/launcher/SeletorDeMidiasLauncher.tsx'), 'utf-8');
  it('botão só "Upload" e rolagem num quadro próprio (a grade não esmaga as mídias)', () => {
    expect(seletor).toContain('<Upload className="h-4 w-4" />Upload');
    expect(seletor).not.toContain('Enviar do computador ou celular');
    expect(seletor).toContain('max-h-[55vh] overflow-y-auto');
    expect(seletor).not.toMatch(/grid max-h-\[/);
    expect(seletor).toContain('line-clamp-2');
    expect(seletor).toContain('<PreviaRapidaDeMidia');
  });
  it('Enviadas: pastas Vídeos e Fotos (capa = só Fotos)', async () => {
    respostas.media = [{ id: 'a' }, { id: 'b' }];
    const p = await buscarPastas('emp', 'enviadas');
    expect(p.map((x) => x.nome)).toEqual(['Vídeos', 'Fotos']);
    expect((await buscarPastas('emp', 'enviadas', true)).map((x) => x.id)).toEqual(['image']);
  });
  it('Biblioteca: as pastas da página Biblioteca (RPC oficial) com quantas mídias aceitas têm; pasta vazia some', async () => {
    rpcResposta.biblioteca_listar_pastas = [
      { id: 'p1', nome: 'Memes', descricao: null, ordem: 0, total: 3, videos: 1, imagens: 2, capa_url: null },
      { id: 'p2', nome: 'Áudios', descricao: null, ordem: 1, total: 4, videos: 0, imagens: 0, capa_url: null },
    ];
    expect(await buscarPastas('emp', 'biblioteca')).toEqual([{ id: 'p1', nome: 'Memes', total: 3, capa_url: null }]);
    expect((await buscarPastas('emp', 'biblioteca', true))[0].total).toBe(2);
  });
  it('mídias de uma pasta da Biblioteca pela busca oficial, filtrando o tipo', async () => {
    rpcResposta.biblioteca_buscar = [
      { media_id: 'm1', nome: 'Meme gato', file_type: 'image', file_url: 'https://x/1.jpg', thumbnail_url: null, aspect_ratio: '16:9', duration_ms: null },
      { media_id: 'm2', nome: 'Música', file_type: 'audio', file_url: 'https://x/2.mp3', thumbnail_url: null, aspect_ratio: null, duration_ms: 1 },
    ];
    expect((await buscarMidiasDaPasta('biblioteca', 'p1', 'gato')).map((m) => m.id)).toEqual(['m1']);
    expect(rpcChamadas).toContainEqual(['biblioteca_buscar', { p_busca: 'gato', p_tipo: null, p_pasta_id: 'p1', p_limite: 500, p_offset: 0 }]);
  });
});

describe('F-213 prévia rápida e cartões das telas', () => {
  const video = { id: 'v', name: 'Vídeo do parceiro', file_url: 'https://x/v.mp4', file_type: 'video', thumbnail_url: null };
  it('vídeo: botão de prévia; tocando tem pausar e volume', () => {
    const tocar = vi.fn();
    const { rerender } = render(<PreviaRapidaDeMidia midia={video} tocando={false} onTocar={tocar} />);
    fireEvent.click(screen.getByTestId('previa-tocar'));
    expect(tocar).toHaveBeenCalledWith(true);
    rerender(<PreviaRapidaDeMidia midia={video} tocando onTocar={tocar} />);
    expect(screen.getByLabelText(/^(Pausar|Tocar)$/)).toBeTruthy();
    expect(screen.getByLabelText('Volume')).toBeTruthy();
    expect(screen.getByLabelText(/som$/)).toBeTruthy();
  });
  it('cartão da TV 1: lista de reprodução com posição, nome, tipo e tempo total; sem limite de mídias', () => {
    const itens: ItemDeFundo[] = Array.from({ length: 25 }, (_, i) => ({
      id: `i${i}`, media_id: `m${i}`, vitrine: 'tv1', ordem: i, duracao_s: 10, ativo: true,
      media: { id: `m${i}`, name: `Mídia ${i + 1}`, file_url: 'https://x/a.jpg', file_type: 'image', thumbnail_url: null },
    }));
    render(<CartaoDaVitrine vitrine={{ id: 'tv1', nome: 'TV 1', formato: '16:9' }} itens={itens}
      onAdicionar={vi.fn()} onReordenar={vi.fn()} onAtualizar={vi.fn()} onRemover={vi.fn()} />);
    expect(screen.getByText('25 mídias · 4:10 por volta')).toBeTruthy();
    expect(screen.getByText('Mídia 25')).toBeTruthy();
    expect(screen.getByText('Lista de reprodução')).toBeTruthy();
    expect(segundosDoItem({ ...itens[0], media: { ...itens[0].media!, file_type: 'video', duration_ms: 65000 } })).toBe(65);
  });
  it('setas reordenam a lista (celular)', () => {
    const reordenar = vi.fn();
    const itens: ItemDeFundo[] = ['a', 'b'].map((n, i) => ({
      id: n, media_id: n, vitrine: 'totem1', ordem: i, duracao_s: 10, ativo: true,
      media: { id: n, name: n.toUpperCase(), file_url: 'https://x/a.jpg', file_type: 'image', thumbnail_url: null },
    }));
    render(<CartaoDaVitrine vitrine={{ id: 'totem1', nome: 'Totem 1', formato: '9:16' }} itens={itens}
      onAdicionar={vi.fn()} onReordenar={reordenar} onAtualizar={vi.fn()} onRemover={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Mover para baixo')[0]);
    expect(reordenar.mock.calls[0][0].map((i: ItemDeFundo) => i.id)).toEqual(['b', 'a']);
  });
});
