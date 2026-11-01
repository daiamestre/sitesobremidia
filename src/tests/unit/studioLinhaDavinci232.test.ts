// F-232 — linha do tempo no estilo DaVinci Resolve: lâmina, arrastar clipe, ímã, timecode e onda do áudio.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { duracaoDoClipe, inicios, novoClipe, projetoVazio, type FaixaDeAudio, type ProjetoDeVideo, type Sobreposicao } from '@/lib/studio/video/linha';
import { cortarEm, encaixar, moverClipePara, picos, pontosDeEncaixe, timecode, umQuadro } from '@/lib/studio/video/edicao';

const semTransicao = { transicao: { tipo: 'corte' as const, duracao: 0 } };
function projeto(): ProjetoDeVideo {
  const p = projetoVazio('16:9');
  const a = novoClipe('video', 'a.mp4', 'A', { duracaoArquivo: 10, fim: 10, ...semTransicao });
  const b = novoClipe('imagem', 'b.jpg', 'B', { duracao: 4, ...semTransicao });
  const c = novoClipe('imagem', 'c.jpg', 'C', { duracao: 6, ...semTransicao });
  const texto = { id: 't1', tipo: 'texto', nome: 'Título', texto: 'OFERTA', de: 2, ate: 8 } as unknown as Sobreposicao;
  const audio: FaixaDeAudio = { id: 'm1', nome: 'Música', src: 'm.mp3', duracaoArquivo: 30, em: 0, inicio: 0, fim: 20, volume: 1, somEntra: 1, somSai: 1, repetir: false };
  return { ...p, clipes: [a, b, c], sobreposicoes: [texto], audios: [audio] };
}

describe('lâmina (corta no ponto clicado)', () => {
  it('corta o clipe de vídeo em dois no instante exato', () => {
    const p = projeto();
    const r = cortarEm(p, { tipo: 'clipe', id: p.clipes[0].id }, 3.5)!;
    expect(r.projeto.clipes).toHaveLength(4);
    expect(r.projeto.clipes[0]).toMatchObject({ inicio: 0, fim: 3.5 });
    expect(r.projeto.clipes[1]).toMatchObject({ id: r.novoId, inicio: 3.5, fim: 10 });
  });
  it('corta foto, texto e áudio; colado na ponta não corta', () => {
    const p = projeto();
    const foto = cortarEm(p, { tipo: 'clipe', id: p.clipes[1].id }, 11)!;
    expect(foto.projeto.clipes.map((c) => duracaoDoClipe(c))).toEqual([10, 1, 3, 6]);
    const t = cortarEm(p, { tipo: 'sob', id: 't1' }, 5)!;
    expect(t.projeto.sobreposicoes.map((s) => [s.de, s.ate])).toEqual([[2, 5], [5, 8]]);
    const a = cortarEm(p, { tipo: 'audio', id: 'm1' }, 12)!;
    expect(a.projeto.audios.map((x) => [x.em, x.inicio, x.fim])).toEqual([[0, 0, 12], [12, 12, 20]]);
    expect(a.projeto.audios[0].somSai).toBe(0); // o corte não abaixa o som no meio da música
    expect(cortarEm(p, { tipo: 'sob', id: 't1' }, 2.05)).toBeNull();
  });
});

describe('arrastar o clipe para outra posição', () => {
  it('o clipe vai para onde o meio dele caiu e a faixa fica sem buracos', () => {
    const p = projeto();
    const [a, b, c] = p.clipes;
    expect(moverClipePara(p, a.id, 12).clipes.map((x) => x.nome)).toEqual(['B', 'C', 'A']);
    expect(moverClipePara(p, c.id, 0).clipes.map((x) => x.nome)).toEqual(['C', 'A', 'B']);
    expect(moverClipePara(p, b.id, 10.3)).toBe(p); // solto no mesmo lugar: nada muda
    const q = moverClipePara(p, a.id, 12);
    const ini = inicios(q.clipes);
    expect(ini).toEqual([0, 4, 10]);
  });
});

describe('ímã, timecode e onda', () => {
  it('encaixa nas pontas dos clipes, dos textos e no cursor (dentro da tolerância)', () => {
    const p = projeto();
    const pts = pontosDeEncaixe(p, 7.3);
    expect(pts).toEqual(expect.arrayContaining([0, 10, 14, 20, 2, 8, 7.3]));
    expect(encaixar(9.92, pts, 0.15)).toBe(10);
    expect(encaixar(7.25, pts, 0.15)).toBe(7.3);
    expect(encaixar(5, pts, 0.15)).toBe(5);
  });
  it('timecode hh:mm:ss:quadro (30 qps) e passo de um quadro', () => {
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(4.4)).toBe('00:00:04:12');
    expect(timecode(3725.5)).toBe('01:02:05:15');
    expect(umQuadro(1, 1)).toBeCloseTo(1 + 1 / 30, 5);
    expect(umQuadro(0, -1)).toBe(0);
  });
  it('a onda do som vira picos de 0 a 1', () => {
    const a = new Float32Array([0, 0.5, -1, 0.25, 0.1, -0.2, 0, 0]);
    expect(Array.from(picos(a, 4)).map((v) => Math.round(v * 100) / 100)).toEqual([0.5, 1, 0.2, 0]);
  });
  it('a linha do tempo tem cabeçalho das faixas, lâmina, ímã, scrub e onda; a página liga os atalhos', () => {
    const ui = fs.readFileSync('src/components/studio/video/LinhaDoTempo.tsx', 'utf8');
    for (const t of ['ferramenta-lamina', 'ferramenta-selecao', 'ferramenta-ima', 'timecode', 'mira-lamina', "id: 'V1'", "id: 'T1'", '<Onda ', 'onPointerDown={scrub}']) expect(ui).toContain(t);
    const pg = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(pg).toMatch(/ctrl && e\.key\.toLowerCase\(\) === 'b'/);
    expect(pg).toMatch(/setFerramenta\('lamina'\)/);
    expect(pg).toMatch(/onCortarEm=\{cortarComLamina\}/);
  });
});

describe('F-233 — pasta "Encartes de Mercado" aberta com os produtos da pessoa', () => {
  it('a pasta tem o painel "Seus produtos" (texto, leitor de código, nome/de/por, fotos reais) e leva os produtos ao editor', () => {
    const pasta = fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8');
    for (const t of ['encartes-texto', 'encartes-aplicar', '<LeitorDeCodigo aoLer={porCodigo} />', 'completarImagens(', 'aria-label="Preço antigo (de)"', 'aria-label="Preço (por)"', 'CHAVE_PRODUTOS_DO_ENCARTE']) expect(pasta).toContain(t);
    expect(fs.readFileSync('src/pages/studioai/PastaPage.tsx', 'utf8')).toMatch(/pastaId === PASTA_ENCARTES \? <PastaDeEncartes \/>/);
    expect(fs.readFileSync('src/pages/studioai/EncartePage.tsx', 'utf8')).toMatch(/sessionStorage\.getItem\(CHAVE_PRODUTOS_DO_ENCARTE\)/);
    // a seção solta de encartes saiu do início: eles ficam só dentro da pasta, como as outras pastas de modelos
    expect(fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8')).not.toMatch(/<EncartesDoStudio/);
  });
});
