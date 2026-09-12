/**
 * SOBRE MÍDIA AI Engineering System — High-Risk & Skill Dependency Governance
 * Governança de operações de alto risco (Human-in-the-Loop) e integridade de dependências de skills.
 */

import {
  VALID_HIGH_RISK_OPERATIONS,
  validateHighRiskApprovalRequest,
  validateSkillDependency,
  deepFreeze
} from './contracts.mjs';

/**
 * Governança de Operações de Alto Risco.
 * Impede mutações destrutivas ou de produção sem aprovação formal.
 */
export class HighRiskGovernance {
  constructor() {
    this.approvalRequests = new Map();
  }

  /**
   * Avalia se uma operação é de alto risco.
   */
  static isHighRiskOperation(operationType, targetResource = '') {
    if (VALID_HIGH_RISK_OPERATIONS.includes(operationType)) {
      return true;
    }

    const lowerTarget = String(targetResource).toLowerCase();
    if (
      lowerTarget.includes('drop table') ||
      lowerTarget.includes('drop schema') ||
      lowerTarget.includes('drop database') ||
      lowerTarget.includes('truncate') ||
      lowerTarget.includes('rm -rf') ||
      lowerTarget.includes('git reset --hard') ||
      lowerTarget.includes('git clean -fd') ||
      lowerTarget.includes('git push --force') ||
      lowerTarget.includes('git push -f')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Registra uma solicitação de aprovação para operação de alto risco.
   */
  requestApproval({
    request_id,
    task_id,
    agent_id,
    operation_type,
    target_resource,
    description = ''
  }) {
    const reqId = request_id || `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const request = {
      request_id: reqId,
      task_id,
      agent_id,
      operation_type,
      target_resource,
      description,
      status: 'PENDING_APPROVAL',
      created_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null
    };

    const errors = validateHighRiskApprovalRequest(request);
    if (errors.length > 0) {
      throw new Error(`[HIGH-RISK GOVERNANCE ERROR]: Solicitação inválida: ${errors.join(', ')}`);
    }

    this.approvalRequests.set(reqId, request);
    return deepFreeze({ ...request });
  }

  /**
   * Aprova uma operação de alto risco.
   */
  approve(requestId, approverId = 'HUMAN_SUPERVISOR') {
    if (!this.approvalRequests.has(requestId)) {
      throw new Error(`[HIGH-RISK GOVERNANCE ERROR]: Solicitação '${requestId}' não encontrada.`);
    }

    const req = this.approvalRequests.get(requestId);
    if (req.status !== 'PENDING_APPROVAL') {
      throw new Error(`[HIGH-RISK GOVERNANCE ERROR]: Solicitação '${requestId}' não está pendente (status: ${req.status}).`);
    }

    req.status = 'APPROVED';
    req.approved_by = approverId;
    req.approved_at = new Date().toISOString();

    return deepFreeze({ ...req });
  }

  /**
   * Rejeita uma operação de alto risco.
   */
  reject(requestId, rejectorId = 'HUMAN_SUPERVISOR', reason = 'Rejeitado por política de segurança') {
    if (!this.approvalRequests.has(requestId)) {
      throw new Error(`[HIGH-RISK GOVERNANCE ERROR]: Solicitação '${requestId}' não encontrada.`);
    }

    const req = this.approvalRequests.get(requestId);
    if (req.status !== 'PENDING_APPROVAL') {
      throw new Error(`[HIGH-RISK GOVERNANCE ERROR]: Solicitação '${requestId}' não está pendente (status: ${req.status}).`);
    }

    req.status = 'REJECTED';
    req.rejected_by = rejectorId;
    req.rejected_at = new Date().toISOString();
    req.rejection_reason = reason;

    return deepFreeze({ ...req });
  }

  /**
   * Verifica se a execução está formalmente autorizada.
   */
  canExecute(requestId) {
    if (!requestId || !this.approvalRequests.has(requestId)) {
      return false;
    }
    const req = this.approvalRequests.get(requestId);
    return req.status === 'APPROVED';
  }

  /**
   * Garante fail-closed para operações de alto risco não autorizadas.
   */
  assertApproved(requestId, operationType = 'DESTRUCTIVE_DATABASE') {
    if (!this.canExecute(requestId)) {
      throw new Error(
        `[HIGH-RISK SECURITY VIOLATION]: Operação de alto risco '${operationType}' bloqueada fail-closed. Solicitação '${requestId || 'SEM_ID'}' não aprovada.`
      );
    }
    return true;
  }

  reset() {
    this.approvalRequests.clear();
  }
}

/**
 * Governança de Dependências entre Skills.
 * Proíbe dependências circulares, dependências não autorizadas e herança indevida de permissões.
 */
export class SkillDependencyGovernance {
  /**
   * Valida dependências e detecta ciclos no grafo de skills.
   */
  static validateSkillDependencies(dependencyMap = {}) {
    const errors = [];
    const visited = new Set();
    const recursionStack = new Set();

    function checkCycle(node) {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = dependencyMap[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (checkCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Ciclo detectado
        }
      }

      recursionStack.delete(node);
      return false;
    }

    for (const skillId of Object.keys(dependencyMap)) {
      if (!visited.has(skillId)) {
        if (checkCycle(skillId)) {
          errors.push(`Dependência circular detectada envolvendo a skill '${skillId}'.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Impede que a dependência de uma skill conceda capacidades ou permissões adicionais ao agente.
   */
  static assertNoPermissionEscalation(agent, skill, invokedDependency) {
    // A skill invocada via dependência NÃO pode ter mais ferramentas ou permissões que o agente possui
    if (invokedDependency && Array.isArray(invokedDependency.tools)) {
      for (const tool of invokedDependency.tools) {
        if (!agent.tools.includes(tool)) {
          throw new Error(
            `[SECURITY ESCALATION BLOCKED]: Dependência de skill '${invokedDependency.skill_id}' tenta conceder ferramenta não autorizada '${tool}' ao agente '${agent.agent_id}'.`
          );
        }
      }
    }
    return true;
  }
}

export const highRiskGovernance = new HighRiskGovernance();
