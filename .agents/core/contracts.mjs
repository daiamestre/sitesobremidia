/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Contracts
 * Define schemas canônicos e validadores para Agentes, Tarefas, Execuções, Resultados e Handoffs.
 */

export const VALID_LIFECYCLE_STATES = [
  'CREATED',
  'READY',
  'RUNNING',
  'WAITING',
  'COMPLETED',
  'FAILED',
  'BLOCKED'
];

export const VALID_MEMORY_SCOPES = [
  'GLOBAL',
  'PROJECT',
  'TASK',
  'AGENT',
  'EXECUTION'
];

export function validateAgentContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object') {
    return ['Contrato nulo ou não é um objeto.'];
  }

  if (!contract.agent_id || typeof contract.agent_id !== 'string') {
    errors.push("Campo obrigatório 'agent_id' ausente ou inválido.");
  }

  if (!contract.name || typeof contract.name !== 'string') {
    errors.push("Campo obrigatório 'name' ausente ou inválido.");
  }

  if (!contract.version || typeof contract.version !== 'string') {
    errors.push("Campo obrigatório 'version' ausente ou inválido.");
  }

  if (!contract.role || typeof contract.role !== 'string') {
    errors.push("Campo obrigatório 'role' ausente ou inválido.");
  }

  if (!contract.objective || typeof contract.objective !== 'string') {
    errors.push("Campo obrigatório 'objective' ausente ou inválido.");
  }

  if (!Array.isArray(contract.skills)) {
    errors.push("Campo obrigatório 'skills' deve ser um array de strings.");
  }

  if (!Array.isArray(contract.tools)) {
    errors.push("Campo obrigatório 'tools' deve ser um array de strings.");
  }

  if (!contract.permissions || typeof contract.permissions !== 'object') {
    errors.push("Campo obrigatório 'permissions' ausente ou inválido.");
  } else {
    if (typeof contract.permissions.read !== 'boolean') errors.push("Permissão 'permissions.read' deve ser booleana.");
    if (typeof contract.permissions.write !== 'boolean') errors.push("Permissão 'permissions.write' deve ser booleana.");
    if (typeof contract.permissions.execute !== 'boolean') errors.push("Permissão 'permissions.execute' deve ser booleana.");
    if (!Array.isArray(contract.permissions.allowed_paths)) errors.push("Permissão 'permissions.allowed_paths' deve ser um array de caminhos.");
  }

  if (!VALID_MEMORY_SCOPES.includes(contract.memory_scope)) {
    errors.push(`Escopo de memória 'memory_scope' inválido (${contract.memory_scope}). Permitidos: ${VALID_MEMORY_SCOPES.join(', ')}.`);
  }

  return errors;
}

export function validateAgentTask(task) {
  const errors = [];
  if (!task || typeof task !== 'object') {
    return ['Tarefa nula ou não é um objeto.'];
  }

  if (!task.task_id || typeof task.task_id !== 'string') {
    errors.push("Campo obrigatório 'task_id' ausente ou inválido.");
  }

  if (!task.objective || typeof task.objective !== 'string') {
    errors.push("Campo obrigatório 'objective' ausente ou inválido.");
  }

  return errors;
}

export function validateAgentResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return ['Resultado nulo ou não é um objeto.'];
  }

  if (typeof result.success !== 'boolean') {
    errors.push("Campo obrigatório 'success' deve ser booleano.");
  }

  if (!result.summary || typeof result.summary !== 'string') {
    errors.push("Campo obrigatório 'summary' ausente ou inválido.");
  }

  if (!Array.isArray(result.evidence)) {
    errors.push("Campo obrigatório 'evidence' deve ser um array.");
  }

  return errors;
}

/**
 * Congela recursivamente um objeto e todas as suas propriedades aninhadas,
 * garantindo imutabilidade profunda e proteção contra mutações in-memory.
 */
export function deepFreeze(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (seen.has(obj)) {
    return obj;
  }
  seen.add(obj);

  const propNames = Reflect.ownKeys(obj);
  for (const name of propNames) {
    const val = obj[name];
    if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
      deepFreeze(val, seen);
    }
  }

  return Object.freeze(obj);
}

