/**
 * SOBRE MÍDIA AI Engineering System — Task to Agent Router
 * Roteamento determinístico baseado em classificação de intenção, regras de domínio e governança de capacidades.
 */

import { registry } from './registry.mjs';
import { DiscoveryPolicy } from './project_discovery.mjs';
import { TargetDiscovery } from './target_discovery.mjs';
import { CapabilityDiscovery } from './capability_discovery.mjs';

export const TASK_TYPE_ROUTING = {
  // Builder (CODE_IMPLEMENTATION)
  IMPLEMENTATION: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Tarefas de construção de código e implementação requerem o Builder Agent.' },
  FEATURE: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Implementação de novas features requer o Builder Agent.' },
  BUGFIX: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Correção de bugs e defeitos de código requer o Builder Agent.' },
  HOTFIX: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Correções emergenciais de código requerem o Builder Agent.' },
  REFACTOR: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Refatoração estrutural de código requer o Builder Agent.' },
  BUILD: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Construção de módulos e bundles requer o Builder Agent.' },
  CONSTRUCTION: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Construção e codificação requerem o Builder Agent.' },
  FIX: { targetAgent: 'builder', requiredCapability: 'CODE_IMPLEMENTATION', reason: 'Ajustes e correções de código requerem o Builder Agent.' },

  // Architect (SYSTEM_ARCHITECTURE)
  ARCHITECTURE: { targetAgent: 'architect', requiredCapability: 'SYSTEM_ARCHITECTURE', reason: 'Modelagem estrutural e arquitetura de domínio requerem o Architect Agent.' },
  DESIGN: { targetAgent: 'architect', requiredCapability: 'SYSTEM_ARCHITECTURE', reason: 'Design arquitetural e estruturação requerem o Architect Agent.' },
  SPECIFICATION: { targetAgent: 'architect', requiredCapability: 'SYSTEM_ARCHITECTURE', reason: 'Especificação técnica e modelagem requerem o Architect Agent.' },
  OPTIMIZATION: { targetAgent: 'architect', requiredCapability: 'SYSTEM_ARCHITECTURE', reason: 'Otimização de design e arquitetura requer o Architect Agent.' },
  ARCHITECTURE_AND_AUDIT: { targetAgent: 'architect', requiredCapability: 'SYSTEM_ARCHITECTURE', reason: 'Arquitetura e análise estrutural requerem o Architect Agent.' },

  // Database (DATABASE_MANAGEMENT)
  DATABASE: { targetAgent: 'database', requiredCapability: 'DATABASE_MANAGEMENT', reason: 'Tarefas de banco de dados, RLS e migrations requerem o Database Agent.' },
  MIGRATION: { targetAgent: 'database', requiredCapability: 'DATABASE_MANAGEMENT', reason: 'Gerenciamento de migrations PostgreSQL/Supabase requer o Database Agent.' },
  RLS: { targetAgent: 'database', requiredCapability: 'DATABASE_MANAGEMENT', reason: 'Políticas de segurança Row Level Security (RLS) requerem o Database Agent.' },

  // Forensic (FORENSIC_AUDITING)
  FORENSIC: { targetAgent: 'forensic', requiredCapability: 'FORENSIC_AUDITING', reason: 'Investigação forense e auditoria de diffs requerem o Forensic Auditor Agent.' },
  AUDIT: { targetAgent: 'forensic', requiredCapability: 'FORENSIC_AUDITING', reason: 'Auditoria de conformidade e integridade requer o Forensic Auditor Agent.' },
  INVESTIGATION: { targetAgent: 'forensic', requiredCapability: 'FORENSIC_AUDITING', reason: 'Investigação de causas-raiz e comportamentos inesperados requer o Forensic Auditor Agent.' },
  DIAGNOSIS: { targetAgent: 'forensic', requiredCapability: 'FORENSIC_AUDITING', reason: 'Diagnóstico técnico e análise de anomalias requer o Forensic Auditor Agent.' },
  SECURITY: { targetAgent: 'forensic', requiredCapability: 'FORENSIC_AUDITING', reason: 'Auditoria de segurança e isolamento de portais requer o Forensic Auditor Agent.' },

  // QA (QUALITY_ASSURANCE)
  QA: { targetAgent: 'qa', requiredCapability: 'QUALITY_ASSURANCE', reason: 'Execução e validação de testes automatizados requerem o QA Agent.' },
  TEST: { targetAgent: 'qa', requiredCapability: 'QUALITY_ASSURANCE', reason: 'Execução de suítes de testes requer o QA Agent.' },
  TESTING: { targetAgent: 'qa', requiredCapability: 'QUALITY_ASSURANCE', reason: 'Testes de integração e unidade requerem o QA Agent.' },
  VERIFICATION: { targetAgent: 'qa', requiredCapability: 'QUALITY_ASSURANCE', reason: 'Verificação de critérios de aceitação requer o QA Agent.' },

  // Android Player & Hardware Specialist (ANDROID_ENGINEERING)
  ANDROID_ENGINEERING: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Engenharia de Android Player, builds Gradle e releases requerem o Android Engineer Agent.' },
  ANDROID: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Tarefas de desenvolvimento Android requerem o Android Engineer Agent.' },
  PLAYER: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Engenharia de Player nativo e hardware requerem o Android Engineer Agent.' },
  OTA: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Distribuição e releases OTA requerem o Android Engineer Agent.' },
  CANARY: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Homologação e testes canary no Player requerem o Android Engineer Agent.' },
  HARDWARE: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Pareamento de hardware e displays requerem o Android Engineer Agent.' },
  EXOPLAYER: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Engine de mídia e reprodução ExoPlayer requerem o Android Engineer Agent.' },
  GRADLE_BUILD: { targetAgent: 'android_engineer', requiredCapability: 'ANDROID_ENGINEERING', reason: 'Compilação de APKs e pipelines Gradle requerem o Android Engineer Agent.' },

  // Orchestrator (TASK_ORCHESTRATION)
  GENERAL_ORCHESTRATION: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Coordenação e orquestração central requerem o Orchestrator Agent.' },
  ORCHESTRATION: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Coordenação central de fluxo requer o Orchestrator Agent.' },
  DEPLOYMENT: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Coordenação de release e deployment requer o Orchestrator Agent.' },
  NON_PROJECT: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Tarefas não vinculadas a workspace requerem o Orchestrator Agent.' },
  CONCEPTUAL: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Análise puramente conceitual requer o Orchestrator Agent.' },
  TEXT_ONLY: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Tarefas exclusivamente textuais requerem o Orchestrator Agent.' },
  CONVERSATION: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Interação e diálogo operacional requerem o Orchestrator Agent.' },
  GENERAL: { targetAgent: 'orchestrator', requiredCapability: 'TASK_ORCHESTRATION', reason: 'Coordenação geral de tarefas requer o Orchestrator Agent.' }
};

const KEYWORD_ROUTING_RULES = [
  {
    type: 'ANDROID_ENGINEERING',
    keywords: ['android', 'player', 'apk', 'gradle', 'ota', 'exoplayer', 'canary', 'tvbox', 'pairing'],
    targetAgent: 'android_engineer',
    requiredCapability: 'ANDROID_ENGINEERING',
    reason: 'Tarefas de Android Player, APK, Gradle, OTA e hardware requerem o Android Engineer Agent.'
  },
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
  static routeTask(task, options = {}) {
    if (!task || !task.objective) {
      throw new Error('[ROUTER ERROR]: Tarefa inválida ou sem objetivo definido.');
    }

    const text = `${task.task_id || ''} ${task.task_type || task.type || ''} ${task.objective} ${task.context || ''}`.toLowerCase();
    const isProjectAware = DiscoveryPolicy.isProjectAware(task);
    const discoveryPolicy = DiscoveryPolicy.evaluate(task);

    let discoveredTargets = options.discovered_targets || null;
    if (!discoveredTargets && isProjectAware && task.workspace_root) {
      try {
        discoveredTargets = TargetDiscovery.discoverTargets(task, task.workspace_root);
      } catch {
        discoveredTargets = null;
      }
    }

    // 1. Agente explicitamente solicitado na tarefa (precedência máxima de autoridade com validação estrita)
    const explicitAgentId = task.preferred_agent || task.agent_id || task.agent;
    if (explicitAgentId && typeof explicitAgentId === 'string' && explicitAgentId.trim().length > 0) {
      const cleanExplicit = explicitAgentId.trim();
      const agent = registry.getAgent(cleanExplicit);

      if (!agent) {
        throw new Error(`[ROUTER ERROR]: Agente explicitamente solicitado '${cleanExplicit}' não está registrado no Registry.`);
      }

      if (agent.status !== 'ACTIVE') {
        throw new Error(`[ROUTER ERROR]: Agente explicitamente solicitado '${cleanExplicit}' não está ativo (status: ${agent.status}).`);
      }

      const eligibility = registry.isEligibleForTask(cleanExplicit, task);
      if (!eligibility.eligible) {
        throw new Error(`[ROUTER ERROR]: Agente explicitamente solicitado '${cleanExplicit}' não é elegível para a tarefa: ${eligibility.reason}`);
      }

      const requiredCaps = Array.isArray(task.required_capabilities) && task.required_capabilities.length > 0
        ? [...task.required_capabilities]
        : (agent.capabilities || []);

      return {
        task_id: task.task_id,
        classification: task.task_type || task.type || 'EXPLICIT_AGENT_ASSIGNMENT',
        selected_agent: agent.agent_id,
        reason: `Roteamento por atribuição explícita de agente: '${cleanExplicit}'. Elegibilidade e capacidades verificadas no Registry.`,
        required_skills: agent.skills || [],
        required_capabilities: requiredCaps,
        is_project_aware: isProjectAware,
        discovery_policy: discoveryPolicy,
        discovered_targets: discoveredTargets
      };
    }

    // 2. Roteamento por tipo explícito de tarefa
    const rawType = task.task_type || task.type;
    if (rawType && typeof rawType === 'string') {
      const normType = rawType.trim().toUpperCase();
      const typeRule = TASK_TYPE_ROUTING[normType];

      if (typeRule) {
        const agent = registry.getAgent(typeRule.targetAgent);
        const requiredCaps = [typeRule.requiredCapability];
        if (Array.isArray(task.required_capabilities)) {
          for (const c of task.required_capabilities) {
            if (!requiredCaps.includes(c)) requiredCaps.push(c);
          }
        }

        const eligibility = registry.isEligibleForTask(typeRule.targetAgent, {
          ...task,
          required_capabilities: requiredCaps
        });

        if (!eligibility.eligible) {
          throw new Error(`[ROUTER ERROR]: Agente '${typeRule.targetAgent}' mapeado para o tipo '${normType}' não é elegível para a tarefa: ${eligibility.reason}`);
        }

        return {
          task_id: task.task_id,
          classification: normType,
          selected_agent: typeRule.targetAgent,
          reason: `Roteamento por tipo canônico de tarefa: '${normType}'. ${typeRule.reason}`,
          required_skills: agent ? agent.skills : [],
          required_capabilities: requiredCaps,
          is_project_aware: isProjectAware,
          discovery_policy: discoveryPolicy,
          discovered_targets: discoveredTargets
        };
      }
    }

    // 3. Roteamento por palavras-chave de domínio
    for (const rule of KEYWORD_ROUTING_RULES) {
      const match = rule.keywords.some(kw => text.includes(kw));
      if (match) {
        const agent = registry.getAgent(rule.targetAgent);
        const requiredCaps = [rule.requiredCapability];
        if (Array.isArray(task.required_capabilities)) {
          for (const c of task.required_capabilities) {
            if (!requiredCaps.includes(c)) requiredCaps.push(c);
          }
        }

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
            discovery_policy: discoveryPolicy,
            discovered_targets: discoveredTargets
          };
        }
      }
    }

    // 4. Se a tarefa declarou required_capabilities explícitas, procurar agente elegível no Registry
    if (Array.isArray(task.required_capabilities) && task.required_capabilities.length > 0) {
      const allAgents = registry.listAgents().filter(a => a.status === 'ACTIVE');
      const candidate = allAgents.find(a => {
        const elig = registry.isEligibleForTask(a.agent_id, task);
        return elig.eligible;
      });

      if (candidate) {
        return {
          task_id: task.task_id,
          classification: 'CAPABILITY_MATCH',
          selected_agent: candidate.agent_id,
          reason: `Roteamento por correspondência estrita de capacidades exigidas: [${task.required_capabilities.join(', ')}].`,
          required_skills: candidate.skills || [],
          required_capabilities: task.required_capabilities,
          is_project_aware: isProjectAware,
          discovery_policy: discoveryPolicy,
          discovered_targets: discoveredTargets
        };
      } else {
        throw new Error(`[ROUTER ERROR]: Nenhum agente no Registry é elegível para as capacidades exigidas: [${task.required_capabilities.join(', ')}].`);
      }
    }

    // 5. Descoberta Canônica de Capacidades (Data-Driven Capability Discovery)
    try {
      const capResult = CapabilityDiscovery.discoverCapabilities(task, {
        workspace_root: task.workspace_root,
        discovered_targets: discoveredTargets
      });

      if (capResult && capResult.recommended_agent && capResult.recommended_agent !== 'orchestrator') {
        const agent = registry.getAgent(capResult.recommended_agent);
        if (agent && agent.status === 'ACTIVE') {
          return {
            task_id: task.task_id,
            classification: `CAPABILITY_${capResult.primary_capability}`,
            selected_agent: agent.agent_id,
            reason: `Roteamento por descoberta dinâmica de capacidades: '${capResult.primary_capability}'. Agente recomendado: ${agent.name}.`,
            required_skills: agent.skills || [],
            required_capabilities: capResult.matched_capabilities,
            is_project_aware: isProjectAware,
            discovery_policy: discoveryPolicy,
            discovered_targets: discoveredTargets,
            capability_discovery: capResult
          };
        }
      }
    } catch {
      // Fallback seguro caso discovery falhe
    }

    // 6. Fallback seguro para Orchestrator (Coordenação Central)
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
      discovery_policy: discoveryPolicy,
      discovered_targets: discoveredTargets
    };
  }
}

