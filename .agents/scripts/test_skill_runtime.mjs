/**
 * SOBRE MÍDIA AI Engineering System — Skill Runtime Adversarial Test Suite (SKR-01..30)
 * Bateria de testes adversariais para homologação do MICRO-GATE 0.15.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registry,
  runtime,
  canonicalSkillRegistry,
  PermissionEngine,
  SkillRuntime,
  skillRuntime,
  validateSkillExecutionRequest,
  validateSkillExecutionResult,
  AgentRegistry,
  HandoffManager
} from '../core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

async function runAdversarialSuite() {
  console.log('🧪 =========================================================================');
  console.log('🧪 MICRO-GATE 0.15: SKILL RUNTIME & AGENT EXECUTION ADVERSARIAL SUITE');
  console.log('🧪 =========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testId, description, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`[✅ ${testId}] PASS — ${description}`);
    } else {
      console.error(`[❌ ${testId}] FAIL — ${description} | Details: ${details}`);
    }
  }

  // --- IDENTITY & REGISTRY (SKR-01..04) ---

  // SKR-01: Valid skill execution through runtime
  try {
    const customRuntime = new SkillRuntime();
    const req = {
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-01',
      execution_id: 'EXEC-SKR-01',
      action: 'scan_workspace',
      input: {},
      workspace_root: rootDir
    };
    const res = await customRuntime.executeSkill(req);
    assert(
      res.success === true &&
      res.skill_id === 'project-discovery' &&
      res.agent_id === 'architect' &&
      res.evidence.length > 0 &&
      res.evidence[0].exit_code === 0 &&
      Object.isFrozen(res),
      'SKR-01',
      'Valid skill execution through runtime returns frozen SkillExecutionResult with valid evidence'
    );
  } catch (err) {
    assert(false, 'SKR-01', 'Valid skill execution', err.message);
  }

  // SKR-02: Inexistent skill
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'non-existent-skill-999',
      agent_id: 'architect',
      task_id: 'TASK-SKR-02',
      execution_id: 'EXEC-SKR-02',
      action: 'some_action',
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('não encontrada no CanonicalSkillRegistry')),
      'SKR-02',
      'Inexistent skill fails closed with descriptive error'
    );
  } catch (err) {
    assert(false, 'SKR-02', 'Inexistent skill', err.message);
  }

  // SKR-03: Malformed/corrupted request
  try {
    const errs1 = validateSkillExecutionRequest(null);
    const errs2 = validateSkillExecutionRequest({ skill_id: 'test' }); // missing agent, task, execution, action
    const res = await skillRuntime.executeSkill({
      skill_id: '',
      agent_id: 'architect',
      task_id: 'TASK-SKR-03',
      execution_id: 'EXEC-SKR-03',
      action: ''
    });
    assert(
      errs1.length > 0 && errs2.length > 0 && res.success === false && res.errors.length > 0,
      'SKR-03',
      'Malformed skill execution request is rejected by validation contracts'
    );
  } catch (err) {
    assert(false, 'SKR-03', 'Malformed request', err.message);
  }

  // SKR-04: Unregistered skill
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'unregistered-rogue-skill',
      agent_id: 'builder',
      task_id: 'TASK-SKR-04',
      execution_id: 'EXEC-SKR-04',
      action: 'run',
      workspace_root: rootDir
    });
    assert(
      res.success === false && res.errors[0].includes('não encontrada'),
      'SKR-04',
      'Unregistered skill is rejected fail-closed'
    );
  } catch (err) {
    assert(false, 'SKR-04', 'Unregistered skill', err.message);
  }

  // --- AGENT BINDING (SKR-05..08) ---

  // SKR-05: Skill not declared by agent
  try {
    // QA does not declare database-supabase-guard
    const res = await skillRuntime.executeSkill({
      skill_id: 'database-supabase-guard',
      agent_id: 'qa',
      task_id: 'TASK-SKR-05',
      execution_id: 'EXEC-SKR-05',
      action: 'validate_migration_sql',
      input: { sql: 'SELECT 1;' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('não possui vinculação autorizada')),
      'SKR-05',
      'Skill not declared in agent contract is blocked'
    );
  } catch (err) {
    assert(false, 'SKR-05', 'Undeclared skill binding', err.message);
  }

  // SKR-06: Inexistent agent
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'ghost_agent_404',
      task_id: 'TASK-SKR-06',
      execution_id: 'EXEC-SKR-06',
      action: 'scan_workspace',
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('não está registrado no AgentRegistry')),
      'SKR-06',
      'Inexistent agent cannot execute skills'
    );
  } catch (err) {
    assert(false, 'SKR-06', 'Inexistent agent', err.message);
  }

  // SKR-07: Disabled agent
  try {
    const customRegistry = new AgentRegistry();
    customRegistry.registerAgent({
      agent_id: 'disabled_agent',
      name: 'Disabled Bot',
      version: '1.0.0',
      status: 'DISABLED',
      role: 'Disabled Bot',
      objective: 'Testing disabled agent',
      skills: ['project-discovery'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      capabilities: ['PROJECT_DISCOVERY'],
      task_types: ['DISCOVERY'],
      memory_scope: 'TASK'
    });
    const isolatedRuntime = new SkillRuntime(canonicalSkillRegistry, customRegistry);
    const res = await isolatedRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'disabled_agent',
      task_id: 'TASK-SKR-07',
      execution_id: 'EXEC-SKR-07',
      action: 'scan_workspace',
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes("status 'DISABLED'")),
      'SKR-07',
      'Disabled agent cannot execute skills'
    );
  } catch (err) {
    assert(false, 'SKR-07', 'Disabled agent', err.message);
  }

  // SKR-08: Deprecated agent
  try {
    const customRegistry = new AgentRegistry();
    customRegistry.registerAgent({
      agent_id: 'deprecated_agent',
      name: 'Deprecated Bot',
      version: '1.0.0',
      status: 'DEPRECATED',
      role: 'Deprecated Bot',
      objective: 'Testing deprecated agent',
      skills: ['project-discovery'],
      tools: ['view_file'],
      permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
      capabilities: ['PROJECT_DISCOVERY'],
      task_types: ['DISCOVERY'],
      memory_scope: 'TASK'
    });
    const isolatedRuntime = new SkillRuntime(canonicalSkillRegistry, customRegistry);
    const res = await isolatedRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'deprecated_agent',
      task_id: 'TASK-SKR-08',
      execution_id: 'EXEC-SKR-08',
      action: 'scan_workspace',
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes("status 'DEPRECATED'")),
      'SKR-08',
      'Deprecated agent cannot execute skills'
    );
  } catch (err) {
    assert(false, 'SKR-08', 'Deprecated agent', err.message);
  }

  // --- AUTHORITY IMMUTABILITY (SKR-09..13) ---

  // SKR-09: Skill cannot grant capabilities to agent
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-09',
      objective: 'Check capability grant immunity'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      // Skill execution
      await ctx.executeSkill('project-discovery', 'scan_workspace');
      // Attempt to grant capability
      let threw = false;
      try {
        ctx.capabilities.push('DATABASE_MANAGEMENT');
      } catch {
        threw = true;
      }
      return {
        threw,
        hasDbCap: ctx.hasCapability('DATABASE_MANAGEMENT'),
        success: true,
        summary: 'Checked capability immutability',
        evidence: [{ command: 'echo cap-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.hasDbCap === false,
      'SKR-09',
      'Skill execution cannot grant capabilities to executing agent'
    );
  } catch (err) {
    assert(false, 'SKR-09', 'Capability grant attempt', err.message);
  }

  // SKR-10: Skill cannot grant permissions to agent
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-10',
      objective: 'Check permission grant immunity'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      await ctx.executeSkill('project-discovery', 'scan_workspace');
      let threw = false;
      try {
        ctx.permissions.write = true;
      } catch {
        threw = true;
      }
      return {
        threw,
        canWrite: ctx.permissions.write,
        checkPerm: ctx.checkPermission(null, null, 'write'),
        success: true,
        summary: 'Checked permission immutability',
        evidence: [{ command: 'echo perm-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.canWrite === false && execRes.result.checkPerm === false,
      'SKR-10',
      'Skill execution cannot grant write permissions to read-only agent'
    );
  } catch (err) {
    assert(false, 'SKR-10', 'Permission grant attempt', err.message);
  }

  // SKR-11: Skill cannot grant tools to agent
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-11',
      objective: 'Check tool grant immunity'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      await ctx.executeSkill('project-discovery', 'scan_workspace');
      let threw = false;
      try {
        ctx.tools.push('write_to_file');
      } catch {
        threw = true;
      }
      return {
        threw,
        hasTool: ctx.tools.includes('write_to_file'),
        checkPerm: ctx.checkPermission('write_to_file'),
        success: true,
        summary: 'Checked tool immutability',
        evidence: [{ command: 'echo tool-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.hasTool === false && execRes.result.checkPerm === false,
      'SKR-11',
      'Skill execution cannot grant unauthorized tools to agent'
    );
  } catch (err) {
    assert(false, 'SKR-11', 'Tool grant attempt', err.message);
  }

  // SKR-12: Skill cannot alter allowed_paths
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-12',
      objective: 'Check allowed_paths immunity'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      await ctx.executeSkill('project-discovery', 'scan_workspace');
      let threw = false;
      try {
        ctx.permissions.allowed_paths.push('/etc/shadow');
      } catch {
        threw = true;
      }
      return {
        threw,
        hasShadow: ctx.permissions.allowed_paths.includes('/etc/shadow'),
        canAccessShadow: ctx.checkPermission(null, '/etc/shadow'),
        success: true,
        summary: 'Checked allowed_paths immutability',
        evidence: [{ command: 'echo path-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.hasShadow === false && execRes.result.canAccessShadow === false,
      'SKR-12',
      'Skill execution cannot alter allowed_paths of agent'
    );
  } catch (err) {
    assert(false, 'SKR-12', 'Allowed paths alteration attempt', err.message);
  }

  // SKR-13: Skill cannot alter AgentContract or AgentRegistry
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-13',
      objective: 'Check registry immunity'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      await ctx.executeSkill('project-discovery', 'scan_workspace');
      let threw = false;
      try {
        registry.registerAgent({ agent_id: 'rogue_agent', name: 'Rogue', status: 'ACTIVE', skills: [], tools: [], permissions: { read: true, write: true, execute: true, allowed_paths: ['/'] }, capabilities: [], task_types: [], memory_scope: 'GLOBAL' });
      } catch {
        threw = true;
      }
      const arch = registry.getAgent('architect');
      return {
        threw,
        archStatus: arch.status,
        archRole: arch.role,
        success: true,
        summary: 'Checked registry immutability',
        evidence: [{ command: 'echo reg-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.archStatus === 'ACTIVE' && execRes.result.archRole.includes('Architecture'),
      'SKR-13',
      'Skill execution cannot alter AgentContract or AgentRegistry'
    );
  } catch (err) {
    assert(false, 'SKR-13', 'Registry alteration attempt', err.message);
  }

  // --- CONTEXT & PROVENANCE (SKR-14..18) ---

  // SKR-14: Execution context is deeply immutable
  try {
    const spawnHandle = runtime.spawnAgent('builder', {
      task_id: 'TASK-SKR-14',
      objective: 'Check executionContext deep immutability'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      let threwAgent = false;
      let threwPerm = false;
      try { ctx.agent = { agent_id: 'super_admin' }; } catch { threwAgent = true; }
      try { ctx.permissions = { read: true, write: true }; } catch { threwPerm = true; }
      return {
        threwAgent,
        threwPerm,
        agentId: ctx.agent.agent_id,
        success: true,
        summary: 'Immutability verified',
        evidence: [{ command: 'echo immut-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      (execRes.result.threwAgent || execRes.result.agentId === 'builder') && execRes.result.agentId !== 'super_admin',
      'SKR-14',
      'ExecutionContext properties are deeply immutable and protected against reassignment'
    );
  } catch (err) {
    assert(false, 'SKR-14', 'Context immutability', err.message);
  }

  // SKR-15: Forged task_id
  try {
    const spawnHandle = runtime.spawnAgent('architect', { task_id: 'TASK-REAL-15', objective: 'Forge task test' });
    const execRes = await spawnHandle.execute(async (ctx) => {
      const skillRes = await skillRuntime.executeSkill({
        skill_id: 'project-discovery',
        agent_id: 'architect',
        task_id: 'TASK-FORGED-99',
        execution_id: ctx.execution_id,
        action: 'scan_workspace',
        workspace_root: rootDir
      }, ctx);
      return {
        skillRes,
        success: true,
        summary: 'Forged task checked',
        evidence: [{ command: 'echo task-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.skillRes.success === false &&
      execRes.result.skillRes.errors.some(e => e.includes('Cross-task context mismatch')),
      'SKR-15',
      'Forged task_id mismatching executionContext is rejected'
    );
  } catch (err) {
    assert(false, 'SKR-15', 'Forged task_id', err.message);
  }

  // SKR-16: Forged execution_id
  try {
    const spawnHandle = runtime.spawnAgent('architect', { task_id: 'TASK-REAL-16', objective: 'Forge execution test' });
    const execRes = await spawnHandle.execute(async (ctx) => {
      const skillRes = await skillRuntime.executeSkill({
        skill_id: 'project-discovery',
        agent_id: 'architect',
        task_id: 'TASK-REAL-16',
        execution_id: 'EXEC-FORGED-888',
        action: 'scan_workspace',
        workspace_root: rootDir
      }, ctx);
      return {
        skillRes,
        success: true,
        summary: 'Forged execution checked',
        evidence: [{ command: 'echo exec-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.skillRes.success === false &&
      execRes.result.skillRes.errors.some(e => e.includes('Cross-execution mismatch')),
      'SKR-16',
      'Forged execution_id mismatching executionContext is rejected'
    );
  } catch (err) {
    assert(false, 'SKR-16', 'Forged execution_id', err.message);
  }

  // SKR-17: Forged agent_id
  try {
    const spawnHandle = runtime.spawnAgent('architect', { task_id: 'TASK-REAL-17', objective: 'Forge agent test' });
    const execRes = await spawnHandle.execute(async (ctx) => {
      const skillRes = await skillRuntime.executeSkill({
        skill_id: 'project-discovery',
        agent_id: 'builder', // Mismatch from architect context
        task_id: 'TASK-REAL-17',
        execution_id: ctx.execution_id,
        action: 'scan_workspace',
        workspace_root: rootDir
      }, ctx);
      return {
        skillRes,
        success: true,
        summary: 'Forged agent checked',
        evidence: [{ command: 'echo agent-check', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.result.skillRes.success === false &&
      execRes.result.skillRes.errors.some(e => e.includes('Cross-agent context mismatch')),
      'SKR-17',
      'Forged agent_id mismatching executionContext is rejected'
    );
  } catch (err) {
    assert(false, 'SKR-17', 'Forged agent_id', err.message);
  }

  // SKR-18: Forged workspace_root
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-18',
      execution_id: 'EXEC-SKR-18',
      action: 'scan_workspace',
      workspace_root: '/unauthorized/rogue/workspace'
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('Workspace não autorizado')),
      'SKR-18',
      'Forged workspace_root outside authorized project boundary is blocked'
    );
  } catch (err) {
    assert(false, 'SKR-18', 'Forged workspace', err.message);
  }

  // --- SECURITY & BOUNDARIES (SKR-19..23) ---

  // SKR-19: Path traversal in input
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-19',
      execution_id: 'EXEC-SKR-19',
      action: 'verify_stack',
      input: { target_path: '../../../../Windows/System32' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('PermissionEngine')),
      'SKR-19',
      'Path traversal in skill input is detected and blocked by PermissionEngine'
    );
  } catch (err) {
    assert(false, 'SKR-19', 'Path traversal', err.message);
  }

  // SKR-20: Foreign workspace target
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-20',
      execution_id: 'EXEC-SKR-20',
      action: 'verify_stack',
      input: { path: '/etc/passwd' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('PermissionEngine')),
      'SKR-20',
      'Foreign workspace target is blocked by PermissionEngine'
    );
  } catch (err) {
    assert(false, 'SKR-20', 'Foreign workspace', err.message);
  }

  // SKR-21: Unauthorized operation (write requested for read-only agent)
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-21',
      execution_id: 'EXEC-SKR-21',
      action: 'verify_stack',
      input: { required_operation: 'write' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes("Operação do tipo 'write' negada")),
      'SKR-21',
      'Unauthorized operation type is blocked by PermissionEngine'
    );
  } catch (err) {
    assert(false, 'SKR-21', 'Unauthorized operation', err.message);
  }

  // SKR-22: Direct privileged action
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'database-supabase-guard',
      agent_id: 'database',
      task_id: 'TASK-SKR-22',
      execution_id: 'EXEC-SKR-22',
      action: 'validate_migration_sql',
      input: { sql: 'DROP SCHEMA public CASCADE;' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.errors.some(e => e.includes('Comando destrutivo não permitido')),
      'SKR-22',
      'Destructive database operation inside skill is blocked'
    );
  } catch (err) {
    assert(false, 'SKR-22', 'Privileged action block', err.message);
  }

  // SKR-23: PermissionEngine cannot be bypassed
  try {
    const arch = registry.getAgent('architect');
    const permCheck = PermissionEngine.checkToolPermission(arch, 'deploy_service');
    assert(
      permCheck.allowed === false,
      'SKR-23',
      'PermissionEngine strictly validates tool authorizations without bypass'
    );
  } catch (err) {
    assert(false, 'SKR-23', 'PermissionEngine check', err.message);
  }

  // --- EVIDENCE GOVERNANCE (SKR-24..27) ---

  // SKR-24: Forged evidence validation
  try {
    const badEvidence = {
      command: '', // invalid
      exit_code: 'zero', // invalid
      summary: 'PASS'
    };
    const errs = validateSkillExecutionResult({
      success: true,
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-24',
      execution_id: 'EXEC-SKR-24',
      action: 'scan',
      evidence: [badEvidence],
      errors: []
    });
    assert(
      errs.length > 0,
      'SKR-24',
      'Forged/malformed evidence in skill result is rejected by contracts'
    );
  } catch (err) {
    assert(false, 'SKR-24', 'Forged evidence', err.message);
  }

  // SKR-25: Cross-task evidence
  try {
    const handoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-CURRENT',
      execution_id: 'EXEC-01',
      from: 'architect',
      to: 'builder',
      objective: 'Check cross-task evidence',
      completed_work: 'Done',
      evidence: [{
        command: 'skill:project-discovery:scan',
        exit_code: 0,
        summary: 'PASS',
        task_id: 'TASK-FOREIGN-99'
      }],
      next_action: 'Next'
    });
    const val = HandoffManager.validateHandoff(handoff, { expected_task_id: 'TASK-CURRENT' });
    assert(
      val.valid === false && val.errors.some(e => e.includes('Cross-task evidence')),
      'SKR-25',
      'Cross-task evidence injected from foreign task is detected and rejected'
    );
  } catch (err) {
    assert(false, 'SKR-25', 'Cross-task evidence', err.message);
  }

  // SKR-26: Cross-execution evidence
  try {
    const handoff = HandoffManager.createHandoffPayload({
      task_id: 'TASK-SKR-26',
      execution_id: 'EXEC-ACTIVE-10',
      from: 'architect',
      to: 'builder',
      objective: 'Check cross-execution evidence',
      completed_work: 'Done',
      evidence: [{
        command: 'skill:project-discovery:scan',
        exit_code: 0,
        summary: 'PASS',
        execution_id: 'EXEC-FOREIGN-77'
      }],
      next_action: 'Next'
    });
    const val = HandoffManager.validateHandoff(handoff);
    assert(
      val.valid === false && val.errors.some(e => e.includes('Cross-execution evidence')),
      'SKR-26',
      'Cross-execution evidence from foreign execution is detected and rejected'
    );
  } catch (err) {
    assert(false, 'SKR-26', 'Cross-execution evidence', err.message);
  }

  // SKR-27: Non-zero exit code in skill action
  try {
    const res = await skillRuntime.executeSkill({
      skill_id: 'forensic-auditor',
      agent_id: 'forensic',
      task_id: 'TASK-SKR-27',
      execution_id: 'EXEC-SKR-27',
      action: 'check_forbidden_patterns',
      input: { content: 'console.log("forbidden debug statement");' },
      workspace_root: rootDir
    });
    assert(
      res.success === false &&
      res.evidence.length > 0 &&
      res.evidence[0].exit_code === 1,
      'SKR-27',
      'Skill action detecting violations produces exit_code=1 and success=false'
    );
  } catch (err) {
    assert(false, 'SKR-27', 'Non-zero exit code', err.message);
  }

  // --- RUNTIME RESILIENCE (SKR-28..30) ---

  // SKR-28: Duplicate skill action execution governance (Idempotent No-Op)
  try {
    const localRuntime = new SkillRuntime();
    const req = {
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-28',
      execution_id: 'EXEC-SKR-28',
      action: 'scan_workspace',
      workspace_root: rootDir
    };
    const res1 = await localRuntime.executeSkill(req);
    const res2 = await localRuntime.executeSkill(req);
    assert(
      res1.success === true &&
      res2.success === true &&
      res2.is_idempotent_noop === true &&
      res2.duplicate_prevented === true,
      'SKR-28',
      'Duplicate skill execution on same execution identity is governed as Idempotent No-Op'
    );
  } catch (err) {
    assert(false, 'SKR-28', 'Duplicate skill execution', err.message);
  }

  // SKR-29: Failure propagation
  try {
    const spawnHandle = runtime.spawnAgent('architect', {
      task_id: 'TASK-SKR-29',
      objective: 'Propagate failure test'
    });
    const execRes = await spawnHandle.execute(async (ctx) => {
      const skillRes = await ctx.executeSkill('project-discovery', 'verify_stack', {
        target_path: '/unauthorized/escape/path'
      });
      if (!skillRes.success) {
        throw new Error(`Skill execution failed: ${skillRes.errors.join('; ')}`);
      }
      return {
        success: true,
        summary: 'Should not reach',
        evidence: [{ command: 'echo unreachable', exit_code: 0, summary: 'PASS' }]
      };
    });
    assert(
      execRes.status === 'FAILED' &&
      execRes.error.includes('Skill execution failed'),
      'SKR-29',
      'Skill execution failure propagates deterministically to agent status FAILED'
    );
  } catch (err) {
    assert(false, 'SKR-29', 'Failure propagation', err.message);
  }

  // SKR-30: Full successful governed execution of 3 canonical skills
  try {
    // 1. project-discovery (Architect)
    const resDisc = await skillRuntime.executeSkill({
      skill_id: 'project-discovery',
      agent_id: 'architect',
      task_id: 'TASK-SKR-30-A',
      execution_id: 'EXEC-SKR-30-A',
      action: 'scan_workspace',
      workspace_root: rootDir
    });

    // 2. forensic-auditor (Forensic)
    const resForensic = await skillRuntime.executeSkill({
      skill_id: 'forensic-auditor',
      agent_id: 'forensic',
      task_id: 'TASK-SKR-30-B',
      execution_id: 'EXEC-SKR-30-B',
      action: 'audit_diff',
      workspace_root: rootDir
    });

    // 3. database-supabase-guard (Database)
    const validSql = `
      CREATE TABLE IF NOT EXISTS public.app_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL
      );
      ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Allow select for authenticated" ON public.app_settings FOR SELECT TO authenticated USING (true);
    `;
    const resDb = await skillRuntime.executeSkill({
      skill_id: 'database-supabase-guard',
      agent_id: 'database',
      task_id: 'TASK-SKR-30-C',
      execution_id: 'EXEC-SKR-30-C',
      action: 'validate_migration_sql',
      input: { sql: validSql },
      workspace_root: rootDir
    });

    assert(
      resDisc.success === true &&
      resForensic.success === true &&
      resDb.success === true &&
      resDisc.evidence.length > 0 &&
      resForensic.evidence.length > 0 &&
      resDb.evidence.length > 0,
      'SKR-30',
      'Full successful governed execution of 3 canonical skills (project-discovery, forensic-auditor, database-supabase-guard)'
    );
  } catch (err) {
    assert(false, 'SKR-30', '3 canonical skills execution', err.message);
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
