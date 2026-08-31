/**
 * SOBRE MÍDIA ERP - Provisionamento de Infraestrutura E2E
 * 
 * Este script deve ser executado UMA ÚNICA VEZ pelo administrador do sistema
 * para criar o Tenant E2E e o Usuário E2E isolados para testes automatizados.
 * 
 * REQUISITOS (no arquivo .env):
 * VITE_SUPABASE_URL=...
 * SUPABASE_SERVICE_ROLE_KEY=... (NUNCA COMMITE ESTA CHAVE)
 * TEST_USER_EMAIL=e2e-owner@sobremidia.com.br
 * TEST_USER_PASSWORD=...
 * 
 * EXECUÇÃO:
 * node scripts/provision_e2e_infra.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carrega as variáveis do .env na raiz do projeto
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('🚨 ERRO FATAL: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  console.error('Adicione a chave Service Role temporariamente ao seu .env local (ela não será commitada).');
  process.exit(1);
}

if (!testEmail || !testPassword) {
  console.error('🚨 ERRO FATAL: TEST_USER_EMAIL e TEST_USER_PASSWORD são obrigatórios no .env.');
  process.exit(1);
}

import { createSafeAuthAdmin } from '../utils/safeAuthAdmin.mjs';

// ⚠️ PROTEÇÃO DE PRODUÇÃO: Exige flag explícita se a URL não for localhost
if (!supabaseUrl.includes('localhost') && process.argv[2] !== '--force') {
  console.error('⚠️ ATENÇÃO: Você está apontando para um ambiente remoto.');
  console.error('Execute: node scripts/e2e/bootstrap-e2e.js --force');
  process.exit(1);
}

const supabaseAdminRaw = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
const supabaseAdmin = createSafeAuthAdmin(supabaseAdminRaw);

async function provisionE2E() {
  console.log(`🚀 Iniciando provisionamento da infraestrutura E2E para: ${testEmail}`);

  // 1. Criar E2E Tenant
  const tenantId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  console.log('🏢 Garantindo existência do E2E Tenant (isolamento de dados)...');
  
  const { error: tenantError } = await supabaseAdmin
    .from('empresa_operadora')
    .upsert({
      id: tenantId,
      nome: 'Sobre Mídia E2E Tenant',
      nome_fantasia: 'E2E Tenant Test',
      cnpj: '99.999.999/0001-99',
      email: testEmail,
      telefone: '(99) 99999-9999',
      status: 'ACTIVE'
    }, { onConflict: 'cnpj' });

  if (tenantError) {
    console.error('Erro ao criar E2E Tenant:', tenantError);
    process.exit(1);
  }

  // 2. Buscar o ID do perfil OWNER
  console.log('🛡️ Buscando perfil constitucional OWNER...');
  const { data: ownerProfile, error: profileError } = await supabaseAdmin
    .from('perfis')
    .select('id')
    .eq('nome', 'OWNER')
    .single();

  if (profileError || !ownerProfile) {
    console.error('Erro ao localizar perfil OWNER:', profileError);
    process.exit(1);
  }

  // 3. Criar o Usuário no Supabase Auth (Admin API)
  console.log('👤 Provisionando identidade de teste Auth (Bypass RLS)...');
  let authUserId;

  // Verifica se o usuário já existe no auth.users listando os usuários
  const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(u => u.email === testEmail);

  if (existingUser) {
    console.log(`⚠️ Usuário Auth já existe: ${existingUser.id}. Atualizando senha...`);
    authUserId = existingUser.id;
    await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: testPassword,
      email_confirm: true,
      user_metadata: { test_confirmed: true }
    });
  } else {
    console.log('Criando novo usuário Auth...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Owner Automático', test_confirmed: true }
    });

    if (authError) {
      console.error('Erro ao criar usuário Auth:', authError);
      process.exit(1);
    }
    authUserId = authData.user.id;
  }

  // 4. Inserir/Atualizar o perfil do usuário em public.usuarios
  console.log('🔗 Vinculando usuário ao E2E Tenant e promovendo a OWNER...');
  
  // Como as triggers podem já ter inserido algo no public.usuarios, usamos UPSERT
  const { error: userError } = await supabaseAdmin
    .from('usuarios')
    .upsert({
      id: authUserId,
      email: testEmail,
      nome: 'E2E Owner Automático',
      perfil_id: ownerProfile.id,
      empresa_operadora_id: tenantId,
      status_ciclo_vida: 'APPROVED', // Bypassa o fluxo de aprovação manual
      ativo: true,
      is_owner: true
    }, { onConflict: 'id' });

  if (userError) {
    console.error('Erro ao atualizar public.usuarios:', userError);
    process.exit(1);
  }

  console.log('✅ Infraestrutura E2E provisionada com sucesso!');
  console.log('🟢 Tenant Isolado: OK');
  console.log('🟢 Identidade Auth: OK');
  console.log('🟢 Patente OWNER e Aprovação: OK');
  console.log('\nVocê já pode executar o Playwright!');
}

provisionE2E().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
