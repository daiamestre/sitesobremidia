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
    memory_scope: 'GLOBAL',
    budget: { max_files: 5, max_lines: 100 }
  },
  {
    agent_id: 'architect',
    name: 'Architect Agent',
    version: '1.0.0',
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
    memory_scope: 'TASK',
    budget: { max_files: 0, max_lines: 0 }
  },
  {
    agent_id: 'builder',
    name: 'Builder Agent',
    version: '1.0.0',
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
    memory_scope: 'TASK',
    budget: { max_files: 5, max_lines: 150 }
  },
  {
    agent_id: 'database',
    name: 'Database Agent',
    version: '1.0.0',
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
    memory_scope: 'TASK',
    budget: { max_files: 3, max_lines: 100 }
  },
  {
    agent_id: 'forensic',
    name: 'Forensic Auditor Agent',
    version: '1.0.0',
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
    memory_scope: 'TASK',
    budget: { max_files: 0, max_lines: 0 }
  },
  {
    agent_id: 'qa',
    name: 'QA & Verification Agent',
    version: '1.0.0',
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
    memory_scope: 'TASK',
    budget: { max_files: 2, max_lines: 50 }
  }
];

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this._initializeCoreAgents();
  }

  _initializeCoreAgents() {
    for (const agentDef of CORE_AGENTS_DEFINITION) {
      this.registerAgent(agentDef);
    }
  }

  registerAgent(contract) {
    const contractErrors = validateAgentContract(contract);
    if (contractErrors.length > 0) {
      throw new Error(`[REGISTRY ERROR]: Contrato de agente inválido (${contract?.agent_id || 'sem_id'}): ${contractErrors.join(', ')}`);
    }

    if (this.agents.has(contract.agent_id)) {
      throw new Error(`[REGISTRY ERROR]: Agente duplicado com id '${contract.agent_id}'.`);
    }

    // Validar existência física das skills declaradas no Canonical Skill Registry
    for (const skillId of contract.skills) {
      if (!canonicalSkillRegistry.hasSkill(skillId)) {
        throw new Error(`[REGISTRY ERROR]: Agente '${contract.agent_id}' declara Skill inexistente: '${skillId}'.`);
      }
    }

    this.agents.set(contract.agent_id, deepFreeze(contract));
    return this.agents.get(contract.agent_id);
  }

  getAgent(agentId) {
    if (!agentId || !this.agents.has(agentId)) {
      return null;
    }
    return this.agents.get(agentId);
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
