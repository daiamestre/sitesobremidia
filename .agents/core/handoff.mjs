/**
 * SOBRE MÍDIA AI Engineering System — Agent-to-Agent Handoff
 * Gestão, validação canônica e integridade de transferência de contexto entre especialistas.
 */

import path from 'path';
import { validateHandoffContract, validateAgentResult, deepFreeze } from './contracts.mjs';
import { registry } from './registry.mjs';

const consumedHandoffs = new Set();

export class HandoffManager {
  static createHandoffPayload({
    handoff_id,
    task_id,
    execution_id,
    source_execution_id,
    from,
    source_agent_id,
    to,
    destination_agent_id,
    status = 'READY',
    objective,
    completed_work,
    evidence = [],
    files_changed = [],
    tests_run = [],
    open_issues = [],
    constraints = [],
    next_action,
    workspace_root,
    result,
    created_at = new Date().toISOString()
  }) {
    const fromAgent = from || source_agent_id;
    const toAgent = to || destination_agent_id;
    const rawPayload = {
      handoff_id: handoff_id || `HND-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      task_id,
      execution_id: execution_id || source_execution_id,
      from: fromAgent,
      to: toAgent,
      source_agent_id: fromAgent,
      destination_agent_id: toAgent,
      status,
      objective,
      completed_work,
      evidence: Array.isArray(evidence) ? [...evidence] : [],
      files_changed: Array.isArray(files_changed) ? [...files_changed] : [],
      tests_run: Array.isArray(tests_run) ? [...tests_run] : [],
      open_issues: Array.isArray(open_issues) ? [...open_issues] : [],
      constraints: Array.isArray(constraints) ? [...constraints] : [],
      next_action,
      workspace_root,
      result: result ? (typeof result === 'object' ? { ...result } : result) : undefined,
      created_at
    };

    return deepFreeze(rawPayload);
  }

  static validateHandoff(handoffPayload, options = {}) {
    const errors = validateHandoffContract(handoffPayload);
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 1. Validar Especialista de Origem e Destino no Registry
    const fromId = String(handoffPayload.from || handoffPayload.source_agent_id).toLowerCase();
    const toId = String(handoffPayload.to || handoffPayload.destination_agent_id).toLowerCase();

    const destAgent = registry.getAgent(toId);
    if (!destAgent) {
      errors.push(`Especialista de destino '${handoffPayload.to}' não é um agente registrado no Registry.`);
    } else if (destAgent.status !== 'ACTIVE') {
      errors.push(`Especialista de destino '${destAgent.agent_id}' não está ativo (status: ${destAgent.status}).`);
    }

    // 2. Validar Capabilities Exigidas para o Destino (se especificadas)
    const requiredCaps = options.required_capabilities || handoffPayload.required_capabilities;
    if (destAgent && Array.isArray(requiredCaps) && requiredCaps.length > 0) {
      const destCaps = destAgent.capabilities || [];
      const missingCaps = requiredCaps.filter(c => !destCaps.includes(c));
      if (missingCaps.length > 0) {
        errors.push(`Especialista de destino '${destAgent.agent_id}' não possui as capabilities necessárias: ${missingCaps.join(', ')}.`);
      }
    }

    // 3. Validar Binding de Tarefa
    if (options.expected_task_id && handoffPayload.task_id !== options.expected_task_id) {
      errors.push(`Task mismatch: Handoff pertence à tarefa '${handoffPayload.task_id}', mas o destino está executando '${options.expected_task_id}'.`);
    }

    // 4. Validar Binding de Destino
    if (options.expected_destination && toId !== String(options.expected_destination).toLowerCase()) {
      errors.push(`Destination mismatch: Handoff endereçado a '${handoffPayload.to}', mas o agente receptor é '${options.expected_destination}'.`);
    }

    // 5. Validar Binding de Origem
    if (options.expected_source && fromId !== String(options.expected_source).toLowerCase()) {
      errors.push(`Source mismatch: Handoff provém de '${handoffPayload.from}', mas a origem esperada é '${options.expected_source}'.`);
    }

    // 6. Validar Binding de Workspace
    if (options.expected_workspace && handoffPayload.workspace_root) {
      const normHandoffWs = path.resolve(handoffPayload.workspace_root).replace(/\\/g, '/').toLowerCase();
      const normExpectedWs = path.resolve(options.expected_workspace).replace(/\\/g, '/').toLowerCase();
      if (normHandoffWs !== normExpectedWs) {
        errors.push(`Workspace mismatch: Handoff gerado no workspace '${handoffPayload.workspace_root}', mas o esperado é '${options.expected_workspace}'.`);
      }
    }

    // 7. Validar Evidências de Outro Agente / Tarefa / Execução / Workspace (Cross-Entity Evidence)
    if (Array.isArray(handoffPayload.evidence)) {
      for (let i = 0; i < handoffPayload.evidence.length; i++) {
        const ev = handoffPayload.evidence[i];
        if (ev && typeof ev === 'object') {
          if (ev.task_id && ev.task_id !== handoffPayload.task_id) {
            errors.push(`Cross-task evidence na evidência [${i}]: pertence à task '${ev.task_id}', mas handoff pertence a '${handoffPayload.task_id}'.`);
          }
          if (ev.source_agent_id && String(ev.source_agent_id).toLowerCase() !== fromId) {
            errors.push(`Foreign agent evidence na evidência [${i}]: gerada por '${ev.source_agent_id}', mas handoff provém de '${handoffPayload.from}'.`);
          }
          if (ev.agent_id && String(ev.agent_id).toLowerCase() !== fromId) {
            errors.push(`Foreign agent evidence na evidência [${i}]: gerada por '${ev.agent_id}', mas handoff provém de '${handoffPayload.from}'.`);
          }
          if (handoffPayload.execution_id && ev.execution_id && ev.execution_id !== handoffPayload.execution_id) {
            errors.push(`Cross-execution evidence na evidência [${i}]: pertence à execução '${ev.execution_id}', mas handoff pertence a '${handoffPayload.execution_id}'.`);
          }
          if (handoffPayload.workspace_root && ev.workspace_root) {
            const normHandoffWs = path.resolve(handoffPayload.workspace_root).replace(/\\/g, '/').toLowerCase();
            const normEvWs = path.resolve(ev.workspace_root).replace(/\\/g, '/').toLowerCase();
            if (normHandoffWs !== normEvWs) {
              errors.push(`Cross-workspace evidence na evidência [${i}]: pertence ao workspace '${ev.workspace_root}', mas handoff pertence a '${handoffPayload.workspace_root}'.`);
            }
          }
        }
      }
    }

    // 8. Validar AgentResult Anexo (se presente)
    if (handoffPayload.result) {
      const resErrors = validateAgentResult(handoffPayload.result);
      if (resErrors.length > 0) {
        errors.push(`AgentResult anexo inválido: ${resErrors.join(', ')}`);
      }
      if (handoffPayload.result.success === true && handoffPayload.status === 'BLOCKED') {
        errors.push(`Inconsistência de resultado: AgentResult declara success=true mas status do handoff é BLOCKED.`);
      }
      if (handoffPayload.result.task_id && handoffPayload.result.task_id !== handoffPayload.task_id) {
        errors.push(`Cross-task result: AgentResult pertence à task '${handoffPayload.result.task_id}', mas handoff pertence a '${handoffPayload.task_id}'.`);
      }
      if (handoffPayload.execution_id && handoffPayload.result.execution_id && handoffPayload.result.execution_id !== handoffPayload.execution_id) {
        errors.push(`Cross-execution result: AgentResult pertence à execução '${handoffPayload.result.execution_id}', mas handoff pertence a '${handoffPayload.execution_id}'.`);
      }
    }

    // 9. Validar Replay de Handoff
    if (!options.allow_replayed && consumedHandoffs.has(handoffPayload.handoff_id)) {
      errors.push(`Replay detectado: Handoff '${handoffPayload.handoff_id}' já foi consumido em execução anterior.`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static consumeHandoff(handoffId) {
    if (handoffId && typeof handoffId === 'string') {
      consumedHandoffs.add(handoffId);
    }
  }

  static isHandoffConsumed(handoffId) {
    return consumedHandoffs.has(handoffId);
  }

  static resetConsumedHandoffs() {
    consumedHandoffs.clear();
  }
}

