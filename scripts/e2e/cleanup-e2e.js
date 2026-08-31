/**
 * SOBRE MÍDIA ERP - Limpeza de Infraestrutura E2E
 * 
 * Remove exclusivamente os dados do Tenant E2E e o usuário associado.
 * IDEMPOTENTE: Pode ser rodado várias vezes com segurança.
 * 
 * REQUISITOS (no arquivo .env):
 * VITE_SUPABASE_URL=...
 * SUPABASE_SERVICE_ROLE_KEY=...
 * TEST_USER_EMAIL=e2e-owner@sobremidia.com.br
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { createSafeAuthAdmin } from '../utils/safeAuthAdmin.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testEmail = process.env.TEST_USER_EMAIL;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('🚨 ERRO FATAL: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

if (!testEmail || !testEmail.includes('e2e')) {
  console.error('🚨 ERRO DE SEGURANÇA: O email de teste não parece ser um email E2E válido. Abortando para proteger produção.');
  process.exit(1);
}

// ⚠️ PROTEÇÃO DE PRODUÇÃO: Exige flag explícita se a URL não for localhost (não automatizado)
if (!supabaseUrl.includes('localhost') && process.argv[2] !== '--force') {
  console.error('⚠️ ATENÇÃO: Você está apontando para um ambiente remoto.');
  console.error('Execute: node scripts/e2e/cleanup-e2e.js --force');
  process.exit(1);
}

const supabaseAdminRaw = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const supabaseAdmin = createSafeAuthAdmin(supabaseAdminRaw);

async function cleanupE2E() {
  console.log(`🧹 Iniciando limpeza E2E para: ${testEmail}`);
  const tenantId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  // 1. Apagar Usuário do Auth
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
  const testUser = usersData?.users?.find(u => u.email === testEmail);

  if (testUser) {
    console.log(`🗑️ Removendo usuário Auth (${testUser.id})...`);
    await supabaseAdmin.auth.admin.deleteUser(testUser.id);
  }

  // 2. Apagar dados do Tenant (Cascade cuidará da maioria, mas garantimos a exclusão da empresa)
  console.log(`🗑️ Removendo Tenant E2E (${tenantId}) e todos os dados associados (via Cascade)...`);
  const { error: deleteError } = await supabaseAdmin
    .from('empresa_operadora')
    .delete()
    .eq('id', tenantId);

  if (deleteError) {
    console.error('Erro ao deletar tenant E2E:', deleteError);
  }

  console.log('✅ Ambiente E2E limpo com sucesso.');
}

cleanupE2E().catch(console.error);
