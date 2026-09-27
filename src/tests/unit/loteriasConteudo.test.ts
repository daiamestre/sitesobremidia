/** F-94 — robô das Loterias: leitura das duas fontes (amostras REAIS de 27/09/2026) e artes. */
import { describe, it, expect } from 'vitest';
import amostras from '../fixtures/loterias/amostras_27_09_2026.json';
import { LOTERIAS, daCaixa, doEspelho, maisNovo, dataIso, dataLonga, valorCurto, faixaPrincipal } from '../../../scripts/conteudo/loterias-dados.mjs';
import { htmlResultado, htmlProximo } from '../../../scripts/conteudo/cartoes-loterias.mjs';

type Amostra = Record<string, { caixa: unknown; espelho: unknown }>;
const A = amostras as unknown as Amostra;

describe('Loterias — leitura das fontes', () => {
  it('as 9 loterias são lidas da CAIXA e do espelho com o mesmo formato', () => {
    for (const lot of LOTERIAS) {
      const c = daCaixa(lot.slug, A[lot.slug].caixa);
      const e = doEspelho(lot.slug, A[lot.slug].espelho);
      expect(c, lot.slug).not.toBeNull();
      expect(e, lot.slug).not.toBeNull();
      expect(c!.dezenas.length, lot.slug).toBe(e!.dezenas.length);
      expect(c!.proximo.data, lot.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('campos específicos: Mega-Sena, Timemania, Dia de Sorte, Dupla Sena, +Milionária', () => {
    const mega = daCaixa('megasena', A.megasena.caixa)!;
    expect(mega).toMatchObject({ concurso: 3062, data: '2026-09-24', dezenas: ['05', '09', '11', '17', '18', '38'], acumulou: true });
    expect(mega.proximo).toEqual({ concurso: 3063, data: '2026-09-27', estimativa: 45000000 });
    expect(daCaixa('timemania', A.timemania.caixa)!.timeCoracao).toBe('CRB/AL');
    expect(daCaixa('diadesorte', A.diadesorte.caixa)!.mesSorte).toBe('Janeiro');
    expect(daCaixa('duplasena', A.duplasena.caixa)!.dezenas2).toHaveLength(6);
    expect(doEspelho('duplasena', A.duplasena.espelho)!.dezenas2).toHaveLength(6); // espelho junta as 12
    expect(daCaixa('maismilionaria', A.maismilionaria.caixa)!.trevos).toEqual(['3', '6']);
  });

  it('vale o concurso mais novo entre as fontes (o espelho pode atrasar)', () => {
    const c = daCaixa('lotofacil', A.lotofacil.caixa)!;
    const e = doEspelho('lotofacil', A.lotofacil.espelho)!;
    expect(e.concurso).toBe(3788);
    expect(maisNovo(c, e)!.concurso).toBe(3789);
    expect(maisNovo(null, e)!.concurso).toBe(3788);
    expect(maisNovo(null, null)).toBeNull();
  });

  it('resposta inválida nunca vira resultado', () => {
    expect(daCaixa('megasena', null)).toBeNull();
    expect(daCaixa('megasena', { numero: 1 })).toBeNull();
    expect(doEspelho('megasena', { concurso: 1, data: 'x', dezenas: [] })).toBeNull();
  });

  it('datas e valores em português', () => {
    expect(dataIso('24/09/2026')).toBe('2026-09-24');
    expect(dataIso('2026-09-24')).toBeNull();
    expect(dataLonga('2026-09-24')).toBe('quinta, 24/09');
    expect(dataLonga('2026-09-27')).toBe('domingo, 27/09');
    expect(valorCurto(45000000)).toBe('R$ 45 milhões');
    expect(valorCurto(1200000)).toBe('R$ 1,20 milhão');
    expect(valorCurto(8055220.68)).toBe('R$ 8,05 milhões');
    expect(valorCurto(2259.58)).toBe('R$ 2.259,58');
    expect(valorCurto(2500000000)).toBe('R$ 2,50 bilhões');
  });

  it('faixa principal: acumulou ou ganhadores com o prêmio', () => {
    expect(faixaPrincipal(daCaixa('megasena', A.megasena.caixa)!)).toEqual({ acumulou: true, texto: 'ACUMULOU!' });
    expect(faixaPrincipal(daCaixa('lotofacil', A.lotofacil.caixa)!).texto).toBe('1 ganhador — R$ 8,05 milhões');
  });
});

describe('Loterias — artes', () => {
  it('resultado: nome, concurso, todas as dezenas, próximo concurso e aviso legal', () => {
    const lot = LOTERIAS[0];
    const r = daCaixa('megasena', A.megasena.caixa)!;
    const html = htmlResultado(lot, r, 1920, 1080);
    expect(html).toContain('Mega-Sena');
    expect(html).toContain('Concurso 3062 · quinta, 24/09');
    for (const d of r.dezenas) expect(html).toContain(`<span class="bola">${d}</span>`);
    expect(html).toContain('Próximo concurso 3063 · domingo, 27/09 · Estimativa R$ 45 milhões');
    expect(html).toContain('Proibido para menores de 18 anos');
    expect(html).toContain('width:1920px;height:1080px');
  });

  it('próximo sorteio: data e prêmio estimado; sem texto fixo de dias (vem só da CAIXA)', () => {
    const lot = LOTERIAS.find((l) => l.slug === 'maismilionaria')!;
    const html = htmlProximo(lot, daCaixa('maismilionaria', A.maismilionaria.caixa)!, 1080, 1920);
    expect(html).toContain('domingo, 27/09');
    expect(html).toContain('PRÊMIO ESTIMADO');
    expect(html).not.toContain('Sorteios:');
  });

  it('texto da fonte é escapado (sem HTML injetado)', () => {
    const lot = LOTERIAS.find((l) => l.slug === 'timemania')!;
    const r = { ...daCaixa('timemania', A.timemania.caixa)!, timeCoracao: '<script>x</script>' };
    expect(htmlResultado(lot, r, 1920, 1080)).not.toContain('<script>x');
  });
});
