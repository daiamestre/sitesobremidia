import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * PROTEÇÃO CONSTITUCIONAL DE PERFIS (Fase 2 — seção 19)
 *
 * Garante que NENHUMA migration futura remova os perfis oficiais da
 * plataforma. A verificação considera SEMPRE a ÚLTIMA definição da
 * constraint perfis_nome_check (ordem alfabética de arquivo = ordem
 * de aplicação do `supabase db push`), pois é ela que prevalece no banco.
 */

const PERFIS_CONSTITUCIONAIS = [
  'OWNER',
  'ADMIN',
  'ANUNCIANTE',
  'REPRESENTANTE',
  'GERENTE',
  'FINANCEIRO',
  'GESTOR',
  'FUNCIONARIO',
  'PARCEIRO',
] as const;

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');

function extrairPerfisDaConstraint(sql: string): string[] {
  // Localiza a última definição de perfis_nome_check e extrai os literais
  // 'NOME' presentes na sequência da constraint.
  const idx = sql.lastIndexOf('perfis_nome_check');
  if (idx === -1) return [];
  const janela = sql.slice(idx, idx + 1200);
  const Literais = janela.match(/'([A-Z][A-Z_]*)'/g) ?? [];
  return [...new Set(Literais.map(l => l.slice(1, -1)))];
}

describe('[REGRESSÃO] Perfis constitucionais — RBAC da SOBRE MÍDIA', () => {
  const arquivos = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  it('deve existir pelo menos uma migration definindo perfis_nome_check', () => {
    const comConstraint = arquivos.filter(f =>
      readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').includes('perfis_nome_check'),
    );
    expect(comConstraint.length).toBeGreaterThan(0);
  });

  it('a ÚLTIMA definição da constraint deve conter TODOS os perfis constitucionais', () => {
    let ultimaDefinicao: { arquivo: string; perfis: string[] } | null = null;
    for (const f of arquivos) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      if (sql.includes('perfis_nome_check')) {
        ultimaDefinicao = { arquivo: f, perfis: extrairPerfisDaConstraint(sql) };
      }
    }
    expect(ultimaDefinicao).not.toBeNull();
    const ausentes = PERFIS_CONSTITUCIONAIS.filter(
      p => !ultimaDefinicao!.perfis.includes(p),
    );
    expect(
      ausentes,
      `Migration "${ultimaDefinicao!.arquivo}" removeu perfis constitucionais: ${ausentes.join(', ')}`,
    ).toEqual([]);
  });

  it('ANUNCIANTE e REPRESENTANTE devem ser perfis DISTINTOS na constraint', () => {
    let ultimoSql = '';
    for (const f of arquivos) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      if (sql.includes('perfis_nome_check')) ultimoSql = sql;
    }
    const perfis = extrairPerfisDaConstraint(ultimoSql);
    const temAnunciante = perfis.includes('ANUNCIANTE');
    const temRepresentante = perfis.includes('REPRESENTANTE');
    expect(temAnunciante && temRepresentante).toBe(true);
    // Distintos: cada um aparece como literal próprio (não há colapso)
    expect(perfis.filter(p => p === 'ANUNCIANTE').length).toBe(1);
    expect(perfis.filter(p => p === 'REPRESENTANTE').length).toBe(1);
  });

  it('seed.sql deve semear todos os perfis constitucionais (incl. ANUNCIANTE)', () => {
    const seed = readFileSync(path.resolve(process.cwd(), 'supabase', 'seed.sql'), 'utf8');
    for (const perfil of PERFIS_CONSTITUCIONAIS) {
      expect(seed).toContain(`'${perfil}'`);
    }
  });
});
