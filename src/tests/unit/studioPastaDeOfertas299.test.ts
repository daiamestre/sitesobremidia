/**
 * F-299 (pedido do dono, 11/11/2026): UMA pasta por segmento no Studio (Mercado, Farmácia, Padaria, Adega, Suplementos…)
 * com ENCARTES e PALCO DE OFERTAS dentro; cada uma abre os modelos dela (F-298) e "Editar este modelo" leva à edição.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { SEGMENTOS_COM_OFERTAS, SEGMENTO_DA_PASTA_DE_OFERTAS, infoDaPasta, pastaDeOfertasDe, pastaDeOfertasDaPasta } from '@/lib/studio/pastasDoSegmento';
import { SEGMENTOS_DE_OFERTA } from '@/lib/studio/segmentosDeOferta';

const catalogo = fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8');

describe('F-299: encartes e palco na mesma pasta do segmento', () => {
  it('todo segmento com encartes e palco tem a sua pasta de ofertas', () => {
    expect(SEGMENTOS_COM_OFERTAS).toEqual(['mercado', 'farmacia', ...SEGMENTOS_DE_OFERTA.map((s) => s.id)]);
    for (const s of SEGMENTOS_COM_OFERTAS) {
      expect(SEGMENTO_DA_PASTA_DE_OFERTAS[pastaDeOfertasDe(s)]).toBe(s);
      // a escolha de modelo dos encartes e do palco volta para a pasta do segmento
      expect(pastaDeOfertasDaPasta(infoDaPasta(s).pastaEncartes)).toBe(pastaDeOfertasDe(s));
      expect(pastaDeOfertasDaPasta(infoDaPasta(s).pastaPalco)).toBe(pastaDeOfertasDe(s));
    }
  });
  it('o Studio mostra UM cartão por segmento (sem os cartões separados de encartes e de palco)', () => {
    expect(catalogo).toContain('<CartaoDaPastaDeOfertas segmento="mercado" />');
    expect(catalogo).toContain('<CartaoDaPastaDeOfertas segmento="farmacia"');
    expect(catalogo).toContain('<CartaoDaPastaDeOfertas key={sg.id} segmento={sg.id}');
    expect(catalogo).not.toContain('data-testid="studio-pasta-palco"');
    expect(catalogo).not.toContain('data-testid="studio-pasta-encartes"');
    expect(catalogo).not.toContain('studio-pasta-palco-${sg.id}');
  });
  it('a pasta do segmento abre as duas pastas e a escolha de modelo volta para ela', () => {
    const pasta = fs.readFileSync('src/components/studio/PastaDeOfertas.tsx', 'utf8');
    expect(pasta).toContain('titulo="Encartes"');
    expect(pasta).toContain('titulo="Palco de Ofertas"');
    expect(fs.readFileSync('src/pages/studioai/PastaPage.tsx', 'utf8')).toContain('SEGMENTO_DA_PASTA_DE_OFERTAS[pastaId]');
    for (const f of ['src/components/studio/PalcoDeOfertas.tsx', 'src/components/studio/PastaDeEncartes.tsx'])
      expect(fs.readFileSync(f, 'utf8')).toContain('voltar={`/studio/pasta/${pastaDeOfertasDe(segmento)}`}');
  });
  it('as capas passam em loop: o cartão alterna encarte e palco; cada pasta passa os modelos dela, em movimento', () => {
    const pasta = fs.readFileSync('src/components/studio/PastaDeOfertas.tsx', 'utf8');
    expect(pasta).toContain('intercalar(encartes, palcos)');
    expect(pasta).toContain('<CapaDosEncartes segmento={segmento} />');
    const enc = fs.readFileSync('src/components/studio/EncartesDoStudio.tsx', 'utf8');
    expect(enc).toContain('export function useSlidesDosEncartes');
    expect(enc).toContain('encarteEmMovimento(documentoDoEncarteOficial(o, cesta, {}, f))} animar sempre');
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('export function useSlidesDosPalcos');
    expect(palco).toContain('return fundosDoSegmento(segmento).map((f) => {');
    expect(palco).toContain('const amostra = comPreco.length ? comPreco.slice(0, 3) : exemplos;');
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toContain('animar sempre className="h-full w-full" />');
  });
  it('"Editar este modelo" vai direto para a edição (encarte: o editor; palco: a mesa do palco)', () => {
    expect(fs.readFileSync('src/components/studio/EncarteOficial.tsx', 'utf8')).toContain('export function enderecoDoEditorDoEncarte');
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toContain('navegar(enderecoDoEditorDoEncarte(o, s.produtos, s.quantos))');
  });
});
