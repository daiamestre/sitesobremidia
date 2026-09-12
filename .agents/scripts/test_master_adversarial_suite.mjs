/**
 * SOBRE MÍDIA AI Engineering System — Master Adversarial Test Suite
 * Validação pericial consolidada de todos os 25 Micro-Gates da fundação Multi-Agent Level B.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  VALID_CAPABILITIES,
  VALID_TASK_TYPES,
  VALID_TASK_LIFECYCLE_STATES,
  VALID_AGENT_LIFECYCLE_STATES,
  VALID_SKILL_LIFECYCLE_STATES,
  VALID_HIGH_RISK_OPERATIONS,
  validateCanonicalTask,
  validateExecutionPlan,
  validateAgentResult,
  validateEvidence,
  validateHandoffContract,
  validateMemoryRecord,
  validateHighRiskApprovalRequest,
  validateAuditTrailEvent,
  validateSkillDependency,
  deepFreeze
} from '../core/contracts.mjs';

import { registry, AgentRegistry } from '../core/registry.mjs';
import { canonicalSkillRegistry, CanonicalSkillRegistry } from '../core/skill_registry.mjs';
import { skillRuntime, SkillRuntime } from '../core/skill_runtime.mjs';
import { PermissionEngine } from '../core/permissions.mjs';
import { memoryManager, ScopedMemoryManager } from '../core/memory.mjs';
import { HandoffManager } from '../core/handoff.mjs';
import { AgentLifecycle, TaskLifecycle, SkillLifecycle } from '../core/lifecycle.mjs';
import { TaskNormalizer, ExecutionPlanner, CompletionAuthority, TaskOrchestrator } from '../core/orchestrator.mjs';
import { runtime, AgentRuntime } from '../core/runtime.mjs';
import { auditLogger, AuditTrailLogger } from '../core/audit.mjs';
import { highRiskGovernance, HighRiskGovernance, SkillDependencyGovernance } from '../core/governance.mjs';
import { ProjectDiscovery } from '../core/project_discovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');

let passedTests = 0;
let totalTests = 0;

function runTest(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`[✅ ${id}] PASS — ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[❌ ${id}] FAIL — ${name}`);
    console.error(`       Error: ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`       Stack: ${relevantStack}`);
    }
  }
}

async function runAsyncTest(id, name, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`[✅ ${id}] PASS — ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[❌ ${id}] FAIL — ${name}`);
    console.error(`       Error: ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`       Stack: ${relevantStack}`);
    }
  }
}

async function runAll() {
  console.log('🧪 =========================================================================');
  console.log('🧪 SOBRE MÍDIA AI ENGINEERING SYSTEM: MASTER ADVERSARIAL TEST SUITE');
  console.log('🧪 =========================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: HANDOFF GOVERNANCE (H01 .. H10)
  // --------------------------------------------------------------------------
  console.log('--- 1. HANDOFF GOVERNANCE (H01 .. H10) ---');

  runTest('H01', 'Valid handoff between architect and builder is strictly valid', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H01',
      execution_id: 'EXEC-H01',
      from: 'architect',
      to: 'builder',
      objective: 'Implementar componente com base na arquitetura',
      completed_work: 'Arquitetura validada',
      evidence: [{ command: 'view_file:src/types.ts', exit_code: 0, summary: 'Tipos conferidos PASS' }],
      next_action: 'Construir componente'
    });
    const val = HandoffManager.validateHandoff(payload, { expected_task_id: 'TASK-H01', expected_destination: 'builder' });
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.errors.length, 0);
  });

  runTest('H02', 'Forged task mismatch in handoff is blocked fail-closed', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-LEGIT',
      execution_id: 'EXEC-H02',
      from: 'architect',
      to: 'builder',
      objective: 'Implementar',
      completed_work: 'Doc',
      evidence: [{ command: 'audit', exit_code: 0 }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload, { expected_task_id: 'TASK-ATTACKER' });
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Task mismatch')));
  });

  runTest('H03', 'Forged execution mismatch in handoff result is blocked fail-closed', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H03',
      execution_id: 'EXEC-1',
      from: 'architect',
      to: 'builder',
      objective: 'Implementar',
      completed_work: 'Doc',
      evidence: [{ command: 'audit', exit_code: 0, execution_id: 'EXEC-FORGED' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload, { expected_task_id: 'TASK-H03' });
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Cross-execution evidence')));
  });

  runTest('H04', 'Unauthorized target agent in handoff fails closed', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H04',
      from: 'architect',
      to: 'unregistered-rogue-agent',
      objective: 'Takeover',
      completed_work: 'None',
      evidence: [{ command: 'noop', exit_code: 0 }],
      next_action: 'Escape'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('não é um agente registrado')));
  });

  runTest('H05', 'Foreign/failed evidence in handoff is rejected fail-closed', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H05',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Fail',
      evidence: [{ command: 'broken_command', exit_code: 1, summary: 'Command failed' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('exit_code=1')));
  });

  runTest('H06', 'Capability escalation attempt in handoff destination is checked', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H06',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0 }],
      next_action: 'Build'
    });
    // Builder doesn't have DATABASE_MANAGEMENT
    const val = HandoffManager.validateHandoff(payload, { required_capabilities: ['DATABASE_MANAGEMENT'] });
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('não possui as capabilities necessárias')));
  });

  runTest('H07', 'Permission escalation attempt through handoff mutation is blocked by deep freeze', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H07',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0 }],
      next_action: 'Build'
    });
    assert.throws(() => {
      payload.from = 'root_admin';
    }, /read only|Cannot assign/);
  });

  runTest('H08', 'Workspace mismatch between handoff and execution is rejected fail-closed', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-H08',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0 }],
      workspace_root: 'C:/fake/rogue/workspace',
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload, { expected_workspace: workspaceRoot });
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Workspace mismatch')));
  });

  runTest('H09', 'Replayed handoff is detected and rejected fail-closed', () => {
    const handoffId = 'HND-REPLAY-09';
    HandoffManager.consumeHandoff(handoffId);
    const payload = HandoffManager.createHandoffPayload({
      handoff_id: handoffId,
      task_id: 'TASK-H09',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0 }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Replay detectado')));
    HandoffManager.resetConsumedHandoffs();
  });

  runTest('H10', 'Duplicate handoff payload creation preserves deterministic validation', () => {
    const p1 = HandoffManager.createHandoffPayload({
      handoff_id: 'HND-DUP-1',
      task_id: 'TASK-H10',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0 }],
      next_action: 'Build'
    });
    const val1 = HandoffManager.validateHandoff(p1);
    assert.strictEqual(val1.valid, true);
    assert.strictEqual(Object.isFrozen(p1), true);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: SCOPED MEMORY & CONTEXT (MEM-01 .. MEM-09)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. SCOPED MEMORY & CONTEXT (MEM-01 .. MEM-09) ---');

  const mem = new ScopedMemoryManager();

  runTest('MEM-01', 'Memory isolation: agent private memory is accessible only to owner', () => {
    mem.set('AGENT', 'secret_key', 'arch_secret_123', { agent_id: 'architect' });
    const readByOwner = mem.get('AGENT', 'secret_key', { agent_id: 'architect' });
    const readByOther = mem.get('AGENT', 'secret_key', { agent_id: 'builder' });
    assert.strictEqual(readByOwner, 'arch_secret_123');
    assert.strictEqual(readByOther, null);
  });

  runTest('MEM-02', 'Cross-task memory boundary enforcement', () => {
    mem.set('TASK', 'plan_step', 'step_data_taskA', { task_id: 'TASK-A' });
    const readTaskA = mem.get('TASK', 'plan_step', { task_id: 'TASK-A' });
    const readTaskB = mem.get('TASK', 'plan_step', { task_id: 'TASK-B' });
    assert.strictEqual(readTaskA, 'step_data_taskA');
    assert.strictEqual(readTaskB, null);
  });

  runTest('MEM-03', 'Cross-execution memory boundary enforcement', () => {
    mem.set('EXECUTION', 'temp_flag', 'flag_exec_1', { execution_id: 'EXEC-1' });
    const readExec1 = mem.get('EXECUTION', 'temp_flag', { execution_id: 'EXEC-1' });
    const readExec2 = mem.get('EXECUTION', 'temp_flag', { execution_id: 'EXEC-2' });
    assert.strictEqual(readExec1, 'flag_exec_1');
    assert.strictEqual(readExec2, null);
  });

  runTest('MEM-04', 'Cross-agent memory boundary in execution context memory', () => {
    const archMem = mem.createExecutionContextMemory('architect', 'TASK-MEM4', workspaceRoot);
    const buildMem = mem.createExecutionContextMemory('builder', 'TASK-MEM4', workspaceRoot);
    archMem.set('AGENT', 'decision', 'use_postgresql');
    assert.strictEqual(archMem.get('AGENT', 'decision'), 'use_postgresql');
    assert.strictEqual(buildMem.get('AGENT', 'decision'), null);
  });

  runTest('MEM-05', 'Workspace memory boundary enforcement in PROJECT scope', () => {
    mem.set('PROJECT', 'stack_summary', 'React+Vite', { workspace_root: workspaceRoot });
    const readSame = mem.get('PROJECT', 'stack_summary', { workspace_root: workspaceRoot });
    const readForeign = mem.get('PROJECT', 'stack_summary', { workspace_root: 'C:/other/project' });
    assert.strictEqual(readSame, 'React+Vite');
    assert.strictEqual(readForeign, null);
  });

  runTest('MEM-06', 'Stale/expired memory governance structure', () => {
    const record = mem.set('GLOBAL', 'cache_item', 'value_v1', { status: 'STALE' });
    assert.strictEqual(record.status, 'STALE');
    assert.strictEqual(record.content, 'value_v1');
  });

  runTest('MEM-07', 'Forged memory rejection by validation contracts', () => {
    assert.throws(() => {
      mem.record({
        schema_version: 'invalid_semver',
        memory_id: 'MEM-FORGED',
        scope: 'INVALID_SCOPE'
      });
    }, /MemoryRecord/);
  });

  runTest('MEM-08', 'Replay/mutation protection on stored memory records', () => {
    const record = mem.set('GLOBAL', 'config', { port: 3000 });
    assert.throws(() => {
      record.content.port = 9999;
    }, /read only|Cannot assign/);
  });

  runTest('MEM-09', 'Legitimate continuation across execution contexts via GLOBAL/PROJECT scope', () => {
    mem.set('GLOBAL', 'shared_discovery', { project: 'SOBRE_MIDIA' });
    const archRead = mem.get('GLOBAL', 'shared_discovery', { agent_id: 'architect' });
    const qaRead = mem.get('GLOBAL', 'shared_discovery', { agent_id: 'qa' });
    assert.deepStrictEqual(archRead, { project: 'SOBRE_MIDIA' });
    assert.deepStrictEqual(qaRead, { project: 'SOBRE_MIDIA' });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: TASK STATE MACHINE (TSM-01 .. TSM-08)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. TASK STATE MACHINE (TSM-01 .. TSM-08) ---');

  runTest('TSM-01', 'Legitimate sequential lifecycle progression', () => {
    const tsm = new TaskLifecycle('RECEIVED', 'TASK-TSM01');
    assert.strictEqual(tsm.getState(), 'RECEIVED');
    tsm.transitionTo('NORMALIZED');
    tsm.transitionTo('ROUTED');
    tsm.transitionTo('PLANNED');
    tsm.transitionTo('EXECUTING');
    tsm.transitionTo('HANDOFF');
    tsm.transitionTo('EXECUTING');
    tsm.transitionTo('COMPLETING');
    tsm.transitionTo('COMPLETED');
    assert.strictEqual(tsm.getState(), 'COMPLETED');
    assert.strictEqual(tsm.isTerminal(), true);
  });

  runTest('TSM-02', 'Illegal jump COMPLETED -> EXECUTING is blocked fail-closed', () => {
    const tsm = new TaskLifecycle('COMPLETED', 'TASK-TSM02');
    assert.throws(() => {
      tsm.transitionTo('EXECUTING');
    }, /Transição ilegal/);
  });

  runTest('TSM-03', 'Illegal jump FAILED -> COMPLETED is blocked fail-closed', () => {
    const tsm = new TaskLifecycle('FAILED', 'TASK-TSM03');
    assert.throws(() => {
      tsm.transitionTo('COMPLETED');
    }, /Transição ilegal/);
  });

  runTest('TSM-04', 'Illegal jump BLOCKED -> COMPLETED is blocked fail-closed', () => {
    const tsm = new TaskLifecycle('BLOCKED', 'TASK-TSM04');
    assert.throws(() => {
      tsm.transitionTo('COMPLETED');
    }, /Transição ilegal/);
  });

  runTest('TSM-05', 'Illegal jump CANCELLED -> EXECUTING is blocked fail-closed', () => {
    const tsm = new TaskLifecycle('CANCELLED', 'TASK-TSM05');
    assert.throws(() => {
      tsm.transitionTo('EXECUTING');
    }, /Transição ilegal/);
  });

  runTest('TSM-06', 'Illegal jump RECEIVED -> COMPLETED is blocked fail-closed', () => {
    const tsm = new TaskLifecycle('RECEIVED', 'TASK-TSM06');
    assert.throws(() => {
      tsm.transitionTo('COMPLETED');
    }, /Transição ilegal/);
  });

  runTest('TSM-07', 'Task failure transition to FAILED and reset retry', () => {
    const tsm = new TaskLifecycle('EXECUTING', 'TASK-TSM07');
    tsm.transitionTo('FAILED', 'Erro pericial');
    assert.strictEqual(tsm.getState(), 'FAILED');
    tsm.transitionTo('NORMALIZED', 'Retry reset');
    assert.strictEqual(tsm.getState(), 'NORMALIZED');
  });

  runTest('TSM-08', 'Task cancellation transition and terminal verification', () => {
    const tsm = new TaskLifecycle('PLANNED', 'TASK-TSM08');
    tsm.transitionTo('CANCELLED', 'Cancelada pelo operador');
    assert.strictEqual(tsm.getState(), 'CANCELLED');
    assert.strictEqual(tsm.isTerminal(), true);
  });

  // --------------------------------------------------------------------------
  // SECTION 4: AGENT LIFECYCLE (ALC-01 .. ALC-08)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. AGENT LIFECYCLE (ALC-01 .. ALC-08) ---');

  runTest('ALC-01', 'Non-existent agent returns null from registry and fails closed', () => {
    assert.strictEqual(registry.getAgent('non-existent-agent-xyz'), null);
    assert.strictEqual(registry.hasAgent('non-existent-agent-xyz'), false);
  });

  runTest('ALC-02', 'Unregistered agent spawn fails closed with BLOCKED status', () => {
    const sp = runtime.spawnAgent('unregistered_agent', { task_id: 'TASK-ALC2', objective: 'Test' });
    assert.strictEqual(sp.status, 'BLOCKED');
  });

  runTest('ALC-03', 'Disabled agent execution is blocked fail-closed', () => {
    const disabledContract = {
      agent_id: 'disabled_tester',
      name: 'Disabled Agent',
      version: '1.0.0',
      status: 'DISABLED',
      role: 'Disabled Tester',
      objective: 'Testing',
      skills: ['project-discovery'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      memory_scope: 'TASK'
    };
    const reg = new AgentRegistry();
    reg.registerAgent(disabledContract);
    const eligibility = reg.isEligibleForTask('disabled_tester', { task_id: 'TASK-ALC3', objective: 'Test' });
    assert.strictEqual(eligibility.eligible, false);
    assert.ok(eligibility.reason.includes('não está ativo'));
  });

  runTest('ALC-04', 'Deprecated agent is ineligible for tasks in registry', () => {
    const depContract = {
      agent_id: 'dep_tester',
      name: 'Deprecated Agent',
      version: '1.0.0',
      status: 'DEPRECATED',
      role: 'Dep Tester',
      objective: 'Testing',
      skills: ['project-discovery'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      memory_scope: 'TASK'
    };
    const reg = new AgentRegistry();
    reg.registerAgent(depContract);
    const eligibility = reg.isEligibleForTask('dep_tester', { task_id: 'TASK-ALC4', objective: 'Test' });
    assert.strictEqual(eligibility.eligible, false);
  });

  runTest('ALC-05', 'Retired agent is recognized as valid status but blocked from execution', () => {
    const retContract = {
      agent_id: 'retired_tester',
      name: 'Retired Agent',
      version: '1.0.0',
      status: 'RETIRED',
      role: 'Ret Tester',
      objective: 'Testing',
      skills: ['project-discovery'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      memory_scope: 'TASK'
    };
    const reg = new AgentRegistry();
    reg.registerAgent(retContract);
    const eligibility = reg.isEligibleForTask('retired_tester', { task_id: 'TASK-ALC5', objective: 'Test' });
    assert.strictEqual(eligibility.eligible, false);
  });

  runTest('ALC-06', 'Valid agent lifecycle progression (CREATED -> READY -> RUNNING -> COMPLETED)', () => {
    const alc = new AgentLifecycle('CREATED', 'EXEC-ALC6');
    alc.transitionTo('READY');
    alc.transitionTo('RUNNING');
    alc.transitionTo('COMPLETED');
    assert.strictEqual(alc.getState(), 'COMPLETED');
    assert.strictEqual(alc.isTerminal(), true);
  });

  runTest('ALC-07', 'Prohibited agent lifecycle jump (COMPLETED -> RUNNING) is blocked', () => {
    const alc = new AgentLifecycle('COMPLETED', 'EXEC-ALC7');
    assert.throws(() => {
      alc.transitionTo('RUNNING');
    }, /Transição ilegal/);
  });

  runTest('ALC-08', 'Agent lifecycle immutability prevents capability escalation', () => {
    const agent = registry.getAgent('architect');
    assert.strictEqual(Object.isFrozen(agent.capabilities), true);
    assert.strictEqual(Object.isFrozen(agent.permissions), true);
  });

  // --------------------------------------------------------------------------
  // SECTION 5: SKILL LIFECYCLE & VERSIONING (SKL-01 .. SKL-08)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. SKILL LIFECYCLE & VERSIONING (SKL-01 .. SKL-08) ---');

  const skr = new SkillRuntime();

  await runAsyncTest('SKL-01', 'Nonexistent skill fails closed with descriptive error', async () => {
    const res = await skr.executeSkill({
      skill_id: 'nonexistent-skill',
      agent_id: 'architect',
      task_id: 'TASK-SKL1',
      execution_id: 'EXEC-SKL1',
      action: 'scan'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes('não encontrada no CanonicalSkillRegistry'));
  });

  await runAsyncTest('SKL-02', 'Unregistered skill execution is blocked fail-closed', async () => {
    const res = await skr.executeSkill({
      skill_id: 'unregistered-skill-abc',
      agent_id: 'architect',
      task_id: 'TASK-SKL2',
      execution_id: 'EXEC-SKL2',
      action: 'exec'
    });
    assert.strictEqual(res.success, false);
  });

  await runAsyncTest('SKL-03', 'Disabled skill execution is blocked fail-closed', async () => {
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'DISABLED');
    const res = await skr.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKL3',
      execution_id: 'EXEC-SKL3',
      action: 'scan_workspace'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes("status 'DISABLED' e não pode ser executada"));
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'AVAILABLE');
  });

  await runAsyncTest('SKL-04', 'Deprecated skill execution is blocked fail-closed', async () => {
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'DEPRECATED');
    const res = await skr.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKL4',
      execution_id: 'EXEC-SKL4',
      action: 'scan_workspace'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes("status 'DEPRECATED' e não pode ser executada"));
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'AVAILABLE');
  });

  await runAsyncTest('SKL-05', 'Retired skill execution is blocked fail-closed', async () => {
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'RETIRED');
    const res = await skr.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKL5',
      execution_id: 'EXEC-SKL5',
      action: 'scan_workspace'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes("status 'RETIRED' e não pode ser executada"));
    canonicalSkillRegistry.setSkillStatus('project-discovery', 'AVAILABLE');
  });

  await runAsyncTest('SKL-06', 'Incompatible skill version requirement is rejected fail-closed', async () => {
    const res = await skr.executeSkill({
      skill_id: 'database-supabase-guard',
      agent_id: 'database',
      task_id: 'TASK-SKL6',
      execution_id: 'EXEC-SKL6',
      action: 'validate_migration_sql',
      required_version: '99.9.9'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes('Incompatibilidade de versão'));
  });

  await runAsyncTest('SKL-07', 'Unauthorized agent executing skill is blocked by AgentContract binding', async () => {
    // Builder doesn't declare database-supabase-guard
    const res = await skr.executeSkill({
      skill_id: 'database-supabase-guard',
      agent_id: 'builder',
      task_id: 'TASK-SKL7',
      execution_id: 'EXEC-SKL7',
      action: 'validate_migration_sql'
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors[0].includes('não possui vinculação autorizada'));
  });

  await runAsyncTest('SKL-08', 'Valid skill execution generates structured evidence and succeeds', async () => {
    const res = await skr.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKL8',
      execution_id: 'EXEC-SKL8',
      action: 'scan_workspace',
      workspace_root: workspaceRoot
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.evidence.length > 0);
    assert.strictEqual(res.evidence[0].exit_code, 0);
  });

  // --------------------------------------------------------------------------
  // SECTION 6: SKILL DEPENDENCIES (DEP-01 .. DEP-04)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. SKILL DEPENDENCIES (DEP-01 .. DEP-04) ---');

  runTest('DEP-01', 'Valid linear dependency graph is accepted', () => {
    const graph = {
      'skill-a': ['skill-b'],
      'skill-b': ['skill-c'],
      'skill-c': []
    };
    const val = SkillDependencyGovernance.validateSkillDependencies(graph);
    assert.strictEqual(val.valid, true);
    assert.strictEqual(val.errors.length, 0);
  });

  runTest('DEP-02', 'Circular dependency in skill graph is detected and blocked', () => {
    const cyclicGraph = {
      'skill-a': ['skill-b'],
      'skill-b': ['skill-c'],
      'skill-c': ['skill-a']
    };
    const val = SkillDependencyGovernance.validateSkillDependencies(cyclicGraph);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Dependência circular detectada')));
  });

  runTest('DEP-03', 'Self-dependency circularity is blocked by schema validation', () => {
    const errs = validateSkillDependency({
      source_skill_id: 'skill-self',
      target_skill_id: 'skill-self'
    });
    assert.ok(errs.some(e => e.includes('Auto-dependência circular')));
  });

  runTest('DEP-04', 'Permission/tool escalation across skill dependency is blocked', () => {
    const agent = registry.getAgent('architect'); // tools: view_file, list_dir, grep_search (no write_to_file)
    const rogueDep = { skill_id: 'rogue-dep', tools: ['write_to_file', 'delete_file'] };
    assert.throws(() => {
      SkillDependencyGovernance.assertNoPermissionEscalation(agent, { skill_id: 'project-discovery' }, rogueDep);
    }, /SECURITY ESCALATION BLOCKED/);
  });

  // --------------------------------------------------------------------------
  // SECTION 7: CAPABILITY & PERMISSION MODEL (CAP-01 .. CAP-06)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. CAPABILITY & PERMISSION MODEL (CAP-01 .. CAP-06) ---');

  runTest('CAP-01', 'Capability is distinct from Permission and Tool in agent contract', () => {
    const arch = registry.getAgent('architect');
    assert.ok(Array.isArray(arch.capabilities));
    assert.ok(arch.capabilities.includes('SYSTEM_ARCHITECTURE'));
    assert.strictEqual(typeof arch.permissions.read, 'boolean');
    assert.ok(Array.isArray(arch.tools));
    assert.ok(arch.tools.includes('view_file'));
    assert.ok(!arch.tools.includes('write_to_file'));
  });

  runTest('CAP-02', 'Capability mutation is impossible due to deep freeze', () => {
    const arch = registry.getAgent('architect');
    assert.throws(() => {
      arch.capabilities.push('ROOT_OVERRIDE');
    }, /read only|Cannot add/);
  });

  runTest('CAP-03', 'Tool escalation attempt is blocked by PermissionEngine', () => {
    const arch = registry.getAgent('architect');
    const perm = PermissionEngine.checkToolPermission(arch, 'write_to_file');
    assert.strictEqual(perm.allowed, false);
    assert.ok(perm.reason.includes('não possui permissão'));
  });

  runTest('CAP-04', 'Path traversal in path check is blocked by PermissionEngine', () => {
    const arch = registry.getAgent('architect');
    const perm = PermissionEngine.checkPathPermission(arch, 'src/../../windows/system32/cmd.exe', workspaceRoot);
    assert.strictEqual(perm.allowed, false);
  });

  runTest('CAP-05', 'Read-only agent write operation is blocked by PermissionEngine', () => {
    const arch = registry.getAgent('architect');
    const perm = PermissionEngine.checkOperationPermission(arch, 'write');
    assert.strictEqual(perm.allowed, false);
  });

  runTest('CAP-06', 'Foreign workspace operation is blocked by PermissionEngine', () => {
    const arch = registry.getAgent('architect');
    const perm = PermissionEngine.checkPathPermission(arch, 'C:/foreign/unauthorized/path', workspaceRoot);
    assert.strictEqual(perm.allowed, false);
  });

  // --------------------------------------------------------------------------
  // SECTION 8: EVIDENCE CHAIN & PROVENANCE (EVD-01 .. EVD-08)
  // --------------------------------------------------------------------------
  console.log('\n--- 8. EVIDENCE CHAIN & PROVENANCE (EVD-01 .. EVD-08) ---');

  runTest('EVD-01', 'Legitimate evidence passes contract validation', () => {
    const ev = { command: 'node test.mjs', exit_code: 0, summary: 'Test PASS' };
    const errs = validateEvidence(ev);
    assert.strictEqual(errs.length, 0);
  });

  runTest('EVD-02', 'Cross-task evidence injection is blocked by handoff validation', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-REAL',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0, task_id: 'TASK-FOREIGN' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Cross-task evidence')));
  });

  runTest('EVD-03', 'Cross-execution evidence injection is blocked', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-EVD3',
      execution_id: 'EXEC-REAL',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0, execution_id: 'EXEC-FOREIGN' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Cross-execution evidence')));
  });

  runTest('EVD-04', 'Cross-agent evidence injection is blocked', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-EVD4',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      evidence: [{ command: 'test', exit_code: 0, source_agent_id: 'forensic' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Foreign agent evidence')));
  });

  runTest('EVD-05', 'Non-zero exit_code evidence in AgentResult declaring success=true is rejected', () => {
    const result = {
      success: true,
      summary: 'Asserted success falsely',
      evidence: [{ command: 'failed_cmd', exit_code: 1, summary: 'Failed' }]
    };
    const errs = validateAgentResult(result);
    assert.ok(errs.length > 0);
    assert.ok(errs.some(e => e.includes('Inconsistência de evidência')));
  });

  runTest('EVD-06', 'Cross-workspace evidence is rejected by handoff validation', () => {
    const payload = HandoffManager.createHandoffPayload({
      task_id: 'TASK-EVD6',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Arch',
      workspace_root: workspaceRoot,
      evidence: [{ command: 'test', exit_code: 0, workspace_root: 'C:/other/workspace' }],
      next_action: 'Build'
    });
    const val = HandoffManager.validateHandoff(payload);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('Cross-workspace evidence')));
  });

  runTest('EVD-07', 'Tampered evidence with negative exit_code is rejected', () => {
    const errs = validateEvidence({ command: 'test', exit_code: -1 });
    assert.strictEqual(errs.length, 0); // numeric integer is valid schema, but rejected in handoff exit_code!=0
    const handoffErrs = validateHandoffContract({
      handoff_id: 'HND-EVD7',
      task_id: 'TASK-EVD7',
      from: 'architect',
      to: 'builder',
      objective: 'Build',
      completed_work: 'Work',
      evidence: [{ command: 'test', exit_code: -1 }],
      next_action: 'Next'
    });
    assert.ok(handoffErrs.some(e => e.includes('exit_code=-1 (esperado 0)')));
  });

  runTest('EVD-08', 'Missing evidence in execution results blocks CompletionAuthority', () => {
    const task = { task_id: 'TASK-EVD8' };
    const plan = { plan_id: 'PLAN-EVD8', steps: [{ step_id: 'STEP-1', step_index: 1, agent_id: 'architect' }] };
    const execResults = [{
      step_id: 'STEP-1',
      agent_id: 'architect',
      task_id: 'TASK-EVD8',
      status: 'COMPLETED',
      result: { success: true, summary: 'No evidence', evidence: [] },
      evidence: []
    }];
    const val = CompletionAuthority.validateCompletion({ task, plan, executionResults: execResults });
    assert.strictEqual(val.completed, false);
    assert.ok(val.errors.some(e => e.includes('não possui evidências comprovadas')));
  });

  // --------------------------------------------------------------------------
  // SECTION 9: FAILURE PROPAGATION (FAIL-01 .. FAIL-06)
  // --------------------------------------------------------------------------
  console.log('\n--- 9. FAILURE PROPAGATION (FAIL-01 .. FAIL-06) ---');

  const orch = new TaskOrchestrator();

  await runAsyncTest('FAIL-01', 'Skill action failure produces success:false and exit_code:1', async () => {
    const res = await skr.executeSkill({
      skill_id: 'forensic-auditor',
      agent_id: 'forensic',
      task_id: 'TASK-FAIL1',
      execution_id: 'EXEC-FAIL1',
      action: 'check_forbidden_patterns',
      input: { content: 'console.log("leak"); debugger;' }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.evidence[0].exit_code, 1);
  });

  await runAsyncTest('FAIL-02', 'Intermediate agent step failure halts execution chain immediately', async () => {
    orch.reset();
    let executedAgents = [];
    const res = await orch.orchestrateTask(
      {
        task_id: 'TASK-FAIL2',
        objective: 'Test failure cascading',
        task_type: 'FEATURE'
      },
      {
        architect: async () => {
          executedAgents.push('architect');
          return { success: true, summary: 'Architect pass', evidence: [{ command: 'view', exit_code: 0 }] };
        },
        builder: async () => {
          executedAgents.push('builder');
          throw new Error('Builder compilation failed');
        },
        qa: async () => {
          executedAgents.push('qa');
          return { success: true, summary: 'QA pass', evidence: [{ command: 'test', exit_code: 0 }] };
        }
      },
      {
        multi_step_chain: ['architect', 'builder', 'qa']
      }
    );

    assert.strictEqual(res.status, 'FAILED');
    assert.deepStrictEqual(executedAgents, ['architect', 'builder']);
    assert.strictEqual(executedAgents.includes('qa'), false);
  });

  await runAsyncTest('FAIL-03', 'Task marked FAILED upon intermediate step failure', async () => {
    orch.reset();
    const res = await orch.orchestrateTask(
      { task_id: 'TASK-FAIL3', objective: 'Step fail', task_type: 'FIX' },
      { architect: async () => { throw new Error('Root cause failure'); } },
      { multi_step_chain: ['architect'] }
    );
    assert.strictEqual(res.status, 'FAILED');
  });

  runTest('FAIL-04', 'CompletionAuthority strictly blocks completion after intermediate step failure', () => {
    const task = { task_id: 'TASK-FAIL4' };
    const plan = {
      plan_id: 'PLAN-FAIL4',
      steps: [
        { step_id: 'STEP-1', step_index: 1, agent_id: 'architect' },
        { step_id: 'STEP-2', step_index: 2, agent_id: 'builder' }
      ]
    };
    const execResults = [
      { step_id: 'STEP-1', agent_id: 'architect', task_id: 'TASK-FAIL4', status: 'COMPLETED', result: { success: true, summary: 'OK', evidence: [{ command: 'c', exit_code: 0 }] }, evidence: [{ command: 'c', exit_code: 0 }] },
      { step_id: 'STEP-2', agent_id: 'builder', task_id: 'TASK-FAIL4', status: 'FAILED', result: { success: false, summary: 'Fail', evidence: [] }, evidence: [] }
    ];
    const val = CompletionAuthority.validateCompletion({ task, plan, executionResults: execResults });
    assert.strictEqual(val.completed, false);
    assert.ok(val.errors.some(e => e.includes('não concluiu com status COMPLETED')));
  });

  await runAsyncTest('FAIL-05', 'Subsequent agents are NOT executed after intermediate failure', async () => {
    orch.reset();
    let qaExecuted = false;
    await orch.orchestrateTask(
      { task_id: 'TASK-FAIL5', objective: 'Abort chain', task_type: 'IMPLEMENTATION' },
      {
        architect: async () => { throw new Error('Architect crash'); },
        qa: async () => { qaExecuted = true; return { success: true, summary: 'QA', evidence: [{ command: 't', exit_code: 0 }] }; }
      },
      { multi_step_chain: ['architect', 'qa'] }
    );
    assert.strictEqual(qaExecuted, false);
  });

  runTest('FAIL-06', 'No silent transmutation of failure into success (fail-closed check)', () => {
    const dec = CompletionAuthority.declareCompletion({
      task: { task_id: 'TASK-FAIL6' },
      plan: { plan_id: 'PLAN-FAIL6', steps: [{ step_id: 'S1', step_index: 1, agent_id: 'architect' }] },
      executionResults: [{ step_id: 'S1', agent_id: 'architect', task_id: 'TASK-FAIL6', status: 'FAILED', result: { success: false, summary: 'Fail' } }]
    });
    assert.strictEqual(dec.completed, false);
    assert.strictEqual(dec.status, 'BLOCKED');
  });

  // --------------------------------------------------------------------------
  // SECTION 10: GLOBAL IDEMPOTENCY (IDEM-01 .. IDEM-05)
  // --------------------------------------------------------------------------
  console.log('\n--- 10. GLOBAL IDEMPOTENCY (IDEM-01 .. IDEM-05) ---');

  await runAsyncTest('IDEM-01', 'Skill-level duplicate execution returns cached idempotent result', async () => {
    const execId = `EXEC-IDEM1-${Date.now()}`;
    const req = {
      skill_id: 'sobremidia-domain',
      agent_id: 'architect',
      task_id: 'TASK-IDEM1',
      execution_id: execId,
      action: 'verify_rules'
    };
    const r1 = await skr.executeSkill(req);
    const r2 = await skr.executeSkill(req);
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r2.is_idempotent_noop, true);
    assert.strictEqual(r2.duplicate_prevented, true);
  });

  await runAsyncTest('IDEM-02', 'Agent-level duplicate execution idempotency', async () => {
    orch.reset();
    let callCount = 0;
    const task = { task_id: 'TASK-IDEM2', objective: 'Idempotent agent execution', task_type: 'SPECIFICATION' };
    const handler = async () => {
      callCount++;
      return { success: true, summary: 'Run OK', evidence: [{ command: 'verify', exit_code: 0 }] };
    };

    const r1 = await orch.orchestrateTask(task, { architect: handler });
    assert.strictEqual(r1.status, 'COMPLETED');
    assert.strictEqual(callCount, 1);

    // Re-run same task
    const r2 = await orch.orchestrateTask(task, { architect: handler });
    assert.strictEqual(r2.is_idempotent_noop, true);
    assert.strictEqual(callCount, 1); // Handler NOT called again
  });

  await runAsyncTest('IDEM-03', 'Task-level duplicate execution returns idempotent no-op preserving completion_id', async () => {
    orch.reset();
    const task = { task_id: 'TASK-IDEM3', objective: 'Preserve completion ID', task_type: 'SPECIFICATION' };
    const r1 = await orch.orchestrateTask(task, { architect: async () => ({ success: true, summary: 'OK', evidence: [{ command: 'c', exit_code: 0 }] }) });
    const r2 = await orch.orchestrateTask(task, { architect: async () => ({ success: true, summary: 'OK', evidence: [{ command: 'c', exit_code: 0 }] }) });
    assert.strictEqual(r1.completion_id, r2.completion_id);
    assert.strictEqual(r2.is_idempotent_noop, true);
  });

  runTest('IDEM-04', 'Handoff replay detection and rejection', () => {
    const handoffId = 'HND-IDEM4';
    HandoffManager.consumeHandoff(handoffId);
    assert.strictEqual(HandoffManager.isHandoffConsumed(handoffId), true);
    HandoffManager.resetConsumedHandoffs();
  });

  runTest('IDEM-05', 'CompletionAuthority duplicate declaration idempotency', () => {
    CompletionAuthority.resetRegistry();
    const task = { task_id: 'TASK-IDEM5' };
    const plan = { plan_id: 'PLAN-IDEM5', steps: [{ step_id: 'S1', step_index: 1, agent_id: 'architect' }] };
    const execResults = [{ step_id: 'S1', agent_id: 'architect', task_id: 'TASK-IDEM5', status: 'COMPLETED', result: { success: true, summary: 'OK', evidence: [{ command: 'c', exit_code: 0 }] }, evidence: [{ command: 'c', exit_code: 0 }] }];

    const c1 = CompletionAuthority.declareCompletion({ task, plan, executionResults: execResults });
    const c2 = CompletionAuthority.declareCompletion({ task, plan, executionResults: execResults });

    assert.strictEqual(c1.completion_id, c2.completion_id);
    assert.strictEqual(c2.is_idempotent_noop, true);
    CompletionAuthority.resetRegistry();
  });

  // --------------------------------------------------------------------------
  // SECTION 11: OBSERVABILITY & AUDIT TRAIL (OBS-01 .. OBS-04)
  // --------------------------------------------------------------------------
  console.log('\n--- 11. OBSERVABILITY & AUDIT TRAIL (OBS-01 .. OBS-04) ---');

  const audit = new AuditTrailLogger();

  runTest('OBS-01', 'Structured audit events recorded on task, skill, and completion', () => {
    const event = audit.recordEvent({
      event_type: 'SKILL_EXECUTED',
      task_id: 'TASK-OBS1',
      execution_id: 'EXEC-OBS1',
      agent_id: 'architect',
      skill_id: 'project-discovery',
      action: 'scan_workspace',
      status: 'COMPLETED',
      evidence: [{ command: 'scan', exit_code: 0 }]
    });

    assert.ok(event.event_id.startsWith('AUD-'));
    assert.strictEqual(event.event_type, 'SKILL_EXECUTED');
    assert.strictEqual(event.task_id, 'TASK-OBS1');
  });

  runTest('OBS-02', 'Query audit events by task_id', () => {
    audit.recordEvent({ event_type: 'TASK_INTAKE', task_id: 'TASK-OBS2' });
    audit.recordEvent({ event_type: 'COMPLETION_SEALED', task_id: 'TASK-OBS2' });
    const taskEvents = audit.getEventsForTask('TASK-OBS2');
    assert.strictEqual(taskEvents.length, 2);
  });

  runTest('OBS-03', 'Query audit events by execution_id', () => {
    audit.recordEvent({ event_type: 'AGENT_SPAWNED', task_id: 'TASK-OBS3', execution_id: 'EXEC-OBS3' });
    const execEvents = audit.getEventsForExecution('EXEC-OBS3');
    assert.strictEqual(execEvents.length, 1);
  });

  runTest('OBS-04', 'Immutability and schema validation of audit events', () => {
    const event = audit.recordEvent({ event_type: 'LOG', task_id: 'TASK-OBS4' });
    assert.strictEqual(Object.isFrozen(event), true);
    assert.throws(() => {
      event.status = 'TAMPERED';
    }, /read only|Cannot assign/);
  });

  // --------------------------------------------------------------------------
  // SECTION 12: HIGH-RISK HUMAN GOVERNANCE (HRG-01 .. HRG-04)
  // --------------------------------------------------------------------------
  console.log('\n--- 12. HIGH-RISK HUMAN GOVERNANCE (HRG-01 .. HRG-04) ---');

  const hrg = new HighRiskGovernance();

  runTest('HRG-01', 'Identification of high-risk operations', () => {
    assert.strictEqual(HighRiskGovernance.isHighRiskOperation('DESTRUCTIVE_DATABASE', 'DROP TABLE users'), true);
    assert.strictEqual(HighRiskGovernance.isHighRiskOperation('PRODUCTION_MUTATION', 'git push --force'), true);
    assert.strictEqual(HighRiskGovernance.isHighRiskOperation('READ_FILE', 'src/App.tsx'), false);
  });

  runTest('HRG-02', 'Unapproved high-risk operation throws fail-closed error', () => {
    const req = hrg.requestApproval({
      task_id: 'TASK-HRG2',
      agent_id: 'database',
      operation_type: 'DESTRUCTIVE_DATABASE',
      target_resource: 'DROP TABLE test_tab'
    });
    assert.strictEqual(req.status, 'PENDING_APPROVAL');
    assert.strictEqual(hrg.canExecute(req.request_id), false);
    assert.throws(() => {
      hrg.assertApproved(req.request_id, 'DESTRUCTIVE_DATABASE');
    }, /HIGH-RISK SECURITY VIOLATION/);
  });

  runTest('HRG-03', 'Approved high-risk operation allows execution', () => {
    const req = hrg.requestApproval({
      task_id: 'TASK-HRG3',
      agent_id: 'database',
      operation_type: 'DESTRUCTIVE_DATABASE',
      target_resource: 'DROP TABLE scratch_temp'
    });
    hrg.approve(req.request_id, 'SUPERVISOR_ALICE');
    assert.strictEqual(hrg.canExecute(req.request_id), true);
    assert.strictEqual(hrg.assertApproved(req.request_id, 'DESTRUCTIVE_DATABASE'), true);
  });

  runTest('HRG-04', 'Rejected high-risk operation is strictly blocked', () => {
    const req = hrg.requestApproval({
      task_id: 'TASK-HRG4',
      agent_id: 'database',
      operation_type: 'DESTRUCTIVE_DATABASE',
      target_resource: 'DROP TABLE prod_users'
    });
    hrg.reject(req.request_id, 'SUPERVISOR_BOB', 'Risco inaceitável de perda de dados');
    assert.strictEqual(hrg.canExecute(req.request_id), false);
    assert.throws(() => {
      hrg.assertApproved(req.request_id, 'DESTRUCTIVE_DATABASE');
    }, /HIGH-RISK SECURITY VIOLATION/);
  });

  console.log('\n=========================================================================');
  console.log(`📊 MASTER ADVERSARIAL TEST SUITE RESULT: ${passedTests} / ${totalTests} PASS (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('=========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll();
