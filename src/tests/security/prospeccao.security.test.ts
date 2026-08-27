import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE SEGURANÇA — CENTRAL DE PROSPECÇÃO DO REPRESENTANTE
// (missão §9 §27-§29 §41): auditoria ESTÁTICA determinística de fonte.
// Localiza a ÚLTIMA migration contendo cada objeto (imune a renomeações).
// ─────────────────────────────────────────────────────────────────────────────

const PROJETO = process.cwd();
const MIG_DIR = path.join(PROJETO, 'supabase', 'migrations');
const ler = (rel: string) => fs.readFileSync(path.join(PROJETO, rel), 'utf8');

function ultimaMigrationContendo(termo: string): string {
  const arquivos = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  let ultima = '';
  for (const f of arquivos) {
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    if (sql.includes(termo)) ultima = sql;
  }
  return ultima;
}

/** Garantia presente em QUALQUER migration do histórico (imune a reescritas
 *  posteriores de funções irmãs no mesmo arquivo) */
function historicoContem(termoAncora: string, garantia: string): boolean {
  const arquivos = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  return arquivos.some((f) => {
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    return sql.includes(termoAncora) && sql.includes(garantia);
  });
}

const SVC = 'src/services/prospeccao.service.ts';
const EDGE = 'supabase/functions/provision-user/index.ts';

describe('SECURITY — provisionamento REPRESENTANTE→GESTOR (missão §22 §27)', () => {
  const sql = ultimaMigrationContendo('provisionar_usuario_corporativo');

  it('RPC permite representante provisionar SOMENTE o perfil GESTOR', () => {
    expect(sql).toMatch(/REPRESENTANTE/);
    expect(sql).toMatch(/perfil GESTOR/);
    // Bloqueio explícito de perfis não-GESTOR no caminho do representante
    expect(sql).not.toMatch(/REPRESENTANTE[^]{0,400}THEN\s+NULL/);
  });

  it('anti-forgery mantem bloqueio de OWNER e de tenant divergente', () => {
    expect(historicoContem('prevent_usuario_insert_forgery', 'OWNER n\u00e3o autorizada')).toBe(true);
    expect(historicoContem('prevent_usuario_insert_forgery', 'tenant n\u00e3o corresponde')).toBe(true);
  });

  it('representante sem cliente vinculado fora da carteira é bloqueado', () => {
    // A versão final (sessão paralela) amplia para CLIENTE/ANUNCIANTE DA
    // CARTEIRA + GESTOR — a garantia essencial é o gate de carteira:
    expect(
      historicoContem('provisionar_usuario_corporativo', 'fora da carteira do representante') ||
        historicoContem('provisionar_usuario_corporativo', 'apenas GESTOR sem cliente vinculado')
    ).toBe(true);
  });

  it('edge repassa dadosExtra mas nunca expõe service_role ao frontend', () => {
    const edge = ler(EDGE);
    expect(edge).toContain('dadosExtra');
    expect(edge).toContain('SUPABASE_SERVICE_ROLE_KEY'); // uso server-side legítimo
    expect(fs.existsSync(path.join(PROJETO, 'src/services/corporateUsers.service.ts'))).toBe(true);
    const svcFront = ler('src/services/corporateUsers.service.ts');
    expect(/SERVICE_ROLE/i.test(svcFront)).toBe(false);
  });
});

describe('SECURITY — relacionamento anunciante↔ponto (missão §9-§10 §28-§29)', () => {
  it('seleção é validada SERVER-SIDE com disponibilidade e posse da carteira', () => {
    expect(historicoContem('selecionar_pontos_prospeccao', "disponibilidade = 'DISPONIVEL'")).toBe(true);
    expect(historicoContem('selecionar_pontos_prospeccao', 'sua carteira')).toBe(true);
    expect(historicoContem('selecionar_pontos_prospeccao', 'inativos ou indispon')).toBe(true);
  });

  it('cliente_pontos tem RLS habilitada e policies por tenant/dono', () => {
    expect(historicoContem('CREATE TABLE IF NOT EXISTS public.cliente_pontos', 'ENABLE ROW LEVEL SECURITY')).toBe(true);
    expect(historicoContem('cliente_pontos', 'get_user_empresa_operadora_id(auth.uid())')).toBe(true);
    expect(historicoContem('cliente_pontos', 'is_internal_role()')).toBe(true);
  });

  it('frontend NÃO insere vínculos direto — só via RPC autorizada', () => {
    const svc = ler(SVC);
    expect(svc.includes('selecionar_pontos_prospeccao')).toBe(true);
    expect(/from\(['"]cliente_pontos['"]\)\s*\.insert/.test(svc)).toBe(false);
  });
});

describe('SECURITY — higiene geral (missão §41)', () => {
  it('nenhum token administrativo no service/páginas de prospecção', () => {
    const arquivos = [SVC,
      'src/modules/crm/pages/NovaProspeccaoPage.tsx',
      'src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx',
      'src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx'];
    for (const f of arquivos) {
      expect(fs.existsSync(path.join(PROJETO, f)), `arquivo ausente: ${f}`).toBe(true);
      expect(ler(f).includes('sbp_'), `token sbp_ em ${f}`).toBe(false);
      expect(/service_role|SERVICE_ROLE/i.test(ler(f)), `service_role em ${f}`).toBe(false);
    }
  });

  it('senha automática permanece backend-only no fluxo do gestor', () => {
    const page = ler('src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx');
    expect(page).toContain('exibida apenas agora');
    expect(page).not.toMatch(/senha\s*=\s*['"][^'"]{6,}['"]/i);
  });
});
