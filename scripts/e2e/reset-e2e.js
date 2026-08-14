/**
 * SOBRE MÍDIA ERP - Reset da Infraestrutura E2E
 * 
 * Limpa e recria o Tenant E2E.
 */

import { execSync } from 'child_process';
import path from 'path';

const cleanupPath = path.resolve(__dirname, 'cleanup-e2e.js');
const bootstrapPath = path.resolve(__dirname, 'bootstrap-e2e.js');

try {
  console.log('🔄 Executando RESET E2E...');
  execSync(`node ${cleanupPath} --force`, { stdio: 'inherit' });
  execSync(`node ${bootstrapPath}`, { stdio: 'inherit' });
  console.log('✅ Reset E2E finalizado com sucesso.');
} catch (err) {
  console.error('🚨 Falha no Reset E2E:', err.message);
  process.exit(1);
}
