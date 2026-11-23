/**
 * F-355 (pedido do dono, 20/11/2026) — as logos de promoção que o dono manda entram na galeria de logos do Studio
 * (o "Trocar logo" da criação de vídeo, dos palcos e dos encartes) para TODOS os usuários, com miniatura.
 * REGRA DO DONO: a logo entra EXATAMENTE como ele mandou, o mesmo arquivo, sem recorte nem mudança, em NENHUMA logo.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LOGOS_DE_PROMOCAO } from '@/lib/studio/logosDePromocao';
import { LOGOS_OFICIAIS, gravarLogoDoEncarte, lerLogoDoEncarte, logosDaPasta } from '@/lib/studio/logos';
import { FUNDOS_DO_PALCO, projetoDoCarrossel } from '@/lib/studio/palco';
import { duasLinhas, tamanhoQueCabe, valoresIniciais } from '@/lib/studio/logoPersonalizada';

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
      // REGRA DO DONO: o MESMO arquivo que ele mandou, byte por byte (nada recortado, nada mudado, por fora ou por dentro).
      // Única exceção (pedida por ele em 22/11/2026): a logo com dizeres de modelo publica a versão só sem esses dizeres.
      const orig = `../logos-de-promocao-originais/${item.id}${l.url.slice(l.url.lastIndexOf('.'))}`;
      if (fs.existsSync(orig)) {
        const marcaDoDono = createHash('sha256').update(fs.readFileSync(orig)).digest('hex').slice(0, 8);
        const limpa = `../logos-de-promocao-originais/${item.id}-limpa-${marcaDoDono}.png`;
        expect((item as { limpa?: boolean }).limpa === true, l.id).toBe(fs.existsSync(limpa));
        expect(fs.readFileSync(`public${l.url}`).equals(fs.readFileSync(fs.existsSync(limpa) ? limpa : orig)), l.id).toBe(true);
      }
      expect(l.url, l.id).toMatch(/-[0-9a-f]{8}\.[a-z]+$/); // nome novo a cada troca: o aparelho nunca mostra a versão antiga
      // o nome traz a marca do próprio conteúdo: se alguém mexer no arquivo, a marca não bate
      expect(l.url, l.id).toContain(createHash('sha256').update(fs.readFileSync(`public${l.url}`)).digest('hex').slice(0, 8));
    }
  }, 120_000);
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
  it('exceção do dono: só os dizeres de modelo saem; fora da caixa deles a logo é idêntica ao arquivo do dono, pixel a pixel', async () => {
    const cfg = JSON.parse(fs.readFileSync('scripts/studio/espaco-da-logo.json', 'utf8')) as Record<string, { zonas: Array<{ limites: number[]; modo: string }> }>;
    const r = fs.readFileSync('scripts/studio/espaco-da-logo.mjs', 'utf8');
    expect(r).not.toMatch(/BiRefNet|removeAlpha|trim\(/); // nada de IA de recorte nem de cortar a logo
    for (const [id, c] of Object.entries(cfg)) {
      if (id.startsWith('_')) continue;
      const orig = `../logos-de-promocao-originais/${id}.png`;
      if (!fs.existsSync(orig)) continue; // os originais ficam fora do repositório (só no PC do dono)
      const marca = createHash('sha256').update(fs.readFileSync(orig)).digest('hex').slice(0, 8);
      const [a, b] = await Promise.all([orig, `../logos-de-promocao-originais/${id}-limpa-${marca}.png`].map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      expect([b.info.width, b.info.height], id).toEqual([a.info.width, a.info.height]);
      const W = a.info.width; let foraDaCaixa = 0;
      const naZona = (x: number, y: number) => c.zonas.some(({ limites: [x0, y0, x1, y1] }) => x >= x0 && y >= y0 && x < x1 && y < y1);
      for (let k = 0; k < W * a.info.height; k++) {
        if (a.data.readUInt32LE(k * 4) === b.data.readUInt32LE(k * 4)) continue;
        if (!naZona(k % W, Math.floor(k / W))) foraDaCaixa++;
      }
      expect(foraDaCaixa, `${id}: pixels mudados fora da caixa dos dizeres`).toBe(0);
      // NADA RECORTADO (reclamação do dono, 22/11/2026: "a Black Friday está toda recortada"): nenhum ponto do desenho some
      let furos = 0; for (let k = 0; k < W * a.info.height; k++) if (a.data[k * 4 + 3] > 200 && b.data[k * 4 + 3] < a.data[k * 4 + 3] - 8) furos++;
      expect(furos, `${id}: pontos do desenho que ficaram transparentes`).toBe(0);
      if (c.zonas.some((z) => z.modo === 'xadrez')) { // a vaga da logo do usuário é só o miolo cinza do xadrez, nunca o desenho colorido
        const v = await sharp(`../logos-de-promocao-originais/${id}-vaga-${marca}.png`).ensureAlpha().raw().toBuffer();
        let naVaga = 0, coloridos = 0;
        for (let k = 0; k < W * a.info.height; k++) if (v[k * 4 + 3] > 128) { naVaga++; const [r, g, bl] = [a.data[k * 4], a.data[k * 4 + 1], a.data[k * 4 + 2]]; if (Math.max(r, g, bl) - Math.min(r, g, bl) > 40) coloridos++; }
        expect(naVaga, id).toBeGreaterThan(20000);
        expect(coloridos / naVaga, `${id}: desenho colorido dentro da vaga`).toBeLessThan(0.01);
      }
    }
  }, 120_000);
  it('faixas e espaços: o usuário escreve o nome da empresa e põe a logo dele (opcional), dentro da logo', async () => {
    const comEspaco = LOGOS_DE_PROMOCAO.filter((l) => l.espacos);
    expect(comEspaco.map((l) => l.id).sort()).toEqual(['promocao-black-friday-dados', 'promocao-esquenta-black-friday-laranja', 'promocao-natal-de-ofertas-gorro', 'promocao-ofertas-de-natal-faixa', 'promocao-quarta-das-carnes', 'promocao-sexta-da-carne-brasa']);
    for (const l of comEspaco) {
      const e = l.espacos!;
      expect(e.textos.length, l.id).toBeGreaterThan(0);
      for (const t of e.textos) { const [x, y, w, h] = t.caixa; expect(x >= 0 && y >= 0 && x + w <= l.largura && y + h <= l.altura, `${l.id} ${t.id}`).toBe(true); }
      if (e.logo?.circulo) { const [cx, cy, r] = e.logo.circulo; expect(cx - r >= 0 && cy - r >= 0 && cx + r <= l.largura && cy + r <= l.altura, l.id).toBe(true); }
      if (e.vaga) expect(fs.existsSync(`public${e.vaga}`), l.id).toBe(true);
    }
    // começa com o nome da empresa (o mesmo do Palco de Ofertas); a logo do usuário só entra se ele puser
    localStorage.setItem('studio-locucao-loja', 'Mercado Bom Preço');
    const v = valoresIniciais(comEspaco[0].id, comEspaco[0].espacos!);
    expect(Object.values(v.textos).every((t) => t === 'MERCADO BOM PREÇO')).toBe(true);
    expect(v.logoUrl).toBeNull();
    localStorage.removeItem('studio-locucao-loja');
    expect(tamanhoQueCabe((t) => t * 10, 500, 80)).toBe(50);
    expect(duasLinhas('SUPERMERCADO BOM PRECO')).toEqual(['SUPERMERCADO', 'BOM PRECO']);
  });
  it('pastas (pedido do dono): toda logo oficial está numa pasta de segmento ou de data comemorativa', async () => {
    const { PASTAS_DE_LOGOS, logosDaPastaDe } = await import('@/lib/studio/pastasDeLogos');
    const ids = PASTAS_DE_LOGOS.map((p) => p.id);
    for (const l of LOGOS_OFICIAIS) expect(ids, l.id).toContain(l.pasta);
    for (const p of ['mercado', 'acougue', 'farmacia', 'padaria', 'black-friday', 'natal', 'dia-das-maes', 'dia-dos-pais', 'sao-joao', 'carnaval']) expect(ids).toContain(p);
    expect(logosDaPastaDe(LOGOS_OFICIAIS, 'black-friday').map((l) => l.id)).toContain('promocao-black-friday-dados');
    expect(logosDaPastaDe(LOGOS_OFICIAIS, 'natal').length).toBeGreaterThan(10);
  });
  it('meta do dono: 8 logos por pasta, com a próxima pasta indicada (todas as pastas entram na ordem da meta)', async () => {
    const { PASTAS_DE_LOGOS, ORDEM_DA_META, META_DE_LOGOS_POR_PASTA, progressoDaMeta } = await import('@/lib/studio/pastasDeLogos');
    expect(META_DE_LOGOS_POR_PASTA).toBe(8);
    expect([...ORDEM_DA_META].sort()).toEqual(PASTAS_DE_LOGOS.map((p) => p.id).sort());
    const m = progressoDaMeta(LOGOS_OFICIAIS);
    for (const p of m.pastas) expect(p.tem + p.falta >= 8, p.pasta.id).toBe(true);
    expect(m.proxima?.completa ?? false).toBe(false);
    expect(m.pastas.slice(0, m.pastas.indexOf(m.proxima!)).every((p) => p.completa)).toBe(true);
  });
  it('logo genérica vai para as pastas dos segmentos da cor dela (pedido do dono); logo de segmento/data fica só na dela', async () => {
    const { logosDaPastaDe, pastasDaLogo } = await import('@/lib/studio/pastasDeLogos');
    const pega = (id: string) => LOGOS_OFICIAIS.find((l) => l.id === id)!;
    for (const l of LOGOS_OFICIAIS.filter((x) => x.pasta === 'mercado')) expect(l.cores?.length, l.id).toBeGreaterThan(0);
    for (const l of LOGOS_OFICIAIS.filter((x) => x.pasta !== 'mercado')) expect(l.cores, l.id).toBeUndefined();
    expect(pastasDaLogo(pega('promocao-ofertas-do-dia-verde'))).toEqual(expect.arrayContaining(['mercado', 'farmacia', 'hortifruti']));
    expect(pastasDaLogo(pega('promocao-ofertas-do-dia-carrinho'))).toEqual(expect.arrayContaining(['mercado', 'farmacia']));
    expect(pastasDaLogo(pega('promocao-black-friday-dados'))).toEqual(['black-friday']);
    expect(logosDaPastaDe(LOGOS_OFICIAIS, 'farmacia').map((l) => l.id)).toEqual(expect.arrayContaining(['oficial-ofertas-de-farmacia', 'promocao-ofertas-do-dia-verde', 'promocao-oferta-do-dia']));
  });
});
