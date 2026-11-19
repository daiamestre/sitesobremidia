// F-345: o microfone do Editor de Áudio diz o motivo e COMO liberar em cada aparelho
import { describe, expect, it } from 'vitest';
import { aparelhoDoMicrofone, motivoDoErroDoMicrofone, PASSOS_DO_MICROFONE } from '@/components/studio/audio/EditorDeAudio';

describe('F-345 microfone do Editor de Áudio', () => {
  it('classifica os erros do navegador', () => {
    expect(motivoDoErroDoMicrofone({ name: 'NotAllowedError' })).toBe('negado');
    expect(motivoDoErroDoMicrofone({ name: 'NotFoundError' })).toBe('sem-microfone');
    expect(motivoDoErroDoMicrofone({ name: 'NotReadableError' })).toBe('ocupado');
    expect(motivoDoErroDoMicrofone(new Error('x'))).toBe('outro');
  });
  it('reconhece iPhone, Android, computador e navegador de dentro do Instagram/WhatsApp', () => {
    expect(aparelhoDoMicrofone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iphone');
    expect(aparelhoDoMicrofone('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('android');
    expect(aparelhoDoMicrofone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0')).toBe('app-interno');
    expect(aparelhoDoMicrofone('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')).toBe('computador');
  });
  it('todo aparelho tem o passo a passo para liberar', () => {
    for (const passos of Object.values(PASSOS_DO_MICROFONE)) expect(passos.length).toBeGreaterThanOrEqual(2);
    expect(PASSOS_DO_MICROFONE.iphone.join(' ')).toMatch(/Ajustes do Site.*Microfone.*Permitir/);
  });
});
