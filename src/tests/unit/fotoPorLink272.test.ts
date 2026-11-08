// F-272 — foto do produto POR LINK (sem guardar cópia): passa-foto no Worker e o site usando o link.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PASSA_FOTO, ehFotoPorLink, esquecerPassaFoto, fotoSemFundoPorLink, linkDaFoto, origemDaFoto } from '@/lib/tabloide/fotoPorLink';
import worker from '../../../cloudflare/tabloide-ia/worker.js';

const ler = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../..', p), 'utf8');
const MARCA = 'https://www.adria.com.br/wp-content/uploads/2026/04/PappardelleCaseiro.png';

afterEach(() => { vi.unstubAllGlobals(); esquecerPassaFoto(); });

describe('link da foto (F-272)', () => {
  it('monta o link com a caixa de corte e lê de volta o endereço original', () => {
    const l = linkDaFoto(MARCA, { left: 10, top: 20, width: 300, height: 400 });
    expect(l).toBe(`${PASSA_FOTO}?u=${encodeURIComponent(MARCA)}&c=10,20,300,400`);
    expect(ehFotoPorLink(l)).toBe(true);
    expect(origemDaFoto(l)).toBe(MARCA);
    expect(linkDaFoto(MARCA, null, true)).toContain('&s=1');
  });
  it('o script do catálogo e o site usam o MESMO passa-foto e o mesmo formato de link', () => {
    const s = ler('scripts/ops/passa-foto.mjs');
    expect(ler('scripts/ops/catalogo-por-link.mjs')).toContain("from './passa-foto.mjs'");
    expect(ler('scripts/ops/marca-oficial.mjs')).toContain("from './passa-foto.mjs'");
    expect(s).toContain(`PASSA_FOTO = '${PASSA_FOTO}'`);
    expect(s).toContain("`${PASSA_FOTO}?u=${encodeURIComponent(url)}${semFundo ? '&s=1' : ''}${caixa ? `&c=${caixa.left},${caixa.top},${caixa.width},${caixa.height}` : ''}`");
  });
  it('nunca usa link para foto que já é nossa (R2), nem quando o passa-foto não está publicado (volta ao caminho de antes)', async () => {
    const carrega = vi.fn(async () => true);
    expect(await fotoSemFundoPorLink('https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/catalogo/x.png', carrega)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('método não permitido', { status: 405 })));
    expect(await fotoSemFundoPorLink(MARCA, carrega)).toBeNull();
    expect(carrega).not.toHaveBeenCalled();
  });
  it('o preparo da foto tenta o link antes de guardar cópia, e nunca para foto enviada pelo cliente ou criada por IA', () => {
    const t = ler('src/lib/tabloide/imagens.ts');
    const i = t.indexOf('fotoSemFundoPorLink(imagem.url');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(t.indexOf('const semFundo = await pngSemSobras(imagem.url)'));
    expect(t).toContain("imagem.fonte !== 'UPLOAD' && imagem.fonte !== 'IA'");
  });
});

describe('passa-foto no Worker (F-272)', () => {
  const pedir = (q: string, env: Record<string, unknown> = {}) => worker.fetch(new Request(`https://w.example/foto${q}`), env);
  const foto = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });

  it('sem endereço responde 400 com permissão de uso (é o sinal de "no ar" que o site confere)', async () => {
    const r = await pedir('');
    expect(r.status).toBe(400);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('não é repasse aberto: recusa site fora da lista e endereço sem https', async () => {
    expect((await pedir(`?u=${encodeURIComponent('https://site-qualquer.example/a.png')}`)).status).toBe(400);
    expect((await pedir(`?u=${encodeURIComponent('http://www.adria.com.br/a.png')}`)).status).toBe(400);
  });
  it('só repassa imagem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));
    expect((await pedir(`?u=${encodeURIComponent(MARCA)}`)).status).toBe(502);
  });
  it('corta a sobra e tira o fundo pela Cloudflare Images, devolvendo WebP com cache longo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => foto()));
    const passos: unknown[] = [];
    const cadeia = { transform: (o: unknown) => { passos.push(o); return cadeia; }, output: async () => ({ response: () => new Response('webp') }) };
    const r = await pedir(`?u=${encodeURIComponent(MARCA)}&s=1&c=1,2,30,40`, { IMAGES: { input: () => cadeia } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('cache-control')).toContain('max-age=2592000');
    expect(passos).toEqual([{ segment: 'foreground', width: 1400, height: 1400, fit: 'scale-down' }, { trim: { left: 1, top: 2, width: 30, height: 40 } }]);
  });
  it('se a transformação falhar (ex.: cota do mês), entrega a foto original: o encarte nunca fica sem foto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => foto()));
    const r = await pedir(`?u=${encodeURIComponent(MARCA)}&c=1,2,30,40`, { IMAGES: { input: () => { throw new Error('9422 limit'); } } });
    expect(r.status).toBe(200);
    expect(r.headers.get('x-passa-foto')).toBe('original');
    expect(r.headers.get('content-type')).toBe('image/png');
  });
  it('as outras ações do Worker continuam exigindo o segredo', async () => {
    const r = await worker.fetch(new Request('https://w.example/', { method: 'POST', body: '{}' }), { SEGREDO: 'x' });
    expect(r.status).toBe(401);
  });
});
