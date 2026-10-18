/**
 * F-198 (substitui o padrão "básico" do F-188) — todo vídeo sai na MELHOR qualidade que a TV Box (MXQ 4K / Rockchip,
 * decodificador de hardware) aguenta: H.264 High 4.1, até 1920, fps do original até 30, CRF 19 com teto de 8 Mbps.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('.github/workflows/compress-video.yml', 'utf8');

describe('F-198 · esteira de vídeo em alta qualidade para TV grande', () => {
  it('codifica em H.264 High 4.1 por qualidade constante, com teto de 8 Mbps', () => {
    expect(yml).toContain('-profile:v high -level:v 4.1');
    expect(yml).toContain('-crf 19 -maxrate 8000k -bufsize 16000k');
    expect(yml).not.toContain('fps=24');
    expect(yml).not.toContain('2400000');
  });

  it('mantém o fps do original até 30 e nunca aumenta a imagem', () => {
    expect(yml).toContain("BEGIN{print (f<=30.5)?1:0}");
    expect(yml).toContain('FILTRO="$ESCALA,fps=30"');
    expect(yml).toContain("scale='min(1920,iw)':-2:flags=lanczos");
  });

  it('vídeo que já está bom fica como está; dá para refazer a partir do original', () => {
    expect(yml).toContain('[ "${BITS:-0}" -le 10000000 ]');
    expect(yml).toContain('[ "$PERFIL" = "High" ]');
    expect(yml).toContain('REPROCESSAR: ${{ github.event.client_payload.reprocessar }}');
    expect(yml).toContain('NOVO="q/${F}.mp4"');
  });

  it('travas de antes: resultado conferido e original preservado', () => {
    expect(yml).toContain('d<=0.5');
    expect(yml).toContain('NÃO apaga o original');
  });
});
