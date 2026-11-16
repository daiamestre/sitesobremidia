/**
 * F-315 (pedido do dono, 16/11/2026): no tablet, "Exportar" dava "este aparelho não grava vídeo H.264 em 1080×1920".
 * Agora a exportação procura o melhor que o aparelho faz e, no último caso, grava tocando em WebM — e baixa em qualquer aparelho.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { escolherCodificacao } from '@/lib/studio/video/motor';

/** codificador de tablet barato: só H.264 Baseline/Main, deitado, até 1920×1088, até 30 quadros/s */
const tabletBarato = async (c: VideoEncoderConfig) =>
  c.width <= 1920 && c.height <= 1088 && (c.framerate ?? 30) <= 30 && !c.codec.startsWith('avc1.64');

describe('F-315: exportar vídeo em qualquer aparelho', () => {
  it('computador: grava como pedido (Full HD em pé, High profile)', async () => {
    const p = await escolherCodificacao(1080, 1920, 30, 1, undefined, async () => true);
    expect(p).toMatchObject({ W: 1080, H: 1920, girar: false, fps: 30, escala: 1, codec: 'avc1.640034' });
  });

  it('tablet que só grava deitado: o vídeo em pé sai Full HD gravado deitado com a marca de giro', async () => {
    const p = await escolherCodificacao(1080, 1920, 30, 1, undefined, tabletBarato);
    expect(p).toMatchObject({ W: 1080, H: 1920, girar: true, fps: 30, escala: 1 });
    expect(p!.codec.startsWith('avc1.4D') || p!.codec.startsWith('avc1.42')).toBe(true);
  });

  it('60 quadros/s e 4K no tablet caem para o que ele faz (30 quadros/s, Full HD)', async () => {
    expect(await escolherCodificacao(1080, 1920, 60, 1, undefined, tabletBarato)).toMatchObject({ fps: 30, girar: true, escala: 1 });
    expect(await escolherCodificacao(1920, 1080, 30, 2, undefined, tabletBarato)).toMatchObject({ W: 1920, H: 1080, escala: 1, girar: false });
  });

  it('aparelho só com 720p: usa 720p', async () => {
    const p = await escolherCodificacao(1920, 1080, 30, 1, undefined, async (c) => c.width <= 1280 && c.height <= 720);
    expect(p).toMatchObject({ W: 1280, H: 720, girar: false });
  });

  it('sem H.264 nenhum: null — a tela grava tocando em WebM, sem erro para a pessoa', async () => {
    expect(await escolherCodificacao(1080, 1920, 30, 1, undefined, async () => false)).toBeNull();
    const tela = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');
    expect(tela).toContain("motor.current!.exportar((f) => setExportando(f), { preferirWebm: true })");
    const motor = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(motor).not.toContain('Este aparelho não grava vídeo H.264');
    expect(motor).toContain("rotation: girar ? 90 : 0");
  });

  it('baixar: link na página por 60 s e, no iPhone/iPad, o Compartilhar (Salvar vídeo)', () => {
    const b = fs.readFileSync('src/lib/studioai/exportar.tsx', 'utf8');
    expect(b).toContain('navigator.share({ files: [arquivo]');
    expect(b).toContain('document.body.appendChild(a);');
    expect(b).toContain('60_000');
    expect(fs.readFileSync('src/pages/studioai/ProjetosPage.tsx', 'utf8')).toContain('extensaoDoVideo(v.mime ?? b.type, v.url)');
  });
});
