// F-319 (pedido do dono): efeitos de impacto REALISTAS — filmagens reais (fogo, explosão, fumaça, brasas, raio, vidro,
// confete) aplicadas na arte, editáveis como qualquer elemento, iguais na prévia e no MP4.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EFEITOS_REAIS, efeitoPorId, instanteNoEfeito } from '@/lib/studio/efeitosReais';
import { camadaNoPonto, efeitoReal, forma, type Documento } from '@/lib/studio/documento';
import { estiloDoPedido } from '@/lib/studio/sincronizar';
import { abasDe } from '@/components/studio/editor/Paineis';

describe('F-319: efeitos reais', () => {
  it('cada efeito tem a filmagem, o pôster e a ficha de licença', () => {
    const ficha = fs.readFileSync('docs/licencas/EFEITOS_PIXABAY.md', 'utf8');
    expect(EFEITOS_REAIS.length).toBeGreaterThanOrEqual(14);
    for (const e of EFEITOS_REAIS) {
      expect(fs.existsSync(`public/studio/efeitos/${e.id}.mp4`), e.id).toBe(true);
      expect(fs.existsSync(`public/studio/efeitos/${e.id}.webp`), e.id).toBe(true);
      expect(fs.statSync(`public/studio/efeitos/${e.id}.mp4`).size, e.id).toBeLessThanOrEqual(2 * 1024 * 1024); // a trava da Vercel (travaVercel.test.ts)
      expect(ficha, e.id).toContain(`${e.id}.mp4`);
    }
  });

  it('o instante na filmagem: começa no segundo pedido, termina no fim do arquivo; o laço repete com entrada e saída suaves', () => {
    const exp = efeitoReal('x', 'explosao-pequena', 0, 0, 100, 100, { inicio: 1 });
    expect(instanteNoEfeito(exp, 0.5)).toBeNull();
    expect(instanteNoEfeito(exp, 1.5)?.local).toBeCloseTo(0.5);
    expect(instanteNoEfeito(exp, 1 + efeitoPorId('explosao-pequena')!.dur + 0.1)).toBeNull();
    const fogo = efeitoReal('f', 'fogo-subindo', 0, 0, 100, 100, { repetir: true });
    expect(instanteNoEfeito(fogo, 7, 10)?.local).toBeCloseTo(2); // 5 s de laço
    expect(instanteNoEfeito(fogo, 0.15, 10)?.alfa).toBeCloseTo(0.5);
    expect(instanteNoEfeito(fogo, 10.1, 10)).toBeNull();
    expect(instanteNoEfeito({ ...fogo, duracao: 2 }, 3, 10)).toBeNull();
    expect(instanteNoEfeito({ ...exp, velocidade: 2 }, 1.5)?.local).toBeCloseTo(1);
  });

  it('o toque escolhe primeiro os outros elementos (o efeito cobre áreas grandes)', () => {
    const d: Documento = { versao: 2, formato: '16:9', fundo: '#000', camadas: [forma('Caixa', 100, 100, 200, 200), efeitoReal('Fogo', 'parede-de-fogo', 0, 0, 1920, 1080)] };
    expect(camadaNoPonto(d, 150, 150)?.nome).toBe('Caixa');
    expect(camadaNoPonto(d, 1000, 900)?.nome).toBe('Fogo');
  });

  it('o elemento do efeito se edita (trocar, hora, laço, velocidade, força) e anda junto nos dois formatos', () => {
    const c = efeitoReal('Fogo', 'parede-de-fogo', 0, 0, 1920, 1080);
    expect(abasDe(c).map((a) => a.id)).toEqual(expect.arrayContaining(['efeitos', 'animar', 'posicao']));
    expect(estiloDoPedido({ efeito: 'brasas', inicio: 2, repetir: true, velocidade: 1.5, mistura: 'lighter', x: 10 } as never, c)).toEqual({ efeito: 'brasas', inicio: 2, repetir: true, velocidade: 1.5, mistura: 'lighter' });
    const p = fs.readFileSync('src/components/studio/editor/Paineis.tsx', 'utf8');
    for (const x of ['cartao-efeito-real', 'Começa no segundo', 'Repetir sem parar', 'Velocidade', 'Luz mais forte']) expect(p, x).toContain(x);
  });

  it('o MP4 espera cada efeito no quadro exato; a prévia parada redesenha quando ele chega', () => {
    const m = fs.readFileSync('src/lib/studio/video/motor.ts', 'utf8');
    expect(m).toContain('posicionarEfeitos(');
    expect(m).toContain('modoExatoDosEfeitos(true)');
    expect(m).toContain('aoEfeitoPronto(');
    const d = fs.readFileSync('src/lib/studio/desenhar.ts', 'utf8');
    expect(d).toContain("c.tipo === 'efeito'");
  });
});
