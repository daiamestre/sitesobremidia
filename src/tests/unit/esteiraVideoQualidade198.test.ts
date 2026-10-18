/**
 * F-188 — todo vídeo enviado sai no padrão básico das TV Box MXQ 4K: H.264 Main 4.0, 24 fps, ~2,4 Mbps, lado maior até 1920.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('.github/workflows/compress-video.yml', 'utf8');

describe('F-188 · esteira de vídeo no padrão básico a 24 fps', () => {
  it('codifica em H.264 Main nível 4.0 e reduz para 24 fps', () => {
    expect(yml).toContain('-profile:v main -level:v 4.0');
    expect(yml).toContain('FILTRO="$ESCALA,fps=24"');
    expect(yml).not.toContain('-profile:v high');
  });

  it('limita a taxa a 2,4 Mbps e nunca acima de 85% da original', () => {
    expect(yml).toContain('ALVO=$(( ${BITS:-2400000} * 85 / 100 )); [ "$ALVO" -gt 2400000 ] && ALVO=2400000');
    expect(yml).toContain('-b:v "$ALVO" -maxrate "$TETO" -bufsize "$BUF" -g 48 -keyint_min 48');
  });

  it('só deixa como está o vídeo que já cumpre o padrão', () => {
    expect(yml).toContain('[ "${BITS:-0}" -le 3000000 ]');
    expect(yml).toContain('[ "$FPS_OK" = "1" ]');
    expect(yml).toContain('[ "$PERFIL" = "Main" ]');
  });

  it('mantém as travas de antes: lado maior até 1920, resultado conferido e original preservado', () => {
    expect(yml).toContain("scale='min(1920,iw)':-2");
    expect(yml).toContain('[ "$T2" -ge "$T1" ]');
    expect(yml).toContain('NÃO apaga o original');
  });
});
