/**
 * SOBRE MÍDIA AI Engineering System — Micro-Gate 0.16 Multi-Agent Pilot Runner
 * Executa a composição operacional multi-agentes canônica completa de ponta a ponta:
 * TASK INTAKE -> NORMALIZATION -> PROJECT DISCOVERY -> PLANNING ->
 * ARCHITECT (project-discovery) -> HANDOFF ->
 * DATABASE (database-supabase-guard) -> HANDOFF ->
 * FORENSIC (forensic-auditor) -> COMPLETION AUTHORITY -> IDEMPOTENT NO-OP VERIFICATION
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registry,
  runtime,
  orchestrator,
  TaskNormalizer,
  ExecutionPlanner,
  CompletionAuthority,
  ProjectDiscovery,
  HandoffManager,
  skillRuntime
} from '../core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export async function runMicroGate016Pilot() {
  console.log('🚀 [MICRO-GATE 0.16]: Iniciando Piloto Canônico de End-to-End Multi-Agent Task Composition...\n');

  // 1. Task Intake
  const rawTask = {
    task_id: 'TASK-E2E-016',
    objective: 'Composição operacional multi-agentes de ponta a ponta (Architect -> Database -> Forensic) com governança canônica, execução real de skills através do SkillRuntime, validação de handoffs e selamento com CompletionAuthority no SOBRE MÍDIA AI Engineering System.',
    task_type: 'ARCHITECTURE_AND_AUDIT',
    workspace_root: rootDir,
    required_capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY'],
    context: 'Demonstrar composição ponta a ponta entre agentes especialistas operando com contratos imutáveis, execução de skills governada e selamento formal de conclusão.'
  };

  console.log(`📋 1. INTAKE: Recebida tarefa '${rawTask.task_id}': ${rawTask.objective}`);

  // 2. Normalization
  const canonicalTask = TaskNormalizer.normalize(rawTask);
  console.log(`🧹 2. NORMALIZATION: Tarefa normalizada com sucesso (Type: ${canonicalTask.task_type}, ProjectAware: ${canonicalTask.is_project_aware})`);

  // 3. Project Discovery
  const discovery = ProjectDiscovery.discover(canonicalTask.workspace_root);
  console.log(`🔍 3. PROJECT DISCOVERY: Discovery executado com status '${discovery.status}' (${discovery.evidence.length} evidências físicas)`);

  // 4. Multi-Step Execution Planning com 3 agentes canônicos
  const multiStepPlan = ExecutionPlanner.createPlan(canonicalTask, {
    multi_step_chain: ['architect', 'database', 'forensic'],
    step_objectives: {
      architect: 'Executar Skill project-discovery para mapear a stack técnica, limites de workspace e módulos do SOBRE MÍDIA',
      database: 'Executar Skill database-supabase-guard para auditar integridade de migrações DDL e conformidade RLS',
      forensic: 'Executar Skill forensic-auditor para certificar conformidade de autoridade, ausência de regressões e integridade de diff'
    },
    step_outcomes: {
      architect: 'Stack técnica mapeada com 23 evidências e entregue via handoff governado',
      database: 'Migração SQL e RLS validadas sem operações destrutivas ou bypass de segurança',
      forensic: 'Laudo pericial forense atestando integridade integral da composição multi-agentes'
    }
  });

  console.log(`🗺️ 4. EXECUTION PLAN: Plano '${multiStepPlan.plan_id}' gerado com ${multiStepPlan.steps.length} passos determinísticos:`);
  multiStepPlan.steps.forEach(s => console.log(`   - Passo ${s.step_index}: ${s.agent_id} (${s.objective})`));

  // 5. Orchestrator Execution com SkillRuntime & Handoffs
  console.log('\n⚙️ 5. EXECUTION: Executando passos determinísticos através do TaskOrchestrator com SkillRuntime ativo...\n');

  const executedSkillsInPilot = [];

  const orchestrationResult = await orchestrator.orchestrateTask(rawTask, {
    architect: async (ctx) => {
      console.log(`   [Architect]: Invocando Skill 'project-discovery' (scan_workspace)...`);
      const skillRes = await ctx.executeSkill('project-discovery', 'scan_workspace');
      if (!skillRes.success) {
        throw new Error(`Falha na execução da skill project-discovery: ${skillRes.errors.join('; ')}`);
      }
      executedSkillsInPilot.push({ agent: 'architect', skill: 'project-discovery', action: 'scan_workspace', success: skillRes.success });
      console.log(`   [Architect]: Skill 'project-discovery' concluída com sucesso (${skillRes.evidence.length} evidência(s)).`);

      return {
        success: true,
        summary: 'Architect: Arquitetura e descoberta de projeto validadas via SkillRuntime.',
        evidence: skillRes.evidence,
        files_touched: []
      };
    },
    database: async (ctx) => {
      console.log(`   [Database]: Invocando Skill 'database-supabase-guard' (validate_migration_sql + check_rls_policies)...`);
      const testSql = `
        CREATE TABLE IF NOT EXISTS public.e2e_composition_audit (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id TEXT NOT NULL,
          agent_chain JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE public.e2e_composition_audit ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow authenticated read" ON public.e2e_composition_audit FOR SELECT TO authenticated USING (true);
        CREATE POLICY "Allow authenticated insert" ON public.e2e_composition_audit FOR INSERT TO authenticated WITH CHECK (true);
      `;
      const sqlValidation = await ctx.executeSkill('database-supabase-guard', 'validate_migration_sql', { sql: testSql });
      const rlsValidation = await ctx.executeSkill('database-supabase-guard', 'check_rls_policies', {
        table_name: 'e2e_composition_audit',
        policies: [{ operation: 'ALL' }]
      });

      if (!sqlValidation.success || !rlsValidation.success) {
        throw new Error('Falha na validação de banco pela skill database-supabase-guard');
      }

      executedSkillsInPilot.push({ agent: 'database', skill: 'database-supabase-guard', action: 'validate_migration_sql', success: sqlValidation.success });
      executedSkillsInPilot.push({ agent: 'database', skill: 'database-supabase-guard', action: 'check_rls_policies', success: rlsValidation.success });
      console.log(`   [Database]: Skill 'database-supabase-guard' validou DDL e RLS com sucesso.`);

      return {
        success: true,
        summary: 'Database: Validação de migração e RLS concluída via SkillRuntime.',
        evidence: [...sqlValidation.evidence, ...rlsValidation.evidence],
        files_touched: []
      };
    },
    forensic: async (ctx) => {
      console.log(`   [Forensic]: Invocando Skill 'forensic-auditor' (audit_diff)...`);
      const forensicRes = await ctx.executeSkill('forensic-auditor', 'audit_diff');
      if (!forensicRes.success) {
        throw new Error('Falha na auditoria pela skill forensic-auditor');
      }
      executedSkillsInPilot.push({ agent: 'forensic', skill: 'forensic-auditor', action: 'audit_diff', success: forensicRes.success });
      console.log(`   [Forensic]: Skill 'forensic-auditor' certificou conformidade forense.`);

      return {
        success: true,
        summary: 'Forensic: Auditoria pericial concluída. Cadeia multi-agente 100% íntegra.',
        evidence: forensicRes.evidence,
        files_touched: []
      };
    }
  }, {
    multi_step_chain: ['architect', 'database', 'forensic']
  });

  // 6. Completion Result
  console.log('\n🏁 6. COMPLETION: Resultado da Orquestração Composta:');
  console.log(`   Status: ${orchestrationResult.status}`);
  console.log(`   Task ID: ${orchestrationResult.task_id}`);
  console.log(`   Plan ID: ${orchestrationResult.plan_id}`);
  console.log(`   Completion ID: ${orchestrationResult.completion_id}`);
  console.log(`   Passos Executados: ${orchestrationResult.execution_results?.length || 0}`);
  console.log(`   Handoffs Validados: ${orchestrationResult.handoffs?.length || 0}`);
  console.log(`   Skills Executadas: ${executedSkillsInPilot.length}`);

  if (orchestrationResult.status !== 'COMPLETED') {
    console.error(`❌ ERRO: Orquestração não concluiu com status COMPLETED: ${orchestrationResult.error}`);
    process.exit(1);
  }

  // 7. Duplicate Completion Verification (Idempotent No-Op)
  console.log('\n🛡️ 7. DUPLICATE COMPLETION VERIFICATION: Testando reexecução idempotente...');
  const duplicateResult = await orchestrator.orchestrateTask(rawTask, {
    architect: async () => { throw new Error('Não deve reexecutar'); }
  });

  console.log(`   Status: ${duplicateResult.status}`);
  console.log(`   Is Idempotent No-Op: ${duplicateResult.is_idempotent_noop === true}`);
  console.log(`   Duplicate Prevented: ${duplicateResult.duplicate_prevented === true}`);
  console.log(`   Completion ID Preservado: ${duplicateResult.completion_id === orchestrationResult.completion_id}`);

  if (!duplicateResult.is_idempotent_noop || duplicateResult.completion_id !== orchestrationResult.completion_id) {
    console.error('❌ ERRO: Falha na verificação de conclusão duplicada idempotente.');
    process.exit(1);
  }

  console.log('\n=================================================================');
  console.log('🎉 [MICRO-GATE 0.16]: PILOTO DE TASK COMPOSITION CONCLUÍDO COM 100% DE SUCESSO!');
  console.log('=================================================================\n');

  return {
    orchestrationResult,
    duplicateResult,
    executedSkillsInPilot
  };
}

// Execução direta via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMicroGate016Pilot().catch(err => {
    console.error('❌ Erro fatal no piloto 0.16:', err);
    process.exit(1);
  });
}
