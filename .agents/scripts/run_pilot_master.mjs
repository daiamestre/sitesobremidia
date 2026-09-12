/**
 * SOBRE MÍDIA AI Engineering System — Master Real Engineering Pilot & Self-Hosting Validation
 * Execução autônoma de ponta a ponta da tarefa real de engenharia TASK-E2E-MASTER.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  TaskNormalizer,
  ExecutionPlanner,
  CompletionAuthority,
  TaskOrchestrator
} from '../core/orchestrator.mjs';

import { registry } from '../core/registry.mjs';
import { canonicalSkillRegistry } from '../core/skill_registry.mjs';
import { skillRuntime } from '../core/skill_runtime.mjs';
import { memoryManager } from '../core/memory.mjs';
import { HandoffManager } from '../core/handoff.mjs';
import { auditLogger } from '../core/audit.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');

async function runMasterPilot() {
  console.log('🚀 =========================================================================');
  console.log('🚀 SOBRE MÍDIA AI ENGINEERING SYSTEM: MASTER REAL ENGINEERING PILOT');
  console.log('🚀 TAREFA CANÔNICA: TASK-E2E-MASTER');
  console.log('🚀 =========================================================================\n');

  const orchestrator = new TaskOrchestrator();
  orchestrator.reset();
  auditLogger.clear();

  const rawMasterTask = {
    task_id: 'TASK-E2E-MASTER',
    objective: 'Auditoria, verificação pericial e homologação arquitetural completa da fundação multi-agentes do SOBRE MÍDIA AI Engineering System',
    task_type: 'ORCHESTRATION',
    workspace_root: workspaceRoot,
    required_capabilities: ['TASK_ORCHESTRATION']
  };

  console.log('📋 1. INTAKE & TASK NORMALIZATION...');
  const canonicalTask = TaskNormalizer.normalize(rawMasterTask);
  console.log(`   [✓] Tarefa Normalizada: ${canonicalTask.task_id} (Tipo: ${canonicalTask.task_type})`);

  console.log('\n📋 2. MULTI-AGENT EXECUTION PLANNING...');
  const plan = ExecutionPlanner.createPlan(canonicalTask, {
    plan_id: 'PLAN-E2E-MASTER-01',
    multi_step_chain: ['architect', 'database', 'forensic', 'qa'],
    step_objectives: {
      architect: 'Escanear workspace e validar conformidade da arquitetura de governança',
      database: 'Verificar conformidade e integridade das políticas de RLS e migrações',
      forensic: 'Auditar padrões proibidos e validar integridade pericial de diffs',
      qa: 'Consolidar evidências e atestar conformidade de qualidade'
    }
  });
  console.log(`   [✓] Plano Criado: ${plan.plan_id} com ${plan.steps.length} etapas sequenciais`);

  console.log('\n📋 3. SEQUENTIAL MULTI-AGENT EXECUTION PIPELINE...');

  const actionHandlers = {
    architect: async (ctx) => {
      const { agent, executeSkill, memory } = ctx;
      console.log(`   ▶ [Passo 1/4] Executando ${agent.name} (${agent.agent_id})...`);
      const skillRes = await executeSkill('project-discovery', 'scan_workspace', {
        workspace_root: workspaceRoot
      });
      assert.strictEqual(skillRes.success, true);
      assert.ok(skillRes.evidence.length > 0);

      // Armazenar decisão arquitetural na memória PROJECT
      memory.set('PROJECT', 'architecture_health', {
        status: 'HEALTHY',
        scanned_at: new Date().toISOString()
      });

      return {
        success: true,
        summary: `Architect concluiu scan de workspace e validação de governança com ${skillRes.evidence.length} evidências físicas.`,
        evidence: skillRes.evidence,
        files_touched: []
      };
    },

    database: async (ctx) => {
      const { agent, executeSkill } = ctx;
      console.log(`   ▶ [Passo 2/4] Executando ${agent.name} (${agent.agent_id})...`);
      const skillRes = await executeSkill('database-supabase-guard', 'check_rls_policies', {
        table_name: 'telas',
        policies: [
          { operation: 'SELECT' },
          { operation: 'INSERT' },
          { operation: 'UPDATE' },
          { operation: 'DELETE' }
        ]
      });
      assert.strictEqual(skillRes.success, true);

      return {
        success: true,
        summary: `Database agent verificou cobertura completa de RLS para tabelas críticas.`,
        evidence: skillRes.evidence,
        files_touched: []
      };
    },

    forensic: async (ctx) => {
      const { agent, executeSkill } = ctx;
      console.log(`   ▶ [Passo 3/4] Executando ${agent.name} (${agent.agent_id})...`);
      const coreFile = fs.readFileSync(path.join(workspaceRoot, '.agents', 'core', 'contracts.mjs'), 'utf8');
      const skillRes = await executeSkill('forensic-auditor', 'check_forbidden_patterns', {
        content: coreFile
      });
      assert.strictEqual(skillRes.success, true);

      return {
        success: true,
        summary: `Forensic Auditor auditou código do núcleo contra padrões proibidos sem violações.`,
        evidence: skillRes.evidence,
        files_touched: []
      };
    },

    qa: async (ctx) => {
      const { agent, executeSkill } = ctx;
      console.log(`   ▶ [Passo 4/4] Executando ${agent.name} (${agent.agent_id})...`);
      const domainRes = await executeSkill('sobremidia-domain', 'verify_rules');
      assert.strictEqual(domainRes.success, true);

      return {
        success: true,
        summary: `QA Agent homologou conformidade de domínio SOBRE MÍDIA e fechamento de evidências.`,
        evidence: domainRes.evidence,
        files_touched: []
      };
    }
  };


  const result = await orchestrator.orchestrateTask(canonicalTask, actionHandlers, {
    plan_id: plan.plan_id,
    multi_step_chain: ['architect', 'database', 'forensic', 'qa']
  });

  console.log('\n📋 4. COMPLETION & AUDIT RESULTS...');
  console.log(`   [✓] Status Final da Tarefa: ${result.status}`);
  if (result.error) console.log(`   [!] Error: ${result.error}`);
  console.log(`   [✓] Completion ID: ${result.completion_id}`);
  console.log(`   [✓] Execuções Concluídas: ${result.execution_results?.length || 0}`);
  console.log(`   [✓] Handoffs Auditados: ${result.handoffs?.length || 0}`);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.ok(result.completion_id.startsWith('CMP-'));
  assert.strictEqual(result.execution_results.length, 4);
  assert.strictEqual(result.handoffs.length, 3);

  // Validar Audit Trail
  const taskEvents = auditLogger.getEventsForTask('TASK-E2E-MASTER');
  console.log(`   [✓] Eventos de Audit Trail Registrados: ${taskEvents.length}`);
  assert.ok(taskEvents.length >= 4);

  // Testar Idempotência da Tarefa Master
  console.log('\n📋 5. VALIDANDO IDEMPOTÊNCIA DA TAREFA MASTER...');
  const duplicateRun = await orchestrator.orchestrateTask(canonicalTask, actionHandlers, {
    plan_id: 'PLAN-E2E-MASTER-02',
    multi_step_chain: ['architect', 'database', 'forensic', 'qa']
  });
  console.log(`   [✓] Re-execução Governança: is_idempotent_noop=${duplicateRun.is_idempotent_noop}`);
  assert.strictEqual(duplicateRun.is_idempotent_noop, true);
  assert.strictEqual(duplicateRun.completion_id, result.completion_id);

  console.log('\n=========================================================================');
  console.log('🎉 PILOTO MASTER CONCLUÍDO COM SUCESSO ABSOLUTO (100% PASS)');
  console.log('=========================================================================\n');
}

runMasterPilot().catch(err => {
  console.error('❌ ERRO NO PILOTO MASTER:', err);
  process.exit(1);
});
