import { WorkflowStatus } from '../types/workflow.types';
import { CrmRole } from '../types/rbac.types';

// Tabela estrita de transições permitidas (State Machine)
export const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  PROSPECT: ['PROPOSTA_GERADA', 'CANCELADO'],
  PROPOSTA_GERADA: ['AGUARDANDO_ASSINATURA', 'PROSPECT', 'CANCELADO'],
  AGUARDANDO_ASSINATURA: ['AGUARDANDO_PAGAMENTO', 'PROPOSTA_GERADA', 'CANCELADO'],
  AGUARDANDO_PAGAMENTO: ['PAGAMENTO_CONFIRMADO', 'CANCELADO'],
  PAGAMENTO_CONFIRMADO: ['EM_PRODUCAO', 'CANCELADO'],
  EM_PRODUCAO: ['AGUARDANDO_APROVACAO', 'CANCELADO'],
  AGUARDANDO_APROVACAO: ['CAMPANHA_APROVADA', 'EM_PRODUCAO', 'CANCELADO'],
  CAMPANHA_APROVADA: ['CAMPANHA_ATIVA', 'CANCELADO'],
  CAMPANHA_ATIVA: ['CAMPANHA_FINALIZADA', 'CANCELADO'],
  CAMPANHA_FINALIZADA: [], // Estado final
  CANCELADO: [], // Estado final
};

// Permissões por Role para alterar Status específicos
export const ROLE_STATUS_PERMISSIONS: Record<WorkflowStatus, CrmRole[]> = {
  PROSPECT: ['ADMIN', 'GERENTE', 'REPRESENTANTE'],
  PROPOSTA_GERADA: ['ADMIN', 'GERENTE', 'REPRESENTANTE'],
  AGUARDANDO_ASSINATURA: ['ADMIN', 'GERENTE', 'REPRESENTANTE', 'CLIENTE'],
  AGUARDANDO_PAGAMENTO: ['ADMIN', 'GERENTE', 'REPRESENTANTE', 'CLIENTE'],
  PAGAMENTO_CONFIRMADO: ['ADMIN', 'FINANCEIRO'], // APENAS ADMIN E FINANCEIRO
  EM_PRODUCAO: ['ADMIN', 'GERENTE', 'DESIGNER'],
  AGUARDANDO_APROVACAO: ['ADMIN', 'GERENTE', 'DESIGNER'],
  CAMPANHA_APROVADA: ['ADMIN', 'GERENTE', 'CLIENTE'],
  CAMPANHA_ATIVA: ['ADMIN', 'GERENTE'],
  CAMPANHA_FINALIZADA: ['ADMIN', 'GERENTE'],
  CANCELADO: ['ADMIN', 'GERENTE', 'FINANCEIRO'],
};

export class ContractStateMachine {
  /**
   * Verifica se uma transição de status é válida de acordo com as regras de negócio
   */
  static canTransition(from: WorkflowStatus, to: WorkflowStatus, userRole: CrmRole): {
    allowed: boolean;
    reason?: string;
  } {
    // Admin tem override de transição (sujeito à auditoria)
    if (userRole === 'ADMIN') {
      return { allowed: true };
    }

    // 1. Verifica se a transição está na tabela estrita
    const validTargets = ALLOWED_TRANSITIONS[from] || [];
    if (!validTargets.includes(to)) {
      return {
        allowed: false,
        reason: `Não é permitido pular etapas. Transição inválida de ${from} para ${to}.`,
      };
    }

    // 2. Verifica se a Role do usuário possui permissão para o status de destino
    const allowedRoles = ROLE_STATUS_PERMISSIONS[to] || [];
    if (!allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        reason: `A função (${userRole}) não possui permissão para alterar o contrato para o status ${to}.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Obtém a lista de próximos status possíveis a partir do status atual
   */
  static getNextPossibleStatuses(current: WorkflowStatus, userRole: CrmRole): WorkflowStatus[] {
    const validTargets = ALLOWED_TRANSITIONS[current] || [];
    if (userRole === 'ADMIN') {
      return validTargets;
    }
    return validTargets.filter((targetStatus) => {
      const allowedRoles = ROLE_STATUS_PERMISSIONS[targetStatus] || [];
      return allowedRoles.includes(userRole);
    });
  }
}
