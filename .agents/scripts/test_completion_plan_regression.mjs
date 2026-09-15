/**
 * SOBRE MÍDIA AI Engineering System
 * Suite de Regressão da Integração: Execution Plan + CompletionAuthority
 *
 * Valida a matriz canônica exigida na Fase 5:
 * TEST A: Execution plan válido + lifecycle completo -> CompletionAuthority = ALLOWED
 * TEST B: Execution plan null -> BLOCKED
 * TEST C: Execution plan inválido -> BLOCKED
 * TEST D: Lifecycle completo mas sem execution plan -> BLOCKED
 * TEST E: Agent declares completion manually -> BLOCKED
 * TEST F: Execution plan válido + Vercel deployment não comprovado -> BLOCKED
 * TEST G: Execution plan válido + commit/deploy/postdeploy/homologation comprovados -> ALLOWED
 */

import assert from 'assert';
import { CompletionAuthority, ExecutionPlanner, TaskNormalizer } from '../core/orchestrator.mjs';

function runSuite() {
  console.log('🧪 =========================================================================');
  console.log('🧪 SUITE DE REGRESSÃO: INTEGRATION EXECUTION PLAN + COMPLETION AUTHORITY');
  console.log('🧪 =========================================================================\n');

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

  const baseTask = TaskNormalizer.normalize({
    task_id: 'TASK-PLAN-REGRESSION-01',
    objective: 'Auditar e validar integridade do plano de execução na autoridade de conclusão',
    task_type: 'FORENSIC'
  });

  const validPlan = ExecutionPlanner.createPlan(baseTask, {
    multi_step_chain: ['forensic']
  });

  const validExecutionResults = [
    {
      step_id: validPlan.steps[0].step_id,
      agent_id: 'forensic',
      task_id: baseTask.task_id,
      status: 'COMPLETED',
      result: { success: true },
      evidence: [{ command: 'audit:check', exit_code: 0 }]
    }
  ];

  const fullVerifiedLifecycle = {
    all_stages_completed: true,
    scope: {
      commit_required: true,
      vercel_deploy_required: true,
      supabase_deploy_required: false,
      post_deploy_verification_required: true,
      homologation_required: true
    },
    commit: { success: true, commit_sha: 'sha_canonical_2026' },
    deploys: {
      vercel: {
        status: 'SUCCESS',
        deployment_id: 'dpl_valid_verified_123',
        deployment_url: 'https://sitesobremidia.vercel.app',
        commit_sha: 'sha_canonical_2026',
        verified_remote: true
      },
      supabase: { status: 'SKIPPED' }
    },
    post_deploy: {
      status: 'VERIFIED',
      checks: [{ target: 'production_url', status: 'PASS', code: 200 }]
    },
    homologation: {
      status: 'HOMOLOGATED',
      evidence_attached: true
    }
  };

  // TEST A: Execution plan válido + lifecycle completo -> CompletionAuthority = ALLOWED
  test('TEST A: Execution plan válido + lifecycle completo -> CompletionAuthority = ALLOWED', () => {
    CompletionAuthority.resetRegistry();

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(verdict.completed, true);
    assert.strictEqual(verdict.status, 'COMPLETED');
    assert.strictEqual(verdict.errors.length, 0);

    const cert = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(cert.completed, true);
    assert.ok(cert.certificate?.certificate_id.startsWith('CERT-'));
  });

  // TEST B: Execution plan null -> BLOCKED
  test('TEST B: Execution plan null -> BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: null,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(verdict.completed, false);
    assert.strictEqual(verdict.status, 'BLOCKED');
    assert.ok(verdict.errors.some(e => e.includes('Plano de execução nulo ou inválido')));
  });

  // TEST C: Execution plan inválido (sem steps ou sem plan_id) -> BLOCKED
  test('TEST C: Execution plan inválido (sem steps ou plan_id ausente) -> BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const invalidPlan = { plan_id: '', steps: [] };

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: invalidPlan,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(verdict.completed, false);
    assert.strictEqual(verdict.status, 'BLOCKED');
    assert.ok(verdict.errors.some(e => e.includes('Plano de execução nulo ou inválido')));
  });

  // TEST D: Lifecycle completo mas sem execution plan -> BLOCKED
  test('TEST D: Lifecycle completo mas sem execution plan -> BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: undefined,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(verdict.completed, false);
    assert.strictEqual(verdict.status, 'BLOCKED');
    assert.ok(verdict.errors.some(e => e.includes('Plano de execução nulo ou inválido')));
  });

  // TEST E: Agent declares completion manually (declaration_only) -> BLOCKED
  test('TEST E: Agent declares completion manually -> BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: [],
      production_lifecycle: null,
      options: { declaration_only: true, declared_status: 'PRODUCTION VERIFIED (100% PASS)' }
    });

    assert.strictEqual(verdict.completed, false);
    assert.strictEqual(verdict.status, 'BLOCKED');
    assert.ok(verdict.errors.some(e => e.includes('Declaração verbal') || e.includes('Nenhum resultado')));
  });

  // TEST F: Execution plan válido + Vercel deployment não comprovado -> BLOCKED
  test('TEST F: Execution plan válido + Vercel deployment não comprovado -> BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const unverifiedVercelLifecycle = {
      ...fullVerifiedLifecycle,
      deploys: {
        vercel: {
          status: 'FAILED',
          reason: 'Deploy failed on remote infrastructure'
        }
      }
    };

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: validExecutionResults,
      production_lifecycle: unverifiedVercelLifecycle
    });

    assert.strictEqual(verdict.completed, false);
    assert.strictEqual(verdict.status, 'BLOCKED');
    assert.ok(verdict.errors.some(e => e.includes('Deploy Vercel obrigatório não concluído')));
  });

  // TEST G: Execution plan válido + commit/deploy/postdeploy/homologation comprovados -> ALLOWED
  test('TEST G: Execution plan válido + commit/deploy/postdeploy/homologation comprovados -> ALLOWED', () => {
    CompletionAuthority.resetRegistry();

    const verdict = CompletionAuthority.validateCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(verdict.completed, true);
    assert.strictEqual(verdict.status, 'COMPLETED');

    const cert = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: validPlan,
      executionResults: validExecutionResults,
      production_lifecycle: fullVerifiedLifecycle
    });

    assert.strictEqual(cert.completed, true);
    assert.strictEqual(cert.status, 'COMPLETED');
    assert.strictEqual(cert.certificate.status, 'PRODUCTION_VERIFIED');
    assert.strictEqual(cert.certificate.commit_sha, 'sha_canonical_2026');
    assert.strictEqual(cert.certificate.vercel_deployment_id, 'dpl_valid_verified_123');
  });

  console.log(`\n🎉 SUCESSO: TODAS AS ${passed}/${total} INVARIANTES DE INTEGRAÇÃO APROVADAS COM SUCESSO!`);
}

runSuite();
