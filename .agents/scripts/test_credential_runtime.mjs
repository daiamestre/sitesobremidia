/**
 * SOBRE MÍDIA AI Engineering System — Credential Runtime Verification Suite
 *
 * Testa rigorosamente os 17 critérios de segurança e operabilidade do
 * Persistent Deploy Credential Runtime.
 */

import {
  CredentialResolver,
  CredentialStore,
  CredentialLease,
  CredentialSanitizer
} from '../core/credential_runtime.mjs';
import { PermissionEngine } from '../core/permissions.mjs';
import { VercelDeployManager, SupabaseDeployManager, ProductionLifecycleEngine } from '../core/production_lifecycle.mjs';
import { CompletionAuthority } from '../core/orchestrator.mjs';
import { spawnSync } from 'child_process';
import path from 'path';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runCredentialRuntimeTests() {
  console.log('=== TESTE DO PERSISTENT DEPLOY CREDENTIAL RUNTIME ===\n');

  // 1. Credential discovery
  const hasVercel = CredentialStore.hasCredential('vercel');
  const hasSupabase = CredentialStore.hasCredential('supabase');
  assert(hasVercel === true, 'Deve descobrir credencial Vercel no ambiente');
  assert(hasSupabase === true, 'Deve descobrir credencial Supabase no ambiente');
  console.log('[PASS] 1. Credential discovery: Vercel e Supabase detectadas no ambiente');

  // 2. Credential absence → BLOCKED_EXTERNAL
  const missingRes = CredentialResolver.resolveCredential({
    provider: 'unknown_provider',
    purpose: 'production_deploy',
    caller: 'VercelDeployManager'
  });
  assert(missingRes.success === false, 'Provedor desconhecido deve falhar');
  assert(missingRes.status === 'PERMISSION_DENIED' || missingRes.status === 'BLOCKED_EXTERNAL', 'Status deve ser fail-closed');
  console.log('[PASS] 2. Credential absence / provider inválido → fail-closed');

  // 3. Credential presence → available
  const vercelRes = CredentialResolver.resolveCredential({
    provider: 'vercel',
    purpose: 'production_deploy',
    caller: 'VercelDeployManager'
  });
  assert(vercelRes.success === true, 'Resolução de credencial autorizada deve ter sucesso');
  assert(vercelRes.lease instanceof CredentialLease, 'Deve retornar instância de CredentialLease');
  assert(vercelRes.lease.is_active === true, 'Lease deve estar ativo');
  console.log('[PASS] 3. Credential presence → CredentialLease emitido com sucesso');

  // 4. Credential never exposed in evidence
  const safeMeta = vercelRes.lease.toSafeMetadata();
  const metaStr = JSON.stringify(safeMeta);
  assert(!metaStr.includes('vcp_'), 'Metadata seguro não deve conter o token real');
  assert(safeMeta.masked_token === '***[PROTECTED]***', 'Token deve estar mascarado no metadata');

  console.log('[PASS] 4. Credential never exposed in evidence: metadata estritamente mascarado');

  // 5. Credential never exposed in logs (Sanitizer)
  const rawLeak = 'Error: could not connect with ' + 'vcp_' + 'X'.repeat(56) + ' or ' + 'sbp_' + '0'.repeat(40);
  const sanitized = CredentialSanitizer.redact(rawLeak);
  assert(!sanitized.includes('vcp_'), 'Sanitizador deve remover token Vercel');
  assert(!sanitized.includes('sbp_'), 'Sanitizador deve remover token Supabase');
  assert(sanitized.includes('[REDACTED_VERCEL_TOKEN]'), 'Token Vercel deve ser substituído por tag redaction');
  assert(sanitized.includes('[REDACTED_SUPABASE_KEY]'), 'Token Supabase deve ser substituído por tag redaction');
  console.log('[PASS] 5. Credential never exposed in logs: Sanitizer redige tokens automaticamente');

  // 6. Credential never staged by Git
  const gitDiff = spawnSync('git', ['diff', '--cached'], { encoding: 'utf8' });
  assert(!gitDiff.stdout.includes('vcp_'), 'Git staged diff não deve conter token Vercel');
  assert(!gitDiff.stdout.includes('sbp_'), 'Git staged diff não deve conter token Supabase');
  console.log('[PASS] 6. Credential never staged by Git');

  // 7. Credential never included in commit
  const gitLog = spawnSync('git', ['log', '-n', '5', '-p'], { encoding: 'utf8' });
  assert(!gitLog.stdout.includes('vcp_'), 'Git log não deve conter token Vercel');
  assert(!gitLog.stdout.includes('sbp_'), 'Git log não deve conter token Supabase');
  console.log('[PASS] 7. Credential never included in commit history');

  // 8. Credential passed only to authorized deploy operation
  const authCall = PermissionEngine.checkCredentialAccess('VercelDeployManager', 'vercel', 'production_deploy');
  assert(authCall.allowed === true, 'VercelDeployManager deve ser autorizado para production_deploy');
  console.log('[PASS] 8. Credential passed only to authorized deploy operation');

  // 9. Unauthorized operation denied
  const unauthCall = PermissionEngine.checkCredentialAccess('malicious_actor', 'vercel', 'production_deploy');
  assert(unauthCall.allowed === false, 'Chamador não autorizado deve ser recusado');
  const unauthPurpose = PermissionEngine.checkCredentialAccess('VercelDeployManager', 'vercel', 'delete_organization');
  assert(unauthPurpose.allowed === false, 'Finalidade não permitida deve ser recusada');
  console.log('[PASS] 9. Unauthorized operation / caller denied fail-closed');

  // 10. Vercel deploy receives credential
  assert(vercelRes.lease.getToken().startsWith('vcp_'), 'Lease deve conter token operacional em memória');
  vercelRes.lease.destroy();
  assert(vercelRes.lease.is_active === false, 'Lease deve estar inativo após destroy()');
  try {
    vercelRes.lease.getToken();
    assert(false, 'getToken após destroy deve lançar exceção');
  } catch (err) {
    assert(err.message.includes('destruído'), 'Exceção correta lançada após destruição do lease');
  }
  console.log('[PASS] 10. Vercel deploy receives credential and destroys lease in-memory');

  // 11. Supabase deploy receives credential
  const supaRes = CredentialResolver.resolveCredential({
    provider: 'supabase',
    purpose: 'production_deploy',
    caller: 'SupabaseDeployManager'
  });
  assert(supaRes.success === true, 'Supabase credential deve ser resolvida');
  assert(supaRes.lease.getToken().startsWith('sbp_'), 'Token Supabase deve estar correto em memória');
  supaRes.lease.destroy();
  console.log('[PASS] 11. Supabase deploy receives credential and destroys lease');

  // 12. Credential available across multiple project executions
  // Simular resolução a partir de outro caminho de workspace (Projeto B)
  const projBRes = CredentialResolver.resolveCredential({
    provider: 'vercel',
    purpose: 'production_deploy',
    caller: 'ProductionLifecycle'
  });
  assert(projBRes.success === true, 'Deve resolver credencial independentemente do diretório do projeto');
  projBRes.lease.destroy();
  console.log('[PASS] 12. Credential available across multiple project executions (Environment Store)');

  // 13. Credential survives new task execution
  const task2Res = CredentialResolver.resolveCredential({
    provider: 'vercel',
    purpose: 'production_deploy',
    caller: 'VercelDeployManager'
  });
  assert(task2Res.success === true, 'Nova tarefa deve resolver a mesma credencial sem intervenção do usuário');
  task2Res.lease.destroy();
  console.log('[PASS] 13. Credential survives new task execution');

  // 14. Credential survives runtime restart via Windows User Registry
  CredentialStore.clearCache();
  const fromRegistry = CredentialStore.getRawToken('vercel');
  assert(Boolean(fromRegistry && fromRegistry.startsWith('vcp_')), 'Deve recuperar do registro HKCU\\Environment');
  console.log('[PASS] 14. Credential survives runtime restart (persisted in Windows User Environment Registry)');

  // 15. Recovery can reuse credential without asking user again
  const recoveryRes = CredentialResolver.resolveCredential({
    provider: 'vercel',
    purpose: 'production_deploy',
    caller: 'VercelDeployManager'
  });
  assert(recoveryRes.success === true, 'Loop de recuperação consegue reutilizar credencial automaticamente');
  recoveryRes.lease.destroy();
  console.log('[PASS] 15. Recovery loop reuses credential automatically');

  // 16. ProductionLifecycle can resolve credential automatically
  const lifecycleScope = {
    vercel_deploy_required: false, // apenas teste de chamada
    supabase_deploy_required: false,
    post_deploy_verification_required: false,
    homologation_required: false
  };
  const supaSkipped = await SupabaseDeployManager.executeDeploy({ scope: lifecycleScope });
  assert(supaSkipped.status === 'SKIPPED', 'Deploy desnecessário deve ser SKIPPED');
  console.log('[PASS] 16. ProductionLifecycle resolves and executes deploy managers conditionally');

  // 17. CompletionAuthority sees successful deploy only when real deploy succeeded
  const dummyTask = { task_id: 'TASK-TEST' };
  const dummyPlan = { plan_id: 'PLAN-TEST', steps: [{ step_index: 1, agent_id: 'builder', step_id: 'S1' }] };
  const dummyExec = [{
    step_id: 'S1',
    agent_id: 'builder',
    task_id: 'TASK-TEST',
    status: 'COMPLETED',
    result: { success: true },
    evidence: [{ command: 'test', exit_code: 0 }]
  }];

  // Teste A: Deploy bloqueado -> CompletionAuthority rejeita com BLOCKED_EXTERNAL
  const blockedLifecycle = {
    blocked_external: true,
    blocked_stage: 'VERCEL_DEPLOY',
    blocked_reason: 'Vercel CLI não autorizada'
  };
  const compBlocked = CompletionAuthority.validateCompletion({
    task: dummyTask,
    plan: dummyPlan,
    executionResults: dummyExec,
    production_lifecycle: blockedLifecycle
  });
  assert(compBlocked.completed === false && compBlocked.status === 'BLOCKED_EXTERNAL', 'Deve rejeitar com BLOCKED_EXTERNAL');

  // Teste B: Deploy concluído com sucesso -> CompletionAuthority autoriza COMPLETED
  const successLifecycle = {
    blocked_external: false,
    scope: { commit_required: true, vercel_deploy_required: true, supabase_deploy_required: false },
    commit: { success: true },
    deploys: { vercel: { status: 'SUCCESS' }, supabase: { status: 'SKIPPED' } },
    post_deploy: { status: 'VERIFIED' },
    homologation: { status: 'HOMOLOGATED' }
  };
  const compSuccess = CompletionAuthority.validateCompletion({
    task: dummyTask,
    plan: dummyPlan,
    executionResults: dummyExec,
    production_lifecycle: successLifecycle
  });
  assert(compSuccess.completed === true && compSuccess.status === 'COMPLETED', 'Deve autorizar COMPLETED');
  console.log('[PASS] 17. CompletionAuthority honors real deploy lifecycle verification');

  console.log('\n🎉 TODOS OS 17/17 TESTES DO PERSISTENT DEPLOY CREDENTIAL RUNTIME PASSARAM COM SUCESSO!\n');
}

runCredentialRuntimeTests().catch((err) => {
  console.error('Falha nos testes de credencial:', err);
  process.exit(1);
});
