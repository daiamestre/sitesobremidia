/** P-31 / F-281 — Modo LED (Fase 1): painéis no tamanho e posição exatos que o processador do telão lê da saída do PC. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { escreverPaineis, lerPaineis } from '@/pages/LedPage';

describe('F-281 Modo LED', () => {
  it('lê e escreve a lista de painéis (código da tela + área em pixels)', () => {
    const ps = lerPaineis('TELA-1@0,0,448,256; TELA-1@448,0,448,256;ruim@1,2;X@0,0,4,4');
    expect(ps).toEqual([{ tela: 'TELA-1', x: 0, y: 0, w: 448, h: 256 }, { tela: 'TELA-1', x: 448, y: 0, w: 448, h: 256 }]);
    expect(escreverPaineis(ps)).toBe('TELA-1@0,0,448,256;TELA-1@448,0,448,256');
  });
  it('a rota /led existe e cada painel usa o player web de sempre (o Player Android não muda)', () => {
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="/led" element={<LedPage />} />');
    expect(fs.readFileSync('src/pages/LedPage.tsx', 'utf8')).toContain('src={`/player/${encodeURIComponent(p.tela)}`}');
  });
});
