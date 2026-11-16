// F-320 (pedido do dono, 16/11/2026): o vídeo de impacto no padrão do concorrente — uma fita só em cada lugar, sem botão em
// cima de botão, sem a linha embaixo da logo, sem as listras de rachadura desenhadas, a sirene e as batidas com o mesmo som
// do concorrente (logo batendo ≠ texto importante batendo na parede de concreto) e o locutor com voz de rádio.
import fs from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FUNDOS_DO_PALCO, BATIDA_DA_LOGO, projetoDoCarrossel, vinhetaDoPalco } from '@/lib/studio/palco';
import { DURACAO_DA_SUBIDA, SONS } from '@/lib/studio/impacto';
import { inicios } from '@/lib/studio/video/linha';

const f = FUNDOS_DO_PALCO.find((x) => x.id === 'alerta-de-oferta')!;
const produtos = [
  { nome: 'Arroz Tipo 1 Camil 1kg', preco: 4.99, precoDe: 6.49, unidade: 'un', imagem: null },
  { nome: 'Feijão Carioca Camil 1kg', preco: 7.49, precoDe: null, unidade: 'un', imagem: null },
];
const o = { fundo: f, loja: 'Mercado Bom Preço', segundos: 4 };

/** fração de pixels AMARELOS (fita/borda do botão) numa área da imagem */
async function amarelo(arq: string, x0: number, y0: number, x1: number, y1: number) {
  const { data, info } = await sharp(arq).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, a = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * info.width + x) * 3; n++; if (data[i] > 200 && data[i + 1] > 170 && data[i + 2] < 120) a++; }
  return a / n;
}

describe('F-320: impacto igual ao do concorrente', () => {
  it('o fundo Alerta de Oferta não tem mais fita nem botão GRAVADOS (só a nossa fita animada e o nosso botão aparecem)', async () => {
    for (const s of ['v', 'v-st']) {
      const arq = `public/studio/palco/alerta-de-oferta-${s}.webp`;
      expect(await amarelo(arq, 0, 1700, 250, 1920), `${s} fita de baixo à esquerda`).toBeLessThan(0.01);
      expect(await amarelo(arq, 850, 1700, 1080, 1920), `${s} fita de baixo à direita`).toBeLessThan(0.01);
      expect(await amarelo(arq, 300, 1676, 800, 1690), `${s} borda do botão`).toBeLessThan(0.01);
    }
    for (const s of ['h', 'h-st']) {
      const arq = `public/studio/palco/alerta-de-oferta-${s}.webp`;
      expect(await amarelo(arq, 0, 900, 300, 1080), `${s} fita de baixo à esquerda`).toBeLessThan(0.01);
      expect(await amarelo(arq, 710, 952, 1206, 962), `${s} borda do botão`).toBeLessThan(0.01);
    }
    // as fitas animadas: 3, uma em cada lugar, passando para a direita
    expect(f.faixas!.linhas['9:16']).toHaveLength(3);
  });

  it('a abertura no tempo do concorrente: sirene, subida, a logo BATE em 1,6 s com cacos reais e sem listras desenhadas', () => {
    const ab = vinhetaDoPalco('abertura', produtos[0], '9:16', o, 3.6);
    expect(BATIDA_DA_LOGO).toBeCloseTo(1.6);
    expect(ab.efeitos).toMatchObject({ quebra: true, quebraReal: true });
    expect(ab.camadas.some((c) => c.nome === 'Cacos da batida (efeito)')).toBe(true);
    const p = projetoDoCarrossel(produtos, '9:16', o);
    expect(p.clipes[0].duracao).toBeGreaterThanOrEqual(3.6);
    const sons = p.sons ?? [];
    const subida = sons.find((s) => s.som === 'subida')!, logo = sons.find((s) => s.som === 'impacto')!;
    expect(subida.em + DURACAO_DA_SUBIDA).toBeCloseTo(BATIDA_DA_LOGO, 1); // a subida termina NA batida
    expect(logo.em).toBeCloseTo(BATIDA_DA_LOGO, 1);
    // texto importante e preço = parede de concreto; a logo tem o som dela
    const ini = inicios(p.clipes);
    expect(sons.filter((s) => s.som === 'concreto' && s.em > ini[1])).toHaveLength(produtos.length);
    const ed = fs.readFileSync('src/lib/studio/efeitosDeImpacto.ts', 'utf8');
    expect(ed).toContain('if (real) { if (fogo) desenharFogoNaLogo');
  });

  it('os sons são os nossos, novos e no lugar certo (sirene de 3,5 s, batidas de concreto e da logo)', () => {
    for (const k of ['sirene', 'subida', 'impacto', 'concreto', 'whoosh'] as const) {
      expect(SONS[k].src).toContain('?v=');
      const arq = `public${SONS[k].src.split('?')[0]}`;
      expect(fs.existsSync(arq), k).toBe(true);
      expect(fs.statSync(arq).size, k).toBeLessThan(200_000);
    }
    expect(fs.existsSync('scripts/studio/sintetizar-sons.mjs')).toBe(true);
    expect(fs.existsSync('scripts/studio/montar-sons-de-batida.mjs')).toBe(true);
    expect(fs.readFileSync('docs/licencas/SONS_PIXABAY.md', 'utf8')).toContain('hitting-wall');
  });

  it('o fogo atrás da logo esfuma na base (nada de linha reta embaixo do nome)', () => {
    const s = fs.readFileSync('src/lib/studio/efeitosReais.ts', 'utf8');
    expect(s).toContain("c.ancora === 'cima' ? f * 0.5 : f, f]");
  });

  it('o locutor: voz de rádio na prévia e no MP4 e o jeito IMPACTO na geração (sem gerar de novo o que já existe)', () => {
    const m = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(m).toContain('export function vozDeRadio');
    expect((m.match(/vozDeRadio\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const fn = fs.readFileSync('supabase/functions/studio-locucao/index.ts', 'utf8');
    expect(fn).toContain('AJUSTE_IMPACTO');
    expect(fn).toContain("impacto ? `${vozId}|${MODELO}|impacto|${f.texto}` : `${vozId}|${MODELO}|${f.texto}`");
    expect(fs.readFileSync('src/components/studio/PainelDeLocucao.tsx', 'utf8')).toContain("estilo: 'impacto'");
  });
});

describe('F-320: a fala recém-gerada nunca some do vídeo', () => {
  it('o MP4 tenta baixar a fala 3 vezes e a prévia tenta de novo (antes o vídeo saía calado na abertura)', () => {
    const m = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(m).toContain('for (let k = 0; k < 3; k++)');
    expect(m).toContain("n.dataset.tentou = '1'");
  });
});
