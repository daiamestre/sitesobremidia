// F-263 (MG-AUT-09a) — trava as correções de segurança do pareamento por código e da assinatura antiga.
// A prova no banco de produção está em scripts/ops/teste-pareamento.sql (22 checagens, transação desfeita) e em
// docs/engineering/evidence/F-263_pareamento/. Este teste impede que o repositório volte ao estado inseguro.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const MIGRACAO = 'supabase/migrations/20261361_pareamento_seguro.sql';
const ler = (f: string) => fs.readFileSync(f, 'utf8');
const semComentarios = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('F-263 — pareamento por código seguro', () => {
  const sql = semComentarios(ler(MIGRACAO));

  it('remove as 4 regras abertas e fecha a tabela para anônimo e logado (só as funções acessam)', () => {
    for (const regra of ['dpc_all_auth', 'dpc_insert_anon', 'dpc_select_anon', 'dpc_update_anon']) {
      expect(sql).toContain(`drop policy if exists ${regra} on public.device_pairing_codes`);
    }
    expect(sql).toMatch(/revoke select, insert, update, delete, truncate on public\.device_pairing_codes from anon, authenticated/);
    expect(sql).not.toMatch(/create policy\s+\w+\s+on public\.device_pairing_codes/i);
  });

  it('o vínculo exige a mesma regra de "alterar tela" e registra recusa e vínculo', () => {
    expect(sql).toContain('public.fn_player_can_access_screen(p_screen_id)');
    expect(sql).toContain('public.fn_perfil_sem_gestao_de_telas()');
    expect(sql).toContain("'forbidden_screen'");
    expect(sql).toMatch(/'ACCESS_DENIED', v_uid, jsonb_build_object\('acao', 'pareamento'/);
    expect(sql).toMatch(/'DEVICE_PAIRED', v_uid/);
    expect(sql).toMatch(/revoke all on function public\.fn_link_device_to_screen\(character varying, uuid\) from public, anon/);
  });

  it('grava em devices só com colunas que existem (a versão antiga usava `status` e ON CONFLICT sem chave única)', () => {
    const corpo = sql.slice(sql.indexOf('create or replace function public.fn_link_device_to_screen'));
    expect(corpo).not.toMatch(/on conflict \(identity_hash\)/i);
    expect(corpo).not.toMatch(/insert into public\.devices \([^)]*\bstatus\b/);
    expect(corpo).toMatch(/insert into public\.devices \(name, screen_id, identity_hash, screen_token/);
  });

  it('o roteiro de prova cobre os perfis e os casos pedidos', () => {
    const t = ler('scripts/ops/teste-pareamento.sql');
    for (const caso of ['anon não lê a tabela', 'anunciante não apaga', 'cliente bloqueado', 'dono de outra empresa bloqueado',
      'gestor liga aparelho na PRÓPRIA tela', 'ADMIN (não dono)', 'código já usado recusado', 'código expirado recusado', 'código inválido recusado',
      'identificador de outro aparelho']) {
      expect(t, caso).toContain(caso);
    }
  });
});

describe('F-263 — assinatura antiga removida', () => {
  it('contract-signature-flow (service role sem login, nunca publicada) não existe mais; o fluxo é fn_assinar_contrato', () => {
    expect(fs.existsSync('supabase/functions/contract-signature-flow')).toBe(false);
    expect(ler('src/modules/crm/services/digitalSignature.service.ts')).toContain('fn_assinar_contrato');
  });
});
