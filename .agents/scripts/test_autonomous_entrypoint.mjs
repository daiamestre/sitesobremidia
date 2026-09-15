/**
 * SOBRE MÍDIA AI Engineering System — Autonomous Operational Entrypoint Test Suite
 * Validação rigorosa e completa da camada de entrada operacional autônoma.
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeAutonomousTask } from '../core/entrypoint.mjs';
import { TaskOrchestrator, orchestrator } from '../core/orchestrator.mjs';
import { auditLogger } from '../core/audit.mjs';
import { registry } from '../core/registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');

let totalTests = 0;
let passedTests = 0;

function runTest(id, description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[✅ ${id}] PASS — ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`[❌ ${id}] FAIL — ${description}`);
    console.error(`       Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(id, description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[✅ ${id}] PASS — ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`[❌ ${id}] FAIL — ${description}`);
    console.error(`       Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('🧪 =========================================================================');
  console.log('🧪 SOBRE MÍDIA AI ENGINEERING SYSTEM: AUTONOMOUS ENTRYPOINT TEST SUITE');
  console.log('🧪 =========================================================================\n');

  orchestrator.reset();
  auditLogger.clear();

  // 1. Pure String Input Normalization
  await runAsyncTest('AEP-01', 'Pure natural language string input executes autonomously without manual object', async () => {
    orchestrator.reset();
    const prompt = 'Audite o código contra padrões proibidos e valide conformidade forense';
    const result = await executeAutonomousTask(prompt, { workspace_root: workspaceRoot });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.ok(result.task_id.startsWith('TASK-'));
    assert.strictEqual(result.objective, prompt);
    assert.ok(result.completion_id.startsWith('CMP-'));
    assert.ok(result.evidence.length > 0);
  });

  // 2. Autonomous Multi-Step Composite Workflow Decomposition
  await runAsyncTest('AEP-02', 'Composite engineering task automatically plans and executes full specialist chain', async () => {
    orchestrator.reset();
    const prompt = 'Analise a arquitetura de governança, implemente a melhoria segura, execute os testes e valide a integridade forense';
    const result = await executeAutonomousTask(prompt, { workspace_root: workspaceRoot });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.steps_executed.length, 4);

    const executedAgents = result.steps_executed.map(s => s.agent_id);
    assert.deepStrictEqual(executedAgents, ['architect', 'builder', 'qa', 'forensic']);
    assert.strictEqual(result.handoffs.length, 3);
    assert.ok(result.evidence.length >= 4);
    for (const ev of result.evidence) {
      assert.strictEqual(ev.exit_code, 0);
    }
  });

  // 3. Database Workflow Decomposition
  await runAsyncTest('AEP-03', 'Database and RLS task automatically plans and executes database specialist chain', async () => {
    orchestrator.reset();
    const prompt = 'Verifique as tabelas de banco de dados, políticas de RLS, audite conformidade e teste migrações';
    const result = await executeAutonomousTask(prompt, { workspace_root: workspaceRoot });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    const executedAgents = result.steps_executed.map(s => s.agent_id);
    assert.deepStrictEqual(executedAgents, ['architect', 'database', 'qa', 'forensic']);
    assert.strictEqual(result.handoffs.length, 3);
  });

  // 4. Autonomous Skill Selection & Execution Without Caller Handlers
  await runAsyncTest('AEP-04', 'Zero actionHandlers provided by caller executes real canonical skills autonomously', async () => {
    orchestrator.reset();
    const prompt = 'Auditoria forense de integridade dos contratos';
    const result = await executeAutonomousTask(prompt, { workspace_root: workspaceRoot });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'COMPLETED');
    assert.ok(result.evidence.some(e => e.command.includes('forensic-auditor')));
  });

  // 5. Completion Authority Sealing & Duplicate Idempotency
  await runAsyncTest('AEP-05', 'Re-executing completed task returns idempotent no-op preserving completion_id', async () => {
    orchestrator.reset();
    const taskId = 'TASK-AUTONOMY-IDEM-01';
    const prompt = 'Verificação de regras de domínio SOBRE MÍDIA';
    const res1 = await executeAutonomousTask(prompt, { task_id: taskId, workspace_root: workspaceRoot });
    assert.strictEqual(res1.status, 'COMPLETED');

    const res2 = await executeAutonomousTask(prompt, { task_id: taskId, workspace_root: workspaceRoot });
    assert.strictEqual(res2.is_idempotent_noop, true);
    assert.strictEqual(res2.completion_id, res1.completion_id);
  });

  // 6. Audit Trail Logging on Autonomous Run
  await runAsyncTest('AEP-06', 'Autonomous execution generates full audit trail events', async () => {
    orchestrator.reset();
    const taskId = 'TASK-AUDIT-TEST-01';
    const prompt = 'Analise a estrutura e audite os padrões';
    const res = await executeAutonomousTask(prompt, { task_id: taskId, workspace_root: workspaceRoot });

    assert.strictEqual(res.success, true);
    const events = auditLogger.getEventsForTask(taskId);
    assert.ok(events.length > 0);
  });

  // 7. Section 11 Requirement: Real Autonomy Engineering Task Execution
  await runAsyncTest('AEP-07', 'Real Engineering Task execution from pure prompt: understand -> plan -> agents -> execute -> test -> validate -> seal', async () => {
    orchestrator.reset();
    const realTaskPrompt = 'Analise o sistema de agentes existente, encontre uma melhoria pequena e segura no mecanismo operacional, implemente a melhoria, execute os testes relacionados e entregue evidência do resultado.';
    
    const autonomyResult = await executeAutonomousTask(realTaskPrompt, {
      workspace_root: workspaceRoot
    });

    assert.strictEqual(autonomyResult.success, true);
    assert.strictEqual(autonomyResult.status, 'COMPLETED');
    assert.ok(autonomyResult.completion_id.startsWith('CMP-'));
    assert.strictEqual(autonomyResult.steps_executed.length, 4);
    assert.deepStrictEqual(autonomyResult.steps_executed.map(s => s.agent_id), ['architect', 'builder', 'qa', 'forensic']);
    assert.strictEqual(autonomyResult.handoffs.length, 3);
    assert.ok(autonomyResult.evidence.length >= 4);
    for (const ev of autonomyResult.evidence) {
      assert.strictEqual(ev.exit_code, 0);
    }
  });

  console.log('\n=========================================================================');
  console.log(`📊 AUTONOMOUS ENTRYPOINT TEST SUITE RESULT: ${passedTests} / ${totalTests} PASS (100%)`);
  console.log('=========================================================================\n');
}

runAllTests().catch(err => {
  console.error('❌ ERRO NA SUÍTE DE TESTES:', err);
  process.exit(1);
});
