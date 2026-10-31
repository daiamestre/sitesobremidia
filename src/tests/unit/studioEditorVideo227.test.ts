// F-227 — Editor de vídeo do SOBRE MÍDIA Studio (estilo CapCut/KineMaster): linha do tempo, cortes, transições, efeitos.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  AJUSTES_NEUTROS, cortar, dividir, duracaoDoClipe, duracaoTotal, formatarTempo, inicios, noTempo, novoClipe, projetoVazio, tempoNoArquivo, transicaoEntre, volumeNoTempo,
  type Sobreposicao,
} from '@/lib/studio/video/linha';
import { FILTROS, TRANSICOES, caixaDaMidia, filtroDoClipe } from '@/lib/studio/video/efeitos';

const video = (d = 10, o = {}) => novoClipe('video', 'blob:x', 'V', { duracaoArquivo: d, fim: d, ...o });
const foto = (o = {}) => novoClipe('imagem', 'blob:y', 'F', o);

describe('linha do tempo', () => {
  it('clipes em sequência, com a transição sobrepondo o fim de um e o começo do outro', () => {
    const c = [video(10), foto({ duracao: 4 })]; // transição padrão: dissolver 0,5 s
    expect(transicaoEntre(c, 0)).toBe(0.5);
    expect(inicios(c)).toEqual([0, 9.5]);
    expect(duracaoTotal({ clipes: c, sobreposicoes: [], audios: [] })).toBe(13.5);
    const meio = noTempo(c, 9.75);
    expect(meio.atual?.indice).toBe(0);
    expect(meio.proximo?.indice).toBe(1);
    expect(meio.transicao).toBeCloseTo(0.5, 5);
    expect(noTempo(c, 12).atual?.indice).toBe(1);
    expect(noTempo(c, 12).proximo).toBeNull();
  });
  it('corte seco não sobrepõe; transição nunca passa de metade do clipe', () => {
    const c = [video(10, { transicao: { tipo: 'corte', duracao: 0 } }), foto({ duracao: 4 })];
    expect(inicios(c)).toEqual([0, 10]);
    const curtos = [foto({ duracao: 1, transicao: { tipo: 'zoom', duracao: 2 } }), foto({ duracao: 1 })];
    expect(transicaoEntre(curtos, 0)).toBe(0.5);
  });
  it('velocidade muda a duração; o segundo do arquivo acompanha', () => {
    const c = video(10, { inicio: 2, fim: 8, velocidade: 2 });
    expect(duracaoDoClipe(c)).toBe(3);
    expect(tempoNoArquivo(c, 1)).toBe(4);
    expect(tempoNoArquivo(c, 99)).toBe(8);
  });
  it('dividir corta o clipe em dois no cursor (vídeo e foto)', () => {
    const [a, b] = dividir(video(10), 4)!;
    expect([a.inicio, a.fim, b.inicio, b.fim]).toEqual([0, 4, 4, 10]);
    expect(a.transicao.tipo).toBe('corte');
    expect(b.id).not.toBe(a.id);
    const [f1, f2] = dividir(foto({ duracao: 5 }), 2)!;
    expect([f1.duracao, f2.duracao]).toEqual([2, 3]);
    expect(dividir(video(10), 0.05)).toBeNull();
  });
  it('cortar pelas pontas respeita o arquivo e o mínimo de 0,2 s', () => {
    const c = video(10);
    expect(cortar(c, 'inicio', -3).inicio).toBe(0);
    expect(cortar(c, 'fim', 50).fim).toBe(10);
    expect(cortar({ ...c, inicio: 5 }, 'fim', 5.05).fim).toBeCloseTo(5.2, 5);
    expect(cortar(foto(), 'fim', 0.1).duracao).toBe(0.3);
  });
  it('volume com entrada e saída suaves', () => {
    expect(volumeNoTempo(1, 0, 10, 2, 2)).toBe(0);
    expect(volumeNoTempo(1, 1, 10, 2, 2)).toBe(0.5);
    expect(volumeNoTempo(1, 5, 10, 2, 2)).toBe(1);
    expect(volumeNoTempo(1, 9, 10, 2, 2)).toBe(0.5);
  });
  it('textos/elementos por cima contam na duração; projeto vazio tem 3 s para começar', () => {
    const s = { de: 0, ate: 7 } as Sobreposicao;
    expect(duracaoTotal({ clipes: [], sobreposicoes: [s], audios: [] })).toBe(7);
    expect(duracaoTotal(projetoVazio())).toBe(3);
    expect(formatarTempo(65.25)).toBe('01:05.3');
  });
});

describe('efeitos', () => {
  it('12 filtros e 11 transições, como nos apps de edição', () => {
    expect(FILTROS).toHaveLength(12);
    expect(TRANSICOES).toHaveLength(11);
    expect(filtroDoClipe('nenhum', AJUSTES_NEUTROS)).toBe('none');
    expect(filtroDoClipe('pb', { ...AJUSTES_NEUTROS, brilho: 120, desfoque: 4 }, 0.5)).toBe('grayscale(1) contrast(1.12) brightness(120%) blur(2.0px)');
  });
  it('enquadrar: encher a tela corta; mostrar inteiro cabe na tela', () => {
    const cobrir = caixaDaMidia(1000, 1000, 1920, 1080, { ajuste: 'cobrir', focoX: 50, focoY: 50 }, 1);
    expect(cobrir.dw).toBe(1920);
    expect(cobrir.dh).toBe(1920);
    const conter = caixaDaMidia(1000, 1000, 1920, 1080, { ajuste: 'conter', focoX: 50, focoY: 50 }, 1);
    expect(conter.dh).toBe(1080);
    expect(conter.dx).toBe(420);
  });
});

describe('ligações do editor de vídeo', () => {
  it('rota, menu do Studio, Meus Projetos, atalho no início e "Levar para o vídeo" no editor de imagens', () => {
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="video/:projetoId" element={<StudioVideo />} />');
    expect(fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8')).toContain("{ nome: 'Editor de vídeo', to: '/studio/video'");
    expect(fs.readFileSync('src/pages/studioai/ProjetosPage.tsx', 'utf8')).toContain('`/studio/video/${p.id}`');
    expect(fs.readFileSync('src/pages/studioai/EditorPage.tsx', 'utf8')).toContain('studio-levar-video');
    expect(fs.readFileSync('src/pages/studioai/CatalogoPage.tsx', 'utf8')).toContain('atalho-editor-video');
  });
  it('exporta com som (AAC no MP4/Opus no WebM) e salva na galeria na pasta "Vídeos do Studio" (anunciante até 20 s)', () => {
    expect(fs.readFileSync('src/lib/studio/video.ts', 'utf8')).toContain('avc1.640028,mp4a.40.2');
    const p = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(p).toContain("chave: 'studio-videos'");
    expect(p).toContain('clienteId ? 20 : 180');
    const m = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(m).toContain('createMediaElementSource');
    expect(m).toContain('sm=cors'); // foto/vídeo já mostrado na galeria sem permissão: busca de novo
  });
});
