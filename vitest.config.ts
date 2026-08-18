import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // E2E roda via: npx playwright test (separado do Vitest)
    exclude: ['src/tests/e2e/**', 'node_modules/**'],
    include: [
      'src/tests/unit/**/*.{test,spec}.{ts,tsx}',
      'src/tests/integration/**/*.{test,spec}.{ts,tsx}',
      'src/tests/security/**/*.{security,test}.{ts,tsx}',
      'src/tests/crm/**/*.{test,spec}.{ts,tsx}',
      'src/tests/regression/**/*.{test,spec}.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/modules/crm/services/**/*.ts'],
      exclude: ['src/tests/**', 'node_modules/**'],
      thresholds: {
        // Baseline progressivo — aumentar à medida que novos testes são adicionados
        lines: 10,
        functions: 10,
        branches: 5,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
