import { test, expect, Page } from '@playwright/test';

/**
 * E2E: Fluxo de Autenticação — Login e Acesso ao ERP
 *
 * Cobre:
 * - Página de login do representante
 * - Redirecionamento pós-login para o CRM Dashboard
 * - Verificação de elementos críticos da UI
 * - Logout
 */

// Helper: navega para a tela de login dos representantes
// ROTA REAL: /representantes/login (pública) — /representantes é RequireApproval (protegida)
// Prova: App.tsx define /representantes como CrmLayout protegido e /representantes/login como público
async function goToLogin(page: Page) {
  await page.goto('/representantes/login');
  // Espera determinística pelo formulário de login (React montado).
  // Com o Supabase real conectado, a validação de sessão + redirect
  // pode levar dezenas de segundos — networkidle nunca estabiliza.
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 60000 });
}

test.describe('Autenticação — Portal do Representante', () => {
  test.setTimeout(180_000);

  test('deve exibir a tela de login ao acessar /representantes', async ({ page }) => {
    await goToLogin(page);
    // A página de login deve estar visível
    await expect(page).toHaveURL(/representantes/);
    // Deve conter algum formulário ou campo de entrada
    const hasInput = await page.locator('input[type="email"], input[type="text"], input[name="email"]').count();
    expect(hasInput).toBeGreaterThan(0);
  });

  test('deve exibir campo de senha na tela de login', async ({ page }) => {
    await goToLogin(page);
    const passwordField = page.locator('input[type="password"]');
    await expect(passwordField).toBeVisible();
  });

  test('deve ter botão de submit/entrar visível', async ({ page }) => {
    await goToLogin(page);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acessar")');
    await expect(submitBtn.first()).toBeVisible();
  });

  test('não deve navegar para o dashboard sem credenciais', async ({ page }) => {
    await page.goto('/representantes/dashboard');
    // Sem autenticação, deve redirecionar para o login (via RequireApproval → /auth ou /representantes/login)
    // Supabase getSession real pode levar >15s em rede — timeout estendido para 60s
    await page.waitForURL(url => url.toString().includes('auth') || url.toString().includes('login'), { timeout: 60000 });
    await expect(page).not.toHaveURL('/representantes/dashboard');
  });

  test('página inicial deve carregar sem erros de console críticos', async ({ page }) => {
    const criticalErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        criticalErrors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('load');
    // Filtrar erros não relacionados à app (ex: extensões do browser, ResizeObserver, third-party)
    const appErrors = criticalErrors.filter(e => !e.includes('extension') && !e.includes('chrome-extension') && !e.includes('ResizeObserver') && !e.includes('Failed to load resource'));
    expect(appErrors.length).toBe(0);
  });
});

test.describe('Página Principal (Landing Page)', () => {

  test('deve exibir a landing page em /', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/');
  });

  test('deve ter title definido e não vazio', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('deve carregar em menos de 5 segundos', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe('Rotas de Player (Digital Signage)', () => {

  test('/player deve carregar sem erro 404', async ({ page }) => {
    const response = await page.goto('/player');
    // Player page pode ter redirect, mas não deve ser 404
    expect(response?.status()).not.toBe(404);
  });
});

test.describe('PWA — Service Worker e Assets', () => {

  test('deve servir manifest.webmanifest', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('name');
  });
});
