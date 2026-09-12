/**
 * SOBRE MÍDIA AI Engineering System — Micro-Gate 0.14 Adversarial Test Suite
 * Task Orchestration & Execution Governance Verification (ORC-01 through ORC-35)
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
  validateCanonicalTask,
  validateExecutionPlan,
  validateAgentResult,
  validateEvidence,
  deepFreeze
} from '../core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

let total = 0;
let passed = 0;
const results = [];

function assert(condition, testId, scenario, details = '') {
  total++;
  if (condition) {
    passed++;
    results.push({ id: testId, scenario, expected: 'PASS', actual: 'PASS', status: 'PASS', details });
    console.log(`[✅ ${testId}] PASS — ${scenario}`);
  } else {
    results.push({ id: testId, scenario, expected: 'PASS', actual: 'FAIL', status: 'FAIL', details });
    console.error(`[❌ ${testId}] FAIL — ${scenario} | Details: ${details}`);
  }
}

console.log('🧪 =========================================================================');
console.log('🧪 MICRO-GATE 0.14: TASK ORCHESTRATION & EXECUTION GOVERNANCE ADVERSARIAL SUITE');
console.log('🧪 =========================================================================\n');

async function runAdversarialSuite() {
  // ORC-01: valid task normalization
  try {
    const raw = {
      task_id: 'TASK-NORM-01',
      objective: 'Implementar validação canônica de contrato no CRM',
      task_type: 'IMPLEMENTATION',
      workspace_root: rootDir,
      required_capabilities: ['CODE_IMPLEMENTATION']
    };
    const canonical = TaskNormalizer.normalize(raw);
    assert(
      canonical.task_id === 'TASK-NORM-01' &&
      canonical.task_type === 'IMPLEMENTATION' &&
      canonical.is_project_aware === true &&
      Object.isFrozen(canonical),
      'ORC-01',
      'Valid task normalization produces frozen CanonicalTask'
    );
  } catch (err) {
    assert(false, 'ORC-01', 'Valid task normalization', err.message);
  }

  // ORC-02: malformed task (missing task_id or objective)
  try {
    let caught = 0;
    try { TaskNormalizer.normalize(null); } catch { caught++; }
    try { TaskNormalizer.normalize({}); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: 'T1' }); } catch { caught++; }
    try { TaskNormalizer.normalize({ objective: 'No ID' }); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: 'T 1', objective: 'Space in ID' }); } catch { caught++; }
    try { TaskNormalizer.normalize({ task_id: '../bad', objective: 'Path traversal' }); } catch { caught++; }
    assert(caught === 6, 'ORC-02', 'Malformed tasks are strictly rejected during normalization');
  } catch (err) {
    assert(false, 'ORC-02', 'Malformed task rejection', err.message);
  }

  // ORC-03: unknown task type
  try {
    let caughtUnknown = false;
    try {
      TaskNormalizer.normalize({
        task_id: 'TASK-UNKNOWN-TYPE',
        objective: 'Test invalid task type',
        task_type: 'NON_EXISTENT_CUSTOM_TYPE_XYZ'
      });
    } catch {
      caughtUnknown = true;
    }
    assert(caughtUnknown, 'ORC-03', 'Unknown task type is rejected by validation contracts');
  } catch (err) {
    assert(false, 'ORC-03', 'Unknown task type', err.message);
  }

  // ORC-04: project-aware task without discovery
  try {
    const testRuntime = new AgentRuntime();
    const spawnRes = testRuntime.spawnAgent('builder', {
      task_id: 'TASK-NO-DISC',
      objective: 'Implement feature in non-existent directory',
      task_type: 'IMPLEMENTATION',
      workspace_root: path.join(rootDir, 'non_existent_fake_dir_xyz_123')
    });
    assert(
      spawnRes.status === 'BLOCKED' && spawnRes.error.includes('Project Discovery'),
      'ORC-04',
      'Project-aware task fails/blocks when project discovery fails on invalid directory'
    );
  } catch (err) {
    assert(false, 'ORC-04', 'Project-aware task without discovery', err.message);
  }

  // ORC-05: workspace mismatch
  try {
    const testRuntime = new AgentRuntime();
    const fakeDiscovery = ProjectDiscovery.discover(rootDir);
    const spawnRes = testRuntime.spawnAgent('builder', {
      task_id: 'TASK-WS-MISMATCH',
      objective: 'Task requiring other workspace',
      task_type: 'IMPLEMENTATION',
      workspace_root: path.resolve(rootDir, '..')
    }, { project: fakeDiscovery });

    assert(
      spawnRes.status === 'BLOCKED' && spawnRes.error.includes('Workspace mismatch'),
      'ORC-05',
      'Workspace mismatch between task workspace_root and DiscoveryResult blocks execution'
    );
  } catch (err) {
    assert(false, 'ORC-05', 'Workspace mismatch', err.message);
  }

  // ORC-06: invalid discovery object in context
  try {
    const testRuntime = new AgentRuntime();
    const spawnRes = testRuntime.spawnAgent('builder', {
      task_id: 'TASK-INV-DISC',
      objective: 'Task with forged discovery',
      task_type: 'IMPLEMENTATION',
      workspace_root: rootDir
    }, { project: { corrupted: true } });

    assert(
      spawnRes.status === 'BLOCKED' && spawnRes.error.includes('DiscoveryResult'),
      'ORC-06',
      'Corrupted or forged DiscoveryResult in context is rejected'
    );
  } catch (err) {
    assert(false, 'ORC-06', 'Invalid discovery', err.message);
  }

  // ORC-07: explicit eligible agent
  try {
    const task = {
      task_id: 'TASK-EXP-ELIG',
      objective: 'Architectural specification of domain models',
      task_type: 'ARCHITECTURE',
      preferred_agent: 'architect'
    };
    const route = TaskRouter.routeTask(task);
    assert(
      route.selected_agent === 'architect' && route.classification.includes('ARCHITECTURE'),
      'ORC-07',
      'Explicit eligible agent is selected directly'
    );
  } catch (err) {
    assert(false, 'ORC-07', 'Explicit eligible agent', err.message);
  }

  // ORC-08: explicit ineligible agent
  try {
    let caughtIneligible = false;
    try {
      TaskRouter.routeTask({
        task_id: 'TASK-EXP-INELIG',
        objective: 'Database migration task assigned to QA',
        preferred_agent: 'qa',
        required_capabilities: ['DATABASE_MANAGEMENT']
      });
    } catch (e) {
      caughtIneligible = e.message.includes('não é elegível');
    }
    assert(caughtIneligible, 'ORC-08', 'Explicit ineligible agent throws fail-closed error without silent fallback');
  } catch (err) {
    assert(false, 'ORC-08', 'Explicit ineligible agent', err.message);
  }

  // ORC-09: missing capability
  try {
    let caughtMissing = false;
    try {
      TaskRouter.routeTask({
        task_id: 'TASK-MISSING-CAP',
        objective: 'Task requiring non-held capability',
        type: 'IMPLEMENTATION',
        required_capabilities: ['SYSTEM_ARCHITECTURE', 'DATABASE_MANAGEMENT', 'CODE_IMPLEMENTATION']
      });
    } catch (e) {
      caughtMissing = true;
    }
    assert(caughtMissing, 'ORC-09', 'Missing capability requirement blocks agent selection');
  } catch (err) {
    assert(false, 'ORC-09', 'Missing capability', err.message);
  }

  // ORC-10: disabled agent
  try {
    const isolatedRegistry = new AgentRegistry();
    const disabledAgent = {
      agent_id: 'disabled_bot',
      name: 'Disabled Bot',
      version: '1.0.0',
      status: 'DISABLED',
      role: 'Disabled Test Agent',
      objective: 'Testing disabled status',
      skills: ['sobremidia-domain'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      capabilities: ['CODE_IMPLEMENTATION'],
      task_types: ['IMPLEMENTATION'],
      memory_scope: 'TASK'
    };
    isolatedRegistry.registerAgent(disabledAgent);
    const elig = isolatedRegistry.isEligibleForTask('disabled_bot', { task_id: 'T-DIS', objective: 'Test' });
    assert(
      elig.eligible === false && elig.reason.includes('não está ativo'),
      'ORC-10',
      'Disabled agent is marked ineligible in registry'
    );
  } catch (err) {
    assert(false, 'ORC-10', 'Disabled agent', err.message);
  }

  // ORC-11: deprecated agent
  try {
    const isolatedRegistry = new AgentRegistry();
    const depAgent = {
      agent_id: 'deprecated_bot',
      name: 'Deprecated Bot',
      version: '1.0.0',
      status: 'DEPRECATED',
      role: 'Deprecated Test Agent',
      objective: 'Testing deprecated status',
      skills: ['sobremidia-domain'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      capabilities: ['CODE_IMPLEMENTATION'],
      task_types: ['IMPLEMENTATION'],
      memory_scope: 'TASK'
    };
    isolatedRegistry.registerAgent(depAgent);
    const elig = isolatedRegistry.isEligibleForTask('deprecated_bot', { task_id: 'T-DEP', objective: 'Test' });
    assert(
      elig.eligible === false && elig.reason.includes('não está ativo'),
      'ORC-11',
      'Deprecated agent is marked ineligible in registry'
    );
  } catch (err) {
    assert(false, 'ORC-11', 'Deprecated agent', err.message);
  }

  // ORC-12: deterministic agent selection
  try {
    const taskA = { task_id: 'TASK-DET-01', objective: 'Criar migration SQL para nova tabela', type: 'DATABASE' };
    const taskB = { task_id: 'TASK-DET-02', objective: 'Criar migration SQL para nova tabela', type: 'DATABASE' };
    const routeA = TaskRouter.routeTask(taskA);
    const routeB = TaskRouter.routeTask(taskB);
    assert(
      routeA.selected_agent === 'database' && routeB.selected_agent === 'database',
      'ORC-12',
      'Task routing is strictly deterministic for equivalent tasks'
    );
  } catch (err) {
    assert(false, 'ORC-12', 'Deterministic selection', err.message);
  }

  // ORC-13: no eligible agent
  try {
    let caughtNoEligible = false;
    try {
      TaskRouter.routeTask({
        task_id: 'TASK-NO-ELIG',
        objective: 'Impossible composite task',
        required_capabilities: ['DATABASE_MANAGEMENT', 'SYSTEM_ARCHITECTURE', 'QUALITY_ASSURANCE']
      });
    } catch (e) {
      caughtNoEligible = e.message.includes('Nenhum agente');
    }
    assert(caughtNoEligible, 'ORC-13', 'Router blocks when no registered agent possesses all required capabilities');
  } catch (err) {
    assert(false, 'ORC-13', 'No eligible agent', err.message);
  }

  // ORC-14: task capability injection
  try {
    const rawTask = {
      task_id: 'TASK-CAP-INJECT',
      objective: 'Task attempting to grant unauthorized capability',
      task_type: 'IMPLEMENTATION',
      capabilities: ['DATABASE_MANAGEMENT', 'SUPER_ADMIN_CAPABILITY']
    };
    const normalized = TaskNormalizer.normalize(rawTask);
    const spawnRes = runtime.spawnAgent('builder', normalized);
    const execCtx = await spawnRes.execute(async (ctx) => {
      return {
        hasFakeCap: ctx.hasCapability('DATABASE_MANAGEMENT'),
        caps: ctx.capabilities,
        success: true,
        summary: 'Checked capabilities in context',
        evidence: [{ command: 'echo capability-test', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      execCtx.result.hasFakeCap === false && !execCtx.result.caps.includes('DATABASE_MANAGEMENT'),
      'ORC-14',
      'Task cannot grant capabilities to agent (authority strictly derived from registry)'
    );
  } catch (err) {
    assert(false, 'ORC-14', 'Task capability injection', err.message);
  }

  // ORC-15: permission injection
  try {
    const rawTask = {
      task_id: 'TASK-PERM-INJECT',
      objective: 'Task attempting to inject write permissions into read-only architect',
      task_type: 'ARCHITECTURE',
      permissions: { write: true, allowed_paths: ['src/'] }
    };
    const normalized = TaskNormalizer.normalize(rawTask);
    const spawnRes = runtime.spawnAgent('architect', normalized);
    const execRes = await spawnRes.execute(async (ctx) => {
      const canWrite = ctx.checkPermission('write_to_file', 'src/test.ts', 'write');
      return {
        canWrite,
        permissions: ctx.permissions,
        success: true,
        summary: 'Checked permissions in architect context',
        evidence: [{ command: 'echo perm-test', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      execRes.result.canWrite === false && execRes.result.permissions.write === false,
      'ORC-15',
      'Task cannot inject permissions into execution context'
    );
  } catch (err) {
    assert(false, 'ORC-15', 'Permission injection', err.message);
  }

  // ORC-16: skill injection
  try {
    const rawTask = {
      task_id: 'TASK-SKILL-INJECT',
      objective: 'Task attempting to load unauthorized skill',
      task_type: 'IMPLEMENTATION',
      skills: ['database-supabase-guard']
    };
    const normalized = TaskNormalizer.normalize(rawTask);
    const spawnRes = runtime.spawnAgent('builder', normalized);
    const execRes = await spawnRes.execute(async (ctx) => {
      const hasSkill = ctx.getSkill('database-supabase-guard');
      return {
        hasSkill: hasSkill !== null,
        success: true,
        summary: 'Checked skills in builder context',
        evidence: [{ command: 'echo skill-test', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      execRes.result.hasSkill === false,
      'ORC-16',
      'Task cannot inject unauthorized skills into execution context'
    );
  } catch (err) {
    assert(false, 'ORC-16', 'Skill injection', err.message);
  }

  // ORC-17: memory authority injection
  try {
    const spawnRes = runtime.spawnAgent('builder', {
      task_id: 'TASK-MEM-AUTH',
      objective: 'Check memory authority boundary'
    });
    const execRes = await spawnRes.execute(async (ctx) => {
      ctx.memory.set('TASK', 'permissions', { write: true, allowed_paths: ['/root'] });
      ctx.memory.set('TASK', 'role', 'OWNER');
      const canAccessRoot = ctx.checkPermission(null, '/root', 'write');
      return {
        canAccessRoot,
        agentRole: ctx.agent.role,
        success: true,
        summary: 'Memory set performed',
        evidence: [{ command: 'echo mem-test', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      execRes.result.canAccessRoot === false && execRes.result.agentRole !== 'OWNER',
      'ORC-17',
      'Memory writes cannot alter runtime permissions or agent role'
    );
  } catch (err) {
    assert(false, 'ORC-17', 'Memory authority injection', err.message);
  }

  // ORC-18: profile authority injection
  try {
    const fakeProfile = {
      schema_version: '1.0.0',
      project_id: 'SOBRE_MIDIA',
      project_name: 'SOBRE MÍDIA',
      architecture: 'SSR',
      stack: { runtime: 'Node', language: 'TS' },
      source: 'test',
      permissions: { write: true, allowed_paths: ['/etc/passwd'] },
      capabilities: ['DATABASE_MANAGEMENT']
    };
    const spawnRes = runtime.spawnAgent('architect', {
      task_id: 'TASK-PROF-AUTH',
      objective: 'Check profile authority boundary'
    }, { profile: fakeProfile });

    const execRes = await spawnRes.execute(async (ctx) => {
      const canWriteEtc = ctx.checkPermission('write_to_file', '/etc/passwd', 'write');
      const hasDbCap = ctx.hasCapability('DATABASE_MANAGEMENT');
      return {
        canWriteEtc,
        hasDbCap,
        success: true,
        summary: 'Profile authority checked',
        evidence: [{ command: 'echo profile-test', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      execRes.result.canWriteEtc === false && execRes.result.hasDbCap === false,
      'ORC-18',
      'Project profile cannot grant permissions or capabilities to agent'
    );
  } catch (err) {
    assert(false, 'ORC-18', 'Profile authority injection', err.message);
  }

  // ORC-19: valid execution plan
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-PLAN-01',
      objective: 'Criar migration SQL para módulo CRM',
      task_type: 'DATABASE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    assert(
      plan.plan_id.startsWith('PLAN-') &&
      plan.selected_agent === 'database' &&
      plan.steps.length === 1 &&
      Object.isFrozen(plan),
      'ORC-19',
      'Valid execution plan generated and frozen'
    );
  } catch (err) {
    assert(false, 'ORC-19', 'Valid execution plan', err.message);
  }

  // ORC-20: mutated execution plan (immutability)
  try {
    const task = TaskNormalizer.normalize({
      task_id: 'TASK-PLAN-MUT',
      objective: 'Test plan immutability',
      task_type: 'ARCHITECTURE',
      workspace_root: rootDir
    });
    const plan = ExecutionPlanner.createPlan(task);
    let mutationCaught = false;
    try {
      plan.selected_agent = 'builder';
    } catch {
      mutationCaught = true;
    }
    assert(
      mutationCaught || plan.selected_agent === 'architect',
      'ORC-20',
      'Execution plan is deeply frozen and resistant to mutation'
    );
  } catch (err) {
    assert(false, 'ORC-20', 'Mutated execution plan', err.message);
  }

  // ORC-21: duplicate execution (idempotency)
  try {
    const taskOrch = new TaskOrchestrator();
    const rawTask = {
      task_id: 'TASK-DUP-EXEC',
      objective: 'Test duplicate execution protection',
      task_type: 'NON_PROJECT'
    };
    const res1 = await taskOrch.orchestrateTask(rawTask, async () => ({
      success: true,
      summary: 'Run 1 success',
      evidence: [{ command: 'echo run-1', exit_code: 0, summary: 'PASS' }]
    }), { plan_id: 'PLAN-FIXED-DUP-01' });

    const res2 = await taskOrch.orchestrateTask(rawTask, async () => ({
      success: true,
      summary: 'Run 2 attempt',
      evidence: [{ command: 'echo run-2', exit_code: 0, summary: 'PASS' }]
    }), { plan_id: 'PLAN-FIXED-DUP-01' });

    assert(
      res1.status === 'COMPLETED' && res2.status === 'BLOCKED' && res2.error.includes('Replay detectado'),
      'ORC-21',
      'Duplicate execution of the same execution plan is blocked (idempotency)'
    );
  } catch (err) {
    assert(false, 'ORC-21', 'Duplicate execution', err.message);
  }

  // ORC-22: duplicate completion validation
  try {
    const task = TaskNormalizer.normalize({ task_id: 'TASK-DUP-COMP', objective: 'Test completion', task_type: 'NON_PROJECT' });
    const plan = ExecutionPlanner.createPlan(task);
    const execResults = [{
      step_id: plan.steps[0].step_id,
      agent_id: plan.steps[0].agent_id,
      task_id: task.task_id,
      status: 'COMPLETED',
      result: { success: true, summary: 'Pass' },
      evidence: [{ command: 'echo pass', exit_code: 0, summary: 'PASS' }]
    }];

    const val1 = CompletionAuthority.validateCompletion({ task, plan, executionResults: execResults });
    assert(val1.completed === true, 'ORC-22', 'Completion authority validates completed execution');
  } catch (err) {
    assert(false, 'ORC-22', 'Duplicate completion', err.message);
  }

  // ORC-23: invalid AgentResult
  try {
    const errs1 = validateAgentResult(null);
    const errs2 = validateAgentResult({ success: 'yes' });
    const errs3 = validateAgentResult({ success: true, summary: 123 });
    const errs4 = validateAgentResult({ success: true, summary: 'ok', evidence: 'not-array' });
    assert(
      errs1.length > 0 && errs2.length > 0 && errs3.length > 0 && errs4.length > 0,
      'ORC-23',
      'Malformed AgentResult payloads are strictly rejected'
    );
  } catch (err) {
    assert(false, 'ORC-23', 'Invalid AgentResult', err.message);
  }

  // ORC-24: invalid Evidence
  try {
    const errs1 = validateEvidence(null);
    const errs2 = validateEvidence({ command: '' });
    const errs3 = validateEvidence({ command: 'echo hi', exit_code: 'zero' });
    const resErrs = validateAgentResult({
      success: true,
      summary: 'False success',
      evidence: [{ command: 'failed-cmd', exit_code: 1, summary: 'Failed' }]
    });
    assert(
      errs1.length > 0 && errs2.length > 0 && errs3.length > 0 && resErrs.length > 0,
      'ORC-24',
      'Invalid evidence and inconsistent exit_code are rejected by validation contracts'
    );
  } catch (err) {
    assert(false, 'ORC-24', 'Invalid Evidence', err.message);
  }

  // ORC-25: invalid Handoff
  try {
    const badHandoff = {
      handoff_id: 'HND-BAD',
      task_id: 'T-1',
      from: 'architect',
      to: 'unregistered_agent_xyz',
      objective: 'test',
      completed_work: 'work',
      evidence: [{ command: 'echo test', exit_code: 0, summary: 'PASS' }],
      next_action: 'next'
    };
    const val = HandoffManager.validateHandoff(badHandoff);
    assert(
      val.valid === false && val.errors.some(e => e.includes('não é um agente registrado')),
      'ORC-25',
      'Handoff targeting unregistered agent is rejected'
    );
  } catch (err) {
    assert(false, 'ORC-25', 'Invalid Handoff', err.message);
  }

  // ORC-26: failed execution
  try {
    const spawnRes = runtime.spawnAgent('builder', {
      task_id: 'TASK-FAIL-EXEC',
      objective: 'Action that throws exception'
    });
    const execRes = await spawnRes.execute(async () => {
      throw new Error('Synthetic syntax error during compilation');
    });
    assert(
      execRes.status === 'FAILED' && execRes.error.includes('Synthetic syntax error'),
      'ORC-26',
      'Runtime catches action handler exceptions and transitions status to FAILED'
    );
  } catch (err) {
    assert(false, 'ORC-26', 'Failed execution', err.message);
  }

  // ORC-27: blocked execution
  try {
    const spawnRes = runtime.spawnAgent('unregistered_agent_id_xyz', {
      task_id: 'TASK-BLOCK-EXEC',
      objective: 'Spawn unknown agent'
    });
    assert(
      spawnRes.status === 'BLOCKED',
      'ORC-27',
      'Spawning unregistered agent transitions immediately to BLOCKED'
    );
  } catch (err) {
    assert(false, 'ORC-27', 'Blocked execution', err.message);
  }

  // ORC-28: successful multi-step chain
  try {
    const taskOrch = new TaskOrchestrator();
    const multiTask = {
      task_id: 'TASK-MULTI-CHAIN',
      objective: 'Orquestração multi-etapa completa (Architect -> Builder -> QA -> Forensic)',
      task_type: 'NON_PROJECT'
    };

    const multiRes = await taskOrch.orchestrateTask(multiTask, {
      architect: async () => ({
        success: true,
        summary: 'Architect: Especificação técnica aprovada.',
        evidence: [{ command: 'echo arch-spec-ok', exit_code: 0, summary: 'PASS' }],
        files_touched: []
      }),
      builder: async () => ({
        success: true,
        summary: 'Builder: Código implementado.',
        evidence: [{ command: 'echo build-ok', exit_code: 0, summary: 'PASS' }],
        files_touched: []
      }),
      qa: async () => ({
        success: true,
        summary: 'QA: Testes aprovados.',
        evidence: [{ command: 'echo qa-ok', exit_code: 0, summary: 'PASS' }],
        files_touched: []
      }),
      forensic: async () => ({
        success: true,
        summary: 'Forensic: Auditoria forense aprovada.',
        evidence: [{ command: 'echo forensic-ok', exit_code: 0, summary: 'PASS' }],
        files_touched: []
      })
    }, {
      multi_step_chain: ['architect', 'builder', 'qa', 'forensic']
    });

    assert(
      multiRes.status === 'COMPLETED' &&
      multiRes.execution_results.length === 4 &&
      multiRes.handoffs.length === 3,
      'ORC-28',
      'Successful 4-step multi-agent chain executes deterministically with valid handoffs and completion'
    );
  } catch (err) {
    assert(false, 'ORC-28', 'Successful multi-step chain', err.message);
  }

  // ORC-29: broken multi-step chain
  try {
    const taskOrch = new TaskOrchestrator();
    const brokenTask = {
      task_id: 'TASK-BROKEN-CHAIN',
      objective: 'Multi-step chain where Builder fails',
      task_type: 'NON_PROJECT'
    };

    const brokenRes = await taskOrch.orchestrateTask(brokenTask, {
      architect: async () => ({
        success: true,
        summary: 'Architect PASS',
        evidence: [{ command: 'echo ok', exit_code: 0, summary: 'PASS' }],
        files_touched: []
      }),
      builder: async () => {
        throw new Error('Builder failed compilation');
      }
    }, {
      multi_step_chain: ['architect', 'builder', 'qa']
    });

    assert(
      brokenRes.status === 'FAILED' &&
      brokenRes.execution_results.length === 2 &&
      brokenRes.error.includes('Builder failed compilation'),
      'ORC-29',
      'Broken multi-step chain halts immediately on step failure with FAILED status'
    );
  } catch (err) {
    assert(false, 'ORC-29', 'Broken multi-step chain', err.message);
  }

  // ORC-30: false completion
  try {
    const task = TaskNormalizer.normalize({ task_id: 'TASK-FALSE-COMP', objective: 'False completion test', task_type: 'NON_PROJECT' });
    const plan = ExecutionPlanner.createPlan(task, { multi_step_chain: ['architect', 'builder'] });
    const partialExec = [{
      step_id: plan.steps[0].step_id,
      agent_id: 'architect',
      task_id: task.task_id,
      status: 'COMPLETED',
      result: { success: true, summary: 'Only step 1 executed' },
      evidence: [{ command: 'echo ok', exit_code: 0, summary: 'PASS' }]
    }];

    const val = CompletionAuthority.validateCompletion({ task, plan, executionResults: partialExec });
    assert(
      val.completed === false && val.status === 'BLOCKED' && val.errors.some(e => e.includes('builder')),
      'ORC-30',
      'Completion authority blocks false completion when plan steps are missing'
    );
  } catch (err) {
    assert(false, 'ORC-30', 'False completion', err.message);
  }

  // ORC-31: forged agent identity
  try {
    const spawnRes = runtime.spawnAgent('builder', { task_id: 'TASK-FORGE-ID', objective: 'Forge test' });
    const execRes = await spawnRes.execute(async (ctx) => {
      let threw = false;
      try {
        ctx.agent = { agent_id: 'super_admin' };
      } catch {
        threw = true;
      }
      return {
        threw,
        agentId: ctx.agent.agent_id,
        success: true,
        summary: 'Agent identity check',
        evidence: [{ command: 'echo ok', exit_code: 0, summary: 'PASS' }]
      };
    });

    assert(
      (execRes.result.threw || execRes.result.agentId === 'builder') && execRes.result.agentId !== 'super_admin',
      'ORC-31',
      'Agent identity in execution context cannot be forged or overwritten'
    );
  } catch (err) {
    assert(false, 'ORC-31', 'Forged agent identity', err.message);
  }

  // ORC-32: forged capability in task
  try {
    let rejected = false;
    try {
      TaskNormalizer.normalize({
        task_id: 'TASK-FORGE-CAP',
        objective: 'Task with fabricated capability',
        required_capabilities: ['UNAUTHORIZED_ROOT_ACCESS_CAPABILITY']
      });
    } catch {
      rejected = true;
    }
    assert(rejected, 'ORC-32', 'Fabricated/forged capability in task declaration is rejected');
  } catch (err) {
    assert(false, 'ORC-32', 'Forged capability', err.message);
  }

  // ORC-33: forged workspace in evidence/handoff
  try {
    const badHandoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-FORGE-WS',
      from: 'architect',
      to: 'builder',
      objective: 'Test foreign workspace',
      completed_work: 'Done',
      evidence: [{
        command: 'echo test',
        exit_code: 0,
        summary: 'PASS',
        workspace_root: '/foreign/unauthorized/path'
      }],
      workspace_root: rootDir,
      next_action: 'Next'
    });

    const val = HandoffManager.validateHandoff(badHandoff, { expected_workspace: rootDir });
    assert(
      val.valid === false && val.errors.some(e => e.includes('Cross-workspace evidence')),
      'ORC-33',
      'Cross-workspace forged evidence in handoff is detected and rejected'
    );
  } catch (err) {
    assert(false, 'ORC-33', 'Forged workspace', err.message);
  }

  // ORC-34: cross-task execution attempt
  try {
    const taskA = TaskNormalizer.normalize({ task_id: 'TASK-A', objective: 'Task A', task_type: 'NON_PROJECT' });
    const planA = ExecutionPlanner.createPlan(taskA);
    const execForeign = [{
      step_id: planA.steps[0].step_id,
      agent_id: planA.steps[0].agent_id,
      task_id: 'TASK-B-FOREIGN',
      status: 'COMPLETED',
      result: { success: true, summary: 'Foreign result' },
      evidence: [{ command: 'echo ok', exit_code: 0, summary: 'PASS' }]
    }];

    const val = CompletionAuthority.validateCompletion({ task: taskA, plan: planA, executionResults: execForeign });
    assert(
      val.completed === false && val.errors.some(e => e.includes('cross-task')),
      'ORC-34',
      'Cross-task execution result attached to a different task is rejected'
    );
  } catch (err) {
    assert(false, 'ORC-34', 'Cross-task execution', err.message);
  }

  // ORC-35: cross-execution context attempt
  try {
    const handoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-CROSS-EXEC',
      execution_id: 'EXEC-ORIGINAL-01',
      from: 'architect',
      to: 'builder',
      objective: 'Cross-execution test',
      completed_work: 'Done',
      evidence: [{
        command: 'echo test',
        exit_code: 0,
        summary: 'PASS',
        execution_id: 'EXEC-FOREIGN-999'
      }],
      next_action: 'Next'
    });

    const val = HandoffManager.validateHandoff(handoff);
    assert(
      val.valid === false && val.errors.some(e => e.includes('Cross-execution evidence')),
      'ORC-35',
      'Cross-execution evidence injected into foreign handoff payload is rejected'
    );
  } catch (err) {
    assert(false, 'ORC-35', 'Cross-execution context', err.message);
  }

  console.log('\n=========================================================================');
  console.log(`📊 ADVERSARIAL TEST SUITE RESULT: ${passed} / ${total} PASS (${Math.round((passed / total) * 100)}%)`);
  console.log('=========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAdversarialSuite().catch(e => {
  console.error('Fatal error running adversarial suite:', e);
  process.exit(1);
});
