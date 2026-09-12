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
  'EXECUTION',
  'SESSION'
];

export const VALID_MEMORY_KINDS = [
  'DECISION',
  'FACT',
  'EVIDENCE',
  'NOTE',
  'STATE',
  'CONTEXT',
  'TASK_DATA'
];

export const VALID_MEMORY_STATUSES = [
  'ACTIVE',
  'ARCHIVED',
  'STALE',
  'SUPERSEDED',
  'EXPIRED'
];

export const VALID_DISCOVERY_STATUSES = [
  'DISCOVERED',
  'PARTIAL',
  'BLOCKED',
  'FAILED'
];

export const VALID_PACKAGE_MANAGER_STATUSES = [
  'CANONICAL',
  'CONFLICT',
  'NOT_FOUND'
];

export const VALID_PACKAGE_MANAGERS = [
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'UNKNOWN'
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

export function validateDiscoveryResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return ['DiscoveryResult nulo ou não é um objeto.'];
  }

  // 1. Schema Version
  if (!result.schema_version || typeof result.schema_version !== 'string') {
    errors.push("Campo obrigatório 'schema_version' ausente ou inválido.");
  } else if (!/^\d+\.\d+\.\d+$/.test(result.schema_version)) {
    errors.push(`Formato inválido para 'schema_version' (${result.schema_version}). Esperado formato semver (ex: '1.0.0').`);
  }

  // 2. Project Identity
  if (!result.project_identity || typeof result.project_identity !== 'object') {
    errors.push("Campo obrigatório 'project_identity' ausente ou inválido.");
  } else {
    if (!result.project_identity.name || typeof result.project_identity.name !== 'string') {
      errors.push("Campo obrigatório 'project_identity.name' ausente ou inválido.");
    }
    if (typeof result.project_identity.version !== 'string') {
      errors.push("Campo obrigatório 'project_identity.version' ausente ou não é string.");
    }
    if (result.project_identity.stage !== undefined && typeof result.project_identity.stage !== 'string') {
      errors.push("Campo 'project_identity.stage' deve ser uma string.");
    }
  }

  // 3. Root
  if (!result.root || typeof result.root !== 'object') {
    errors.push("Campo obrigatório 'root' ausente ou inválido.");
  } else {
    if (!result.root.project_root || typeof result.root.project_root !== 'string') {
      errors.push("Campo obrigatório 'root.project_root' ausente ou inválido.");
    }
    if (!result.root.workspace_root || typeof result.root.workspace_root !== 'string') {
      errors.push("Campo obrigatório 'root.workspace_root' ausente ou inválido.");
    }
  }

  // 4. Repository
  if (!result.repository || typeof result.repository !== 'object') {
    errors.push("Campo obrigatório 'repository' ausente ou inválido.");
  } else {
    if (typeof result.repository.vcs !== 'string') {
      errors.push("Campo obrigatório 'repository.vcs' deve ser uma string ('git', 'none', etc.).");
    }
    if (result.repository.branch !== null && typeof result.repository.branch !== 'string') {
      errors.push("Campo 'repository.branch' deve ser string ou null.");
    }
    if (result.repository.head_commit !== null && typeof result.repository.head_commit !== 'string') {
      errors.push("Campo 'repository.head_commit' deve ser string ou null.");
    }
    if (result.repository.is_clean !== null && typeof result.repository.is_clean !== 'boolean') {
      errors.push("Campo 'repository.is_clean' deve ser boolean ou null.");
    }
  }

  // 5. Stack
  if (!result.stack || typeof result.stack !== 'object') {
    errors.push("Campo obrigatório 'stack' ausente ou inválido.");
  } else {
    const stackFields = ['runtime', 'language', 'framework', 'bundler', 'styling', 'database', 'mobile', 'linting'];
    for (const field of stackFields) {
      if (typeof result.stack[field] !== 'string') {
        errors.push(`Campo obrigatório 'stack.${field}' ausente ou não é string.`);
      }
    }
    if (!result.stack.testing || typeof result.stack.testing !== 'object') {
      errors.push("Campo obrigatório 'stack.testing' ausente ou não é um objeto.");
    } else {
      if (typeof result.stack.testing.unit !== 'string') errors.push("Campo obrigatório 'stack.testing.unit' ausente ou não é string.");
      if (typeof result.stack.testing.e2e !== 'string') errors.push("Campo obrigatório 'stack.testing.e2e' ausente ou não é string.");
    }
  }

  // 6. Package Manager
  if (!result.package_manager || typeof result.package_manager !== 'object') {
    errors.push("Campo obrigatório 'package_manager' ausente ou inválido.");
  } else {
    if (!VALID_PACKAGE_MANAGERS.includes(result.package_manager.name)) {
      errors.push(`Gerenciador de pacotes 'package_manager.name' inválido (${result.package_manager.name}). Permitidos: ${VALID_PACKAGE_MANAGERS.join(', ')}.`);
    }
    if (result.package_manager.lockfile !== null && typeof result.package_manager.lockfile !== 'string') {
      errors.push("Campo 'package_manager.lockfile' deve ser string ou null.");
    }
    if (!VALID_PACKAGE_MANAGER_STATUSES.includes(result.package_manager.status)) {
      errors.push(`Status 'package_manager.status' inválido (${result.package_manager.status}). Permitidos: ${VALID_PACKAGE_MANAGER_STATUSES.join(', ')}.`);
    }
  }

  // 7. Commands
  if (!result.commands || typeof result.commands !== 'object') {
    errors.push("Campo obrigatório 'commands' ausente ou inválido.");
  } else {
    const cmdFields = ['dev', 'build', 'test', 'typecheck', 'lint'];
    for (const cmd of cmdFields) {
      if (typeof result.commands[cmd] !== 'string') {
        errors.push(`Comando obrigatório 'commands.${cmd}' ausente ou não é string.`);
      }
    }
  }

  // 8. Database
  if (!result.database || typeof result.database !== 'object') {
    errors.push("Campo obrigatório 'database' ausente ou inválido.");
  } else {
    if (typeof result.database.provider !== 'string') {
      errors.push("Campo obrigatório 'database.provider' ausente ou não é string.");
    }
    if (result.database.migrations_dir !== null && typeof result.database.migrations_dir !== 'string') {
      errors.push("Campo 'database.migrations_dir' deve ser string ou null.");
    }
    if (typeof result.database.migrations_count !== 'number' || result.database.migrations_count < 0) {
      errors.push("Campo obrigatório 'database.migrations_count' deve ser um número maior ou igual a zero.");
    }
    if (typeof result.database.has_rls !== 'boolean' && result.database.has_rls !== 'UNKNOWN' && result.database.has_rls !== null) {
      errors.push("Campo 'database.has_rls' deve ser booleano, 'UNKNOWN' ou null.");
    }
  }

  // 9. Deployment
  if (!result.deployment || typeof result.deployment !== 'object') {
    errors.push("Campo obrigatório 'deployment' ausente ou inválido.");
  } else {
    if (!Array.isArray(result.deployment.detected_configs)) {
      errors.push("Campo obrigatório 'deployment.detected_configs' deve ser um array de strings.");
    } else {
      for (const item of result.deployment.detected_configs) {
        if (typeof item !== 'string') {
          errors.push("Itens em 'deployment.detected_configs' devem ser strings.");
          break;
        }
      }
    }
  }

  // 10. Rules
  if (!result.rules || typeof result.rules !== 'object') {
    errors.push("Campo obrigatório 'rules' ausente ou inválido.");
  } else {
    if (typeof result.rules.has_agents_md !== 'boolean') {
      errors.push("Campo obrigatório 'rules.has_agents_md' deve ser booleano.");
    }
    if (typeof result.rules.has_rules_dir !== 'boolean') {
      errors.push("Campo obrigatório 'rules.has_rules_dir' deve ser booleano.");
    }
    if (!Array.isArray(result.rules.protected_zones)) {
      errors.push("Campo obrigatório 'rules.protected_zones' deve ser um array de strings.");
    }
  }

  // 11. Status
  if (!VALID_DISCOVERY_STATUSES.includes(result.status)) {
    errors.push(`Status global de discovery 'status' inválido (${result.status}). Permitidos: ${VALID_DISCOVERY_STATUSES.join(', ')}.`);
  }

  // 12. Evidence
  if (!Array.isArray(result.evidence)) {
    errors.push("Campo obrigatório 'evidence' deve ser um array.");
  } else {
    if (result.status === 'DISCOVERED' && result.evidence.length === 0) {
      errors.push("Discovery com status 'DISCOVERED' exige ao menos uma evidência física.");
    }
    for (let i = 0; i < result.evidence.length; i++) {
      const ev = result.evidence[i];
      if (!ev || typeof ev !== 'object') {
        errors.push(`Evidência no índice ${i} deve ser um objeto válido.`);
        continue;
      }
      if (!ev.fact_path || typeof ev.fact_path !== 'string') {
        errors.push(`Evidência no índice ${i} sem 'fact_path' válido.`);
      }
      if (!ev.source_file || typeof ev.source_file !== 'string') {
        errors.push(`Evidência no índice ${i} sem 'source_file' válido.`);
      }
      if (!ev.source_hash || typeof ev.source_hash !== 'string') {
        errors.push(`Evidência no índice ${i} sem 'source_hash' válido.`);
      }
      if (typeof ev.observed_key !== 'string') {
        errors.push(`Evidência no índice ${i} sem 'observed_key' string.`);
      }
      if (ev.observed_value === undefined) {
        errors.push(`Evidência no índice ${i} com 'observed_value' indefinido.`);
      }
    }
  }

  // 13. Warnings
  if (!Array.isArray(result.warnings)) {
    errors.push("Campo obrigatório 'warnings' deve ser um array de strings.");
  } else {
    for (const w of result.warnings) {
      if (typeof w !== 'string') {
        errors.push("Todos os itens em 'warnings' devem ser strings.");
        break;
      }
    }
  }

  // 14. Manifest Checksum
  if (result.manifest_checksum !== null && typeof result.manifest_checksum !== 'string') {
    errors.push("Campo 'manifest_checksum' deve ser string ou null.");
  }

  // 15. Discovered At
  if (!result.discovered_at || typeof result.discovered_at !== 'string') {
    errors.push("Campo obrigatório 'discovered_at' ausente ou inválido.");
  }

  return errors;
}

export function validateMemoryRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return ['MemoryRecord nulo ou não é um objeto.'];
  }

  // 1. Schema Version
  if (!record.schema_version || typeof record.schema_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(record.schema_version)) {
    errors.push("Campo obrigatório 'schema_version' ausente ou inválido (formato semver esperado).");
  }

  // 2. Memory ID
  if (!record.memory_id || typeof record.memory_id !== 'string') {
    errors.push("Campo obrigatório 'memory_id' ausente ou inválido.");
  }

  // 3. Project ID & Workspace Root
  if (record.project_id !== undefined && typeof record.project_id !== 'string') {
    errors.push("Campo 'project_id' deve ser string.");
  }
  if (record.workspace_root !== undefined && typeof record.workspace_root !== 'string') {
    errors.push("Campo 'workspace_root' deve ser string.");
  }

  // 4. Scope
  if (!record.scope || !VALID_MEMORY_SCOPES.includes(record.scope)) {
    errors.push(`Campo 'scope' inválido (${record.scope}). Permitidos: ${VALID_MEMORY_SCOPES.join(', ')}.`);
  }

  // 5. Kind
  if (record.kind && !VALID_MEMORY_KINDS.includes(record.kind)) {
    errors.push(`Campo 'kind' inválido (${record.kind}). Permitidos: ${VALID_MEMORY_KINDS.join(', ')}.`);
  }

  // 6. Content
  if (record.content === undefined) {
    errors.push("Campo obrigatório 'content' indefinido.");
  }

  // 7. Source / Provenance
  if (!record.source || typeof record.source !== 'object') {
    errors.push("Campo obrigatório 'source' ausente ou não é objeto.");
  } else {
    if (!record.source.source_agent_id || typeof record.source.source_agent_id !== 'string') {
      errors.push("Campo 'source.source_agent_id' ausente ou inválido.");
    }
    if (record.source.source_task_id !== undefined && typeof record.source.source_task_id !== 'string') {
      errors.push("Campo 'source.source_task_id' deve ser string.");
    }
  }

  // 8. Timestamps
  if (!record.created_at || typeof record.created_at !== 'string') {
    errors.push("Campo obrigatório 'created_at' ausente ou inválido.");
  }
  if (record.updated_at !== undefined && typeof record.updated_at !== 'string') {
    errors.push("Campo 'updated_at' deve ser string.");
  }
  if (record.expires_at !== undefined && record.expires_at !== null && typeof record.expires_at !== 'string') {
    errors.push("Campo 'expires_at' deve ser string ou null.");
  }

  // 9. Status
  if (record.status && !VALID_MEMORY_STATUSES.includes(record.status)) {
    errors.push(`Campo 'status' inválido (${record.status}). Permitidos: ${VALID_MEMORY_STATUSES.join(', ')}.`);
  }

  return errors;
}

export function validateProjectProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') {
    return ['ProjectProfile nulo ou não é um objeto.'];
  }

  // 1. Schema Version
  if (!profile.schema_version || typeof profile.schema_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(profile.schema_version)) {
    errors.push("Campo obrigatório 'schema_version' ausente ou inválido (formato semver esperado).");
  }

  // 2. Project ID & Name
  if (!profile.project_id || typeof profile.project_id !== 'string') {
    errors.push("Campo obrigatório 'project_id' ausente ou inválido.");
  }
  if (!profile.project_name || typeof profile.project_name !== 'string') {
    errors.push("Campo obrigatório 'project_name' ausente ou inválido.");
  }

  // 3. Architecture & Stack
  if (!profile.architecture || (typeof profile.architecture !== 'string' && typeof profile.architecture !== 'object')) {
    errors.push("Campo obrigatório 'architecture' ausente ou inválido.");
  }
  if (!profile.stack || typeof profile.stack !== 'object') {
    errors.push("Campo obrigatório 'stack' ausente ou não é objeto.");
  }

  // 4. Arrays
  if (profile.modules && !Array.isArray(profile.modules)) {
    errors.push("Campo 'modules' deve ser array.");
  }
  if (profile.conventions && !Array.isArray(profile.conventions)) {
    errors.push("Campo 'conventions' deve ser array.");
  }
  if (profile.invariants && !Array.isArray(profile.invariants)) {
    errors.push("Campo 'invariants' deve ser array.");
  }
  if (profile.constraints && !Array.isArray(profile.constraints)) {
    errors.push("Campo 'constraints' deve ser array.");
  }

  // 5. Source
  if (!profile.source || typeof profile.source !== 'string') {
    errors.push("Campo obrigatório 'source' ausente ou inválido.");
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

