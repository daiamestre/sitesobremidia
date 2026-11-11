/**
 * F-296 (pedido do dono, 10/11/2026):
 * - os modelos de antes de cada segmento continuam EXATAMENTE como eram (primeiro da galeria, mesmas artes);
 * - os modelos novos entram como COMPLEMENTARES, numa galeria de modelos (pastas) de cada segmento;
 * - nada do encarte/palco de MERCADO aparece na edição dos outros (fundo do documento, fundo do vídeo, trocas);
 * - flash, clarão, luz e brilho saem na COR DO ENCARTE, girada pelo tom que o cliente escolheu;
 * - cada modelo é dono de si: dados do encarte e ajustes do palco guardados por modelo; projeto com a identidade dele.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ENCARTES_OFICIAIS, documentoDoEncarteOficial, encartesDoSegmento, ehModeloComplementar, formatosDoEncarte } from '@/lib/studio/encartesOficiais';
import { fundosDoSegmento, palcoDoProduto, projetoDoCarrossel } from '@/lib/studio/palco';
import { SEGMENTOS_DE_OFERTA, idDaArte } from '@/lib/studio/segmentosDeOferta';
import { COMPOSICOES_DOS_ENCARTES, COMPOSICOES_DOS_PALCOS } from '@/lib/studio/composicoesDosSegmentos';
import { corDoDocumento, girarMatiz } from '@/lib/studio/corDaArte';
import { desenharTransicao } from '@/lib/studio/video/efeitos';

const CORES_DO_MERCADO = ['#1e3fd0', '#c40f24', '#3a0209'];
const produto = { nome: 'Pão de Forma Wickbold 500g', preco: 7.99, precoDe: null, unidade: null, imagem: { url: 'https://x/p.png', fonte: 'MARCA' as const } };
const segmentos = ['farmacia', ...SEGMENTOS_DE_OFERTA.map((s) => s.id)] as const;
const original = (s: string) => (s === 'farmacia' ? 'saude-em-oferta' : idDaArte(s as never));

describe('F-296: galeria de modelos de cada segmento', () => {
  it.each(segmentos)('%s: o modelo de antes é o primeiro e o complementar vem depois, com arte própria', (s) => {
    const enc = encartesDoSegmento(s);
    expect(enc[0].id).toBe(original(s));
    expect(ehModeloComplementar(enc[0])).toBe(false);
    expect(enc.map((e) => e.id)).toContain(COMPOSICOES_DOS_ENCARTES[s].id);
    const pal = fundosDoSegmento(s);
    expect(pal[0].id).toBe(original(s));
    expect(pal.map((f) => f.id)).toContain(COMPOSICOES_DOS_PALCOS[s].id);
    const c = encartesDoSegmento(s).find((e) => e.id === COMPOSICOES_DOS_ENCARTES[s].id)!;
    for (const f of formatosDoEncarte(c)) expect(fs.existsSync(`public${c.formatos[f]!.fundoLimpo}`), f).toBe(true);
    for (const v of ['v', 'h', 'v-st', 'h-st']) expect(fs.existsSync(`public/studio/palco/${COMPOSICOES_DOS_PALCOS[s].id}-${v}.webp`)).toBe(true);
  });
  it('os modelos de antes continuam com os arquivos de antes (o gerador não grava por cima deles)', () => {
    const g = fs.readFileSync('scripts/studio/gerar-segmentos.mjs', 'utf8');
    expect(g).toContain('${P}/${cp.id}-${f}.webp');
    expect(g).toContain('const t = TEMAS[seg], ce = COMPOSICOES_DOS_ENCARTES[seg], cp = COMPOSICOES_DOS_PALCOS[seg], id = ce.id;');
    for (const c of Object.values(COMPOSICOES_DOS_ENCARTES)) expect(c.id).toMatch(/-em-oferta-[a-z]+$/);
    for (const c of Object.values(COMPOSICOES_DOS_PALCOS)) expect(c.id).toMatch(/-em-oferta-[a-z]+$/);
  });
  it('as pastas mostram os modelos para escolher (encartes e palco) — F-298: antes da edição', () => {
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toContain('<EscolhaDeModelo titulo={info.tituloEncartes}');
    expect(fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8')).toContain('<EscolhaDeModelo titulo={info.tituloPalco}');
  });
});

describe('F-296: nada do mercado na edição dos outros encartes e palcos', () => {
  it('o documento de cada encarte fora do mercado tem a cor DELE', () => {
    for (const e of ENCARTES_OFICIAIS.filter((x) => (x.segmento ?? 'mercado') !== 'mercado')) {
      const d = documentoDoEncarteOficial(e, [produto], {}, '9:16');
      expect(CORES_DO_MERCADO, e.id).not.toContain(d.fundo.toLowerCase());
      expect(d.corTema, e.id).toBeTruthy();
    }
  });
  it.each(segmentos)('palco de %s: documento e vídeo (o que aparece nas trocas) na cor do palco, nunca a do mercado', (s) => {
    for (const fundo of fundosDoSegmento(s)) for (const formato of ['9:16', '16:9'] as const) {
      const d = palcoDoProduto(produto, formato, { fundo });
      expect(CORES_DO_MERCADO, fundo.id).not.toContain(d.fundo.toLowerCase());
      const v = projetoDoCarrossel([produto, produto], formato, { fundo });
      expect(CORES_DO_MERCADO, fundo.id).not.toContain(v.fundo.toLowerCase());
      for (const c of v.clipes) expect(c.documento?.camadas[0].src ?? '', fundo.id).toContain(fundo.id);
    }
  });
});

describe('F-296: flash, luz e brilho na cor do encarte', () => {
  it('a cor gira igual ao filtro hue-rotate da tela (rosa vira rosa)', () => {
    expect(girarMatiz('#ff0000', 0)).toBe('#ff0000');
    const verdeGirado = girarMatiz('#0a9a50', 180);
    expect(verdeGirado).not.toBe('#0a9a50');
    const d = palcoDoProduto(produto, '9:16', { fundo: fundosDoSegmento('padaria')[0], ajustes: { '9:16': { 'Fundo oficial': { matiz: 120 } as never } } });
    expect(corDoDocumento(d)).toBe(girarMatiz(fundosDoSegmento('padaria')[0].corTema, 120));
  });
  it('a troca "flash" pinta na cor recebida, não em branco', () => {
    const pintado: string[] = [];
    const estado: Record<string, unknown> = {};
    const ctx = new Proxy(estado, {
      get: (t, k) => (k === 'fillRect' ? () => pintado.push(String(t.fillStyle)) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k as string] : () => undefined),
      set: (t, k, v) => { t[k as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    desenharTransicao(ctx, 'flash', 0.5, 100, 100, () => {}, () => {}, '#e5257a');
    expect(pintado.some((c) => c !== '#ffffff' && c.startsWith('#'))).toBe(true);
    expect(pintado).not.toContain('#fff');
  });
  it('o motor do vídeo e o carrossel usam a cor da arte', () => {
    expect(fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8')).toContain('corDoDocumento(a.clipe.documento)');
    expect(fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8')).toContain('luzDaTroca(TROCA[troca].luz!, corDoDocumento(');
  });
});

describe('F-296: cada modelo é dono de si', () => {
  it('encarte guarda logo/telefone/endereço por modelo e o palco guarda os ajustes por fundo', () => {
    const enc = fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8');
    expect(enc).toContain('localStorage.setItem(chaveDosDados(e.id)');
    const pal = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(pal).toContain('porFundo.current[fundoId] = { textoBotao, movimento, ajustes };');
    expect(pal).toContain('trocarFundo(modeloDoLink)');
  });
  it('o projeto salvo de um encarte leva a identidade dele (não a do modelo "Ofertas da Semana")', () => {
    const ed = fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8');
    expect(ed).toContain('modeloId: pronta ? idDaArtePronta(pronta.id) : base.id');
    expect(ed).toContain("etiquetas: pronta ? ['novo']");
  });
});
