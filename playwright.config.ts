import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';

// Read from default ".env" file.
dotenv.config();

// Override with E2E specific ephemeral credentials if generated
if (fs.existsSync('.env.e2e.local')) {
  dotenv.config({ path: '.env.e2e.local', override: true });
}

/**
 * SOBRE MÍDIA ERP v3.0 — Playwright E2E Configuration
 * Fluxos críticos: Login → CRM → Contrato → Assinatura → Financeiro → BI → IA
 */
export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: false, // ERP flows são sequenciais por natureza
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Inicia o servidor de dev antes dos testes em ambiente local
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
