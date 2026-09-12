/**
 * SOBRE MÍDIA AI Engineering System — Single-Executor Multi-Agent Runtime
 * Motor de execução e orquestração determinística de agentes especializados.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registry } from './registry.mjs';
import { AgentLifecycle } from './lifecycle.mjs';
import { SkillLoader } from './skill_loader.mjs';
import { PermissionEngine } from './permissions.mjs';
import { memoryManager } from './memory.mjs';
import { HandoffManager } from './handoff.mjs';
import { validateAgentTask, validateDiscoveryResult } from './contracts.mjs';
import { ProjectDiscovery, DiscoveryPolicy } from './project_discovery.mjs';
import { defaultExecutionAdapter, SingleExecutorAdapter } from './executor.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const executionsDir = path.resolve(__dirname, '..', 'memory', 'executions');

export class AgentRuntime {
  constructor(executionAdapter = defaultExecutionAdapter) {
    this.executionAdapter = executionAdapter;
    this.activeExecutions = new Map();
    if (!fs.existsSync(executionsDir)) {
      fs.mkdirSync(executionsDir, { recursive: true });
    }
  }

  spawnAgent(agentId, task, context = {}) {
    const executionId = `EXEC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const lifecycle = new AgentLifecycle('CREATED', executionId);

    // 1. Validar Agente no Registry
    const agent = registry.getAgent(agentId);
    if (!agent) {
      lifecycle.transitionTo('BLOCKED', `Agente '${agentId}' não encontrado no Registry.`);
      return this._recordExecution({
        execution_id: executionId,
        agent_id: agentId,
        task_id: task?.task_id || 'UNKNOWN',
        status: lifecycle.getState(),
        executor_type: this.executionAdapter.executor_type,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error: `Agente '${agentId}' não registrado.`
      });
    }

    // 2. Validar Tarefa
    const taskErrors = validateAgentTask(task);
    if (taskErrors.length > 0) {
      lifecycle.transitionTo('BLOCKED', `Tarefa inválida: ${taskErrors.join(', ')}`);
      return this._recordExecution({
        execution_id: executionId,
        agent_id: agent.agent_id,
        task_id: task?.task_id || 'UNKNOWN',
        status: lifecycle.getState(),
        executor_type: this.executionAdapter.executor_type,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error: `Tarefa rejeitada: ${taskErrors.join(', ')}`
      });
    }

    // 3. Avaliar Discovery Policy e Obter/Validar DiscoveryResult
    let projectDiscovery = null;
    const isProjectAware = DiscoveryPolicy.isProjectAware(task);
    if (isProjectAware) {
      const targetWorkspace = task.workspace_root || context.workspace_root || process.cwd();
      const existingDiscovery = context.project || context.project_discovery;

      if (existingDiscovery) {
        // Validar contrato do DiscoveryResult pré-existente
        const discoveryErrors = validateDiscoveryResult(existingDiscovery);
        if (discoveryErrors.length > 0) {
          lifecycle.transitionTo('BLOCKED', `DiscoveryResult fornecido no context é inválido: ${discoveryErrors.join(', ')}`);
          return this._recordExecution({
            execution_id: executionId,
            agent_id: agent.agent_id,
            task_id: task.task_id,
            status: lifecycle.getState(),
            executor_type: this.executionAdapter.executor_type,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            error: `DiscoveryResult inválido rejeitado: ${discoveryErrors.join(', ')}`
          });
        }

        // Security Boundary: Validar matching do workspace root
        const normTarget = path.resolve(targetWorkspace).replace(/\\/g, '/').toLowerCase();
        const discRootVal = typeof existingDiscovery.root === 'object'
          ? (existingDiscovery.root.workspace_root || existingDiscovery.root.project_root || '')
          : String(existingDiscovery.root || '');
        const normDiscoveryRoot = path.resolve(discRootVal).replace(/\\/g, '/').toLowerCase();

        if (normTarget !== normDiscoveryRoot) {
          const mismatchErr = `Workspace mismatch: Tarefa requer '${normTarget}', mas DiscoveryResult pertence a '${normDiscoveryRoot}'.`;
          lifecycle.transitionTo('BLOCKED', mismatchErr);
          return this._recordExecution({
            execution_id: executionId,
            agent_id: agent.agent_id,
            task_id: task.task_id,
            status: lifecycle.getState(),
            executor_type: this.executionAdapter.executor_type,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            error: mismatchErr
          });
        }

        projectDiscovery = existingDiscovery;
      } else {
        // Executar discovery físico via canonical ProjectDiscovery engine
        try {
          projectDiscovery = ProjectDiscovery.discover(targetWorkspace);
        } catch (discErr) {
          lifecycle.transitionTo('BLOCKED', `Falha ao executar Project Discovery: ${discErr.message}`);
          return this._recordExecution({
            execution_id: executionId,
            agent_id: agent.agent_id,
            task_id: task.task_id,
            status: lifecycle.getState(),
            executor_type: this.executionAdapter.executor_type,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            error: `Project Discovery falhou: ${discErr.message}`
          });
        }
      }
    } else {
      // Tarefa NÃO project-aware: pode herdar context.project se fornecido ou permanecer null
      projectDiscovery = context.project || context.project_discovery || null;
    }

    // 4. Vincular e Carregar Skills (Canonical Skill Loader)
    let loadedSkills = [];
    try {
      loadedSkills = SkillLoader.loadSkillsForAgent(agent);
    } catch (skillErr) {
      lifecycle.transitionTo('BLOCKED', skillErr.message);
      return this._recordExecution({
        execution_id: executionId,
        agent_id: agent.agent_id,
        task_id: task.task_id,
        status: lifecycle.getState(),
        executor_type: this.executionAdapter.executor_type,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error: skillErr.message
      });
    }

    // 5. Inicializar Contexto de Memória
    memoryManager.set('TASK', `current_task:${task.task_id}`, task, agent.agent_id);
    if (projectDiscovery) {
      memoryManager.set('PROJECT', 'discovery_result', projectDiscovery, agent.agent_id);
    }
    if (context.handoff) {
      // Validar handoff de entrada se fornecido
      const handoffValidation = HandoffManager.validateHandoff(context.handoff);
      if (!handoffValidation.valid) {
        lifecycle.transitionTo('BLOCKED', `Handoff de entrada rejeitado: ${handoffValidation.errors.join(', ')}`);
        return this._recordExecution({
          execution_id: executionId,
          agent_id: agent.agent_id,
          task_id: task.task_id,
          status: lifecycle.getState(),
          executor_type: this.executionAdapter.executor_type,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          error: `Handoff inválido bloqueou execução do agente '${agent.agent_id}'.`
        });
      }
      memoryManager.set('AGENT', `received_handoff:${context.handoff.handoff_id}`, context.handoff, agent.agent_id);
    }

    lifecycle.transitionTo('READY', 'Skills vinculadas, discovery validado e contexto de memória isolado carregado.');

    return {
      execution_id: executionId,
      agent,
      task,
      lifecycle,
      loadedSkills,
      projectDiscovery,
      context,
      execute: async (actionHandler) => {
        lifecycle.transitionTo('RUNNING', 'Execução iniciada pelo executor.');
        const startedAt = new Date().toISOString();

        try {
          const executionContext = {
            execution_id: executionId,
            agent,
            task,
            skills: loadedSkills,
            getSkill: (skillId) => loadedSkills.find(s => s.skill_id === skillId) || null,
            memory: {
              get: (scope, key) => memoryManager.get(scope, key, agent.agent_id),
              set: (scope, key, val) => memoryManager.set(scope, key, val, agent.agent_id)
            },
            checkPermission: (tool, path, op) => {
              if (tool && !PermissionEngine.checkToolPermission(agent, tool).allowed) return false;
              if (path && !PermissionEngine.checkPathPermission(agent, path).allowed) return false;
              if (op && !PermissionEngine.checkOperationPermission(agent, op).allowed) return false;
              return true;
            }
          };

          // Injetar propriedades imutáveis de discovery no executionContext
          Object.defineProperty(executionContext, 'project', {
            value: projectDiscovery,
            writable: false,
            configurable: false,
            enumerable: true
          });
          Object.defineProperty(executionContext, 'project_discovery', {
            value: projectDiscovery,
            writable: false,
            configurable: false,
            enumerable: true
          });

          // Executar através do ExecutionAdapter
          const execResponse = await this.executionAdapter.execute({
            agent,
            task,
            executionContext,
            actionHandler
          });

          const result = execResponse.result;

          lifecycle.transitionTo('COMPLETED', 'Execução concluída com sucesso e resultado validado.');
          return this._recordExecution({
            execution_id: executionId,
            agent_id: agent.agent_id,
            task_id: task.task_id,
            status: lifecycle.getState(),
            executor_type: execResponse.executor_type || this.executionAdapter.executor_type,
            adapter_id: execResponse.adapter_id || this.executionAdapter.adapter_id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            skills: loadedSkills.map(s => s.skill_id),
            tools: agent.tools,
            result,
            evidence: result.evidence || [],
            files_touched: result.files_touched || []
          });
        } catch (err) {
          lifecycle.transitionTo('FAILED', `Exceção durante a execução: ${err.message}`);
          return this._recordExecution({
            execution_id: executionId,
            agent_id: agent.agent_id,
            task_id: task.task_id,
            status: lifecycle.getState(),
            executor_type: this.executionAdapter.executor_type,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            error: err.message
          });
        }
      }
    };
  }

  _recordExecution(record) {
    if (record.started_at && record.finished_at && typeof record.duration_ms !== 'number') {
      record.duration_ms = Math.max(0, new Date(record.finished_at).getTime() - new Date(record.started_at).getTime());
    }
    const recordPath = path.join(executionsDir, `${record.execution_id}.json`);
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf8');
    this.activeExecutions.set(record.execution_id, record);
    return record;
  }

  listExecutions() {
    const files = fs.readdirSync(executionsDir).filter(f => f.endsWith('.json'));
    return files.map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(executionsDir, file), 'utf8'));
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime());
  }

  getExecutionMetrics() {
    const all = this.listExecutions();
    const total = all.length;
    const completed = all.filter(e => e.status === 'COMPLETED').length;
    const failed = all.filter(e => e.status === 'FAILED').length;
    const blocked = all.filter(e => e.status === 'BLOCKED').length;
    const durations = all.map(e => e.duration_ms).filter(d => typeof d === 'number' && d >= 0);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    return {
      total,
      completed,
      failed,
      blocked,
      avg_duration_ms: avgDuration
    };
  }

  getExecutionRecord(executionId) {
    if (this.activeExecutions.has(executionId)) {
      return this.activeExecutions.get(executionId);
    }
    const recordPath = path.join(executionsDir, `${executionId}.json`);
    if (fs.existsSync(recordPath)) {
      return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    }
    return null;
  }
}

export const runtime = new AgentRuntime();

