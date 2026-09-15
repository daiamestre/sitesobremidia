/**
 * SOBRE MÍDIA AI Engineering System — Production Lifecycle & Completion Authority Test Suite
 *
 * Valida o ciclo completo de produção:
 * 1. DeployScopeDiscovery (autonomia baseada no diff real)
 * 2. ProductionCommitManager (isolamento de commit e preservação de arquivos pré-existentes)
 * 3. VercelDeployManager (fail-closed, detecção real de credenciais)
 * 4. SupabaseDeployManager (fail-closed, detecção real de credenciais)
 * 5. PostDeployVerifier & ProductionHomologator
 * 6. CompletionAuthority (endurecimento e bloqueio de falsos COMPLETED)
 */

import assert from 'assert';
import {
  DeployScopeDiscovery,
  ProductionCommitManager,
  VercelDeployManager,
  SupabaseDeployManager,
  PostDeployVerifier,
  ProductionHomologator,
  ProductionLifecycleEngine,
  CompletionAuthority,
  CredentialResolver,
  deepFreeze
} from '../core/index.mjs';


async function runTests() {
  console.log('=== TESTE DO CICLO DE PRODUÇÃO E COMPLETION AUTHORITY ===\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // 1. DeployScopeDiscovery Tests
  test('DeployScopeDiscovery: Frontend diff requer Vercel, Commit, Post-Deploy e Homologação', () => {
    const scope = DeployScopeDiscovery.discoverScope({
      files_touched: ['src/modules/crm/components/forms/IntelligentCommercialWizard.tsx']
    });
    assert.strictEqual(scope.commit_required, true);
    assert.strictEqual(scope.vercel_deploy_required, true);
    assert.strictEqual(scope.supabase_deploy_required, false);
    assert.strictEqual(scope.post_deploy_verification_required, true);
    assert.strictEqual(scope.homologation_required, true);
    assert.strictEqual(scope.vercel_files.length, 1);
  });

  test('DeployScopeDiscovery: Supabase migration diff requer Supabase, Commit, Post-Deploy e Homologação', () => {
    const scope = DeployScopeDiscovery.discoverScope({
      files_touched: ['supabase/migrations/20260915_test_migration.sql']
    });
    assert.strictEqual(scope.commit_required, true);
    assert.strictEqual(scope.vercel_deploy_required, false);
    assert.strictEqual(scope.supabase_deploy_required, true);
    assert.strictEqual(scope.post_deploy_verification_required, true);
    assert.strictEqual(scope.homologation_required, true);
    assert.strictEqual(scope.supabase_files.length, 1);
  });

  test('DeployScopeDiscovery: Alteração mista (Frontend + Supabase) requer ambos', () => {
    const scope = DeployScopeDiscovery.discoverScope({
      files_touched: [
        'src/modules/crm/validators/cliente.validator.ts',
        'supabase/migrations/20260915_rpc_update.sql'
      ]
    });
    assert.strictEqual(scope.commit_required, true);
    assert.strictEqual(scope.vercel_deploy_required, true);
    assert.strictEqual(scope.supabase_deploy_required, true);
    assert.strictEqual(scope.post_deploy_verification_required, true);
    assert.strictEqual(scope.homologation_required, true);
  });

  test('DeployScopeDiscovery: Alteração somente interna/docs requer apenas commit, sem deploy artificial', () => {
    const scope = DeployScopeDiscovery.discoverScope({
      files_touched: [
        '.agents/core/contracts.mjs',
        'docs/reports/2026-09-15_report.md'
      ]
    });
    assert.strictEqual(scope.commit_required, true);
    assert.strictEqual(scope.vercel_deploy_required, false);
    assert.strictEqual(scope.supabase_deploy_required, false);
    assert.strictEqual(scope.post_deploy_verification_required, false);
    assert.strictEqual(scope.homologation_required, false);
  });

  test('DeployScopeDiscovery: Arquivos temporários/scratch não ativam commit nem deploy', () => {
    const scope = DeployScopeDiscovery.discoverScope({
      files_touched: [
        'scratch/engineering_artifact.md',
        'playwright-report/index.html',
        '.temp/cli.tmp'
      ]
    });
    assert.strictEqual(scope.commit_required, false);
    assert.strictEqual(scope.vercel_deploy_required, false);
    assert.strictEqual(scope.supabase_deploy_required, false);
    assert.strictEqual(scope.versionable_files.length, 0);
  });

  // 2. ProductionCommitManager Tests
  test('ProductionCommitManager: Rejeita comite vazio com status seguro', () => {
    const res = ProductionCommitManager.executeCommit({ files_to_commit: [] });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.no_changes, true);
  });

  test('ProductionCommitManager: Falha segura se arquivo a comitar não existir', () => {
    const res = ProductionCommitManager.executeCommit({ files_to_commit: ['non_existent_file_xyz_123.ts'] });
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('não encontrado'));
  });

  // 3. VercelDeployManager Tests
  await asyncTest('VercelDeployManager: Pula quando não requerido', async () => {
    const res = await VercelDeployManager.executeDeploy({
      scope: { vercel_deploy_required: false }
    });
    assert.strictEqual(res.status, 'SKIPPED');
  });

  await asyncTest('VercelDeployManager: Retorna BLOCKED_EXTERNAL quando CLI não autorizada (sem token)', async () => {
    const origResolve = CredentialResolver.resolveCredential;
    try {
      CredentialResolver.resolveCredential = () => ({
        success: false,
        status: 'BLOCKED_EXTERNAL',
        reason: 'Vercel CLI não autorizada no ambiente local. Variável VERCEL_TOKEN ou login na CLI é necessária para deploy remoto de produção.'
      });
      const res = await VercelDeployManager.executeDeploy({
        commit_sha: 'abc1234',
        scope: { vercel_deploy_required: true }
      });
      assert.strictEqual(res.required, true);
      assert.strictEqual(res.status, 'BLOCKED_EXTERNAL');
      assert.strictEqual(res.target, 'VERCEL');
      assert.ok(res.reason.includes('VERCEL_TOKEN') || res.reason.includes('não autorizada'));
    } finally {
      CredentialResolver.resolveCredential = origResolve;
    }
  });

  // 4. SupabaseDeployManager Tests
  await asyncTest('SupabaseDeployManager: Pula quando não requerido', async () => {
    const res = await SupabaseDeployManager.executeDeploy({
      scope: { supabase_deploy_required: false }
    });
    assert.strictEqual(res.status, 'SKIPPED');
  });

  await asyncTest('SupabaseDeployManager: Retorna BLOCKED_EXTERNAL quando credenciais remotas ausentes', async () => {
    const origResolve = CredentialResolver.resolveCredential;
    try {
      CredentialResolver.resolveCredential = () => ({
        success: false,
        status: 'BLOCKED_EXTERNAL',
        reason: 'Credenciais remotas do Supabase ausentes (SUPABASE_ACCESS_TOKEN necessária para deploy de backend).'
      });
      const res = await SupabaseDeployManager.executeDeploy({
        files_to_deploy: ['supabase/migrations/test.sql'],
        scope: { supabase_deploy_required: true }
      });
      assert.strictEqual(res.required, true);
      assert.strictEqual(res.status, 'BLOCKED_EXTERNAL');
      assert.strictEqual(res.target, 'SUPABASE');
      assert.ok(res.reason.includes('Credenciais remotas do Supabase ausentes'));
    } finally {
      CredentialResolver.resolveCredential = origResolve;
    }
  });

  // 5. PostDeployVerifier & ProductionHomologator Tests
  await asyncTest('PostDeployVerifier: Retorna BLOCKED_EXTERNAL se deploy upstream estiver bloqueado', async () => {
    const res = await PostDeployVerifier.verify({
      vercel_deploy: { status: 'BLOCKED_EXTERNAL' },
      scope: { post_deploy_verification_required: true }
    });
    assert.strictEqual(res.status, 'BLOCKED_EXTERNAL');
  });

  await asyncTest('ProductionHomologator: Retorna BLOCKED_EXTERNAL se deploy upstream estiver bloqueado', async () => {
    const res = await ProductionHomologator.homologate({
      task: { task_id: 'TASK-1' },
      deploy_scope: { homologation_required: true },
      vercel_deploy: { status: 'BLOCKED_EXTERNAL' }
    });
    assert.strictEqual(res.status, 'BLOCKED_EXTERNAL');
  });

  // 6. CompletionAuthority Hardened Gates Tests
  test('CompletionAuthority: Rejeita COMPLETED se commit obrigatório falhar', () => {
    const mockTask = { task_id: 'TASK-VERIFY-1', objective: 'Test obj' };
    const mockPlan = { plan_id: 'PLAN-1', steps: [{ step_index: 0, agent_id: 'builder', step_id: 'step-0' }] };
    const mockExecResults = [{
      step_id: 'step-0',
      agent_id: 'builder',
      task_id: 'TASK-VERIFY-1',
      status: 'COMPLETED',
      result: { success: true },
      evidence: [{ command: 'test', exit_code: 0 }]
    }];

    const prodLifecycle = {
      blocked_external: false,
      scope: { commit_required: true },
      commit: { success: false, error: 'git commit rejected' }
    };

    const res = CompletionAuthority.validateCompletion({
      task: mockTask,
      plan: mockPlan,
      executionResults: mockExecResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Commit obrigatório')));
  });

  test('CompletionAuthority: Rejeita COMPLETED e marca BLOCKED_EXTERNAL quando publicação externa está bloqueada', () => {
    const mockTask = { task_id: 'TASK-VERIFY-2', objective: 'Test obj' };
    const mockPlan = { plan_id: 'PLAN-2', steps: [{ step_index: 0, agent_id: 'builder', step_id: 'step-0' }] };
    const mockExecResults = [{
      step_id: 'step-0',
      agent_id: 'builder',
      task_id: 'TASK-VERIFY-2',
      status: 'COMPLETED',
      result: { success: true },
      evidence: [{ command: 'test', exit_code: 0 }]
    }];

    const prodLifecycle = {
      blocked_external: true,
      blocked_stage: 'VERCEL_DEPLOY',
      blocked_reason: 'Vercel CLI não autorizada no ambiente local.'
    };

    const res = CompletionAuthority.validateCompletion({
      task: mockTask,
      plan: mockPlan,
      executionResults: mockExecResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED_EXTERNAL');
    assert.strictEqual(res.blocked_stage, 'VERCEL_DEPLOY');
    assert.ok(res.reason.includes('Vercel CLI não autorizada'));
  });

  test('CompletionAuthority: Emite COMPLETED quando todo o ciclo aplicável estiver verificado', () => {
    const mockTask = { task_id: 'TASK-VERIFY-3', objective: 'Test obj' };
    const mockPlan = { plan_id: 'PLAN-3', steps: [{ step_index: 0, agent_id: 'builder', step_id: 'step-0' }] };
    const mockExecResults = [{
      step_id: 'step-0',
      agent_id: 'builder',
      task_id: 'TASK-VERIFY-3',
      status: 'COMPLETED',
      result: { success: true },
      evidence: [{ command: 'test', exit_code: 0 }]
    }];

    const prodLifecycle = {
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: true,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: { success: true, commit_sha: 'commit_123' },
      deploys: {
        vercel: { status: 'SUCCESS', deployment_url: 'https://sitesobremidia.vercel.app' }
      },
      post_deploy: { status: 'VERIFIED' },
      homologation: { status: 'HOMOLOGATED' }
    };

    const res = CompletionAuthority.declareCompletion({
      task: mockTask,
      plan: mockPlan,
      executionResults: mockExecResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, true);
    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(res.production_lifecycle.commit.commit_sha, 'commit_123');
  });

  console.log(`\nTODOS OS ${passed}/${total} TESTES DO CICLO DE PRODUÇÃO PASSARAM COM SUCESSO!`);
}

runTests().catch(err => {
  console.error('Falha na suíte de testes do ciclo de produção:', err);
  process.exit(1);
});
