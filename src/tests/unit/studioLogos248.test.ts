// F-248 — pasta Logos do Studio: a logo do encarte é uma camada que o cliente troca; o fundo não tem mais título gravado.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import sharp from 'sharp';
import { LOGOS_OFICIAIS, LOGO_ALERTA_DE_OFERTA, LOGO_MEGA_OFERTA, gravarLogoDoEncarte, lerLogoDoEncarte, logosDaPasta } from '@/lib/studio/logos';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, formatosDoEncarte, layoutDoEncarte } from '@/lib/studio/encartesOficiais';
import { FUNDOS_DO_PALCO, palcoDoProduto, srcDoFundo } from '@/lib/studio/palco';
import { TAMANHO_DOC } from '@/lib/studio/documento';
import { configDoEncarte, ENCARTES } from '@/lib/tabloide/encartes';
import { configPadrao } from '@/lib/tabloide/cartaz';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const produto = { nome: 'Arroz Camil 5kg', preco: 9.9, precoDe: null, unidade: null, imagem: null };

describe('logos oficiais', () => {
  it('os arquivos existem, sem fundo, em alta, com a medida gravada no código', async () => {
    for (const l of LOGOS_OFICIAIS) {
      const m = await sharp(`public${l.url}`).metadata();
      expect({ w: m.width, h: m.height, alfa: m.hasAlpha }, l.id).toEqual({ w: l.largura, h: l.altura, alfa: true });
      expect(m.width, l.id).toBeGreaterThanOrEqual(1400);
    }
  });
  it('a pasta junta as oficiais com as da biblioteca', () => {
    const selo = { id: 's1', nome: 'Minha', imagem_url: 'https://x/l.png', miniatura_url: null, largura: 400, altura: 200, tipo: 'LOGO_CABECALHO', estado: 'APROVADO', ordem: 1, dono_id: 'u1' };
    const lista = logosDaPasta([selo] as never);
    expect(lista.slice(0, LOGOS_OFICIAIS.length)).toEqual(LOGOS_OFICIAIS);
    expect(lista[LOGOS_OFICIAIS.length]).toMatchObject({ id: 's1', url: 'https://x/l.png', dono: 'u1' });
  });
  it('a escolha fica guardada por encarte e dá para voltar à original', () => {
    gravarLogoDoEncarte('teste-a', LOGO_ALERTA_DE_OFERTA);
    expect(lerLogoDoEncarte('teste-a')?.id).toBe(LOGO_ALERTA_DE_OFERTA.id);
    expect(lerLogoDoEncarte('teste-b')).toBeNull();
    gravarLogoDoEncarte('teste-a', null);
    expect(lerLogoDoEncarte('teste-a')).toBeNull();
  });
});

describe.each(ENCARTES_OFICIAIS)('logo do encarte $id', (e) => {
  it('sai em todos os tamanhos como camada, dentro da arte, sobre o fundo sem título', () => {
    for (const f of formatosDoEncarte(e)) {
      const d = documentoDoEncarteOficial(e, [produto, produto], {}, f);
      const l = d.camadas.find((c) => c.nome === 'Logo do encarte')!;
      expect(l, f).toMatchObject({ tipo: 'imagem', src: e.logoPadrao.url, ajuste: 'conter' });
      expect(l.x >= -1 && l.y >= -1 && l.x + l.w <= TAMANHO_DOC[f].w + 1 && l.y + l.h <= TAMANHO_DOC[f].h + 1, f).toBe(true);
      expect(l.w / l.h, f).toBeGreaterThan(1); // a caixa não deforma: 'conter' mantém a logo inteira
      expect(fs.existsSync(`public${layoutDoEncarte(e, f).fundo}`), f).toBe(true);
    }
  });
  it('troca pela logo escolhida na pasta, sem mexer no resto', () => {
    const d = documentoDoEncarteOficial(e, [produto, produto], { logoDoEncarte: LOGO_ALERTA_DE_OFERTA });
    expect(d.camadas.find((c) => c.nome === 'Logo do encarte')).toMatchObject({ src: LOGO_ALERTA_DE_OFERTA.url });
    expect(d.camadas.filter((c) => c.nome.startsWith('Placa '))).toHaveLength(2);
  });
});

describe('palco e encartes A4', () => {
  it('o palco oficial usa a logo como camada e troca pela pasta', () => {
    const f = FUNDOS_DO_PALCO[0];
    for (const fm of ['9:16', '16:9'] as const) {
      expect(fs.existsSync(`public${srcDoFundo(f, fm)}`), fm).toBe(true);
      expect(palcoDoProduto(produto, fm, { fundo: f }).camadas.find((c) => c.nome === 'Logo do palco')).toMatchObject({ src: f.logoPadrao.url, ajuste: 'conter' });
      expect(palcoDoProduto(produto, fm, { fundo: f, logoDoPalco: LOGO_MEGA_OFERTA }).camadas.find((c) => c.nome === 'Logo do palco')).toMatchObject({ src: LOGO_MEGA_OFERTA.url });
    }
  });
  it('no encarte A4 a logo escolhida vai para o cabeçalho, no lugar do título desenhado', () => {
    const cfg = configDoEncarte({ ...ENCARTES[0], logoUrl: 'https://x/logo.webp' }, configPadrao());
    expect(cfg).toMatchObject({ seloUrl: 'https://x/logo.webp', cabecalhoEmTexto: false });
  });
});

describe('as telas', () => {
  it('a pasta está no catálogo, no menu e na rota; todo encarte e o palco têm "Trocar logo"', () => {
    expect(fs.readFileSync('src/pages/studioai/PastaPage.tsx', 'utf8')).toMatch(/pastaId === PASTA_LOGOS\) return <PastaDeLogos \/>/);
    expect(fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8')).toMatch(/<CapaDaPastaDeLogos \/>/);
    expect(fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8')).toContain("'/studio/pasta/logos'");
    expect(fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8')).toContain('encarte-trocar-logo');
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toContain('studio-trocar-logo');
    expect(fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8')).toContain('palco-trocar-logo');
    expect(fs.readFileSync('src/pages/studioai/EncartePage.tsx', 'utf8')).toMatch(/lerLogoDoEncarte\(modelo\.id\)/);
  });
});
