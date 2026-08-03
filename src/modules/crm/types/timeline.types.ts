import { WorkflowStatus } from './workflow.types';
import { CrmRole } from './rbac.types';

export interface TimelineEntry {
  id: string;
  contratoId: string;
  timestamp: string; // ISO String
  userId: string;
  userNome: string;
  userRole: CrmRole;
  acao: string;
  descricao: string;
  statusAnterior?: WorkflowStatus;
  statusNovo?: WorkflowStatus;
  metadata?: Record<string, any>;
}
