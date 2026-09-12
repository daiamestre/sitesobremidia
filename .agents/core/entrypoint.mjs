/**
 * SOBRE MÍDIA AI Engineering System — Autonomous Operational Entrypoint
 * Ponto de entrada operacional único para execução autônoma de tarefas em linguagem natural.
 * 
 * USUÁRIO
 *    ↓
 * TAREFA EM LINGUAGEM NATURAL (string ou objeto)
 *    ↓
 * ENTRYPOINT OPERACIONAL (executeAutonomousTask)
 *    ↓
 * TASK NORMALIZER
 *    ↓
 * TASK ROUTER
 *    ↓
 * EXECUTION PLANNER
 *    ↓
 * AGENT REGISTRY
 *    ↓
 * AGENT RUNTIME
 *    ↓
 * SKILL RUNTIME
 *    ↓
 * TOOLS / ACTIONS (PreToolGuard & PermissionEngine)
 *    ↓
 * HANDOFFS
 *    ↓
 * QA / FORENSIC VERIFICATION
 *    ↓
 * COMPLETION AUTHORITY
 *    ↓
 * RESULTADO FINAL SELADO
 */

import { TaskNormalizer, ExecutionPlanner, TaskOrchestrator, orchestrator as defaultOrchestrator } from './orchestrator.mjs';
import { registry } from './registry.mjs';
import { canonicalSkillRegistry } from './skill_registry.mjs';
import { auditLogger } from './audit.mjs';
import { deepFreeze } from './contracts.mjs';

/**
 * Executa uma tarefa completa de engenharia a partir de linguagem natural pura.
 * 
 * @param {string|object} taskInput - Tarefa em linguagem natural (string) ou objeto de tarefa.
 * @param {object} [options={}] - Opções operacionais opcionais.
 * @returns {Promise<object>} Resultado final da execução autônoma selada com cadeia de evidências.
 */
export async function executeAutonomousTask(taskInput, options = {}) {
  const orchestratorInstance = options.orchestrator || defaultOrchestrator;

  // 1. Normalizar tarefa bruta (suporta string direta e objeto)
  const canonicalTask = TaskNormalizer.normalize(taskInput, options);

  // 2. Executar orquestração ponta a ponta
  const rawResult = await orchestratorInstance.orchestrateTask(canonicalTask, options.actionHandlers || {}, options);

  // 3. Estruturar relatório e métricas para consumo do usuário
  const stepsExecuted = (rawResult.execution_results || []).map(r => ({
    step_id: r.step_id,
    agent_id: r.agent_id,
    status: r.status,
    summary: r.result?.summary || r.error || `Execução de ${r.agent_id}`,
    evidence_count: r.evidence?.length || 0,
    duration_ms: r.duration_ms || 0
  }));

  const allEvidence = (rawResult.execution_results || []).flatMap(r => r.evidence || []);
  const allFilesTouched = (rawResult.execution_results || []).flatMap(r => r.files_touched || []);
  const allHandoffs = rawResult.handoffs || [];

  const taskAuditEvents = auditLogger.getEventsForTask(canonicalTask.task_id);

  const autonomousResult = {
    success: rawResult.status === 'COMPLETED',
    task_id: canonicalTask.task_id,
    objective: canonicalTask.objective,
    task_type: canonicalTask.task_type,
    status: rawResult.status,
    completion_id: rawResult.completion_id || null,
    plan_id: rawResult.plan_id || null,
    is_idempotent_noop: rawResult.is_idempotent_noop === true,
    steps_executed: stepsExecuted,
    evidence: allEvidence,
    handoffs: allHandoffs,
    files_touched: allFilesTouched,
    audit_events_count: taskAuditEvents.length,
    started_at: rawResult.started_at,
    finished_at: rawResult.finished_at,
    error: rawResult.error || null,
    summary: rawResult.status === 'COMPLETED'
      ? `Tarefa '${canonicalTask.task_id}' concluída com sucesso. ${stepsExecuted.length} etapa(s) executada(s) por [${stepsExecuted.map(s => s.agent_id).join(' -> ')}] com ${allEvidence.length} evidência(s) verificada(s).`
      : `Execução da tarefa '${canonicalTask.task_id}' finalizou com status ${rawResult.status}: ${rawResult.error || 'Falha não especificada'}.`
  };

  return deepFreeze(autonomousResult);
}
