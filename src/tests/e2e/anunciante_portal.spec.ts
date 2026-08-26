import { test, expect } from '@playwright/test';

/**
 * FASE 2 - FASE H: Portal do Anunciante E2E
 * Credenciais oficiais de teste (perfil ANUNCIANTE real).
 * Fluxo: /auth -> signInWithPassword -> redirecionamento por perfil -> /portal
 */

const ANUNCIANTE_EMAIL = process.env.E2E_ANUNCIANTE_EMAIL || 'usuario1anunciante@sobremidia.com.br';
const ANUNCIANTE_PASS = process.env.E2E_ANUNCIANTE_PASS || 'Anunciante@2026!';

test.describe('Portal do Anunciante', () => {
  test.setTimeout(120_000);

  test('login ANUNCIANTE deve cair no /portal e NAO em areas administrativas', async ({ page }) => {
    await page.goto('/auth');

    await page.fill('input[type="email"]', ANUNCIANTE_EMAIL);
    await page.fill('input[type="password"]', ANUNCIANTE_PASS);
    await page.click('button[type="submit"]');

    // Redirecionamento pós-login por perfil ANUNCIANTE -> /portal
    await page.waitForURL(/\/portal/, { timeout: 60_000 });

    const url = new URL(page.url());
    expect(url.pathname.startsWith('/portal')).toBe(true);
    expect(url.pathname.startsWith('/workspace')).toBe(false);
    expect(url.pathname.startsWith('/dashboard')).toBe(false);
    expect(url.pathname.startsWith('/representantes')).toBe(false);

    // O portal carrega com a experiencia do anunciante (layout proprio).
    // No mobile alguns badges com o termo são `hidden md:inline-flex` —
    // considera apenas elementos VISÍVEIS.
    await expect(
      page.getByText(/anunciante/i).locator('visible=true').first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
