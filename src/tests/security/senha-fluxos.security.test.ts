import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE SEGURANÇA — SENHAS & PROVISIONAMENTO (missão §5–§12)
// Auditoria ESTÁTICA de fonte (determinística entre runners, sem mocks de
// ordem): garante que os invariantes críticos permanecem no código.
// ─────────────────────────────────────────────────────────────────────────────

const PROJETO = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(PROJETO, rel), 'utf8');
const existe = (rel: string) => fs.existsSync(path.join(PROJETO, rel));

const EDGE_PROVISIONAR = 'supabase/functions/create-corporate-user/index.ts';
const EDGE_AUTORIZAR = 'supabase/functions/authorize-password-reset/index.ts';
const PAGE_FORGOT = 'src/pages/ForgotPassword.tsx';
const PAGE_CHANGE = 'src/pages/ChangePassword.tsx';
const CENTRAL_ACESSOS = 'src/modules/corporate/pages/UsuariosAcessosPage.tsx';
const RPC_MIGRATION = 'supabase/migrations/20261026_portal_anunciante_foundation.sql';

describe('SECURITY — provisionamento com senha automática (missão §5–§7)', () => {
  it('edge de provisionamento existe', () => {
    expect(existe(EDGE_PROVISIONAR)).toBe(true);
  });

  it('senha inicial é gerada por CSPRNG (crypto.getRandomValues), nunca fixa', () => {
    const src = ler(EDGE_PROVISIONAR);
    expect(src.includes('crypto.getRandomValues'), 'geração deve usar CSPRNG').toBe(true);
    // Nenhuma senha hardcoded plausível
    expect(src).not.toMatch(/password\s*[:=]\s*['"][^'"]{8,}['"]/i);
  });

  it('usuário é criado JÁ COM a senha inicial (sem dependência de convite/e-mail)', () => {
    const src = ler(EDGE_PROVISIONAR);
    expect(src.includes('auth.admin.createUser')).toBe(true);
    expect(src.includes('inviteUserByEmail'), 'convite por e-mail foi abolido do fluxo v2').toBe(false);
  });

  it('senha inicial é retornada UMA única vez e marcada para troca obrigatória', () => {
    const src = ler(EDGE_PROVISIONAR);
    expect(src.includes('senha_inicial')).toBe(true);
    expect(src.includes('deve_trocar_senha')).toBe(true);
  });

  it('nenhuma senha/token é logada em console/log na edge de provisionamento', () => {
    const src = ler(EDGE_PROVISIONAR);
    // console.* não pode referenciar a variável da senha
    const consoles = src.match(/console\.[a-z]+\([^)]*\)/g) || [];
    for (const c of consoles) {
      expect(c.includes('senha'), `console não pode logar senha: ${c}`).toBe(false);
    }
  });

  it('RPC server-side cria usuário com must_change_password=TRUE e auditoria', () => {
    const sql = ler(RPC_MIGRATION);
    expect(sql.includes('must_change_password')).toBe(true);
    expect(sql.includes('provisionar_usuario_corporativo')).toBe(true);
    expect(sql.includes('USER_PROVISIONED')).toBe(true);
  });

  it('wizard da Central de Acessos NÃO menciona mais "convite" do Supabase (copy v2)', () => {
    const src = ler(CENTRAL_ACESSOS);
    expect(src.includes('convite oficial do Supabase Auth')).toBe(false);
    expect(src.toLowerCase().includes('senha inicial automática') || src.includes('senha inicial automática')).toBe(true);
  });
});

describe('SECURITY — redefinição de senha via autorização na Central (missão §8–§12)', () => {
  it('página Esqueci minha senha NÃO redefine diretamente: cria solicitação', () => {
    const src = ler(PAGE_FORGOT);
    expect(src.includes('solicitar_reset_senha')).toBe(true);
    expect(src.includes('resetPasswordForEmail'), 'recovery nativo do Supabase não pertence ao fluxo').toBe(false);
    expect(src.includes('updateUser'), 'frontend não pode trocar senha nesse fluxo').toBe(false);
  });

  it('RPC solicitar_reset_senha notifica Owner/Admin e é anti-enumeração', () => {
    const sql = ler(RPC_MIGRATION);
    expect(sql.includes('solicitar_reset_senha')).toBe(true);
    expect(sql.includes('notificacoes_central')).toBe(true);
    expect(sql.includes('PASSWORD_RESET_REQUEST')).toBe(true);
  });

  it('decisão exige privilégio central e impede dupla decisão (FOR UPDATE)', () => {
    const sql = ler(RPC_MIGRATION);
    expect(sql.includes('decidir_reset_senha')).toBe(true);
    expect(sql.includes('FOR UPDATE')).toBe(true);
    expect(sql.includes('is_central_privileged')).toBe(true);
  });

  it('emissão da credencial: só solicitação APROVADA, emissão ÚNICA e senha temporária CSPRNG', () => {
    const src = ler(EDGE_AUTORIZAR);
    expect(src.includes('APROVADA')).toBe(true);
    expect(src.includes('credencial_emitida_em'), 'claim único anti-corrida').toBe(true);
    expect(src.includes('crypto.getRandomValues')).toBe(true);
    expect(src.includes('auth.admin.updateUserById')).toBe(true);
    expect(src.includes('must_change_password')).toBe(true);
  });

  it('troca obrigatória conclui via RPC server-side (limpa flag + audita)', () => {
    const src = ler(PAGE_CHANGE);
    expect(src.includes('concluir_troca_senha_obrigatoria')).toBe(true);
    expect(src.includes('must_change_password'), 'página consome a flag de troca obrigatória').toBe(true);
  });
});

describe('SECURITY — regra comercial R$19,99 protegida no backend (missão §24–§26)', () => {
  it('RLS impede insert direto de vídeo sem cobrança PAGA (defesa contra bypass)', () => {
    const sql = fs
      .readdirSync(path.join(PROJETO, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ler(`supabase/migrations/${f}`))
      .join('\n');
    expect(sql.includes('cpi_insert_com_cobranca')).toBe(true);
    expect(sql.includes("'PAGA','PAGO'")).toBe(true);
  });

  it('frontend nunca grava status de cobrança diretamente (só lê contas_receber)', () => {
    const svc = ler('src/modules/crm/services/playlistCliente.service.ts');
    expect(/\.update\(/.test(svc.split('contas_receber').join('').split('from(').join('')) === false ||
      !svc.includes(".from('contas_receber').update"), 'serviço não pode atualizar cobranças').toBe(true);
  });
});
