/**
 * F-184 — o mesmo login entra em qualquer aparelho e conecta as telas que precisar; só não conecta uma tela que JÁ ESTÁ
 * conectada em outro aparelho. "Conectada" = o aparelho dela está vivo. Tela de aparelho parado (desligado, trocado,
 * reinstalado, ou o mesmo aparelho com identidade nova depois de atualizar o aplicativo) volta a ficar livre.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261326_tela_de_aparelho_parado_fica_livre.sql', 'utf8');
const trecho = (inicio: string, fim: string) => {
  const i = sql.indexOf(inicio);
  expect(i, `não achei: ${inicio}`).toBeGreaterThan(-1);
  const f = sql.indexOf(fim, i);
  expect(f, `não achei o fim: ${fim}`).toBeGreaterThan(i);
  return sql.slice(i, f);
};

describe('F-184 · tela de aparelho parado fica livre', () => {
  it('aparelho parado = sem sinal há mais de 10 minutos (ou nunca deu sinal)', () => {
    const fn = trecho('FUNCTION public.fn_tela_com_aparelho_parado', '$$;');
    expect(fn).toContain('p_ultimo_sinal IS NULL');
    expect(fn).toContain("now() - interval '10 minutes'");
  });

  it('a escolha de tela do Player mostra como livre a tela de aparelho parado', () => {
    const lista = trecho('FUNCTION public.get_authorized_screens_for_player()', '$function$;');
    expect(lista).toContain("'bound_device_id', CASE WHEN public.fn_tela_com_aparelho_parado(s.last_ping_at) THEN NULL ELSE s.bound_device_id END");
    // continua listando só as telas do próprio usuário
    expect(lista).toContain('WHERE s.user_id = v_auth_uid');
  });

  it('o servidor aceita a conexão na tela de aparelho parado, só com login, e mantém as outras recusas', () => {
    const fn = trecho('FUNCTION public.get_player_playlist_for_screen(p_identifier text, p_device_id text)', '$function$;');
    const ramo = fn.slice(fn.indexOf('ELSIF v_auth_uid IS NOT NULL AND public.fn_tela_com_aparelho_parado(v_screen.last_ping_at) THEN'));
    expect(ramo.length).toBeGreaterThan(200);
    const ateORecuso = ramo.slice(0, ramo.indexOf(`RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;`));
    expect(ateORecuso).toContain('revoked_at IS NOT NULL'); // aparelho revogado continua fora
    expect(ateORecuso).toContain('AND id <> v_screen.id'); // um aparelho continua com uma tela só
    expect(ateORecuso).toContain('UPDATE public.screens SET bound_device_id = p_device_id, last_ping_at = now() WHERE id = v_screen.id;');
    // tela com aparelho vivo: recusa de sempre
    expect(ramo).toContain(`ELSE\n        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;`);
    // o mesmo aparelho na própria tela segue pelo caminho antigo
    expect(fn).toContain('ELSIF v_screen.bound_device_id = p_device_id THEN');
  });
});

describe('F-185 · toda tela livre pode ser conectada', () => {
  const sql185 = readFileSync('supabase/migrations/20261327_aparelho_solta_a_tela_anterior.sql', 'utf8');

  it('o servidor não recusa mais o aparelho por "já estar vinculado a outra tela"', () => {
    expect(sql185).not.toContain('ja esta vinculado a outra tela');
  });

  it('ao conectar, o aparelho solta a tela anterior (nos dois caminhos: tela livre e tela de aparelho parado)', () => {
    const solta = /UPDATE public\.screens\s+SET bound_device_id = NULL\s+WHERE bound_device_id = p_device_id\s+AND id <> v_screen\.id;/g;
    expect(sql185.match(solta)?.length).toBe(2);
  });

  it('tela de aparelho vivo continua recusada', () => {
    expect(sql185).toContain(`ELSE\n        RETURN '{"status": "DEVICE_ALREADY_BOUND"}'::JSONB;`);
    expect(sql185).toContain('public.fn_tela_com_aparelho_parado(v_screen.last_ping_at)');
  });
});
