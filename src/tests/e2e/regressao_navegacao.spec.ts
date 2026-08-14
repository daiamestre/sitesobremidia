import { test, expect } from '@playwright/test';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, login } from './helpers';

test.describe('E2E REGRESSAO - NAVEGACAO CRM POS-CADASTRO', () => {
  test('Login, dashboard, clientes, propostas e contratos acessiveis e renderizando', async ({ page }) => {
    test.setTimeout(240_000);

    console.log('1. LOGIN...');
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);

    console.log('2. Dashboard CRM renderiza...');
    await page.goto('/representantes/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 20000 });

    console.log('3. Listagem de Clientes renderiza...');
    await page.goto('/representantes/clientes', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 20000 });

    console.log('4. Listagem de Propostas renderiza...');
    await page.goto('/representantes/propostas', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 20000 });

    console.log('5. Listagem de Contratos renderiza...');
    await page.goto('/representantes/contratos', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 20000 });

    console.log('6. Novo Cliente ainda acessivel apos navegacao...');
    await page.goto('/representantes/clientes/novo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Novo Cliente.*Cadastro Completo/)).toBeVisible({ timeout: 20000 });

    console.log('REGRESSAO OK - todas as rotas renderizaram.');
  });
});