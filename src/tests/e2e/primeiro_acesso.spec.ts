import { test, expect } from '@playwright/test';

/**
 * ======================================================================
 * E2E FÍSICO — PRIMEIRO ACESSO (BUG P0)
 * Jornada real no navegador com senha de EXATAMENTE 6 caracteres:
 *   provisionamento → login inicial → troca obrigatória → nova senha
 *   → portal do Anunciante → logout → re-login → ACESSO NORMAL (sem loop)
 * ======================================================================
 */

const SUPA = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';
const PROVISIONADOR = { email: 'usuario1anunciante@sobremidia.com.br', senha: 'Anunciante@2026!' };
const SENHA_NOVA_6 = 'abc123'; // exatamente 6 caracteres — caso do bug P0

async function rest(pathname: string, opts: { method?: string; jwt?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (opts.jwt) headers.Authorization = `Bearer ${opts.jwt}`;
  const res = await fetch(`${SUPA}${pathname}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* vazio */ }
  return { status: res.status, ok: res.ok, json };
}

let EMAIL_UI = '';
let SENHA_INICIAL = '';

test.beforeAll(async () => {
  // Provisiona membro da equipe via edge oficial (perfil CLIENTE → /portal)
  const l = await rest('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: PROVISIONADOR.email, password: PROVISIONADOR.senha },
  });
  const jwt = l.json?.access_token;
  if (!jwt) throw new Error('provisionador não logou');

  const perf = await rest('/rest/v1/perfis?select=id&nome=eq.CLIENTE', { jwt });
  const perfilId = perf.json?.[0]?.id;

  EMAIL_UI = `p0.ui.${Date.now()}@sobremidia.test`;
  const prov = await rest('/functions/v1/provision-user', {
    method: 'POST', jwt,
    body: { nome: 'P0 UI Journey', email: EMAIL_UI, perfilId, clienteId: '77777777-1111-7000-8000-000000000001' },
  });
  if (!prov.ok || !prov.json?.senha_inicial) {
    throw new Error('provision falhou: ' + JSON.stringify(prov.json));
  }
  SENHA_INICIAL = prov.json.senha_inicial;
});

test('P0: primeiro acesso define senha de 6 caracteres e NÃO volta a pedir (sem loop)', async ({ page }) => {
  test.setTimeout(180_000);

  // ---------- 1. LOGIN INICIAL ----------
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(EMAIL_UI);
  await page.locator('input[type="password"]').first().fill(SENHA_INICIAL);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  // ---------- 2. SISTEMA OBRIGA A TROCA ----------
  await page.waitForURL(/\/auth\/change-password/, { timeout: 30_000 });
  await expect(page.getByText('Defina sua nova senha')).toBeVisible({ timeout: 15_000 });

  // ---------- 3. SENHA DE 6 CARACTERES + FORÇA INFORMATIVA ----------
  await page.locator('#nova-senha').fill(SENHA_NOVA_6);
  // barra informativa presente; "Senha válida" aparece mesmo com força não-máxima
  await expect(page.getByTestId('forca-rotulo')).toContainText('Força:');
  await expect(page.getByText('Senha válida')).toBeVisible();
  await page.locator('#confirmar-senha').fill(SENHA_NOVA_6);

  // mismatch mostra aviso e mantém botão desabilitado
  await page.locator('#confirmar-senha').fill('abc124');
  await expect(page.getByText('As senhas não coincidem.').first()).toBeVisible();
  await expect(page.getByTestId('btn-definir-senha')).toBeDisabled();
  await page.locator('#confirmar-senha').fill(SENHA_NOVA_6);

  // ---------- 4. DEFINIR NOVA SENHA → PORTAL ----------
  await page.getByTestId('btn-definir-senha').click();
  await page.waitForURL(/\/portal/, { timeout: 45_000 });

  // NÃO pode aparecer a tela de troca novamente dentro do portal
  await page.waitForTimeout(3000);
  expect(page.url()).not.toContain('/auth/change-password');
  await expect(page.getByText('Defina sua nova senha')).toHaveCount(0);

  // ---------- 5. LOGOUT ----------
  // Tenta o logout pela UI (desktop: botão próprio; mobile: drawer). Em mobile o
  // drawer pode fechar por remount — nesse caso cai para limpeza de sessão.
  const menuHamburger = page.getByRole('button', { name: 'Menu' });
  if (await menuHamburger.isVisible().catch(() => false)) {
    await menuHamburger.click().catch(() => {});
  }
  const sairUi = page.getByRole('button', { name: /Sair/i }).locator('visible=true').first();
  try {
    await sairUi.click({ timeout: 6_000 });
  } catch {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL(/\/auth|\/$/, { timeout: 30_000 });
  await page.waitForURL(/\/auth|\/$/, { timeout: 30_000 });

  // ---------- 6. RE-LOGIN COM A NOVA SENHA → ACESSO NORMAL ----------
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(EMAIL_UI);
  await page.locator('input[type="password"]').first().fill(SENHA_NOVA_6);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await page.waitForURL(/\/portal/, { timeout: 45_000 });
  await page.waitForTimeout(3000);
  // SEM LOOP: nunca reaparece a tela de troca obrigatória
  expect(page.url()).not.toContain('/auth/change-password');
  await expect(page.getByText('Defina sua nova senha')).toHaveCount(0);

  // ---------- 7. SENHA INICIAL morta (API) ----------
  const old = await rest('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: EMAIL_UI, password: SENHA_INICIAL },
  });
  expect(old.ok).toBe(false);
});
