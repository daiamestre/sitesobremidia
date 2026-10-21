/**
 * F-205 — "Vincular outro aparelho" no painel e desvincular com tela de suporte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rpc = vi.fn();
// o cliente do projeto usa "this" dentro do rpc: a chamada tem de continuar presa a ele
vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    rpc(this: unknown, ...a: unknown[]) {
      if (this !== supabase) throw new Error('rpc chamado solto do cliente');
      return rpc(...a);
    },
  };
  return { supabase };
});

import { listarAparelhosParaVincular, vincularAparelhoNaTela } from '@/services/vincularAparelho.service';

describe('F-205 serviço', () => {
  beforeEach(() => rpc.mockReset());

  it('lista os aparelhos da tela pela função do banco', async () => {
    rpc.mockResolvedValue({ data: { status: 'SUCCESS', data: [{ aparelho: 'x', compativel: true }] }, error: null });
    const lista = await listarAparelhosParaVincular('tela-1');
    expect(rpc).toHaveBeenCalledWith('fn_aparelhos_para_vincular', { p_tela: 'tela-1' });
    expect(lista).toHaveLength(1);
  });

  it('vincular devolve a mensagem do servidor e mostra o motivo quando recusa', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'SUCCESS', message: 'indo' }, error: null });
    await expect(vincularAparelhoNaTela('t', 'a')).resolves.toBe('indo');
    expect(rpc).toHaveBeenCalledWith('fn_vincular_aparelho_na_tela', { p_tela: 't', p_aparelho: 'a' });
    rpc.mockResolvedValueOnce({ data: { status: 'PLAYER_ANTIGO', message: 'precisa 5.8.9' }, error: null });
    await expect(vincularAparelhoNaTela('t', 'a')).rejects.toThrow('precisa 5.8.9');
  });
});

describe('F-205 página da tela', () => {
  const src = readFileSync(resolve(__dirname, '../../pages/dashboard/ScreenDetails.tsx'), 'utf-8');
  it('tem o botão ao lado de Desvincular Tela e abre a lista', () => {
    expect(src).toContain('data-testid="btn-vincular-outro-aparelho"');
    expect(src.indexOf('Desvincular Tela')).toBeLessThan(src.indexOf('btn-vincular-outro-aparelho'));
    expect(src).toContain('<VincularOutroAparelhoDialog');
  });
  it('o desvincular avisa que o aparelho mostra a tela de suporte', () => {
    expect(src).toContain('tela de suporte');
  });
  it('a migração cobre troca, suporte e o Player antigo', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261347_vincular_outro_aparelho.sql'), 'utf-8');
    expect(sql).toContain("'trocar_tela'");
    expect(sql).toContain('PLAYER_ANTIGO');
    expect(sql).toContain('OUTRA_CONTA');
    expect(sql).toContain('fn_player_tela_do_aparelho');
  });
});
