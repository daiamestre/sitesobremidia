import { test, expect, Page } from '@playwright/test';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_REP_EMAIL, E2E_REP_PASSWORD, login, writeReport } from './helpers';

const emailUnico = `e2e-ui-${Date.now()}@sobremidia.com.br`;

async function semNotFound(page: Page) {
  const notFound = page.getByText(/Page not found/i);
  const visible = await notFound.isVisible().catch(() => false);
  expect(visible, 'Página 404 (Page not found) renderizada').toBe(false);
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20000 });
}

test.describe('PARTE A - MENSAGENS + DASHBOARD SEM 404', () => {
  test.skip(({ isMobile }) => isMobile, 'Sidebar é desktop-only (CrmLayout: hidden md:block)');
  test('OWNER: Dashboard no workspace não 404 e Mensagens navegável', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace|\/dashboard|\/representantes/, { timeout: 30000 });

    await page.goto('/workspace/corporate', { waitUntil: 'domcontentloaded' });
    await semNotFound(page);

    const linkMensagens = page.locator('aside a', { hasText: 'Mensagens' });
    await expect(linkMensagens.first()).toBeVisible({ timeout: 20000 });
    await linkMensagens.first().click();
    await page.waitForURL(/\/workspace\/central/, { timeout: 30000 });
    await expect(page.getByText(/Central de Comunicação/i).first()).toBeVisible({ timeout: 30000 });
  });

  test('REPRESENTANTE: clique em Dashboard não gera 404 (bug corrigido)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.waitForURL(/\/representantes/, { timeout: 30000 });

    await page.goto('/representantes/dashboard', { waitUntil: 'domcontentloaded' });
    await semNotFound(page);

    const linkDashboard = page.locator('aside a', { hasText: 'Dashboard' }).first();
    await expect(linkDashboard).toBeVisible({ timeout: 20000 });
    await linkDashboard.click();
    await page.waitForURL(/\/representantes\/dashboard$/, { timeout: 30000 });
    await semNotFound(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Page not found/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('REPRESENTANTE: Mensagens navega para /representantes/central', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.waitForURL(/\/representantes/, { timeout: 30000 });

    const linkMensagens = page.locator('aside a', { hasText: 'Mensagens' }).first();
    await expect(linkMensagens).toBeVisible({ timeout: 20000 });
    await linkMensagens.click();
    await page.waitForURL(/\/representantes\/central/, { timeout: 30000 });
    await expect(page.getByText(/Central de Comunicação/i).first()).toBeVisible({ timeout: 30000 });
  });
});

test.describe('PARTE B - USUARIOS E ACESSOS', () => {
  test.skip(({ isMobile }) => isMobile, 'Sidebar é desktop-only (CrmLayout: hidden md:block)');
  test('REPRESENTANTE não vê Usuários e Acessos e é bloqueado na rota', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);
    await page.waitForURL(/\/representantes/, { timeout: 30000 });

    await expect(page.locator('aside a', { hasText: 'Central de Acessos' })).toHaveCount(0, { timeout: 15000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const urlAtual = page.url();
    expect(urlAtual.includes('/workspace/usuarios'), `URL não redirecionada: ${urlAtual}`).toBe(false);
    await expect(page.getByText('Central de Acessos').first()).not.toBeVisible({ timeout: 5000 });
  });

  test('OWNER: cria usuário corporativo completo via wizard (4 etapas)', async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Central de Acessos').first()).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: /Novo Usuário/i }).click();
    await expect(page.getByText(/Novo Usuário Corporativo/i)).toBeVisible({ timeout: 15000 });

    // Etapa 1: Dados Pessoais
    await page.fill('#wz-nome', 'Usuário Playwright E2E');
    await page.fill('#wz-email', emailUnico);
    await page.fill('#wz-telefone', '(11) 97777-1234');
    await page.getByRole('button', { name: /Avançar/i }).click();

    // Etapa 2: Acesso Corporativo (perfil real do banco)
    await expect(page.getByText(/Perfil de acesso/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /FINANCEIRO/i }).click();
    await page.getByRole('button', { name: /Avançar/i }).click();

    // Etapa 3: Revisão
    await expect(page.getByText('Usuário Playwright E2E').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Criar usuário e enviar convite/i })).toBeVisible();
    await page.getByRole('button', { name: /Criar usuário e enviar convite/i }).click();

    // Etapa 4: Sucesso
    await expect(page.getByText(/Usuário criado com sucesso/i).first()).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: /Concluir/i }).click();

    // Lista atualizada com o novo usuário
    await expect(page.getByText(emailUnico).first()).toBeVisible({ timeout: 30000 });

    writeReport('usuario_criado_ui.json', { email: emailUnico });
  });

  test('OWNER: novo usuário aparece com perfil e status Ativo na lista', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(emailUnico)).toBeVisible({ timeout: 30000 });
    const linha = page.locator('tr', { hasText: emailUnico });
    await expect(linha).toContainText('FINANCEIRO');
    await expect(linha).toContainText('Ativo');
  });

  test('OWNER: desativa e reativa usuário recém-criado', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(emailUnico)).toBeVisible({ timeout: 30000 });

    const linha = page.locator('tr', { hasText: emailUnico });
    await linha.getByRole('button', { name: /Desativar/i }).click();
    await page.getByRole('button', { name: 'Desativar', exact: true }).last().click();
    await expect(linha.getByText('Inativo')).toBeVisible({ timeout: 30000 });

    await linha.getByRole('button', { name: /Reativar/i }).click();
    await page.getByRole('button', { name: 'Reativar', exact: true }).last().click();
    await expect(linha.getByText('Ativo')).toBeVisible({ timeout: 30000 });
  });

  test('OWNER: conta OWNER é protegida (sem botão desativar)', async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.waitForURL(/\/workspace/, { timeout: 30000 });

    await page.goto('/workspace/usuarios', { waitUntil: 'domcontentloaded' });
    const linhaOwner = page.locator('tr', { hasText: 'E2E Owner' });
    await expect(linhaOwner).toContainText('Protegido');
    await expect(linhaOwner.getByRole('button')).toHaveCount(0);
  });
});
