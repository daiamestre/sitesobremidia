/**
 * SOBRE MÍDIA AI Engineering System — Task to Agent Router
 * Roteamento determinístico baseado em classificação de intenção e regras de domínio.
 */

import { registry } from './registry.mjs';
import { DiscoveryPolicy } from './project_discovery.mjs';

const ROUTING_RULES = [
  {
    type: 'ARCHITECTURE',
    keywords: ['arquitetura', 'design', 'estrutura', 'modelagem', 'fluxo', 'blueprint', 'especificação'],
    targetAgent: 'architect',
    requiredCapability: 'SYSTEM_ARCHITECTURE',
    reason: 'Tarefas de modelagem estrutural e arquitetura de domínio requerem o Architect Agent.'
  },
  {
    type: 'DATABASE',
    keywords: ['banco', 'database', 'migration', 'rls', 'policy', 'sql', 'supabase', 'schema', 'tabela'],
    targetAgent: 'database',
    requiredCapability: 'DATABASE_MANAGEMENT',
    reason: 'Tarefas de banco de dados, RLS e migrations requerem o Database Agent.'
  },
  {
    type: 'FORENSIC',
    keywords: ['auditoria', 'forense', 'investigação', 'diff', 'causa raiz', 'diagnóstico', 'inspeção'],
    targetAgent: 'forensic',
    requiredCapability: 'FORENSIC_AUDITING',
    reason: 'Tarefas de investigação e auditoria forense requerem o Forensic Auditor Agent.'
  },
  {
    type: 'QA',
    keywords: ['teste', 'qa', 'verificação', 'suíte', 'e2e', 'unit', 'regressão', 'validação de testes'],
    targetAgent: 'qa',
    requiredCapability: 'QUALITY_ASSURANCE',
    reason: 'Tarefas de execução e validação de testes automatizados requerem o QA Agent.'
  },
  {
    type: 'IMPLEMENTATION',
    keywords: ['implementar', 'construir', 'código', 'componente', 'fix', 'correção', 'feature', 'página', 'serviço'],
    targetAgent: 'builder',
    requiredCapability: 'CODE_IMPLEMENTATION',
    reason: 'Tarefas de construção de código e implementação requerem o Builder Agent.'
  }
];

export class TaskRouter {
  static routeTask(task) {
    if (!task || !task.objective) {
      throw new Error('[ROUTER ERROR]: Tarefa inválida ou sem objetivo definido.');
    }

    const text = `${task.task_id || ''} ${task.type || ''} ${task.objective} ${task.context || ''}`.toLowerCase();
    const isProjectAware = DiscoveryPolicy.isProjectAware(task);
    const discoveryPolicy = DiscoveryPolicy.evaluate(task);

    // 1. Checar se há tipo explícito correspondente
    if (task.type) {
      const matchedRule = ROUTING_RULES.find(r => r.type.toLowerCase() === task.type.toLowerCase());
      if (matchedRule) {
        const agent = registry.getAgent(matchedRule.targetAgent);
        const requiredCaps = [matchedRule.requiredCapability];
        if (Array.isArray(task.required_capabilities)) {
          for (const c of task.required_capabilities) {
            if (!requiredCaps.includes(c)) requiredCaps.push(c);
          }
        }

        // Validar elegibilidade
        const eligibility = registry.isEligibleForTask(matchedRule.targetAgent, {
          ...task,
          required_capabilities: requiredCaps
        });

        if (!eligibility.eligible) {
          throw new Error(`[ROUTER ERROR]: Agente '${matchedRule.targetAgent}' não é elegível para a tarefa: ${eligibility.reason}`);
        }

        return {
          task_id: task.task_id,
          classification: matchedRule.type,
          selected_agent: matchedRule.targetAgent,
          reason: `Roteamento por tipo explícito de tarefa: '${task.type}'. ${matchedRule.reason}`,
          required_skills: agent ? agent.skills : [],
          required_capabilities: requiredCaps,
          is_project_aware: isProjectAware,
          discovery_policy: discoveryPolicy
        };
      }
    }

    // 2. Checar por palavras-chave
    for (const rule of ROUTING_RULES) {
      const match = rule.keywords.some(kw => text.includes(kw));
      if (match) {
        const agent = registry.getAgent(rule.targetAgent);
        const requiredCaps = [rule.requiredCapability];
        if (Array.isArray(task.required_capabilities)) {
          for (const c of task.required_capabilities) {
            if (!requiredCaps.includes(c)) requiredCaps.push(c);
          }
        }

        // Validar elegibilidade
        const eligibility = registry.isEligibleForTask(rule.targetAgent, {
          ...task,
          required_capabilities: requiredCaps
        });

        if (eligibility.eligible) {
          return {
            task_id: task.task_id,
            classification: rule.type,
            selected_agent: rule.targetAgent,
            reason: `Roteamento por palavras-chave de domínio. ${rule.reason}`,
            required_skills: agent ? agent.skills : [],
            required_capabilities: requiredCaps,
            is_project_aware: isProjectAware,
            discovery_policy: discoveryPolicy
          };
        }
      }
    }

    // 3. Fallback seguro para Orchestrator
    const orchestrator = registry.getAgent('orchestrator');
    const orchestratorCaps = orchestrator ? orchestrator.capabilities : ['TASK_ORCHESTRATION'];
    return {
      task_id: task.task_id,
      classification: 'GENERAL_ORCHESTRATION',
      selected_agent: 'orchestrator',
      reason: 'Tarefa geral ou ambígua roteada para coordenação central do Orchestrator.',
      required_skills: orchestrator ? orchestrator.skills : [],
      required_capabilities: orchestratorCaps,
      is_project_aware: isProjectAware,
      discovery_policy: discoveryPolicy
    };
  }
}

