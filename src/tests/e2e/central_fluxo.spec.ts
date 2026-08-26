import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_REP_EMAIL, E2E_REP_PASSWORD, login } from './helpers';

const TITULO_CENTRAL = 'Central de Comunicação & Inteligência';
const NOTIF_OWNER = 'audit seed owner';
const NOTIF_VAZAMENTO = 'teste vazamento tenant';
const REP_NOME = 'E2E Representante';
const OWNER_NOME = 'E2E Owner';
const MSG_E2E = 'Mensagem E2E Central';

async function resetSeedNotification() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    { auth: { persistSession: false } }
  );
  const { error: le } = await supabase.auth.signInWithPassword({ email: E2E_OWNER_EMAIL, password: E2E_OWNER_PASSWORD });
  if (le) throw new Error(`reset login falhou: ${le.message}`);

  // Estado determinístico: zera o inbox do PRÓPRIO tenant (RLS limita o update)
  const { error: e0 } = await supabase
    .from('notificacoes_central')
    .update({ lida: true, status_notificacao: 'LIDA', resolvida_em: new Date().toISOString() })
    .neq('titulo', NOTIF_OWNER);
  if (e0) throw new Error(`zerar inbox falhou: ${e0.message}`);

  const { error } = await supabase
    .from('notificacoes_central')
    .update({
      lida: false,
      status_notificacao: 'NAO_LIDA',
      resolvida_em: null,
      // Feed paginado (30 mais recentes): renova a data p/ o seed nunca sair da 1ª página
      created_at: new Date().toISOString(),
    })
    .eq('titulo', NOTIF_OWNER);
  await supabase.auth.signOut();
  if (error) throw new Error(`reset falhou: ${error.message}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('E2E CENTRAL - FLUXO COMPLETO COM RLS', () => {
  test('OWNER: dashboard, inbox real, RLS anti-vazamento, decisão e chat', async ({ page }) => {
    test.setTimeout(240_000);

    console.log('0. RESET estado da notificação seed...');
    await resetSeedNotification();

    console.log('1. LOGIN OWNER...');
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);

    console.log('2. ABRIR CENTRAL...');
    await page.goto('/workspace/central', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(TITULO_CENTRAL)).toBeVisible({ timeout: 30000 });

    console.log('3. KPIs renderizam...');
    await expect(page.getByRole('heading', { name: 'Solicitações Pendentes' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Não Lidas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Receita Faturada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alertas Críticos' })).toBeVisible();

    console.log('4. Inbox: notificação do OWNER visível...');
    await expect(page.getByText(NOTIF_OWNER)).toBeVisible({ timeout: 20000 });

    console.log('5. RLS: notificação de OUTRO TENANT NÃO pode aparecer...');
    await expect(page.getByText(NOTIF_VAZAMENTO)).not.toBeVisible();

    console.log('6. Marcar como lida...');
    await expect(page.getByRole('button', { name: /Marcar todas como lidas/ })).toBeVisible({ timeout: 15000 });
    await page.locator('[title="Marcar como lida"]').first().click();
    await expect(page.getByText('LIDA', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Marcar todas como lidas/ })).not.toBeVisible({ timeout: 20000 });

    console.log('7. Chat: criar conversa individual com o Representante...');
    await page.getByRole('tab', { name: /Chat/ }).click();
    await expect(page.getByRole('button', { name: 'Nova', exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Nova', exact: true }).click();
    await expect(page.getByText('Nova conversa')).toBeVisible({ timeout: 15000 });
    const cbRep = page.locator('label', { hasText: REP_NOME }).locator('input[type="checkbox"]');
    await expect(cbRep).toBeVisible({ timeout: 15000 });
    await cbRep.check();
    await page.getByRole('button', { name: /Criar conversa/ }).click();

    console.log('8. Conversa criada aparece na lista...');
    await expect(page.locator('button', { hasText: REP_NOME }).first()).toBeVisible({ timeout: 20000 });

    console.log('9. Enviar mensagem e verificar exibição...');
    await page.locator('button', { hasText: REP_NOME }).first().click();
    await page.fill('input[placeholder="Escreva sua mensagem..."]', MSG_E2E);
    await page.keyboard.press('Enter');
    await expect(page.getByText(MSG_E2E).first()).toBeVisible({ timeout: 20000 });

    console.log('10. Inteligência: KPIs executivos reais renderizam...');
    await page.getByRole('tab', { name: /Inteligência/ }).click();
    await expect(page.getByText('Ocupação da Rede')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('SLA da Rede')).toBeVisible();

    console.log('FLUXO OWNER OK.');
  });

  test('REP: central acessível com isolamento de tenant (não vê dados do outro tenant)', async ({ page }) => {
    test.setTimeout(240_000);

    console.log('1. LOGIN REP...');
    await login(page, E2E_REP_EMAIL, E2E_REP_PASSWORD);

    console.log('2. ABRIR CENTRAL DO REPRESENTANTE...');
    await page.goto('/representantes/central', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(TITULO_CENTRAL)).toBeVisible({ timeout: 30000 });

    console.log('3. RLS: notificação do OWNER NÃO aparece para o REP...');
    await expect(page.getByText(NOTIF_OWNER)).not.toBeVisible({ timeout: 20000 });

    console.log('4. RLS: notificação de OUTRO TENANT NÃO aparece para o REP...');
    await expect(page.getByText(NOTIF_VAZAMENTO)).not.toBeVisible();

    console.log('5. REP é participante da conversa criada pelo OWNER...');
    await page.getByRole('tab', { name: /Chat/ }).click();
    await expect(page.locator('button', { hasText: OWNER_NOME }).first()).toBeVisible({ timeout: 20000 });

    console.log('ISOLAMENTO OK.');
  });
});