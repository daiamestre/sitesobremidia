import { test, expect } from '@playwright/test';
import fs from 'fs';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, login } from './helpers';

const COB_RE = /COB-\d{4}-\d{6}/;

type CobrancaAlvo = { id: string; codigo_operacional: string };

/**
 * Localiza uma cobrança do tenant E2E para validar resolução por código e
 * redirect de URL legada. Fonte: fixture gerada pelo seed isolado
 * (scratch/seed_e2e_cobranca.mjs -> scratch/billing_e2e_fixture.json).
 */
function buscarCobrancaDoTenant(): CobrancaAlvo | null {
  try {
    const raw = fs.readFileSync('scratch/billing_e2e_fixture.json', 'utf8');
    const alvo = JSON.parse(raw);
    return alvo?.id && alvo?.codigo_operacional ? alvo : null;
  } catch {
    return null;
  }
}

test.describe('Billing — identificadores operacionais na URL', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  });

  test('Central exibe COB-AAAA-NNNNNN e o clique abre /financeiro/cobrancas/<código>', async ({ page }) => {
    await page.goto('/financeiro/cobrancas', { waitUntil: 'domcontentloaded' });

    // Agenda pode conter cards; a referência canônica está nas células da tabela
    const ref = page.locator('table td.font-mono', { hasText: COB_RE }).first();
    await expect(ref).toBeVisible({ timeout: 30_000 });

    const codigo = (await ref.textContent())!.trim();
    expect(codigo).toMatch(COB_RE);

    await ref.click();
    await expect(page).toHaveURL(new RegExp(`/financeiro/cobrancas/${codigo}$`), { timeout: 20_000 });
    await expect(page.getByText('Contas a Receber')).toBeVisible({ timeout: 20_000 });

    // UUID não aparece como identificador principal
    expect(await page.locator('h2').textContent()).toMatch(COB_RE);
  });

  test('URL nova (código operacional) resolve e renderiza a cobrança', async ({ page }) => {
    const alvo = buscarCobrancaDoTenant();
    test.skip(!alvo, 'Tenant E2E sem cobrança com código operacional');
    await page.goto(`/financeiro/cobrancas/${alvo!.codigo_operacional}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Contas a Receber')).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain(`/financeiro/cobrancas/${alvo!.codigo_operacional}`);
    await expect(page.locator('h2')).toContainText(alvo!.codigo_operacional);
  });

  test('URL legada (UUID) resolve a cobrança e redireciona para a URL do código', async ({ page }) => {
    const alvo = buscarCobrancaDoTenant();
    test.skip(!alvo, 'Tenant E2E sem cobrança com código operacional');
    await page.goto(`/financeiro/cobrancas/${alvo!.id}`, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(
      new RegExp(`/financeiro/cobrancas/${alvo!.codigo_operacional}$`),
      { timeout: 30_000 }
    );
    await expect(page.getByText('Contas a Receber')).toBeVisible({ timeout: 20_000 });
  });
});
