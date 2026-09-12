/**
 * SOBRE MÍDIA AI Engineering System — Agent Execution Boundary & Adapters
 * Define contratos e adaptadores de execução de agentes (Single-Executor Level B).
 */

import { validateAgentResult } from './contracts.mjs';

/**
 * Interface base para adaptadores de execução de agentes.
 */
export class ExecutionAdapter {
  constructor(executorType = 'SINGLE_EXECUTOR', adapterId = 'base-execution-adapter') {
    this.executor_type = executorType;
    this.adapter_id = adapterId;
  }

  async execute({ agent, task, executionContext, actionHandler }) {
    throw new Error(`[EXECUTION ADAPTER ERROR]: Método execute() deve ser implementado pela classe concreta.`);
  }
}

/**
 * Adaptador concreto: SingleExecutorAdapter (Level B).
 * Encapsula a execução determinística em processo local único.
 */
export class SingleExecutorAdapter extends ExecutionAdapter {
  constructor() {
    super('SINGLE_EXECUTOR', 'single-executor-adapter');
  }

  async execute({ agent, task, executionContext, actionHandler }) {
    if (typeof actionHandler !== 'function') {
      throw new Error(`[SINGLE EXECUTOR ERROR]: actionHandler deve ser uma função executável.`);
    }

    // Executar a ação especializada fornecendo o executionContext
    const rawResult = await actionHandler(executionContext);

    // Validação do AgentResult
    const validationErrors = validateAgentResult(rawResult);
    if (validationErrors.length > 0) {
      throw new Error(`[SINGLE EXECUTOR ERROR]: Formato de AgentResult inválido: ${validationErrors.join(', ')}`);
    }

    return {
      executor_type: this.executor_type,
      adapter_id: this.adapter_id,
      result: rawResult
    };
  }
}

export const defaultExecutionAdapter = new SingleExecutorAdapter();
