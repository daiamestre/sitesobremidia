import { TimelineEntry } from '../types/timeline.types';
import { WorkflowStatus } from '../types/workflow.types';
import { CrmRole } from '../types/rbac.types';

export class TimelineService {
  private timelineStore: TimelineEntry[] = [];

  /**
   * Adiciona uma nova entrada imutável na Timeline do contrato
   */
  async addEntry(params: {
    contratoId: string;
    userId: string;
    userNome: string;
    userRole: CrmRole;
    acao: string;
    descricao: string;
    statusAnterior?: WorkflowStatus;
    statusNovo?: WorkflowStatus;
    metadata?: Record<string, any>;
  }): Promise<TimelineEntry> {
    const newEntry: TimelineEntry = {
      id: `TL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      contratoId: params.contratoId,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      userNome: params.userNome,
      userRole: params.userRole,
      acao: params.acao,
      descricao: params.descricao,
      statusAnterior: params.statusAnterior,
      statusNovo: params.statusNovo,
      metadata: params.metadata,
    };

    this.timelineStore.push(newEntry);
    console.log(`[TimelineService.addEntry] Nova entrada adicionada para o contrato ${params.contratoId}:`, newEntry);
    return newEntry;
  }

  /**
   * Obtém o histórico completo e ordenado da Timeline de um contrato
   */
  async getTimelineByContrato(contratoId: string): Promise<TimelineEntry[]> {
    return this.timelineStore
      .filter((entry) => entry.contratoId === contratoId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

export const timelineService = new TimelineService();
