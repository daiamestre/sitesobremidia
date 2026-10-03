import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-125 — tabelas que estavam abertas a visitante anônimo ficam fechadas (só restringe).
const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261291_fechar_tabelas_abertas.sql'), 'utf8').replace(/\r\n/g, '\n');

describe('Tabelas fechadas (F-125)', () => {
  it('perfis: logado só lê; ninguém altera, apaga ou cria pela API', () => {
    expect(sql).toContain('ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.perfis FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('CREATE POLICY perfis_leitura ON public.perfis FOR SELECT TO authenticated USING (true);');
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.perfis FOR (INSERT|UPDATE|DELETE|ALL)/);
  });

  it('versões de contrato: só quem enxerga o contrato lê e grava; visitante anônimo não tem acesso', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS p_select_contrato_versoes ON public.contrato_versoes;');
    expect(sql).toContain('DROP POLICY IF EXISTS p_insert_contrato_versoes ON public.contrato_versoes;');
    expect(sql.match(/EXISTS \(SELECT 1 FROM public\.contratos c WHERE c\.id = contrato_versoes\.contrato_id\)/g)).toHaveLength(2);
    expect(sql).toContain('REVOKE ALL ON public.contrato_versoes FROM PUBLIC, anon;');
    expect(sql).not.toMatch(/contrato_versoes[^;]*USING \(true\)/);
  });

  it('tabelas antigas sem uso: proteção ligada e acesso só do servidor', () => {
    for (const t of ['assinaturas_digitais', 'conciliacoes', 'feature_flags', 'historico_financeiro', 'roles_permissoes', 'sequencias_numeracao', 'timeline', 'visita_checkins']) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toContain("EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);");
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);");
  });

  it('a migração só restringe: não cria permissão nova de escrita', () => {
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(3);
  });
});
