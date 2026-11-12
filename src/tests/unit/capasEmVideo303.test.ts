/**
 * F-303 (pedido do dono, 12/11/2026: tablet M10 travando nas capas): as capas das pastas e da escolha de modelo são
 * VÍDEOS GRAVADOS (MP4 leve em loop) — nada é desenhado ao vivo. Todo modelo de encarte e de palco tem a sua capa.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import indice from '@/lib/studio/capasEmVideo.json';
import { SEGMENTOS_COM_OFERTAS } from '@/lib/studio/pastasDoSegmento';
import { encartesDoSegmento } from '@/lib/studio/encartesOficiais';
import { fundosDoSegmento } from '@/lib/studio/palco';

const capas = indice as Record<string, { video: string; poster: string; largura: number; altura: number; segundos: number }>;

describe('F-303: capas em vídeo', () => {
  it('todo modelo de encarte e de palco de todo segmento tem a capa gravada (MP4 leve + imagem fixa)', () => {
    for (const s of SEGMENTOS_COM_OFERTAS) {
      for (const o of encartesDoSegmento(s)) expect(capas[`encarte-${o.id}`], `encarte-${o.id}`).toBeTruthy();
      for (const f of fundosDoSegmento(s)) expect(capas[`palco-${f.id}`], `palco-${f.id}`).toBeTruthy();
    }
    for (const [id, c] of Object.entries(capas)) {
      expect(fs.existsSync(`public${c.video}`), c.video).toBe(true);
      expect(fs.existsSync(`public${c.poster}`), c.poster).toBe(true);
      expect(fs.statSync(`public${c.video}`).size, `${id} leve`).toBeLessThan(900 * 1024);
      expect(c.largura).toBeLessThanOrEqual(480);
    }
  });
  it('as capas e a escolha de modelo tocam o vídeo; só o vídeo da vez toca em cada capa', () => {
    expect(fs.readFileSync('src/components/studio/EncartesDoStudio.tsx', 'utf8')).toContain('video: v.video, imagem: v.poster');
    const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
    expect(palco).toContain('video: v.video, imagem: v.poster');
    expect(palco).toContain('<VideoDaCapa capa={capaDoPalco(f.id)!} />');
    expect(fs.readFileSync('src/components/studio/PastaDeEncartes.tsx', 'utf8')).toContain('<VideoDaCapa capa={capaDoEncarte(o.id)!} />');
    const capa = fs.readFileSync('src/components/media/CapaQueGira.tsx', 'utf8');
    expect(capa).toContain('if (s.video) return vez');
    const video = fs.readFileSync('src/components/studio/VideoDaCapa.tsx', 'utf8');
    expect(video).toContain('if (naTela) void v.play()');
  });
  it('a Biblioteca de Loop está no menu do Studio e lista todos os vídeos de capa', () => {
    expect(fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8')).toContain("{ nome: 'Biblioteca de Loop', to: '/studio/biblioteca-de-loop', icone: Repeat }"); // F-304: só owner/ADM
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="biblioteca-de-loop" element={<StudioBibliotecaDeLoop />} />');
    expect(fs.readFileSync('src/pages/studioai/BibliotecaDeLoopPage.tsx', 'utf8')).toContain('todasAsCapas()');
    for (const c of Object.values(capas)) expect((c as { kb?: number }).kb, 'tamanho registrado').toBeGreaterThan(0);
  });
});

describe('F-305: capa no formato original', () => {
  it('o vídeo da capa aparece inteiro (a regra global do Player, que corta, não vale nas capas)', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    expect(css).toContain('video.video-inteiro');
    expect(css).toMatch(/video\.video-inteiro[\s\S]*object-fit: contain !important/);
    expect(fs.readFileSync('src/components/media/CapaQueGira.tsx', 'utf8')).toContain("'object-contain video-inteiro'");
    expect(fs.readFileSync('src/components/studio/VideoDaCapa.tsx', 'utf8')).toContain('className="video-inteiro');
  });
});
