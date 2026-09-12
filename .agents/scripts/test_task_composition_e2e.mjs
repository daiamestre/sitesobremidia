/**
 * SOBRE MÍDIA AI Engineering System — Micro-Gate 0.16 Adversarial E2E Test Suite
 * End-to-End Multi-Agent Engineering Task Composition Verification
 *
 * Test Groups:
 * 1. HANDOFF-H01 .. HANDOFF-H06: Forensic Handoff Integrity
 * 2. COMP-01 .. COMP-07: Completion Authority Negative Proofs & Sealing
 * 3. E2E-01 .. E2E-18: Adversarial Task Composition & Governance Matrix
 * 4. NON-BYPASS-01 .. NON-BYPASS-04: Non-Bypass Structural Proofs
 * 5. DETERMINISM-01: Deterministic Multi-Run Equivalence
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registry,
  AgentRegistry,
  runtime,
  AgentRuntime,
  TaskRouter,
  TaskNormalizer,
  ExecutionPlanner,
  CompletionAuthority,
  TaskOrchestrator,
  orchestrator,
  HandoffManager,
  ProjectDiscovery,
  skillRuntime,
  validateCanonicalTask,
  validateExecutionPlan,
  validateAgentResult,
  validateEvidence,
  deepFreeze
} from '../core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

let totalTests = 0;
let passedTests = 0;
const testRecords = [];

function assert(condition, testId, title, meta = {}) {
  totalTests++;
  const record = {
    id: testId,
    title,
    expected: meta.expected || 'PASS',
    actual: condition ? (meta.actual || 'PASS') : 'FAIL',
    verdict: condition ? 'PASS' : 'FAIL',
    evidence: meta.evidence || (condition ? 'Condition verified' : 'Assertion failed'),
    details: meta.details || ''
  };
  testRecords.push(record);
  if (condition) {
    passedTests++;
    console.log(`[✅ ${testId}] PASS — ${title}`);
  } else {
    console.error(`[❌ ${testId}] FAIL — ${title} | Expected: ${record.expected} | Actual: ${record.actual} | Details: ${record.details}`);
  }
}

console.log('🧪 =========================================================================');
console.log('🧪 MICRO-GATE 0.16: END-TO-END MULTI-AGENT TASK COMPOSITION SUITE');
console.log('🧪 =========================================================================\n');

async function runTestSuite() {
  console.log('--- 1. FORENSIC HANDOFF INTEGRITY (HANDOFF-H01 .. H06) ---');

  // HANDOFF-H01: Legitimate handoff between active agents
  try {
    const validPayload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-01',
      execution_id: 'EXEC-HND-01',
      from: 'architect',
      to: 'builder',
      status: 'READY',
      objective: 'Implementar modelo validado pelo Architect',
      completed_work: 'Especificação técnica concluída com discovery comprovado',
      evidence: [{ command: 'verify-arch', exit_code: 0, summary: 'Arch PASS' }],
      files_changed: ['src/modules/crm/validators/empresa.validator.ts'],
      tests_run: ['verify-arch'],
      next_action: 'Builder implementa alterações no CRM',
      workspace_root: rootDir
    });

    const val = HandoffManager.validateHandoff(validPayload, {
      expected_task_id: 'TASK-HND-01',
      expected_source: 'architect',
      expected_destination: 'builder',
      expected_workspace: rootDir
    });

    assert(
      val.valid === true && val.errors.length === 0 && validPayload.handoff_id.startsWith('HND-'),
      'HANDOFF-H01',
      'Legitimate handoff between architect and builder is strictly valid',
      { expected: 'valid=true', actual: `valid=${val.valid}`, evidence: `handoff_id=${validPayload.handoff_id}` }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H01', 'Legitimate handoff error', { details: err.message });
  }

  // HANDOFF-H02: Handoff with mismatched task_id
  try {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-ORIGINAL',
      execution_id: 'EXEC-HND-02',
      from: 'architect',
      to: 'builder',
      status: 'READY',
      objective: 'Objective',
      completed_work: 'Work',
      evidence: [{ command: 'c', exit_code: 0, summary: 's' }],
      files_changed: [],
      tests_run: ['c'],
      next_action: 'Builder action',
      workspace_root: rootDir
    });

    const val = HandoffManager.validateHandoff(payload, {
      expected_task_id: 'TASK-HND-FOREIGN'
    });

    assert(
      val.valid === false && val.errors.some(e => e.includes('Task mismatch')),
      'HANDOFF-H02',
      'Handoff with mismatched task_id is blocked fail-closed',
      { expected: 'valid=false', actual: `valid=${val.valid}`, evidence: val.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H02', 'Mismatched task_id handoff error', { details: err.message });
  }

  // HANDOFF-H03: Handoff with mismatched destination agent
  try {
    const foreignHandoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-03',
      execution_id: 'EXEC-HND-03',
      from: 'architect',
      to: 'builder',
      status: 'READY',
      objective: 'Objective',
      completed_work: 'Work',
      evidence: [{ command: 'c', exit_code: 0, summary: 's' }],
      files_changed: [],
      tests_run: ['c'],
      next_action: 'Builder action',
      workspace_root: rootDir
    });

    const val = HandoffManager.validateHandoff(foreignHandoff, {
      expected_task_id: 'TASK-HND-03',
      expected_destination: 'forensic' // Mismatched destination
    });

    assert(
      val.valid === false && val.errors.some(e => e.includes('Destination mismatch')),
      'HANDOFF-H03',
      'Handoff with mismatched destination agent is blocked fail-closed',
      { expected: 'valid=false', actual: `valid=${val.valid}`, evidence: val.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H03', 'Mismatched destination handoff error', { details: err.message });
  }

  // HANDOFF-H04: Handoff to unauthorized / non-existent agent
  try {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-04',
      execution_id: 'EXEC-HND-04',
      from: 'architect',
      to: 'unauthorized_ghost_agent',
      status: 'READY',
      objective: 'Objective',
      completed_work: 'Work',
      evidence: [{ command: 'c', exit_code: 0, summary: 's' }],
      files_changed: [],
      tests_run: ['c'],
      next_action: 'Ghost action',
      workspace_root: rootDir
    });

    const val = HandoffManager.validateHandoff(payload);

    assert(
      val.valid === false && val.errors.some(e => e.includes('não é um agente registrado')),
      'HANDOFF-H04',
      'Handoff to unauthorized agent fails closed at validation gate',
      { expected: 'valid=false', actual: `valid=${val.valid}`, evidence: val.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H04', 'Unauthorized agent handoff error', { details: err.message });
  }

  // HANDOFF-H05: Handoff containing failed evidence (exit_code != 0)
  try {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-05',
      execution_id: 'EXEC-HND-05',
      from: 'architect',
      to: 'builder',
      status: 'READY',
      objective: 'Objective',
      completed_work: 'Work',
      evidence: [{ command: 'failing-test', exit_code: 1, summary: 'Test FAILED' }],
      files_changed: [],
      tests_run: ['failing-test'],
      next_action: 'Builder action',
      workspace_root: rootDir
    });

    const val = HandoffManager.validateHandoff(payload);

    assert(
      val.valid === false && val.errors.some(e => e.includes('exit_code=1')),
      'HANDOFF-H05',
      'Handoff with failed evidence (exit_code!=0) is rejected fail-closed',
      { expected: 'valid=false', actual: `valid=${val.valid}`, evidence: val.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H05', 'Failed evidence handoff error', { details: err.message });
  }

  // HANDOFF-H06: Handoff cannot alter capabilities or permissions of destination agent
  try {
    const handoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-HND-06',
      execution_id: 'EXEC-HND-06',
      from: 'architect',
      to: 'builder',
      status: 'READY',
      objective: 'Objective',
      completed_work: 'Work',
      evidence: [{ command: 'c', exit_code: 0, summary: 's' }],
      files_changed: [],
      tests_run: ['c'],
      next_action: 'Builder action',
      workspace_root: rootDir
    });

    const builderAgent = registry.getAgent('builder');
    const originalCapabilities = [...builderAgent.capabilities];
    const originalWritePerm = builderAgent.permissions.write;

    const spawnHandle = runtime.spawnAgent('builder', {
      task_id: 'TASK-HND-06',
      objective: 'Objective',
      workspace_root: rootDir
    }, { handoff });

    assert(
      JSON.stringify(builderAgent.capabilities) === JSON.stringify(originalCapabilities) &&
      builderAgent.permissions.write === originalWritePerm &&
      spawnHandle.lifecycle.getState() === 'READY',
      'HANDOFF-H06',
      'Handoff preserves destination agent contract immutability and permissions',
      { expected: 'contract intact', actual: 'contract intact', evidence: `builder capabilities=${builderAgent.capabilities.join(',')}` }
    );
  } catch (err) {
    assert(false, 'HANDOFF-H06', 'Handoff capability alteration error', { details: err.message });
  }

  console.log('\n--- 2. COMPLETION AUTHORITY NEGATIVE PROOFS & SEALING (COMP-01 .. COMP-07) ---');

  // COMP-01: Complete before all mandatory steps are executed
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-01',
      objective: 'Multi-step task',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir
    });

    const plan = ExecutionPlanner.createPlan(task, {
      multi_step_chain: ['architect', 'database', 'forensic']
    });

    const partialResults = [
      {
        step_id: 'STEP-1-architect',
        agent_id: 'architect',
        task_id: 'TASK-COMP-01',
        status: 'COMPLETED',
        result: { success: true, summary: 'Arch done' },
        evidence: [{ command: 'v1', exit_code: 0 }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: partialResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('não possui registro de execução')),
      'COMP-01',
      'Completion before all mandatory steps executed is blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-01', 'Premature completion error', { details: err.message });
  }

  // COMP-02: Complete with missing evidence
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-02',
      objective: 'Task without evidence',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    const noEvidenceResults = [
      {
        step_id: plan.steps[0].step_id,
        agent_id: plan.steps[0].agent_id,
        task_id: 'TASK-COMP-02',
        status: 'COMPLETED',
        result: { success: true, summary: 'Done with no evidence' },
        evidence: []
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: noEvidenceResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('não possui evidências')),
      'COMP-02',
      'Completion with missing evidence is strictly blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-02', 'Missing evidence completion error', { details: err.message });
  }

  // COMP-03: Complete with evidence belonging to another task
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-03',
      objective: 'Task with cross-task result',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    const crossTaskResults = [
      {
        step_id: plan.steps[0].step_id,
        agent_id: plan.steps[0].agent_id,
        task_id: 'TASK-FOREIGN-XYZ',
        status: 'COMPLETED',
        result: { success: true, summary: 'Done' },
        evidence: [{ command: 'v', exit_code: 0 }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: crossTaskResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('cross-task')),
      'COMP-03',
      'Completion with cross-task execution result is strictly blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-03', 'Cross-task completion error', { details: err.message });
  }

  // COMP-04: Complete after intermediate agent FAILED
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-04',
      objective: 'Multi-step task with failure',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task, {
      multi_step_chain: ['architect', 'database']
    });
    const failedResults = [
      {
        step_id: 'STEP-1-architect',
        agent_id: 'architect',
        task_id: 'TASK-COMP-04',
        status: 'COMPLETED',
        result: { success: true, summary: 'Arch done' },
        evidence: [{ command: 'v1', exit_code: 0 }]
      },
      {
        step_id: 'STEP-2-database',
        agent_id: 'database',
        task_id: 'TASK-COMP-04',
        status: 'FAILED',
        result: { success: false, summary: 'DB Failed' },
        evidence: [{ command: 'v2', exit_code: 1 }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: failedResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('não concluiu com status COMPLETED')),
      'COMP-04',
      'Completion after intermediate agent failure is strictly blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-04', 'Failed intermediate completion error', { details: err.message });
  }

  // COMP-05: Complete with broken handoff chain
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-05',
      objective: 'Multi-step task without valid handoff',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task, {
      multi_step_chain: ['architect', 'database']
    });
    const validResults = [
      {
        step_id: 'STEP-1-architect',
        agent_id: 'architect',
        task_id: 'TASK-COMP-05',
        status: 'COMPLETED',
        result: { success: true, summary: 'Arch done' },
        evidence: [{ command: 'v1', exit_code: 0 }]
      },
      {
        step_id: 'STEP-2-database',
        agent_id: 'database',
        task_id: 'TASK-COMP-05',
        status: 'COMPLETED',
        result: { success: true, summary: 'DB done' },
        evidence: [{ command: 'v2', exit_code: 0 }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: validResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('Cadeia de handoff interrompida')),
      'COMP-05',
      'Completion with broken handoff chain in multi-step task is blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-05', 'Broken handoff completion error', { details: err.message });
  }

  // COMP-06: Complete with evidence reporting exit_code != 0
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-06',
      objective: 'Task with non-zero exit code evidence',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    const nonZeroResults = [
      {
        step_id: plan.steps[0].step_id,
        agent_id: plan.steps[0].agent_id,
        task_id: 'TASK-COMP-06',
        status: 'COMPLETED',
        result: { success: true, summary: 'Done' },
        evidence: [{ command: 'check', exit_code: 127 }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: nonZeroResults,
      handoffs: []
    });

    assert(
      compRes.completed === false && compRes.status === 'BLOCKED' && compRes.errors.some(e => e.includes('reporta falha')),
      'COMP-06',
      'Completion with non-zero exit_code evidence is blocked',
      { expected: 'completed=false', actual: `completed=${compRes.completed}`, evidence: compRes.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'COMP-06', 'Non-zero evidence completion error', { details: err.message });
  }

  // COMP-07: Legitimate completion after full verified chain
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-COMP-07',
      objective: 'Task full valid completion',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    const perfectResults = [
      {
        step_id: plan.steps[0].step_id,
        agent_id: plan.steps[0].agent_id,
        task_id: 'TASK-COMP-07',
        status: 'COMPLETED',
        result: { success: true, summary: 'Perfect execution' },
        evidence: [{ command: 'verify-perfect', exit_code: 0, summary: 'PASS' }]
      }
    ];

    const compRes = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: perfectResults,
      handoffs: []
    });

    assert(
      compRes.completed === true && compRes.status === 'COMPLETED' && compRes.completion_id.startsWith('CMP-'),
      'COMP-07',
      'Legitimate completion is sealed successfully with CMP- ID',
      { expected: 'completed=true', actual: `completed=${compRes.completed}`, evidence: `completion_id=${compRes.completion_id}` }
    );
  } catch (err) {
    assert(false, 'COMP-07', 'Valid completion error', { details: err.message });
  }

  console.log('\n--- 3. ADVERSARIAL TASK COMPOSITION MATRIX (E2E-01 .. E2E-18) ---');

  // E2E-01: Valid Task Intake & Normalization
  try {
    const raw = {
      task_id: 'TASK-E2E-01',
      objective: 'Validação de composição multi-agentes E2E',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir,
      required_capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY']
    };
    const canonical = TaskNormalizer.normalize(raw);
    const plan = ExecutionPlanner.createPlan(canonical);
    assert(
      canonical.task_id === 'TASK-E2E-01' &&
      canonical.task_type === 'ARCHITECTURE_AND_AUDIT' &&
      plan.plan_id.startsWith('PLAN-') &&
      plan.steps.length >= 1,
      'E2E-01',
      'Valid task normalization and plan creation',
      { evidence: `plan_id=${plan.plan_id}` }
    );
  } catch (err) {
    assert(false, 'E2E-01', 'Valid task intake error', { details: err.message });
  }

  // E2E-02: Invalid Raw Task rejected fail-closed
  try {
    let caught = 0;
    try { TaskNormalizer.normalize(null); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: 'BAD/PATH', objective: 'X' }); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: 'BAD SPACE', objective: 'X' }); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: 'T2', objective: '' }); } catch { caught++; }
    assert(caught === 4, 'E2E-02', 'Invalid raw task variations are rejected fail-closed', { evidence: `caught=${caught}/4` });
  } catch (err) {
    assert(false, 'E2E-02', 'Invalid task rejection error', { details: err.message });
  }

  // E2E-03: Inexistent agent in plan steps blocked
  try {
    let caught = false;
    try {
      const canonical = TaskNormalizer.normalize({
        task_id: 'TASK-E2E-03',
        objective: 'Test non-existent agent',
        task_type: 'IMPLEMENTATION',
        workspace_root: rootDir
      });
      ExecutionPlanner.createPlan(canonical, {
        multi_step_chain: ['architect', 'non_existent_ghost_agent']
      });
    } catch (err) {
      caught = err.message.includes('não registrado no Registry');
    }
    assert(caught === true, 'E2E-03', 'Inexistent agent in multi-step plan is blocked fail-closed');
  } catch (err) {
    assert(false, 'E2E-03', 'Inexistent agent error', { details: err.message });
  }

  // E2E-04: Disabled agent in plan steps blocked
  try {
    let caught = false;
    try {
      const canonical = TaskNormalizer.normalize({
        task_id: 'TASK-E2E-04',
        objective: 'Test disabled agent',
        task_type: 'IMPLEMENTATION',
        workspace_root: rootDir
      });
      registry.registerAgent({
        agent_id: 'disabled_agent_test',
        name: 'Disabled Agent',
        version: '1.0.0',
        status: 'DISABLED',
        role: 'Test',
        objective: 'Test',
        skills: [],
        tools: [],
        permissions: { read: true, write: false, execute: false, allowed_paths: [] },
        memory_scope: 'TASK'
      });
      ExecutionPlanner.createPlan(canonical, {
        multi_step_chain: ['disabled_agent_test']
      });
    } catch (err) {
      caught = err.message.includes('não está ativo');
    }
    assert(caught === true, 'E2E-04', 'Disabled agent in plan steps is blocked fail-closed');
  } catch (err) {
    assert(false, 'E2E-04', 'Disabled agent error', { details: err.message });
  }

  // E2E-05: Skill not authorized in agent contract blocked during execution
  try {
    const rawTask = {
      task_id: 'TASK-E2E-05',
      objective: 'Test unauthorized skill execution',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orchestratorInstance = new TaskOrchestrator(runtime);
    const res = await orchestratorInstance.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('database-supabase-guard', 'validate_migration_sql', { sql: 'SELECT 1;' });
        if (!skillRes.success) {
          throw new Error(skillRes.errors.join('; '));
        }
        return {
          success: true,
          summary: 'Should not reach',
          evidence: [],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'FAILED' && (res.error.includes('não possui a skill') || res.error.includes('AgentContract')),
      'E2E-05',
      'Unauthorized skill in agent contract is blocked during execution',
      { evidence: res.error }
    );
  } catch (err) {
    assert(false, 'E2E-05', 'Unauthorized skill error', { details: err.message });
  }

  // E2E-06: Capability escalation by agent or skill rejected
  try {
    const architectAgent = registry.getAgent('architect');
    let mutThrown = false;
    try {
      architectAgent.capabilities.push('DATABASE_MANAGEMENT');
    } catch {
      mutThrown = true;
    }
    assert(
      mutThrown === true || !architectAgent.capabilities.includes('DATABASE_MANAGEMENT'),
      'E2E-06',
      'Capability escalation through mutation is strictly prevented by deep freeze',
      { evidence: `capabilities=${architectAgent.capabilities.join(',')}` }
    );
  } catch (err) {
    assert(false, 'E2E-06', 'Capability escalation error', { details: err.message });
  }

  // E2E-07: Permission escalation (write attempt on read-only agent) blocked
  try {
    const rawTask = {
      task_id: 'TASK-E2E-07',
      objective: 'Test write permission on read-only agent',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const canWrite = ctx.checkPermission(null, 'src/test.ts', 'write');
        return {
          success: !canWrite,
          summary: canWrite ? 'VULNERABILITY: read-only agent allowed write' : 'Write properly blocked',
          evidence: [{ command: 'check-perm', exit_code: canWrite ? 1 : 0, summary: 'Write blocked' }],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'COMPLETED' && res.execution_results[0].result.success === true,
      'E2E-07',
      'Permission engine strictly denies write permission to read-only agent (architect)',
      { evidence: 'Write permission check returned false' }
    );
  } catch (err) {
    assert(false, 'E2E-07', 'Permission escalation error', { details: err.message });
  }

  // E2E-08: Workspace forgery outside authorized boundary blocked
  try {
    const evilWorkspace = path.resolve(rootDir, '..', 'evil_external_workspace').replace(/\\/g, '/');
    const rawTask = {
      task_id: 'TASK-E2E-08',
      objective: 'Test external workspace forgery',
      task_type: 'ARCHITECTURE',
      workspace_root: evilWorkspace
    };
    const orch = new TaskOrchestrator(runtime);
    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
        return {
          success: skillRes.success,
          summary: 'Result',
          evidence: skillRes.evidence || [],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'BLOCKED' || res.status === 'FAILED',
      'E2E-08',
      'Workspace forgery outside project boundary is blocked fail-closed',
      { evidence: `status=${res.status}` }
    );
  } catch (err) {
    assert(false, 'E2E-08', 'Workspace forgery error', { details: err.message });
  }

  // E2E-09: Path traversal in skill input blocked by PermissionEngine
  try {
    const rawTask = {
      task_id: 'TASK-E2E-09',
      objective: 'Test path traversal in skill input',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace', {
          target_path: '../../../../etc/passwd'
        });
        if (!skillRes.success) {
          throw new Error(skillRes.errors.join('; '));
        }
        return {
          success: true,
          summary: 'Should fail',
          evidence: skillRes.evidence || [],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'FAILED' && (res.error.includes('Permissão de caminho negada') || res.error.includes('bloqueado')),
      'E2E-09',
      'Path traversal in skill input is detected and blocked by PermissionEngine',
      { evidence: res.error }
    );
  } catch (err) {
    assert(false, 'E2E-09', 'Path traversal error', { details: err.message });
  }

  // E2E-10: Task ID forgery mismatching executionContext rejected
  try {
    const rawTask = {
      task_id: 'TASK-E2E-10',
      objective: 'Test task_id forgery',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await skillRuntime.executeSkill({
          skill_id: 'project-discovery',
          action: 'scan_workspace',
          agent_id: 'architect',
          task_id: 'FORGED-TASK-ID-XYZ',
          execution_id: ctx.execution_id,
          workspace_root: rootDir
        }, ctx);
        if (!skillRes.success) {
          throw new Error(skillRes.errors.join('; '));
        }
        return {
          success: true,
          summary: 'Should fail',
          evidence: skillRes.evidence || [],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'FAILED' && (res.error.includes('Cross-task context mismatch') || res.error.includes('task_id')),
      'E2E-10',
      'Forged task_id mismatching executionContext is rejected fail-closed',
      { evidence: res.error }
    );
  } catch (err) {
    assert(false, 'E2E-10', 'Task ID forgery error', { details: err.message });
  }

  // E2E-11: Execution ID forgery mismatching executionContext rejected
  try {
    const rawTask = {
      task_id: 'TASK-E2E-11',
      objective: 'Test execution_id forgery',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await skillRuntime.executeSkill({
          skill_id: 'project-discovery',
          action: 'scan_workspace',
          agent_id: 'architect',
          task_id: ctx.task.task_id,
          execution_id: 'FORGED-EXEC-ID-XYZ',
          workspace_root: rootDir
        }, ctx);
        if (!skillRes.success) {
          throw new Error(skillRes.errors.join('; '));
        }
        return {
          success: true,
          summary: 'Should fail',
          evidence: skillRes.evidence || [],
          files_touched: []
        };
      }
    });

    assert(
      res.status === 'FAILED' && (res.error.includes('Cross-execution mismatch') || res.error.includes('execution_id')),
      'E2E-11',
      'Forged execution_id mismatching executionContext is rejected fail-closed',
      { evidence: res.error }
    );
  } catch (err) {
    assert(false, 'E2E-11', 'Execution ID forgery error', { details: err.message });
  }

  // E2E-12: Cross-task evidence injection detected and rejected
  try {
    const rawTask = {
      task_id: 'TASK-E2E-12',
      objective: 'Test cross-task evidence injection',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const canonical = TaskNormalizer.normalize(rawTask);
    const plan = ExecutionPlanner.createPlan(canonical);
    const comp = CompletionAuthority.declareCompletion({
      task: canonical,
      plan,
      executionResults: [{
        step_id: plan.steps[0].step_id,
        agent_id: 'architect',
        task_id: 'FOREIGN-TASK-999',
        status: 'COMPLETED',
        result: { success: true, summary: 'Cross task' },
        evidence: [{ command: 'scan', exit_code: 0 }]
      }],
      handoffs: []
    });

    assert(
      comp.completed === false && comp.status === 'BLOCKED' && comp.errors.some(e => e.includes('cross-task')),
      'E2E-12',
      'Cross-task evidence injection is blocked by CompletionAuthority',
      { evidence: comp.errors.join('; ') }
    );
  } catch (err) {
    assert(false, 'E2E-12', 'Cross-task evidence error', { details: err.message });
  }

  // E2E-13: Cross-execution evidence injection detected and rejected
  try {
    let valRes = false;
    try {
      const res = await skillRuntime.executeSkill({
        skill_id: 'project-discovery',
        action: 'scan_workspace',
        agent_id: 'architect',
        task_id: 'TASK-E2E-13',
        execution_id: 'EXEC-LOCAL-13',
        workspace_root: rootDir
      }, {
        task_id: 'TASK-E2E-13',
        execution_id: 'EXEC-FOREIGN-MISMATCH',
        agent_id: 'architect',
        workspace_root: rootDir
      });
      valRes = !res.success;
    } catch {
      valRes = true;
    }

    assert(
      valRes === true,
      'E2E-13',
      'Cross-execution evidence injection is blocked fail-closed',
      { evidence: 'Execution ID mismatch rejected' }
    );
  } catch (err) {
    assert(false, 'E2E-13', 'Cross-execution evidence error', { details: err.message });
  }

  // E2E-14: Invalid handoff payload blocks destination agent
  try {
    const rawTask = {
      task_id: 'TASK-E2E-14',
      objective: 'Test invalid handoff in chain',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    let databaseExecuted = false;

    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        return {
          success: true,
          summary: 'Architect done with invalid evidence',
          evidence: [{ command: 'bad-evidence', exit_code: 1, summary: 'Fail' }],
          files_touched: []
        };
      },
      database: async (ctx) => {
        databaseExecuted = true;
        return { success: true, summary: 'DB done', evidence: [], files_touched: [] };
      }
    }, {
      multi_step_chain: ['architect', 'database']
    });

    assert(
      databaseExecuted === false && res.status !== 'COMPLETED',
      'E2E-14',
      'Invalid handoff blocks destination agent and halts multi-agent execution chain',
      { evidence: `databaseExecuted=${databaseExecuted}, status=${res.status}` }
    );
  } catch (err) {
    assert(false, 'E2E-14', 'Invalid handoff error', { details: err.message });
  }

  // E2E-15: Failed intermediate agent stops chain and prevents completion
  try {
    const rawTask = {
      task_id: 'TASK-E2E-15',
      objective: 'Test intermediate failure stopping chain',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    let forensicExecuted = false;

    const res = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
        return { success: true, summary: 'Arch PASS', evidence: skillRes.evidence, files_touched: [] };
      },
      database: async (ctx) => {
        throw new Error('Database migration validation failed: lock risk detected');
      },
      forensic: async (ctx) => {
        forensicExecuted = true;
        return { success: true, summary: 'Forensic PASS', evidence: [], files_touched: [] };
      }
    }, {
      multi_step_chain: ['architect', 'database', 'forensic']
    });

    assert(
      forensicExecuted === false && res.status === 'FAILED',
      'E2E-15',
      'Intermediate agent failure halts chain immediately and marks task FAILED',
      { evidence: `forensicExecuted=${forensicExecuted}, status=${res.status}` }
    );
  } catch (err) {
    assert(false, 'E2E-15', 'Intermediate failure error', { details: err.message });
  }

  // E2E-16: Premature completion attempt is blocked
  try {
    const rawTask = {
      task_id: 'TASK-E2E-16',
      objective: 'Test premature completion',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const canonical = TaskNormalizer.normalize(rawTask);
    const plan = ExecutionPlanner.createPlan(canonical);
    const comp = CompletionAuthority.declareCompletion({
      task: canonical,
      plan,
      executionResults: [],
      handoffs: []
    });

    assert(
      comp.completed === false && comp.status === 'BLOCKED',
      'E2E-16',
      'Premature completion attempt with empty execution is blocked by CompletionAuthority',
      { evidence: `status=${comp.status}` }
    );
  } catch (err) {
    assert(false, 'E2E-16', 'Premature completion error', { details: err.message });
  }

  // E2E-17: Duplicate task completion governed as Idempotent No-Op
  try {
    const rawTask = {
      task_id: 'TASK-E2E-17',
      objective: 'Test duplicate completion governance',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    };
    const orch = new TaskOrchestrator(runtime);
    const firstRun = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
        return { success: true, summary: 'Arch PASS', evidence: skillRes.evidence, files_touched: [] };
      }
    });

    const secondRun = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        throw new Error('Should not be executed on duplicate');
      }
    });

    assert(
      firstRun.status === 'COMPLETED' &&
      secondRun.status === 'COMPLETED' &&
      secondRun.is_idempotent_noop === true &&
      secondRun.completion_id === firstRun.completion_id,
      'E2E-17',
      'Duplicate task execution is governed as Idempotent No-Op preserving completion_id',
      { evidence: `completion_id=${secondRun.completion_id}, is_idempotent_noop=${secondRun.is_idempotent_noop}` }
    );
  } catch (err) {
    assert(false, 'E2E-17', 'Duplicate completion error', { details: err.message });
  }

  // E2E-18: Valid full multi-agent composed task execution (Architect -> Database -> Forensic)
  try {
    const rawTask = {
      task_id: 'TASK-E2E-18-FULL',
      objective: 'Executar composição multi-agentes completa e canônica (Architect -> Database -> Forensic) com governança de ponta a ponta',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir,
      required_capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY']
    };

    const orch = new TaskOrchestrator(runtime);
    const executedChain = [];

    const fullResult = await orch.orchestrateTask(rawTask, {
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
        executedChain.push('architect');
        return {
          success: skillRes.success,
          summary: 'Architect: Descoberta de projeto concluída com sucesso.',
          evidence: skillRes.evidence,
          files_touched: []
        };
      },
      database: async (ctx) => {
        const sqlRes = await ctx.executeSkill('database-supabase-guard', 'validate_migration_sql', {
          sql: 'CREATE TABLE public.e2e_test (id UUID PRIMARY KEY DEFAULT gen_random_uuid()); ALTER TABLE public.e2e_test ENABLE ROW LEVEL SECURITY;'
        });
        const rlsRes = await ctx.executeSkill('database-supabase-guard', 'check_rls_policies', {
          table_name: 'e2e_test',
          policies: [{ operation: 'ALL' }]
        });
        executedChain.push('database');
        return {
          success: sqlRes.success && rlsRes.success,
          summary: 'Database: Validação de DDL e RLS concluída.',
          evidence: [...sqlRes.evidence, ...rlsRes.evidence],
          files_touched: []
        };
      },
      forensic: async (ctx) => {
        const diffRes = await ctx.executeSkill('forensic-auditor', 'audit_diff');
        executedChain.push('forensic');
        return {
          success: diffRes.success,
          summary: 'Forensic: Auditoria pericial concluída sem violações.',
          evidence: diffRes.evidence,
          files_touched: []
        };
      }
    }, {
      multi_step_chain: ['architect', 'database', 'forensic']
    });

    assert(
      fullResult.status === 'COMPLETED' &&
      executedChain.length === 3 &&
      executedChain[0] === 'architect' &&
      executedChain[1] === 'database' &&
      executedChain[2] === 'forensic' &&
      fullResult.handoffs.length === 2 &&
      fullResult.execution_results.length === 3 &&
      fullResult.completion_id.startsWith('CMP-'),
      'E2E-18',
      'Valid full multi-agent composed task execution (Architect -> Database -> Forensic) completes and seals with 100% verified chain',
      { evidence: `completion_id=${fullResult.completion_id}, steps=3, handoffs=2` }
    );
  } catch (err) {
    assert(false, 'E2E-18', 'Full E2E composition error', { details: err.message });
  }

  console.log('\n--- 4. NON-BYPASS STRUCTURAL PROOFS (NON-BYPASS-01 .. 04) ---');

  // NON-BYPASS-01: SkillRuntime cannot replace AgentContract
  try {
    const architectAgent = registry.getAgent('architect');
    assert(
      architectAgent.skills.includes('project-discovery') &&
      !architectAgent.skills.includes('database-supabase-guard') &&
      Object.isFrozen(architectAgent.skills),
      'NON-BYPASS-01',
      'SkillRuntime cannot bypass or expand AgentContract skills authorization'
    );
  } catch (err) {
    assert(false, 'NON-BYPASS-01', 'SkillRuntime contract bypass error', { details: err.message });
  }

  // NON-BYPASS-02: AgentRuntime cannot bypass PermissionEngine
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-BYPASS-02',
      objective: 'Test',
      workspace_root: rootDir
    });
    const writeCheck = spawnHandle.agent.permissions.write;
    assert(
      writeCheck === false,
      'NON-BYPASS-02',
      'AgentRuntime preserves PermissionEngine boundaries and read-only enforcement'
    );
  } catch (err) {
    assert(false, 'NON-BYPASS-02', 'AgentRuntime permission bypass error', { details: err.message });
  }

  // NON-BYPASS-03: Handoff cannot bypass AgentRegistry
  try {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-BYPASS-03',
      execution_id: 'EXEC-BYPASS-03',
      from: 'architect',
      to: 'fake_agent_unregistered',
      status: 'READY',
      objective: 'Test',
      completed_work: 'Work',
      evidence: [{ command: 'c', exit_code: 0, summary: 's' }],
      files_changed: [],
      tests_run: ['c'],
      next_action: 'Action',
      workspace_root: rootDir
    });
    const val = HandoffManager.validateHandoff(payload);
    assert(
      val.valid === false && val.errors.some(e => e.includes('não é um agente registrado')),
      'NON-BYPASS-03',
      'Handoff validation strictly rejects un-registered agents'
    );
  } catch (err) {
    assert(false, 'NON-BYPASS-03', 'Handoff registry bypass error', { details: err.message });
  }

  // NON-BYPASS-04: Evidence cannot bypass CompletionAuthority
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-BYPASS-04',
      objective: 'Test',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    const comp = CompletionAuthority.declareCompletion({
      task,
      plan,
      executionResults: [{
        step_id: plan.steps[0].step_id,
        agent_id: plan.steps[0].agent_id,
        task_id: 'TASK-BYPASS-04',
        status: 'COMPLETED',
        result: { success: false, summary: 'Failed' },
        evidence: [{ command: 'c', exit_code: 0 }]
      }],
      handoffs: []
    });
    assert(
      comp.completed === false && comp.status === 'BLOCKED',
      'NON-BYPASS-04',
      'CompletionAuthority rejects execution result reporting success=false regardless of evidence'
    );
  } catch (err) {
    assert(false, 'NON-BYPASS-04', 'CompletionAuthority bypass error', { details: err.message });
  }

  console.log('\n--- 5. DETERMINISM & MULTI-RUN EQUIVALENCE (DETERMINISM-01) ---');

  // DETERMINISM-01: Multiple runs with identical inputs produce identical flow and result structure
  try {
    const rawTaskA = {
      task_id: 'TASK-DET-01-A',
      objective: 'Teste de determinismo do runtime multi-agente',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir,
      required_capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY']
    };
    const rawTaskB = {
      task_id: 'TASK-DET-01-B',
      objective: 'Teste de determinismo do runtime multi-agente',
      task_type: 'ARCHITECTURE_AND_AUDIT',
      workspace_root: rootDir,
      required_capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY']
    };

    const orchA = new TaskOrchestrator(runtime);
    const orchB = new TaskOrchestrator(runtime);

    const makeHandler = () => ({
      architect: async (ctx) => {
        const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
        return { success: true, summary: 'Arch PASS', evidence: skillRes.evidence, files_touched: [] };
      },
      forensic: async (ctx) => {
        const diffRes = await ctx.executeSkill('forensic-auditor', 'audit_diff');
        return { success: true, summary: 'Forensic PASS', evidence: diffRes.evidence, files_touched: [] };
      }
    });

    const resA = await orchA.orchestrateTask(rawTaskA, makeHandler(), { multi_step_chain: ['architect', 'forensic'] });
    const resB = await orchB.orchestrateTask(rawTaskB, makeHandler(), { multi_step_chain: ['architect', 'forensic'] });

    assert(
      resA.status === 'COMPLETED' &&
      resB.status === 'COMPLETED' &&
      resA.execution_results.length === resB.execution_results.length &&
      resA.handoffs.length === resB.handoffs.length &&
      resA.execution_results[0].agent_id === resB.execution_results[0].agent_id &&
      resA.execution_results[1].agent_id === resB.execution_results[1].agent_id,
      'DETERMINISM-01',
      'Deterministic multi-run equivalence verified (identical agent sequence, step count, handoff count and terminal COMPLETED state)',
      { evidence: `Run A steps=${resA.execution_results.length}, Run B steps=${resB.execution_results.length}` }
    );
  } catch (err) {
    assert(false, 'DETERMINISM-01', 'Determinism error', { details: err.message });
  }

  console.log('\n=========================================================================');
  console.log(`📊 ADVERSARIAL E2E TEST SUITE RESULT: ${passedTests} / ${totalTests} PASS (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running adversarial test suite:', err);
  process.exit(1);
});
