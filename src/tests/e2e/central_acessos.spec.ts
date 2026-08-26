import { test, expect, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_REP_EMAIL, E2E_REP_PASSWORD, login, writeReport } from './helpers';

// Emails DETERMINÍSTICOS: módulos são recarregados por worker no Playwright,
// portanto Date.now() no escopo do módulo geraria sufixos divergentes entre testes.
const emails = {
  rep: 'e2e-acc-rep-e2e@sobremidia.com.br',
  gerente: 'e2e-acc-ger-e2e@sobremidia.com.br',
  fin: 'e2e-acc-fin-e2e@sobremidia.com.br',
  admin1: 'e2e-acc-adm1-e2e@sobremidia.com.br',
  admin2: 'e2e-acc-adm2-e2e@sobremidia.com.br',
  repAdmin1: 'e2e-acc-rep2-e2e@sobremidia.com.br',
};
// [SECURITY FASE F] Senha dos usuários E2E via variável de ambiente
// (TEST_USER_PASSWORD). Nunca hardcodar credencial em teste versionado.
const ACC_PASSWORD =
  process.env.TEST_USER_PASSWORD ||
  (() => {
    throw new Error('TEST_USER_PASSWORD obrigatório (ver .env.e2e.local)');
  })();

function adminClient(): SupabaseClient {
  const keys = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sb_keys.json'), 'utf8'));
  const serviceRole = keys.find((k) => k.name === 'service_role').api_key;
  const env = fs.readFileSync('.env.e2e.local', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  return createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

function tokenMgmt(): string {
  return fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
}

async function sqlMgmt(query: string): Promise<any[]> {
  const r = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokenMgmt(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error('SQL MGMT falhou: ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function deletarUsuarioPorEmail(email: string): Promise<void> {
  await sqlMgmt(`
    DELETE FROM public.solicitacoes_acesso WHERE approved_by IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.solicitacoes_acesso WHERE rejected_by IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.solicitacoes_acesso WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.permissoes_usuarios WHERE usuario_id IN (SELECT id FROM auth.users WHERE email = '${email}');
    DELETE FROM public.notificacoes_central WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.auditoria_logs WHERE entidade_id IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.representantes WHERE usuario_id IN (SELECT id FROM public.usuarios WHERE email = '${email}');
    DELETE FROM public.usuarios WHERE email = '${email}';
    DELETE FROM auth.users WHERE email = '${email}';`);
}

async function garantirDisponivel(email: string): Promise<void> {
  await deletarUsuarioPorEmail(email);
}

async function confirmarUsuario(email: string): Promise<void> {
  const admin = adminClient();
  const rows = await sqlMgmt(`SELECT id FROM auth.users WHERE email = '${email}'`);
  if (!rows?.[0]?.id) throw new Error('Usuário auth não encontrado para confirmação: ' + email);
  let erro;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await admin.auth.admin.updateUserById(rows[0].id, { email_confirm: true, password: ACC_PASSWORD });
    erro = r.error;
    if (!erro) break;
    await new Promise((res) => setTimeout(res, 2000 * (tentativa + 1)));
  }
  if (erro) {
    await sqlMgmt(`UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()), confirmed_at = COALESCE(confirmed_at, now()) WHERE id = '${rows[0].id}';`);
  }
  // Provisionamento v2 nasce com troca obrigatória de senha — o teste pré-define
  // a credencial conhecida, portanto limpa o flag para o login ir direto ao workspace.
  await sqlMgmt(`UPDATE public.usuarios SET must_change_password = false WHERE id = '${rows[0].id}' AND must_change_password IS TRUE;`);
}

async function criarUsuarioViaWizard(page: Page, nome: string, email: string, perfil: string): Promise<void> {
  await page.getByRole('button', { name: /Novo Usuário/i }).click();
  await expect(page.getByText(/Novo Usuário Corporativo/i)).toBeVisible({ timeout: 15000 });

  await page.fill('#wz-nome', nome);
  await page.fill('#wz-email', email);
  await page.fill('#wz-telefone', '(11) 96666-4321');
  await page.getByRole('button', { name: /Avançar/i }).click();

  await expect(page.getByText(/Perfil de acesso/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: new RegExp(perfil, 'i') }).click();
  await page.getByRole('button', { name: /Avançar/i }).click();

  await expect(page.getByRole('button', { name: /Criar usu.rio e (gerar senha inicial|enviar convite)/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Criar usu.rio e (gerar senha inicial|enviar convite)/i }).click();

  await expect(page.getByText(/Acesso criado para|Usu.rio criado com sucesso/i).first()).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: /Concluir/i }).click();

  await expect(page.getByText(email).first()).toBeVisible({ timeout: 30000 });
}

async function concederAutonomia(page: Page, email: string, permissoes: string[]): Promise<void> {
  const linha = page.locator('tr', { hasText: email });
  await linha.getByRole('button', { name: /Autonomia/i }).click();
  await expect(page.getByRole('heading', { name: 'Gerenciar Autonomia' })).toBeVisible({ timeout: 15000 });

  for (const p of permissoes) {
    const label = page.locator('label', { hasText: p }).first();
    await expect(label).toBeVisible({ timeout: 15000 });
    const cb = label.locator('button[role="checkbox"]');
    const estado = await cb.getAttribute('data-state');
    if (estado !== 'checked') {
      await cb.click();
    }
  }

  await page.getByRole('button', { name: /Salvar autonomia/i }).click();
  await expect(page.getByText('Autonomia atualizada com sucesso')).toBeVisible({ timeout: 30000 });

  // Recarrega a lista para refletir as permissões persistidas
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });
}

test.describe('CENTRAL CORPORATIVA DE ACESSOS (PROMPT MASTER)', () => {
  test.skip(({ isMobile }) => isMobile, 'Sidebar é desktop-only (CrmLayout: hidden md:block)');

  test('1. OWNER acessa a Central de Acessos com dashboard de indicadores reais', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await expect(page.getByText('Total de usuários').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Ativos').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Inativos').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Convites pendentes').first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/Distribuição por perfil/i).first()).toBeVisible({ timeout: 15000 });

    const linhaOwner = page.locator('tr', { hasText: 'E2E Owner' });
    await expect(linhaOwner).toContainText('Todas (OWNER)');
  });

  test('2. OWNER cria usuário REPRESENTANTE via wizard', async ({ page }) => {
    test.setTimeout(240_000);
    await garantirDisponivel(emails.rep);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await criarUsuarioViaWizard(page, 'Rep Central E2E', emails.rep, 'REPRESENTANTE');
    const linha = page.locator('tr', { hasText: emails.rep });
    await expect(linha).toContainText('REPRESENTANTE');
    await expect(linha).toContainText('Ativo');
  });

  test('3. OWNER cria usuário GERENTE via wizard', async ({ page }) => {
    test.setTimeout(240_000);
    await garantirDisponivel(emails.gerente);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await criarUsuarioViaWizard(page, 'Gerente Central E2E', emails.gerente, 'GERENTE');
    const linha = page.locator('tr', { hasText: emails.gerente });
    await expect(linha).toContainText('GERENTE');
  });

  test('4. OWNER cria usuário FINANCEIRO via wizard', async ({ page }) => {
    test.setTimeout(240_000);
    await garantirDisponivel(emails.fin);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await criarUsuarioViaWizard(page, 'Financeiro Central E2E', emails.fin, 'FINANCEIRO');
    const linha = page.locator('tr', { hasText: emails.fin });
    await expect(linha).toContainText('FINANCEIRO');
  });

  test('5. OWNER cria usuário ADMIN (delegado) via wizard e confirma os acessos criados', async ({ page }) => {
    test.setTimeout(300_000);
    await garantirDisponivel(emails.admin1);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await criarUsuarioViaWizard(page, 'Admin Central E2E', emails.admin1, 'ADMIN');
    const linha = page.locator('tr', { hasText: emails.admin1 });
    await expect(linha).toContainText('ADMIN');

    // Confirma os usuários criados até aqui (definição de senha + e-mail)
    for (const email of [emails.rep, emails.gerente, emails.fin, emails.admin1]) {
      await confirmarUsuario(email);
    }

    writeReport('central_emails.json', { emails, criadoEm: new Date().toISOString() });
  });

  test('6. OWNER cria admin2 e delega autonomia: admin1 recebe todas as permissões, admin2 apenas view+create', async ({ page }) => {
    test.setTimeout(300_000);
    await garantirDisponivel(emails.admin2);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    // admin2: segundo ADMIN, receberá apenas users.view + users.create
    await criarUsuarioViaWizard(page, 'Admin Limitado E2E', emails.admin2, 'ADMIN');
    await confirmarUsuario(emails.admin2);

    await concederAutonomia(page, emails.admin1, [
      'users.view', 'users.create', 'users.edit', 'users.activate',
      'users.deactivate', 'users.create_admin', 'users.manage_permissions',
    ]);

    const linha1 = page.locator('tr', { hasText: emails.admin1 });
    await expect(linha1).toContainText('users.manage_permissions');
    await expect(linha1).toContainText('users.create_admin');

    await concederAutonomia(page, emails.admin2, ['users.view', 'users.create']);
    const linha2 = page.locator('tr', { hasText: emails.admin2 });
    await expect(linha2).toContainText('users.create');
    await expect(linha2).not.toContainText('users.create_admin');
  });

  test('7. ADMIN delegado (admin1) acessa a Central e vê suas permissões', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, emails.admin1, ACC_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Total de usuários').first()).toBeVisible({ timeout: 15000 });

    const linhaAdmin1 = page.locator('tr', { hasText: emails.admin1 });
    await expect(linhaAdmin1).toContainText('users.manage_permissions');

    // REP não tem botão Autonomia (apenas ADMIN é elegível para delegação)
    const linhaRep = page.locator('tr', { hasText: emails.rep });
    await expect(linhaRep.getByRole('button', { name: /Autonomia/i })).toHaveCount(0);
  });

  test('8. ADMIN delegado (admin1) cria usuário REPRESENTANTE via wizard', async ({ page }) => {
    test.setTimeout(240_000);
    await garantirDisponivel(emails.repAdmin1);
    await login(page, emails.admin1, ACC_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await criarUsuarioViaWizard(page, 'Rep por Admin E2E', emails.repAdmin1, 'REPRESENTANTE');
    const linha = page.locator('tr', { hasText: emails.repAdmin1 });
    await expect(linha).toContainText('REPRESENTANTE');
  });

  test('9. ADMIN sem users.create_admin (admin2) não vê perfil ADMIN no wizard', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, emails.admin2, ACC_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: /Novo Usuário/i }).click();
    await expect(page.getByText(/Novo Usuário Corporativo/i)).toBeVisible({ timeout: 15000 });
    await page.fill('#wz-nome', 'Sem Create Admin E2E');
    await page.fill('#wz-email', 'e2e-acc-nca-e2e@sobremidia.com.br');
    await page.getByRole('button', { name: /Avançar/i }).click();
    await expect(page.getByText(/Perfil de acesso/i)).toBeVisible({ timeout: 15000 });

    // ADMIN não é ofertado a quem não possui users.create_admin
    await expect(page.getByRole('dialog').locator('button', { hasText: 'ADMIN' })).toHaveCount(0, { timeout: 10000 });

    // Perfis comuns continuam disponíveis
    await expect(page.getByRole('button', { name: /REPRESENTANTE/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('10. OWNER revoga autonomia: admin1 perde acesso à Central de Acessos', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    const linha1 = page.locator('tr', { hasText: emails.admin1 });
    await linha1.getByRole('button', { name: /Autonomia/i }).click();
    await expect(page.getByRole('heading', { name: 'Gerenciar Autonomia' })).toBeVisible({ timeout: 15000 });

    for (const p of ['users.view', 'users.create', 'users.edit', 'users.activate',
      'users.deactivate', 'users.create_admin', 'users.manage_permissions']) {
      const label = page.locator('label', { hasText: p }).first();
      const cb = label.locator('button[role="checkbox"]');
      const estado = await cb.getAttribute('data-state');
      if (estado === 'checked') {
        await cb.click();
      }
    }
    await page.getByRole('button', { name: /Salvar autonomia/i }).click();
    await expect(page.getByText('Autonomia atualizada com sucesso')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1500);

    // admin1 (sem users.view) não consegue mais abrir a Central
    await login(page, emails.admin1, ACC_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const urlAtual = page.url();
    expect(urlAtual.includes('/workspace/usuarios'), `URL não redirecionada: ${urlAtual}`).toBe(false);
    await expect(page.getByText('Central de Acessos').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('11. REPRESENTANTE não acessa a Central de Acessos (rota bloqueada)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.waitForURL(/\/representantes/, { timeout: 30000 });

    await expect(page.locator('aside a', { hasText: 'Central de Acessos' })).toHaveCount(0, { timeout: 15000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const urlAtual = page.url();
    expect(urlAtual.includes('/workspace/usuarios'), `URL não redirecionada: ${urlAtual}`).toBe(false);
    await expect(page.getByText('Central de Acessos').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('12. OWNER desativa e reativa usuário criado pelo admin delegado', async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });
    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    const linha = page.locator('tr', { hasText: emails.repAdmin1 });
    await expect(linha).toBeVisible({ timeout: 30000 });

    await linha.getByRole('button', { name: /Desativar/i }).click();
    await page.getByRole('button', { name: 'Desativar', exact: true }).last().click();
    await expect(linha.getByText('Inativo')).toBeVisible({ timeout: 30000 });

    await linha.getByRole('button', { name: /Reativar/i }).click();
    await page.getByRole('button', { name: 'Reativar', exact: true }).last().click();
    await expect(linha.getByText('Ativo')).toBeVisible({ timeout: 30000 });
  });

  test('13. Conta OWNER é protegida (sem ações na interface)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    const linhaOwner = page.locator('tr', { hasText: 'E2E Owner' });
    await expect(linhaOwner).toContainText('Protegido');
    await expect(linhaOwner).toContainText('Todas (OWNER)');
    await expect(linhaOwner.getByRole('button')).toHaveCount(0);
  });
});