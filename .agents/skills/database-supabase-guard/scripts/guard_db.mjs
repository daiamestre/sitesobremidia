/**
 * SOBRE MÍDIA AI Engineering System — Database & Supabase Guard Skill Script
 * Procedimentos operacionais para validação estática de migrações SQL, políticas RLS e restrições.
 */

import fs from 'fs';
import path from 'path';

export class DatabaseSupabaseGuard {
  /**
   * Valida uma instrução SQL ou arquivo de migração contra as diretrizes canônicas de banco.
   */
  static validateMigrationSql(sqlContent, options = {}) {
    const errors = [];
    const warnings = [];

    if (!sqlContent || typeof sqlContent !== 'string' || sqlContent.trim().length === 0) {
      return {
        valid: false,
        errors: ['Conteúdo SQL vazio ou inválido.'],
        warnings: []
      };
    }

    const sql = sqlContent;

    // 1. Verificar SECURITY DEFINER sem search_path seguro
    if (/SECURITY\s+DEFINER/i.test(sql) && !/SET\s+search_path\s*=/i.test(sql)) {
      errors.push('Função SECURITY DEFINER encontrada sem configuração explícita de `SET search_path = public`.');
    }

    // 2. Verificar criação de tabela sem ativação explícita de RLS
    const tableMatches = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_\.\"]+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const rawTableName = match.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i, '').trim().replace(/['"`]/g, '');
        const rlsPattern = new RegExp(`ALTER\\s+TABLE\\s+.*${rawTableName}.*ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        if (!rlsPattern.test(sql)) {
          warnings.push(`Tabela '${rawTableName}' criada sem comando correspondente 'ENABLE ROW LEVEL SECURITY' no mesmo script.`);
        }
      }
    }

    // 3. Verificar comandos perigosos de drop sem restrição
    if (/DROP\s+SCHEMA\s+public/i.test(sql) || /DROP\s+DATABASE/i.test(sql)) {
      errors.push('Comando destrutivo não permitido detectado no script (DROP SCHEMA / DROP DATABASE).');
    }

    // 4. Verificar lock exclusivo perigoso em tabelas volumosas
    if (/ALTER\s+TABLE\s+(?:logs|display_stats|event_logs)\s+ADD\s+COLUMN\s+.*\s+DEFAULT\s+/i.test(sql)) {
      warnings.push('Adição de coluna com DEFAULT em tabela de alto volume pode causar bloqueio de lock prolongado.');
    }

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      summary: valid
        ? `SQL Migration validado com sucesso (${warnings.length} avisos).`
        : `Falha na validação de SQL Migration: ${errors.join('; ')}`
    };
  }

  /**
   * Checa cobertura de políticas RLS em uma tabela.
   */
  static checkRlsPolicies(tableName, policies = []) {
    const requiredOps = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const coveredOps = new Set();

    for (const pol of policies) {
      const op = pol.operation?.toUpperCase();
      if (op === 'ALL') {
        requiredOps.forEach(o => coveredOps.add(o));
      } else if (op) {
        coveredOps.add(op);
      }
    }

    const missingOps = requiredOps.filter(op => !coveredOps.has(op));

    return {
      table_name: tableName,
      rls_enabled: true,
      covered_operations: Array.from(coveredOps),
      missing_operations: missingOps,
      is_fully_covered: missingOps.length === 0,
      summary: missingOps.length === 0
        ? `Tabela '${tableName}' possui cobertura completa de RLS (${Array.from(coveredOps).join(', ')}).`
        : `Tabela '${tableName}' com cobertura parcial de RLS. Faltam: [${missingOps.join(', ')}].`
    };
  }
}
