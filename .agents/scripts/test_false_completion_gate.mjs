/**
 * SOBRE MÍDIA AI Engineering System — Micro-Gate Forense: False Completion & Lifecycle Bypass Regression Suite
 *
 * Valida rigorosamente as 8 invariantes de governança contra falso fechamento:
 * TEST 1 — FALSE COMPLETION BLOCK
 * TEST 2 — DECLARATION DOES NOT BYPASS
 * TEST 3 — DEPLOY REQUIRED
 * TEST 4 — VERIFIED DEPLOY
 * TEST 5 — SUPABASE REQUIRED
 * TEST 6 — ALREADY DEPLOYED REUSE RESTRICTIONS
 * TEST 7 — PREEXISTING USER CHANGES PRESERVATION
 * TEST 8 — REALISTIC END-TO-END REPRODUCTION OF TSK-REAL-PROD-02
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import {
  DeployScopeDiscovery,
  ProductionCommitManager,
  VercelDeployManager,
  SupabaseDeployManager,
  PostDeployVerifier,
  ProductionHomologator,
  ProductionLifecycleEngine,
  CompletionAuthority
} from '../core/index.mjs';

async function runGateSuite() {
  console.log('🧪 =========================================================================');
  console.log('🧪 MICRO-GATE FORENSE: REGRESSÃO DE LIFECYCLE E COMPLETION AUTHORITY');
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

  const baseTask = {
    task_id: 'TASK-GATE-REGRESSION',
    objective: 'Validar bloqueio intransigente de conclusões sem evidência',
    task_type: 'IMPLEMENTATION'
  };

  const basePlan = {
    plan_id: 'PLAN-GATE-REGRESSION',
    steps: [{ step_index: 0, agent_id: 'builder', step_id: 'step-0' }]
  };

  const baseExecutionResults = [{
    step_id: 'step-0',
    agent_id: 'builder',
    task_id: 'TASK-GATE-REGRESSION',
    status: 'COMPLETED',
    result: { success: true },
    evidence: [{ command: 'build', exit_code: 0 }]
  }];

  // TEST 1 — FALSE COMPLETION BLOCK
  test('TEST 1 — FALSE COMPLETION BLOCK: Task requer Vercel, Vercel não executado/falho -> COMPLETED = BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const prodLifecycle = {
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: true,
        supabase_deploy_required: false,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: { success: true, commit_sha: 'sha_1001' },
      deploys: {
        vercel: { status: 'FAILED', reason: 'Upload timeout' },
        supabase: { status: 'SKIPPED' }
      },
      post_deploy: { status: 'NOT_ATTEMPTED' },
      homologation: { status: 'NOT_ATTEMPTED' }
    };

    const res = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Deploy Vercel obrigatório não concluído')));
  });

  // TEST 2 — DECLARATION DOES NOT BYPASS
  test('TEST 2 — DECLARATION DOES NOT BYPASS: Agent declara "PRODUCTION VERIFIED" sem evidência -> COMPLETED = BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const res = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: null,
      options: {
        declared_status: 'PRODUCTION VERIFIED',
        declaration_only: true,
        enforce_production_lifecycle: true
      }
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Declaração verbal') || e.includes('Ciclo de produção é OBRIGATÓRIO')));
  });

  // TEST 3 — DEPLOY REQUIRED
  test('TEST 3 — DEPLOY REQUIRED: Código em src/ tocado, deploy não realizado -> não pode completar', () => {
    CompletionAuthority.resetRegistry();

    const taskWithProduct = {
      ...baseTask,
      target_paths: ['src/modules/crm/components/forms/IntelligentCommercialWizard.tsx']
    };

    // Chamada sem production_lifecycle
    const res = CompletionAuthority.declareCompletion({
      task: taskWithProduct,
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: null
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.strictEqual(res.blocked_stage, 'DEPLOY_SCOPE_DISCOVERY');
    assert.ok(res.errors.some(e => e.includes('Ciclo de produção é OBRIGATÓRIO')));
  });

  // TEST 4 — VERIFIED DEPLOY
  test('TEST 4 — VERIFIED DEPLOY: Commit + Vercel deploy + Post-deploy + Homologação comprovados -> COMPLETED = ALLOWED', () => {
    CompletionAuthority.resetRegistry();

    const verifiedLifecycle = {
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: true,
        supabase_deploy_required: false,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: { success: true, commit_sha: 'sha_target_2026' },
      deploys: {
        vercel: {
          status: 'SUCCESS',
          deployment_id: 'dpl_prod_verified_999',
          commit_sha: 'sha_target_2026',
          deployment_url: 'https://sitesobremidia.vercel.app',
          verified_remote: true
        },
        supabase: { status: 'SKIPPED' }
      },
      post_deploy: {
        status: 'VERIFIED',
        checks: [{ target: 'production_url', status: 'PASS', code: 200 }]
      },
      homologation: {
        status: 'HOMOLOGATED'
      }
    };

    const res = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: verifiedLifecycle
    });

    assert.strictEqual(res.completed, true);
    assert.strictEqual(res.status, 'COMPLETED');
    assert.ok(res.certificate);
    assert.strictEqual(res.certificate.status, 'PRODUCTION_VERIFIED');
    assert.strictEqual(res.certificate.commit_sha, 'sha_target_2026');
    assert.strictEqual(res.certificate.vercel_deployment_id, 'dpl_prod_verified_999');
  });

  // TEST 5 — SUPABASE REQUIRED
  test('TEST 5 — SUPABASE REQUIRED: Migration alterada, deploy Supabase não comprovado -> COMPLETED = BLOCKED', () => {
    CompletionAuthority.resetRegistry();

    const prodLifecycle = {
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: false,
        supabase_deploy_required: true,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: { success: true, commit_sha: 'sha_db_123' },
      deploys: {
        vercel: { status: 'SKIPPED' },
        supabase: { status: 'FAILED', reason: 'Migration execution error' }
      },
      post_deploy: { status: 'NOT_ATTEMPTED' },
      homologation: { status: 'NOT_ATTEMPTED' }
    };

    const res = CompletionAuthority.declareCompletion({
      task: { ...baseTask, target_paths: ['supabase/migrations/20261229_test.sql'] },
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Deploy Supabase')));
  });

  // TEST 6 — ALREADY DEPLOYED REUSE RESTRICTIONS
  test('TEST 6 — ALREADY DEPLOYED: Reutilização rejeitada se commit local for diferente do commit publicado', () => {
    CompletionAuthority.resetRegistry();

    // Cenário: Vercel tem deploy de sha_old_111, mas o commit da tarefa atual é sha_new_222
    const prodLifecycle = {
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: true,
        supabase_deploy_required: false,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: { success: true, commit_sha: 'sha_new_222' },
      deploys: {
        vercel: {
          status: 'SUCCESS',
          deployment_id: 'dpl_old_111',
          commit_sha: 'sha_old_111', // DIVERGÊNCIA DE COMMIT
          deployment_url: 'https://sitesobremidia.vercel.app',
          verified_remote: true
        }
      },
      post_deploy: {
        status: 'VERIFIED',
        checks: [{ target: 'production_url', status: 'PASS', code: 200 }]
      },
      homologation: { status: 'HOMOLOGATED' }
    };

    const res = CompletionAuthority.declareCompletion({
      task: baseTask,
      plan: basePlan,
      executionResults: baseExecutionResults,
      production_lifecycle: prodLifecycle
    });

    assert.strictEqual(res.completed, false);
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Inconsistência de commit') && e.includes('sha_old_111') && e.includes('sha_new_222')));
  });

  // TEST 7 — PREEXISTING USER CHANGES PRESERVATION
  test('TEST 7 — PREEXISTING USER CHANGES: ProductionCommitManager só commita arquivos autorizados da tarefa', () => {
    // Arquivos da tarefa explicitamente fornecidos
    const taskFiles = ['src/tests/unit/cliente.validator.test.ts'];
    const res = ProductionCommitManager.executeCommit({
      files_to_commit: taskFiles,
      message: 'test: isolation check',
      workspace_root: process.cwd()
    });

    // Se working tree limpo para esse arquivo, retorna no_changes seguro
    assert.ok(res.success === true);
    if (res.no_changes) {
      assert.strictEqual(res.files_committed.length, 0);
    } else {
      // Se comitou algo, jamais pode conter arquivos fora de taskFiles
      for (const f of res.files_committed) {
        assert.ok(taskFiles.includes(f), `Arquivo não autorizado foi comitado: ${f}`);
      }
    }
  });

  // TEST 8 — REALISTIC END-TO-END REPRODUCTION OF TSK-REAL-PROD-02
  test('TEST 8 — REALISTIC END-TO-END: TSK-REAL-PROD-02 com commit posterior (2f3e65c vs def67d0) bloqueia sem novo deploy', () => {
    CompletionAuthority.resetRegistry();

    // Simulação exata da falha detectada:
    // def67d0 foi deployado há 47m.
    // 2f3e65c foi commitado no banco depois.
    // Homologação executou via UI e retornou PASS.
    // O executor tenta declarar conclusão usando o commit 2f3e65c mas com a Vercel ainda apontando para def67d0:
    const prodLifecycle = {
      task_id: 'TSK-REAL-PROD-02',
      blocked_external: false,
      scope: {
        commit_required: true,
        vercel_deploy_required: true,
        supabase_deploy_required: true,
        post_deploy_verification_required: true,
        homologation_required: true
      },
      commit: {
        success: true,
        commit_sha: '2f3e65c39cf2440deee645a6a628de53fa90408f'
      },
      deploys: {
        vercel: {
          status: 'SUCCESS',
          deployment_id: 'dpl_GTWpGJDVM8ZxozvaiNEQoEhQeSDm',
          commit_sha: 'def67d0611c4f59118f7051547d4107999aae084', // Commit def67d0 desatualizado!
          deployment_url: 'https://sitesobremidia.vercel.app',
          verified_remote: true
        },
        supabase: {
          status: 'SUCCESS',
          files_applied: ['supabase/migrations/20261229_cnpj_cadastral_multiplos_anunciantes.sql']
        }
      },
      post_deploy: {
        status: 'VERIFIED',
        checks: [{ target: 'production_url', status: 'PASS', code: 200 }]
      },
      homologation: {
        status: 'HOMOLOGATED'
      }
    };

    const taskReal = {
      task_id: 'TSK-REAL-PROD-02',
      objective: 'Correção forense do CNPJ no cadastro de anunciante',
      task_type: 'IMPLEMENTATION',
      target_paths: [
        'src/modules/crm/components/forms/IntelligentCommercialWizard.tsx',
        'supabase/migrations/20261229_cnpj_cadastral_multiplos_anunciantes.sql'
      ]
    };

    const res = CompletionAuthority.declareCompletion({
      task: taskReal,
      plan: { plan_id: 'PLAN-TSK-REAL-PROD-02', steps: [{ step_index: 0, agent_id: 'builder', step_id: 'S0' }] },
      executionResults: [{
        step_id: 'S0',
        agent_id: 'builder',
        task_id: 'TSK-REAL-PROD-02',
        status: 'COMPLETED',
        result: { success: true },
        evidence: [{ command: 'qa', exit_code: 0 }]
      }],
      production_lifecycle: prodLifecycle,
      options: {
        declared_status: 'PRODUCTION VERIFIED (100% PASS)'
      }
    });

    // A governança TEM QUE REJEITAR
    assert.strictEqual(res.completed, false, 'Divergência de commit deve impedir conclusão');
    assert.strictEqual(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('Inconsistência de commit') && e.includes('def67d0') && e.includes('2f3e65c')), 'Deve acusar incompatibilidade entre def67d0 e 2f3e65c');
    assert.ok(res.errors.some(e => e.includes('Declaração verbal')), 'Deve rejeitar declaração verbal sem correspondência de evidência');
  });

  console.log(`\n🎉 SUCESSO: TODAS AS ${passed}/${total} INVARIANTES DO MICRO-GATE FORAM VERIFICADAS E APROVADAS!`);
}

runGateSuite().catch(err => {
  console.error('Falha crítica na suíte do Micro-Gate:', err);
  process.exit(1);
});
