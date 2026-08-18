import { test, expect } from '@playwright/test';

test.describe('Owner Customer Center', () => {
  // Teste temporariamente isolado da pipeline remota porque requer CREDENCIAIS PRIVADAS DO SUPABASE AUTH
  test.skip('Deve criar um cliente, persistir, e verificar Cliente 360', async ({ page }) => {
    // 1. LOGIN OWNER
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.OWNER_EMAIL || 'owner@test.com');
    await page.fill('input[type="password"]', process.env.OWNER_PASSWORD || (() => { throw new Error('OWNER_PASSWORD obrigatorio (ver .env.e2e.local)'); })());
    await page.click('button[type="submit"]');

    // 2. NAVEGAR PARA CENTRAL DE CLIENTES
    await page.waitForURL('**/workspace/corporate');
    await page.goto('/workspace/clientes');
    await expect(page.locator('text=Carteira de Clientes')).toBeVisible();

    // 3. CRIAR CLIENTE
    await page.click('button:has-text("+ Cadastrar Novo Cliente")');
    await page.waitForURL('**/workspace/clientes/novo');
    await page.fill('input[name="cnpj"]', '12.345.678/0001-99');
    await page.fill('input[name="razao_social"]', 'Playwright Test Client Ltda');
    await page.click('button:has-text("Salvar Cliente")');

    // 4. CONFIRMAR RESPOSTA HTTP
    const response = await page.waitForResponse(response => response.url().includes('/clientes') && response.request().method() === 'POST');
    expect(response.status()).toBe(201); // Ou o status configurado

    // 5. RELOAD
    await page.goto('/workspace/clientes');

    // 6. CLIENTE CONTINUA EXISTENTE
    await expect(page.locator('text=Playwright Test Client Ltda')).toBeVisible();

    // 7. ABRIR CLIENTE 360
    await page.click('text=VisÃ£o 360Âº');
    await expect(page.locator('text=InformaÃ§Ãµes Cadastrais')).toBeVisible();
    await expect(page.locator('text=GestÃ£o de Identidade e Acesso')).toBeVisible();
  });
});
