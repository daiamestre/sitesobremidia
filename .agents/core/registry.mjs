/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Registry
 * Fonte canônica única de registro e validação de identidades de agentes.
 */

import { validateAgentContract, deepFreeze } from './contracts.mjs';
import { canonicalSkillRegistry } from './skill_registry.mjs';


const CORE_AGENTS_DEFINITION = [
  {
    agent_id: 'orchestrator',
    name: 'Orchestrator Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'Central Coordinator & Task Router',
    objective: 'Classificar tarefas, definir planos de ação, rotear para especialistas e sintetizar resultados.',
    skills: ['orchestrator-core', 'project-discovery'],
    tools: ['view_file', 'list_dir', 'grep_search', 'run_command'],
    permissions: {
      read: true,
      write: true,
      execute: true,
      allowed_paths: ['.agents/']
    },
    capabilities: ['TASK_ORCHESTRATION', 'PROJECT_DISCOVERY'],
    task_types: ['GENERAL_ORCHESTRATION', 'ORCHESTRATION'],
    memory_scope: 'GLOBAL',
    budget: { max_files: 5, max_lines: 100 }
  },
  {
    agent_id: 'architect',
    name: 'Architect Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'System & Domain Architecture Specialist',
    objective: 'Analisar requisitos, modelar estruturas de dados, fluxos de domínio SOBRE MÍDIA e definir padrões técnicos.',
    skills: ['project-discovery', 'sobremidia-domain'],
    tools: ['view_file', 'list_dir', 'grep_search'],
    permissions: {
      read: true,
      write: false,
      execute: false,
      allowed_paths: ['src/', 'supabase/', '.agents/']
    },
    capabilities: ['SYSTEM_ARCHITECTURE', 'PROJECT_DISCOVERY'],
    task_types: ['ARCHITECTURE', 'DESIGN', 'SPECIFICATION'],
    memory_scope: 'TASK',
    budget: { max_files: 0, max_lines: 0 }
  },
  {
    agent_id: 'builder',
    name: 'Builder Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'Implementation & Construction Specialist',
    objective: 'Escrever código, implementar componentes, serviços e executar construções no escopo autorizado.',
    skills: ['sobremidia-domain'],
    tools: ['view_file', 'list_dir', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command'],
    permissions: {
      read: true,
      write: true,
      execute: true,
      allowed_paths: ['src/', 'supabase/', '.agents/']
    },
    capabilities: ['CODE_IMPLEMENTATION'],
    task_types: ['IMPLEMENTATION', 'CONSTRUCTION', 'FIX'],
    memory_scope: 'TASK',
    budget: { max_files: 5, max_lines: 150 }
  },
  {
    agent_id: 'database',
    name: 'Database Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'Database, Migrations & RLS Specialist',
    objective: 'Gerenciar migrations, policies de RLS, triggers, functions e constraints PostgreSQL/Supabase.',
    skills: ['database-supabase-guard', 'sobremidia-domain'],
    tools: ['view_file', 'list_dir', 'grep_search', 'run_command'],
    permissions: {
      read: true,
      write: true,
      execute: true,
      allowed_paths: ['supabase/', '.agents/']
    },
    capabilities: ['DATABASE_MANAGEMENT'],
    task_types: ['DATABASE', 'MIGRATION', 'RLS'],
    memory_scope: 'TASK',
    budget: { max_files: 3, max_lines: 100 }
  },
  {
    agent_id: 'forensic',
    name: 'Forensic Auditor Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'Forensic Diagnosis & Diff Audit Specialist',
    objective: 'Investigar causas-raiz, auditar diffs, inspecionar regressões e validar integridade de dados.',
    skills: ['forensic-auditor', 'project-discovery', 'sobremidia-domain'],
    tools: ['view_file', 'list_dir', 'grep_search', 'run_command'],
    permissions: {
      read: true,
      write: false,
      execute: true,
      allowed_paths: ['src/', 'supabase/', '.agents/']
    },
    capabilities: ['FORENSIC_AUDITING', 'PROJECT_DISCOVERY'],
    task_types: ['FORENSIC', 'AUDIT', 'INVESTIGATION', 'DIAGNOSIS'],
    memory_scope: 'TASK',
    budget: { max_files: 0, max_lines: 0 }
  },
  {
    agent_id: 'qa',
    name: 'QA & Verification Agent',
    version: '1.0.0',
    status: 'ACTIVE',
    role: 'Quality Assurance & Automated Testing Specialist',
    objective: 'Executar suítes de teste, validar não-regressão e verificar critérios de aceitação com evidências.',
    skills: ['forensic-auditor', 'sobremidia-domain'],
    tools: ['view_file', 'list_dir', 'grep_search', 'run_command'],
    permissions: {
      read: true,
      write: false,
      execute: true,
      allowed_paths: ['src/tests/', '.agents/']
    },
    capabilities: ['QUALITY_ASSURANCE'],
    task_types: ['QA', 'TESTING', 'VERIFICATION'],
    memory_scope: 'TASK',
    budget: { max_files: 2, max_lines: 50 }
  }
];

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this._sealed = false;
    this._initializeCoreAgents();
  }

  _initializeCoreAgents() {
    for (const agentDef of CORE_AGENTS_DEFINITION) {
      this.registerAgent(agentDef);
    }
  }

  seal() {
    this._sealed = true;
  }

  unseal() {
    this._sealed = false;
  }

  isSealed() {
    return this._sealed;
  }

  registerAgent(contract) {
    if (this._sealed) {
      throw new Error(`[REGISTRY ERROR]: Registry está selado. Registro de novos agentes não permitido.`);
    }

    const contractErrors = validateAgentContract(contract);
    if (contractErrors.length > 0) {
      throw new Error(`[REGISTRY ERROR]: Contrato de agente inválido (${contract?.agent_id || 'sem_id'}): ${contractErrors.join(', ')}`);
    }

    // Proteção contra duplicação e colisão insensível a maiúsculas/minúsculas
    const incomingId = contract.agent_id.trim();
    for (const existingId of this.agents.keys()) {
      if (existingId.toLowerCase() === incomingId.toLowerCase()) {
        throw new Error(`[REGISTRY ERROR]: Agente duplicado ou colisão de identificador com id '${incomingId}'.`);
      }
    }

    // Validar existência física das skills declaradas no Canonical Skill Registry
    for (const skillId of contract.skills) {
      if (!canonicalSkillRegistry.hasSkill(skillId)) {
        throw new Error(`[REGISTRY ERROR]: Agente '${contract.agent_id}' declara Skill inexistente: '${skillId}'.`);
      }
    }

    // Normalizar campos padrão
    const normalizedContract = {
      ...contract,
      status: contract.status || 'ACTIVE',
      capabilities: Array.isArray(contract.capabilities) ? [...contract.capabilities] : [],
      task_types: Array.isArray(contract.task_types) ? [...contract.task_types] : []
    };

    this.agents.set(incomingId, deepFreeze(normalizedContract));
    return this.agents.get(incomingId);
  }

  getAgent(agentId) {
    if (!agentId || typeof agentId !== 'string') {
      return null;
    }
    const cleanId = agentId.trim();
    return this.agents.get(cleanId) || null;
  }

  hasAgent(agentId) {
    return this.getAgent(agentId) !== null;
  }

  hasCapability(agentId, capabilityId) {
    const agent = this.getAgent(agentId);
    if (!agent || !Array.isArray(agent.capabilities)) {
      return false;
    }
    return agent.capabilities.includes(capabilityId);
  }

  getCapabilities(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent || !Array.isArray(agent.capabilities)) {
      return [];
    }
    return agent.capabilities;
  }

  isEligibleForTask(agentId, task) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return { eligible: false, reason: `Agente '${agentId}' não encontrado no Registry.` };
    }

    if (agent.status !== 'ACTIVE') {
      return { eligible: false, reason: `Agente '${agentId}' não está ativo (status: ${agent.status}).` };
    }

    // 1. Validar capacidades obrigatórias explícitas na tarefa
    if (task && Array.isArray(task.required_capabilities) && task.required_capabilities.length > 0) {
      for (const reqCap of task.required_capabilities) {
        if (!agent.capabilities || !agent.capabilities.includes(reqCap)) {
          return {
            eligible: false,
            reason: `Agente '${agentId}' não possui a capacidade exigida '${reqCap}'. Capacidades: [${(agent.capabilities || []).join(', ')}].`
          };
        }
      }
    }

    return { eligible: true };
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  validateAgent(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return { valid: false, errors: [`Agente '${agentId}' não registrado no Registry.`] };
    }
    const errors = validateAgentContract(agent);
    return { valid: errors.length === 0, errors };
  }
}

export const registry = new AgentRegistry();
export { AgentRegistry };
