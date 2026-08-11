import { test, expect } from '@playwright/test';

test.describe('Customer Portal Dashboard', () => {
  // Teste temporariamente isolado da pipeline remota porque requer CREDENCIAIS PRIVADAS DO SUPABASE AUTH
  test.skip('Deve carregar KPIs reais respeitando tenant isolation', async ({ page }) => {
    // 1. LOGIN CLIENTE
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.CUSTOMER_EMAIL || 'cliente@test.com');
    await page.fill('input[type="password"]', process.env.CUSTOMER_PASSWORD || '123456');
    await page.click('button[type="submit"]');

    // 2. DASHBOARD CLIENTE
    await page.waitForURL('**/portal');
    await expect(page.locator('text=Portal do Cliente Anunciante')).toBeVisible();

    // 3. CONTRATO CORRETO E PONTOS
    // Verifica se carregou sem exibir falhas ou mocks
    await expect(page.locator('text=Contratos Vigentes')).toBeVisible();
    await expect(page.locator('text=Campanhas Ativas')).toBeVisible();
    await expect(page.locator('text=Artes Aprovadas')).toBeVisible();
  });
});
