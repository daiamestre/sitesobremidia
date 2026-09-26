/** F-86 — escudos: nome exibido -> artigo do clube (mesmo vínculo do Sports Engine). Wikitext de TESTE no formato real. */
import { describe, it, expect } from 'vitest';
import { caminhoEscudo, timesDaTabela, timesDosBoxes } from '../../../supabase/functions/_shared/sports/escudos';

describe('escudos: times da fonte', () => {
  it('tabela pt.wikipedia: predefinição {{Futebol X}} a expandir e nome de exibição por código', () => {
    const wt = '| name_FLA = {{Futebol Flamengo}}\n| name_ATP = {{Futebol Athletico Paranaense}}\n| name_ARS = [[Arsenal F.C.|Arsenal]]\n';
    expect(timesDaTabela(wt, { ATP: 'Athletico-PR' })).toEqual([
      { rotulo: 'Flamengo', artigo: null, predefinicao: '{{Futebol Flamengo}}' },
      { rotulo: 'Athletico-PR', artigo: null, predefinicao: '{{Futebol Athletico Paranaense}}' },
      { rotulo: 'Arsenal', artigo: 'Arsenal F.C.', predefinicao: null },
    ]);
  });

  it('Football box (Champions): artigo do link, rótulo sem o ícone do país, sem repetir', () => {
    const box = (a: string, b: string) => `{{#invoke:Football box|main\n|date = {{Start date|2026|9|16}}\n|team1 = ${a}\n|team2 = ${b}\n}}`;
    const wt = box('[[Real Madrid CF|Real Madrid]] {{fbaicon|ESP}}', '{{fbaicon|GER}} [[FC Bayern Munich|Bayern Munich]]')
      + box('[[FC Bayern Munich|Bayern Munich]] {{fbaicon|GER}}', '[[Sabah FK (Azerbaijan)|Sabah]] {{fbaicon|AZE}}');
    expect(timesDosBoxes(wt)).toEqual([
      { rotulo: 'Real Madrid', artigo: 'Real Madrid CF', predefinicao: null },
      { rotulo: 'Bayern Munich', artigo: 'FC Bayern Munich', predefinicao: null },
      { rotulo: 'Sabah', artigo: 'Sabah FK (Azerbaijan)', predefinicao: null },
    ]);
  });

  it('caminho no Storage: legível, sem acento, com o sha1 do arquivo de origem', () => {
    expect(caminhoEscudo('São Paulo', 'abcdef0123456789')).toBe('sao-paulo-abcdef0123.png');
    expect(caminhoEscudo('Bodø/Glimt', '0123456789ff')).toBe('bod-glimt-0123456789.png');
  });
});
