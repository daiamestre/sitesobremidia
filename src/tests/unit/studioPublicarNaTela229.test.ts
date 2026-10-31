// F-229 — mídia do Studio até o Player: salva na galeria sem cópia repetida, com o MD5 que o Player confere, e entra na
// playlist que a tela JÁ está passando (tela sem playlist ganha uma na orientação dela), avisando o Player.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

type Estado = { tabela: string; op: 'select' | 'insert' | 'update'; filtros: [string, unknown][]; dados?: unknown };
const h = vi.hoisted(() => ({ chamadas: [] as Estado[], responder: (_e: Estado): unknown => null }));

vi.mock('@/integrations/supabase/client', () => {
  const de = (tabela: string) => {
    const e: Estado = { tabela, op: 'select', filtros: [] };
    const fim = () => { h.chamadas.push(e); return Promise.resolve({ data: h.responder(e), error: null }); };
    const b: Record<string, unknown> = {
      select: () => b, insert: (d: unknown) => { e.op = 'insert'; e.dados = d; return b; }, update: (d: unknown) => { e.op = 'update'; e.dados = d; return b; },
      eq: (c: string, v: unknown) => { e.filtros.push([c, v]); return b; }, gte: () => b, order: () => b, limit: () => b, not: () => b,
      maybeSingle: fim, single: fim, then: (ok: (v: unknown) => unknown, erro?: (v: unknown) => unknown) => fim().then(ok, erro),
    };
    return b;
  };
  return { supabase: { from: de, rpc: () => Promise.resolve({ data: 'tenant', error: null }), functions: { invoke: vi.fn() }, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) } } };
});
const upload = vi.hoisted(() => vi.fn(async (_b: Blob, caminho: string) => ({ publicUrl: `https://r2/${caminho}`, filePath: caminho })));
vi.mock('@/lib/r2Upload', () => ({ uploadToR2: upload }));
const pasta = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/galeria', () => ({ guardarNaPasta: pasta }));
vi.mock('@/modules/crm/services/playlistCliente.service', () => ({ playlistClienteService: {} }));

import { destinos, formatoDaTela, md5DoArquivo, publicar, salvarNasMidias, type Salvo } from '@/lib/studioai/api';

const filtro = (e: Estado, c: string) => e.filtros.find(([k]) => k === c)?.[1];
const arte = (txt: string) => new Blob([txt], { type: 'image/png' });
const pedido = (png: Blob) => ({ userId: 'u1', clienteId: null, png, nome: 'Aula Experimental', largura: 1080, altura: 1920, formato: '9:16', pasta: { chave: 'aula', nome: 'Aula' } });

beforeEach(() => { h.chamadas.length = 0; upload.mockClear(); pasta.mockClear(); h.responder = () => null; });

describe('formato e impressão digital', () => {
  it('tela em pé recebe 9:16 e deitada 16:9', () => {
    expect(formatoDaTela('portrait')).toBe('9:16');
    expect(formatoDaTela('landscape')).toBe('16:9');
    expect(formatoDaTela(null)).toBe('16:9');
  });
  it('o MD5 é o mesmo que o Player calcula do arquivo baixado', async () => {
    const txt = 'x'.repeat(5 * 1024 * 1024 + 7); // passa de um pedaço de 4 MB
    expect(await md5DoArquivo(new Blob([txt]))).toBe(createHash('md5').update(txt).digest('hex'));
  });
});

describe('salvar na galeria sem cópias', () => {
  it('grava a mídia com file_hash, põe na pasta e a mesma arte salva de novo NÃO vira outra mídia', async () => {
    h.responder = (e) => (e.op === 'insert' && e.tabela === 'media' ? { id: 'm1' } : null);
    const a = await salvarNasMidias(pedido(arte('arte-1')));
    const ins = h.chamadas.find((e) => e.op === 'insert' && e.tabela === 'media')!;
    expect((ins.dados as { file_hash: string }).file_hash).toBe(createHash('md5').update('arte-1').digest('hex'));
    expect(a).toMatchObject({ tipo: 'media', id: 'm1', formato: '9:16' });
    expect(pasta).toHaveBeenCalledWith('u1', 'media', 'm1', { chave: 'aula', nome: 'Aula' });
    const b = await salvarNasMidias(pedido(arte('arte-1')));
    expect(b).toMatchObject({ id: 'm1', repetido: true });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(h.chamadas.filter((e) => e.op === 'insert' && e.tabela === 'media')).toHaveLength(1);
  });
  it('a arte que já está no banco (mesmo MD5) é reaproveitada sem novo envio', async () => {
    h.responder = (e) => (e.tabela === 'media' && e.op === 'select' ? { id: 'antiga', file_url: 'https://r2/antiga.png' } : null);
    const s = await salvarNasMidias(pedido(arte('arte-ja-salva')));
    expect(s).toMatchObject({ id: 'antiga', repetido: true });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('enviar para a tela', () => {
  const salvo: Salvo = { tipo: 'media', id: 'm1', url: 'https://r2/m1.png', duracao: 10 };
  it('entra na playlist que a tela JÁ está passando, no fim, e avisa o Player', async () => {
    h.responder = (e) => {
      if (e.tabela === 'screens') return { playlist_id: 'pl-academia', orientation: 'portrait' };
      if (e.tabela === 'playlist_items' && e.op === 'select' && filtro(e, 'media_id')) return null;
      if (e.tabela === 'playlist_items' && e.op === 'select') return { position: 8 };
      return null;
    };
    const r = await publicar(salvo, { tipo: 'tela', id: 'tela-3', nome: 'Academia Tela 3' });
    const ins = h.chamadas.find((e) => e.op === 'insert' && e.tabela === 'playlist_items')!;
    expect(ins.dados).toMatchObject({ playlist_id: 'pl-academia', media_id: 'm1', position: 9, duration: 10 });
    const aviso = h.chamadas.find((e) => e.op === 'update' && e.tabela === 'playlists')!;
    expect(filtro(aviso, 'id')).toBe('pl-academia');
    expect(aviso.dados).toHaveProperty('updated_at');
    expect(h.chamadas.some((e) => e.op === 'insert' && e.tabela === 'playlists')).toBe(false);
    expect(r).toMatchObject({ ok: true, playlistId: 'pl-academia', telaId: 'tela-3' });
  });
  it('a mesma mídia não entra duas vezes na playlist', async () => {
    h.responder = (e) => (e.tabela === 'screens' ? { playlist_id: 'pl', orientation: 'landscape' } : e.tabela === 'playlist_items' && filtro(e, 'media_id') ? { id: 'item' } : null);
    const r = await publicar(salvo, { tipo: 'tela', id: 't', nome: 'T' });
    expect(h.chamadas.some((e) => e.op === 'insert')).toBe(false);
    expect(r.mensagem).toMatch(/já estava/);
  });
  it('tela sem playlist ganha uma na orientação dela (em pé = 9x16) e fica ligada à tela', async () => {
    h.responder = (e) => {
      if (e.tabela === 'screens' && e.op === 'select') return { playlist_id: null, orientation: 'portrait' };
      if (e.tabela === 'playlists' && e.op === 'insert') return { id: 'pl-nova' };
      return null;
    };
    await publicar(salvo, { tipo: 'tela', id: 'tela-1', nome: 'Academia Tela 1' });
    const nova = h.chamadas.find((e) => e.op === 'insert' && e.tabela === 'playlists')!;
    expect(nova.dados).toMatchObject({ user_id: 'u1', resolution: '9x16', name: 'Studio – Academia Tela 1' });
    const liga = h.chamadas.find((e) => e.op === 'update' && e.tabela === 'screens')!;
    expect(liga.dados).toEqual({ playlist_id: 'pl-nova' });
    expect(filtro(liga, 'id')).toBe('tela-1');
    expect(h.chamadas.find((e) => e.op === 'insert' && e.tabela === 'playlist_items')?.dados).toMatchObject({ playlist_id: 'pl-nova', position: 0 });
  });
  it('a lista de telas traz TODAS (também as sem playlist), com orientação, ligada/desligada e a playlist que passa', async () => {
    h.responder = (e) => (e.tabela === 'playlists' ? [{ id: 'pl', name: 'MODELO ACADEMIA' }]
      : [{ id: 'a', name: 'Tela 3', playlist_id: 'pl', orientation: 'portrait', last_ping_at: new Date().toISOString() },
         { id: 'b', name: 'Tela 1', playlist_id: null, orientation: 'landscape', last_ping_at: null }]);
    const { telas } = await destinos(null);
    expect(telas).toHaveLength(2);
    expect(telas[0]).toMatchObject({ orientacao: 'portrait', online: true, playlist: 'MODELO ACADEMIA' });
    expect(telas[0].detalhe).toMatch(/já passa: MODELO ACADEMIA/);
    expect(telas[1]).toMatchObject({ orientacao: 'landscape', online: false, playlist: null });
    expect(telas[1].detalhe).toMatch(/cria uma/);
  });
});
