import { test, expect } from '@playwright/test';

test.describe('Owner Workspace Navigation Smoke Test', () => {
  test('Deve renderizar rotas Owner sem disparar React Error #306', async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.error(`Page Error: ${msg.text()}`);
      }
    });

    page.on('pageerror', err => {
      errors.push(err.message);
      console.error(`Uncaught Exception: ${err.message}`);
    });

    console.log('Navegando para /workspace/clientes...');
    // Acessar a rota diretamente sem networkidle que trava no dev server
    await page.goto('/workspace/clientes', { waitUntil: 'domcontentloaded' });
    
    // Aguarda um pouco para o React fazer os mounts e eventuais redirecionamentos
    await page.waitForTimeout(5000);

    // Validate that the Error Boundary is NOT present
    const isErrorBoundaryVisible = await page.locator('text=O Player encontrou um problema').isVisible();
    expect(isErrorBoundaryVisible).toBe(false);

    // Validate that React Error #306 is not in the captured errors
    const hasReact306 = errors.some(e => e.includes('Minified React error #306'));
    expect(hasReact306).toBe(false);

    console.log('Navegação inicial verificada com sucesso. Nenhum erro 306 detectado.');
  });
});
