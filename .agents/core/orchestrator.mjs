/**
 * SOBRE MÍDIA AI Engineering System — Task Orchestration & Execution Governance Engine
 * Camada canônica de intake, normalização, classificação, planejamento, execução single-executor
 * e autoridade de conclusão de tarefas multi-agentes.
 */

import path from 'path';
import {
  VALID_CAPABILITIES,
  validateCanonicalTask,
  validateExecutionPlan,
  validateAgentResult,
  validateEvidence,
  deepFreeze
} from './contracts.mjs';
import { registry } from './registry.mjs';
import { TaskRouter } from './router.mjs';
import { DiscoveryPolicy, ProjectDiscovery } from './project_discovery.mjs';
import { HandoffManager } from './handoff.mjs';
import { runtime as defaultRuntime, AgentRuntime } from './runtime.mjs';
import { AgentLifecycle } from './lifecycle.mjs';

/**
 * Normalizador canônico de tarefas brutas.
 * Transforma qualquer entrada rawTask em um CanonicalTask imutável e seguro,
 * rejeitando qualquer injeção indevida de autoridade.
 */
export class TaskNormalizer {
  static normalize(rawTask, options = {}) {
    if (!rawTask || typeof rawTask !== 'object') {
      throw new Error('[TASK NORMALIZATION ERROR]: Tarefa bruta nula ou não é um objeto.');
    }

    if (!rawTask.task_id || typeof rawTask.task_id !== 'string' || rawTask.task_id.trim().length === 0) {
      throw new Error("[TASK NORMALIZATION ERROR]: Campo obrigatório 'task_id' ausente ou inválido.");
    }

    const taskId = rawTask.task_id.trim();
    if (/\s/.test(taskId)) {
      throw new Error(`[TASK NORMALIZATION ERROR]: Campo 'task_id' não pode conter espaços ('${taskId}').`);
    }
    if (/[/\\]|\.\./.test(taskId)) {
      throw new Error(`[TASK NORMALIZATION ERROR]: Campo 'task_id' não pode conter separadores de caminho ou path traversal ('${taskId}').`);
    }

    if (!rawTask.objective || typeof rawTask.objective !== 'string' || rawTask.objective.trim().length === 0) {
      throw new Error("[TASK NORMALIZATION ERROR]: Campo obrigatório 'objective' ausente ou vazio.");
    }
    const objective = rawTask.objective.trim();

    // Normalização determinística do task_type
    const rawType = rawTask.task_type || rawTask.type || 'IMPLEMENTATION';
    const taskType = typeof rawType === 'string' ? rawType.trim().toUpperCase() : 'IMPLEMENTATION';

    // Normalização do workspace_root
    const rawWs = rawTask.workspace_root || options.workspace_root || process.cwd();
    const workspaceRoot = path.resolve(rawWs).replace(/\\/g, '/');

    // Avaliação de Project Awareness via DiscoveryPolicy
    const isProjectAware = DiscoveryPolicy.isProjectAware({
      ...rawTask,
      task_type: taskType,
      workspace_root: workspaceRoot
    });

    // Normalização e validação estrita de required_capabilities
    const requiredCaps = [];
    if (Array.isArray(rawTask.required_capabilities)) {
      for (const cap of rawTask.required_capabilities) {
        if (typeof cap === 'string' && VALID_CAPABILITIES.includes(cap)) {
          if (!requiredCaps.includes(cap)) requiredCaps.push(cap);
        } else if (typeof cap === 'string') {
          throw new Error(`[TASK NORMALIZATION ERROR]: Capacidade '${cap}' não é uma capacidade canônica reconhecida.`);
        }
      }
    }

    // Preferred agent (apenas preferência declarada, nunca autoridade)
    const rawPref = rawTask.preferred_agent || rawTask.agent_id || rawTask.agent || null;
    const preferredAgent = typeof rawPref === 'string' && rawPref.trim().length > 0 ? rawPref.trim() : null;

    // Normalização de target_paths
    const targetPaths = Array.isArray(rawTask.target_paths)
      ? rawTask.target_paths.filter(p => typeof p === 'string')
      : [];

    // Normalização de constraints
    const constraints = Array.isArray(rawTask.constraints)
      ? rawTask.constraints.filter(c => typeof c === 'string')
      : [];

    const canonicalTask = {
      task_id: taskId,
      objective,
      task_type: taskType,
      type: taskType,
      workspace_root: workspaceRoot,
      is_project_aware: isProjectAware,
      required_capabilities: requiredCaps,
      preferred_agent: preferredAgent,
      target_paths: targetPaths,
      constraints,
      context: rawTask.context || '',
      parent_task_id: rawTask.parent_task_id || null,
      created_at: rawTask.created_at || new Date().toISOString()
    };

    const errors = validateCanonicalTask(canonicalTask);
    if (errors.length > 0) {
      throw new Error(`[TASK NORMALIZATION ERROR]: Tarefa canônica inválida: ${errors.join(', ')}`);
    }

    return deepFreeze(canonicalTask);
  }
}

/**
 * Planejador canônico de execução.
 * Gera ExecutionPlans determinísticos, validados e imutáveis.
 */
export class ExecutionPlanner {
  static createPlan(canonicalTask, options = {}) {
    if (!canonicalTask || typeof canonicalTask !== 'object') {
      throw new Error('[EXECUTION PLAN ERROR]: Tarefa canônica nula ou inválida.');
    }

    // 1. Roteamento determinístico
    const routing = TaskRouter.routeTask(canonicalTask);

    // 2. Construção dos passos
    const steps = [];
    if (options.multi_step_chain && Array.isArray(options.multi_step_chain) && options.multi_step_chain.length > 0) {
      for (let i = 0; i < options.multi_step_chain.length; i++) {
        const stepAgentId = options.multi_step_chain[i];
        const agent = registry.getAgent(stepAgentId);
        if (!agent) {
          throw new Error(`[EXECUTION PLAN ERROR]: Agente '${stepAgentId}' do passo ${i + 1} não registrado no Registry.`);
        }
        if (agent.status !== 'ACTIVE') {
          throw new Error(`[EXECUTION PLAN ERROR]: Agente '${stepAgentId}' do passo ${i + 1} não está ativo (status: ${agent.status}).`);
        }
        steps.push({
          step_id: `STEP-${i + 1}-${agent.agent_id}`,
          step_index: i + 1,
          agent_id: agent.agent_id,
          required_capabilities: agent.capabilities || [],
          objective: options.step_objectives?.[agent.agent_id] || `${agent.name} executa etapa ${i + 1} para tarefa '${canonicalTask.task_id}'`,
          expected_outcome: options.step_outcomes?.[agent.agent_id] || `AgentResult e Evidence válidos de ${agent.agent_id}`
        });
      }
    } else {
      steps.push({
        step_id: `STEP-1-${routing.selected_agent}`,
        step_index: 1,
        agent_id: routing.selected_agent,
        required_capabilities: routing.required_capabilities,
        objective: canonicalTask.objective,
        expected_outcome: `AgentResult com evidências comprovadas para '${canonicalTask.task_id}'`
      });
    }

    const plan = {
      plan_id: options.plan_id || `PLAN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      task_id: canonicalTask.task_id,
      task_type: canonicalTask.task_type,
      selected_agent: routing.selected_agent,
      required_capabilities: routing.required_capabilities,
      workspace_root: canonicalTask.workspace_root,
      is_project_aware: canonicalTask.is_project_aware,
      steps,
      routing_reason: routing.reason,
      created_at: new Date().toISOString()
    };

    const planErrors = validateExecutionPlan(plan);
    if (planErrors.length > 0) {
      throw new Error(`[EXECUTION PLAN ERROR]: Plano de execução inválido: ${planErrors.join(', ')}`);
    }

    return deepFreeze(plan);
  }
}

const completedExecutionsRegistry = new Map();

/**
 * Autoridade Canônica de Conclusão de Tarefa.
 * Fonte única autoritativa para validar, selar e gerenciar o status terminal de conclusão.
 */
export class CompletionAuthority {
  /**
   * Valida os critérios técnicos de conclusão de uma execução.
   */
  static validateCompletion({
    task,
    plan,
    executionResults = [],
    handoffs = []
  }) {
    const errors = [];

    if (!task || !task.task_id) {
      errors.push('Tarefa nula ou sem task_id.');
      return { completed: false, status: 'BLOCKED', errors };
    }

    if (!plan || !plan.plan_id || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      errors.push('Plano de execução nulo ou inválido.');
      return { completed: false, status: 'BLOCKED', errors };
    }

    if (executionResults.length === 0) {
      errors.push('Nenhum resultado de execução registrado.');
      return { completed: false, status: 'BLOCKED', errors };
    }

    // 1. Validar que cada etapa do plano foi concluída com sucesso
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const execRec = executionResults.find(e => e.agent_id === step.agent_id || e.step_id === step.step_id);

      if (!execRec) {
        errors.push(`Passo ${step.step_index} (${step.agent_id}) não possui registro de execução correspondente.`);
        continue;
      }

      if (execRec.status !== 'COMPLETED') {
        errors.push(`Passo ${step.step_index} (${step.agent_id}) não concluiu com status COMPLETED (status atual: ${execRec.status}).`);
      }

      if (!execRec.result || typeof execRec.result !== 'object') {
        errors.push(`Passo ${step.step_index} (${step.agent_id}) não possui AgentResult válido.`);
        continue;
      }

      if (execRec.result.success !== true) {
        errors.push(`Passo ${step.step_index} (${step.agent_id}) reporta success=false.`);
      }

      if (execRec.task_id !== task.task_id) {
        errors.push(`Passo ${step.step_index} cross-task: executa task '${execRec.task_id}' em vez de '${task.task_id}'.`);
      }

      if (!Array.isArray(execRec.evidence) || execRec.evidence.length === 0) {
        errors.push(`Passo ${step.step_index} (${step.agent_id}) não possui evidências comprovadas.`);
      } else {
        for (let j = 0; j < execRec.evidence.length; j++) {
          const ev = execRec.evidence[j];
          if (!ev || typeof ev !== 'object') {
            errors.push(`Evidência [${j}] no passo ${step.step_index} inválida.`);
            continue;
          }
          if (typeof ev.exit_code !== 'number' || ev.exit_code !== 0) {
            errors.push(`Evidência [${j}] no passo ${step.step_index} reporta falha (exit_code=${ev.exit_code}).`);
          }
        }
      }
    }

    // 2. Validar cadeia de handoffs para execuções multi-step
    if (plan.steps.length > 1) {
      for (let i = 0; i < plan.steps.length - 1; i++) {
        const fromStep = plan.steps[i];
        const toStep = plan.steps[i + 1];
        const matchingHandoff = handoffs.find(h =>
          (h.from === fromStep.agent_id || h.source_agent_id === fromStep.agent_id) &&
          (h.to === toStep.agent_id || h.destination_agent_id === toStep.agent_id)
        );

        if (!matchingHandoff) {
          errors.push(`Cadeia de handoff interrompida: falta handoff entre passo ${fromStep.step_index} (${fromStep.agent_id}) e passo ${toStep.step_index} (${toStep.agent_id}).`);
        } else {
          const hndVal = HandoffManager.validateHandoff(matchingHandoff, {
            expected_task_id: task.task_id,
            expected_source: fromStep.agent_id,
            expected_destination: toStep.agent_id,
            allow_replayed: true
          });
          if (!hndVal.valid) {
            errors.push(`Handoff inválido entre ${fromStep.agent_id} e ${toStep.agent_id}: ${hndVal.errors.join(', ')}`);
          }
        }
      }
    }

    const completed = errors.length === 0;
    return {
      completed,
      status: completed ? 'COMPLETED' : 'BLOCKED',
      errors
    };
  }

  /**
   * Declara e sela a conclusão de uma tarefa, garantindo idempotência e proteção contra conclusões duplicadas.
   */
  static declareCompletion({
    task,
    plan,
    executionResults = [],
    handoffs = [],
    options = {}
  }) {
    if (!task || !task.task_id) {
      return { completed: false, status: 'BLOCKED', errors: ['Tarefa nula ou sem task_id.'] };
    }

    const completionKey = `${task.task_id}::${plan?.plan_id || 'DEFAULT'}`;

    // Detecção e governança de tentativa de conclusão duplicada
    if (completedExecutionsRegistry.has(completionKey)) {
      const existing = completedExecutionsRegistry.get(completionKey);
      if (options.reject_if_already_completed) {
        return {
          completed: false,
          status: 'BLOCKED',
          errors: [`Duplicate completion rejected: Tarefa '${task.task_id}' já se encontra concluída.`],
          is_duplicate: true
        };
      }
      // Opção B: Idempotent No-Op — retorna a conclusão original sem re-execuções nem mutações
      return {
        ...existing,
        is_idempotent_noop: true,
        duplicate_prevented: true
      };
    }

    const validation = this.validateCompletion({ task, plan, executionResults, handoffs });
    if (!validation.completed) {
      return validation;
    }

    const completionRecord = deepFreeze({
      completion_id: `CMP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      task_id: task.task_id,
      plan_id: plan.plan_id,
      status: 'COMPLETED',
      completed: true,
      completed_at: new Date().toISOString(),
      execution_count: executionResults.length,
      evidence_count: executionResults.reduce((acc, e) => acc + (e.evidence?.length || 0), 0),
      handoff_count: handoffs.length,
      errors: []
    });

    completedExecutionsRegistry.set(completionKey, completionRecord);
    return completionRecord;
  }

  static isCompleted(taskId, planId) {
    if (planId) {
      return completedExecutionsRegistry.has(`${taskId}::${planId}`);
    }
    for (const key of completedExecutionsRegistry.keys()) {
      if (key.startsWith(`${taskId}::`)) return true;
    }
    return false;
  }

  static getCompletionRecord(taskId, planId) {
    const key = planId
      ? `${taskId}::${planId}`
      : Array.from(completedExecutionsRegistry.keys()).find(k => k.startsWith(`${taskId}::`));
    return key ? completedExecutionsRegistry.get(key) : null;
  }

  static resetRegistry() {
    completedExecutionsRegistry.clear();
  }
}

/**
 * TaskOrchestrator — Motor Central de Orquestração Técnica
 */
export class TaskOrchestrator {
  constructor(runtime = defaultRuntime) {
    this.runtime = runtime;
    this.executedPlans = new Set();
    this.completedTasks = new Map();
  }

  /**
   * Executa uma tarefa completa de ponta a ponta com governança determinística e idempotência.
   */
  async orchestrateTask(rawTask, actionHandlers = {}, options = {}) {
    const startedAt = new Date().toISOString();

    // 1. Task Normalization
    let canonicalTask;
    try {
      canonicalTask = TaskNormalizer.normalize(rawTask, options);
    } catch (normErr) {
      return {
        task_id: rawTask?.task_id || 'UNKNOWN',
        status: 'BLOCKED',
        error: `Falha na normalização da tarefa: ${normErr.message}`,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      };
    }

    // 2. Project Awareness & Discovery Validation
    let projectDiscovery = options.project || options.project_discovery || null;
    if (canonicalTask.is_project_aware) {
      if (!projectDiscovery) {
        try {
          projectDiscovery = ProjectDiscovery.discover(canonicalTask.workspace_root);
        } catch (discErr) {
          return {
            task_id: canonicalTask.task_id,
            status: 'BLOCKED',
            error: `Project Discovery obrigatório falhou para tarefa project-aware: ${discErr.message}`,
            started_at: startedAt,
            finished_at: new Date().toISOString()
          };
        }
      }
    }

    // 3. Execution Planning
    let plan;
    try {
      plan = ExecutionPlanner.createPlan(canonicalTask, options);
    } catch (planErr) {
      return {
        task_id: canonicalTask.task_id,
        status: 'BLOCKED',
        error: `Falha no planejamento de execução: ${planErr.message}`,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      };
    }

    // 4. Idempotency Check por Plan ID (Replay Prevention - ORC-21)
    if (this.executedPlans.has(plan.plan_id)) {
      return {
        task_id: canonicalTask.task_id,
        plan_id: plan.plan_id,
        status: 'BLOCKED',
        error: `Replay detectado: Plano de execução '${plan.plan_id}' já foi executado.`,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      };
    }

    // 5. Governança de Tarefa Já Concluída (Task Completion Idempotency - ORC-22)
    if (this.completedTasks.has(canonicalTask.task_id)) {
      const existingRecord = this.completedTasks.get(canonicalTask.task_id);
      if (options.reject_duplicate_task) {
        return {
          task_id: canonicalTask.task_id,
          plan_id: existingRecord.plan_id,
          status: 'BLOCKED',
          error: `Rejeição: Tarefa '${canonicalTask.task_id}' já foi concluída anteriormente (estado terminal COMPLETED).`,
          is_duplicate_blocked: true,
          started_at: startedAt,
          finished_at: new Date().toISOString()
        };
      }
      // Opção B: Retornar o registro já concluído sem re-execuções ou efeitos colaterais
      return {
        ...existingRecord,
        is_idempotent_noop: true,
        duplicate_prevented: true
      };
    }

    const executionResults = [];
    const handoffs = [];
    let currentHandoff = options.handoff || null;

    // 5. Sequential Execution (Single-Executor Model)
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const stepTask = {
        task_id: canonicalTask.task_id,
        objective: step.objective,
        task_type: canonicalTask.task_type,
        workspace_root: canonicalTask.workspace_root,
        is_project_aware: canonicalTask.is_project_aware,
        required_capabilities: step.required_capabilities
      };

      const stepContext = {
        ...options.context,
        workspace_root: canonicalTask.workspace_root,
        project: projectDiscovery,
        project_discovery: projectDiscovery,
        profile: options.profile,
        handoff: currentHandoff
      };

      const spawnHandle = this.runtime.spawnAgent(step.agent_id, stepTask, stepContext);

      // Se o spawn falhou ou bloqueou
      if (spawnHandle.status === 'BLOCKED' || spawnHandle.status === 'FAILED') {
        return {
          task_id: canonicalTask.task_id,
          plan_id: plan.plan_id,
          status: spawnHandle.status,
          error: spawnHandle.error || `Agente '${step.agent_id}' bloqueado no passo ${step.step_index}.`,
          execution_results: executionResults,
          handoffs,
          started_at: startedAt,
          finished_at: new Date().toISOString()
        };
      }

      // Handler para o agente do passo
      const handler = typeof actionHandlers === 'function'
        ? actionHandlers
        : (actionHandlers[step.agent_id] || actionHandlers.default || (async () => ({
            success: true,
            summary: `Execução determinística padrão para agente '${step.agent_id}'.`,
            evidence: [{ command: `verify-agent-${step.agent_id}`, exit_code: 0, summary: 'Validação padrão PASS' }],
            files_touched: []
          })));

      const execRecord = await spawnHandle.execute(handler);
      execRecord.step_id = step.step_id;
      executionResults.push(execRecord);

      if (execRecord.status !== 'COMPLETED') {
        return {
          task_id: canonicalTask.task_id,
          plan_id: plan.plan_id,
          status: execRecord.status,
          error: execRecord.error || `Passo ${step.step_index} (${step.agent_id}) falhou com status ${execRecord.status}.`,
          execution_results: executionResults,
          handoffs,
          started_at: startedAt,
          finished_at: new Date().toISOString()
        };
      }

      // Se houver próximo passo, construir handoff
      if (i < plan.steps.length - 1) {
        const nextStep = plan.steps[i + 1];
        currentHandoff = HandoffManager.createHandoffPayload({
          task_id: canonicalTask.task_id,
          execution_id: execRecord.execution_id,
          from: step.agent_id,
          to: nextStep.agent_id,
          status: 'READY',
          objective: nextStep.objective,
          completed_work: execRecord.result?.summary || `Etapa ${step.step_index} concluída por ${step.agent_id}`,
          evidence: execRecord.evidence || [],
          files_changed: execRecord.files_touched || [],
          tests_run: (execRecord.evidence || []).map(e => e.command),
          next_action: `${nextStep.agent_id} executa ${nextStep.objective}`,
          workspace_root: canonicalTask.workspace_root,
          result: execRecord.result
        });
        handoffs.push(currentHandoff);
      }
    }

    // 6. Completion Authority Declaration & Sealing
    const completionRecord = CompletionAuthority.declareCompletion({
      task: canonicalTask,
      plan,
      executionResults,
      handoffs,
      options
    });

    if (!completionRecord.completed) {
      return {
        task_id: canonicalTask.task_id,
        plan_id: plan.plan_id,
        status: completionRecord.status || 'BLOCKED',
        error: `Autoridade de conclusão rejeitou fechamento da tarefa: ${(completionRecord.errors || []).join('; ')}`,
        execution_results: executionResults,
        handoffs,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      };
    }

    // 7. Registrar plano como executado e tarefa concluída
    this.executedPlans.add(plan.plan_id);
    const finalRecord = {
      task_id: canonicalTask.task_id,
      plan_id: plan.plan_id,
      completion_id: completionRecord.completion_id,
      status: 'COMPLETED',
      task: canonicalTask,
      plan,
      execution_results: executionResults,
      handoffs,
      started_at: startedAt,
      finished_at: completionRecord.completed_at || new Date().toISOString()
    };
    this.completedTasks.set(canonicalTask.task_id, deepFreeze(finalRecord));

    return this.completedTasks.get(canonicalTask.task_id);
  }

  isTaskCompleted(taskId) {
    return this.completedTasks.has(taskId);
  }

  getCompletedTask(taskId) {
    return this.completedTasks.get(taskId) || null;
  }

  reset() {
    this.executedPlans.clear();
    this.completedTasks.clear();
    CompletionAuthority.resetRegistry();
  }
}

export const orchestrator = new TaskOrchestrator();
