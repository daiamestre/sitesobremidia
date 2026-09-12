/**
 * SOBRE MÍDIA AI Engineering System — Scoped Memory Architecture & Security
 * Gerenciador de memória com escopos formais, isolamento criptográfico/referencial,
 * proveniência, validação de schema MemoryRecord e imutabilidade profunda.
 */

import path from 'path';
import {
  VALID_MEMORY_SCOPES,
  VALID_MEMORY_KINDS,
  VALID_MEMORY_STATUSES,
  validateMemoryRecord,
  deepFreeze
} from './contracts.mjs';

export class ScopedMemoryManager {
  constructor() {
    this.storage = {
      GLOBAL: new Map(),
      PROJECT: new Map(),
      TASK: new Map(),
      AGENT: new Map(),
      EXECUTION: new Map(),
      SESSION: new Map()
    };
  }

  /**
   * Armazena um registro de memória com escopo e contexto formal.
   *
   * @param {string} scope - GLOBAL | PROJECT | TASK | AGENT | EXECUTION | SESSION
   * @param {string} key - Chave do item
   * @param {*} value - Conteúdo/valor a ser armazenado
   * @param {string|Object} [context] - ownerId ou objeto de contexto
   * @returns {Object} MemoryRecord canônico validado e congelado
   */
  set(scope, key, value, context = 'system') {
    if (!VALID_MEMORY_SCOPES.includes(scope)) {
      throw new Error(`[MEMORY ERROR]: Escopo inválido '${scope}'. Permitidos: ${VALID_MEMORY_SCOPES.join(', ')}.`);
    }

    const ctx = typeof context === 'string'
      ? { ownerId: context, agent_id: context }
      : (context || {});

    const agentId = ctx.agent_id || ctx.ownerId || 'system';
    const taskId = ctx.task_id || 'UNKNOWN';
    const projectId = ctx.project_id || 'SOBRE_MIDIA';
    const workspaceRoot = (ctx.workspace_root || process.cwd()).replace(/\\/g, '/');

    // Chave de particionamento interno no mapa
    let storageKey = key;
    if (scope === 'AGENT') {
      storageKey = `${agentId}:${key}`;
    } else if (scope === 'TASK') {
      storageKey = `${taskId}:${key}`;
    } else if (scope === 'PROJECT') {
      storageKey = `${path.resolve(workspaceRoot).replace(/\\/g, '/').toLowerCase()}:${key}`;
    } else if (scope === 'EXECUTION' || scope === 'SESSION') {
      const execId = ctx.execution_id || agentId;
      storageKey = `${execId}:${key}`;
    }

    const memoryRecord = {
      schema_version: '1.0.0',
      memory_id: ctx.memory_id || `MEM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      project_id: projectId,
      workspace_root: workspaceRoot,
      scope,
      kind: ctx.kind || (scope === 'TASK' ? 'TASK_DATA' : 'FACT'),
      content: value,
      source: {
        source_agent_id: agentId,
        source_task_id: taskId
      },
      created_at: ctx.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: ctx.expires_at || null,
      confidence: typeof ctx.confidence === 'number' ? ctx.confidence : 1.0,
      status: ctx.status || 'ACTIVE',
      metadata: ctx.metadata || {}
    };

    const errors = validateMemoryRecord(memoryRecord);
    if (errors.length > 0) {
      throw new Error(`[MEMORY ERROR]: Falha na validação do MemoryRecord: ${errors.join('; ')}`);
    }

    const frozenRecord = deepFreeze(memoryRecord);
    this.storage[scope].set(storageKey, frozenRecord);
    return frozenRecord;
  }

  /**
   * Grava diretamente um MemoryRecord já formatado.
   *
   * @param {Object} memoryRecord
   * @returns {Object} MemoryRecord validado e congelado
   */
  record(memoryRecord) {
    const errors = validateMemoryRecord(memoryRecord);
    if (errors.length > 0) {
      throw new Error(`[MEMORY ERROR]: MemoryRecord inválido rejeitado: ${errors.join('; ')}`);
    }

    const scope = memoryRecord.scope;
    const key = memoryRecord.metadata?.key || memoryRecord.memory_id;
    const agentId = memoryRecord.source.source_agent_id;
    const taskId = memoryRecord.source.source_task_id;
    const workspaceRoot = memoryRecord.workspace_root || process.cwd();

    let storageKey = key;
    if (scope === 'AGENT') {
      storageKey = `${agentId}:${key}`;
    } else if (scope === 'TASK') {
      storageKey = `${taskId}:${key}`;
    } else if (scope === 'PROJECT') {
      storageKey = `${path.resolve(workspaceRoot).replace(/\\/g, '/').toLowerCase()}:${key}`;
    }

    const frozenRecord = deepFreeze(memoryRecord);
    this.storage[scope].set(storageKey, frozenRecord);
    return frozenRecord;
  }

  /**
   * Recupera o conteúdo de uma memória respeitando isolamento de escopo.
   *
   * @param {string} scope
   * @param {string} key
   * @param {string|Object} [requesterContext]
   * @returns {*} Conteúdo profundamente congelado ou null
   */
  get(scope, key, requesterContext = 'system') {
    if (!VALID_MEMORY_SCOPES.includes(scope)) {
      throw new Error(`[MEMORY ERROR]: Escopo inválido '${scope}'.`);
    }

    const ctx = typeof requesterContext === 'string'
      ? { requesterId: requesterContext, agent_id: requesterContext }
      : (requesterContext || {});

    const requesterAgentId = ctx.agent_id || ctx.requesterId || 'system';
    const requesterTaskId = ctx.task_id;
    const requesterWorkspace = ctx.workspace_root ? path.resolve(ctx.workspace_root).replace(/\\/g, '/').toLowerCase() : null;
    const requesterExecId = ctx.execution_id || requesterAgentId;

    if (scope === 'GLOBAL') {
      const record = this.storage.GLOBAL.get(key);
      return record ? record.content : null;
    }

    if (scope === 'AGENT') {
      const storageKey = `${requesterAgentId}:${key}`;
      const record = this.storage.AGENT.get(storageKey);
      if (!record) return null;
      // Cross-agent boundary check
      if (record.source.source_agent_id !== requesterAgentId) {
        return null;
      }
      return record.content;
    }

    if (scope === 'TASK') {
      if (requesterTaskId) {
        const storageKey = `${requesterTaskId}:${key}`;
        const record = this.storage.TASK.get(storageKey);
        if (!record) return null;
        if (record.source.source_task_id !== requesterTaskId) return null;
        return record.content;
      }
      // Fallback por chave direta se requesterTaskId não for especificado
      const record = this.storage.TASK.get(key);
      return record ? record.content : null;
    }

    if (scope === 'PROJECT') {
      if (requesterWorkspace) {
        const storageKey = `${requesterWorkspace}:${key}`;
        const record = this.storage.PROJECT.get(storageKey);
        if (record) {
          const recNorm = path.resolve(record.workspace_root).replace(/\\/g, '/').toLowerCase();
          if (recNorm === requesterWorkspace) {
            return record.content;
          }
        }
        return null;
      }
      // Fallback se não fornecido workspace explícito
      const record = this.storage.PROJECT.get(key);
      return record ? record.content : null;
    }

    if (scope === 'EXECUTION' || scope === 'SESSION') {
      const targetScope = this.storage[scope];
      const storageKey = `${requesterExecId}:${key}`;
      const record = targetScope.get(storageKey) || targetScope.get(key);
      return record ? record.content : null;
    }

    return null;
  }

  /**
   * Recupera o MemoryRecord completo em vez de apenas o valor.
   *
   * @param {string} scope
   * @param {string} key
   * @param {string|Object} [requesterContext]
   * @returns {Object|null}
   */
  getRecord(scope, key, requesterContext = 'system') {
    if (!VALID_MEMORY_SCOPES.includes(scope)) return null;
    const ctx = typeof requesterContext === 'string' ? { requesterId: requesterContext } : requesterContext;
    const agentId = ctx.agent_id || ctx.requesterId || 'system';

    let storageKey = key;
    if (scope === 'AGENT') storageKey = `${agentId}:${key}`;
    else if (scope === 'TASK' && ctx.task_id) storageKey = `${ctx.task_id}:${key}`;
    else if (scope === 'PROJECT' && ctx.workspace_root) storageKey = `${path.resolve(ctx.workspace_root).replace(/\\/g, '/').toLowerCase()}:${key}`;

    return this.storage[scope].get(storageKey) || this.storage[scope].get(key) || null;
  }

  has(scope, key, requesterContext = 'system') {
    return this.get(scope, key, requesterContext) !== null;
  }

  clearExecutionMemory(executionId) {
    for (const [k] of this.storage.EXECUTION.entries()) {
      if (k.startsWith(`${executionId}:`)) {
        this.storage.EXECUTION.delete(k);
      }
    }
    for (const [k] of this.storage.SESSION.entries()) {
      if (k.startsWith(`${executionId}:`)) {
        this.storage.SESSION.delete(k);
      }
    }
  }

  /**
   * Cria um snapshot isolado de memória para o ExecutionContext de um agente.
   *
   * @param {string} agentId
   * @param {string} taskId
   * @param {string} workspaceRoot
   * @returns {Object}
   */
  createExecutionContextMemory(agentId, taskId, workspaceRoot = process.cwd()) {
    const manager = this;
    const execContext = {
      agent_id: agentId,
      task_id: taskId,
      workspace_root: workspaceRoot
    };

    return {
      get: (scope, key) => manager.get(scope, key, execContext),
      set: (scope, key, value, optContext = {}) => {
        const merged = { ...execContext, ...optContext, ownerId: agentId };
        return manager.set(scope, key, value, merged);
      },
      has: (scope, key) => manager.has(scope, key, execContext),
      getRecord: (scope, key) => manager.getRecord(scope, key, execContext)
    };
  }
}

export const memoryManager = new ScopedMemoryManager();
