// P-24 (F-271) — tela "Meu estilo" no Studio: só envia o que o banco aceita, exige consentimento e avisa (sem erro)
// enquanto a migração 20261362 não estiver aplicada.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estiloParaEnviar, memoriaIndisponivel } from '@/components/studioai/MeuEstilo';

const ler = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../..', p), 'utf8');

describe('Meu estilo (F-271)', () => {
  it('limpa o estilo: cores válidas em maiúscula, sem repetir, até 6; textos cortados no limite do banco', () => {
    const e = estiloParaEnviar({ tom: '  alegre  ', paleta: ['#ff0000', '#FF0000', 'vermelho', '#00ff00', '#1', '#000001', '#000002', '#000003', '#000004', '#000005'], observacoes: 'x'.repeat(400), formato: '4:3' as never });
    expect(e.tom).toBe('alegre');
    expect(e.paleta).toEqual(['#FF0000', '#00FF00', '#000001', '#000002', '#000003', '#000004']);
    expect(e.observacoes).toHaveLength(300);
    expect(e.formato).toBeUndefined();
    expect(estiloParaEnviar({ publico: '   ' }).publico).toBeUndefined();
  });
  it('reconhece a função do banco ainda não aplicada (aviso em vez de erro)', () => {
    expect(memoriaIndisponivel({ code: 'PGRST202', message: 'Could not find the function public.studio_preferencia_salvar' })).toBe(true);
    expect(memoriaIndisponivel({ code: '42501', message: 'Esse estilo é de outro cliente.' })).toBe(false);
    expect(memoriaIndisponivel(null)).toBe(false);
  });
  it('usa só as regras oficiais do banco, com consentimento, e está nas configurações do Studio', () => {
    const t = ler('src/components/studioai/MeuEstilo.tsx');
    expect(t).toContain("rpc('studio_preferencia_salvar'");
    expect(t).toContain('p_consentimento: aceito');
    expect(t).toContain("rpc('studio_preferencia_revogar'");
    expect(t).toMatch(/disabled=\{!aceito/);
    expect(t).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(ler('src/pages/studioai/ConfiguracoesPage.tsx')).toContain('<MeuEstilo admin={admin}');
  });
});
