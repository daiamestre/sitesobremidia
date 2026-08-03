import { AuditLogEntry } from '../types/audit.types';
import { CrmRole } from '../types/rbac.types';

export class AuditService {
  private auditStore: AuditLogEntry[] = [];

  /**
   * Registra um log de auditoria detalhado no sistema
   */
  async log(params: {
    userId: string;
    userEmail: string;
    userRole: CrmRole;
    entidadeTipo: 'contrato' | 'cliente' | 'empresa' | 'campanha' | 'financeiro' | 'usuario';
    entidadeId: string;
    acao: string;
    statusAnterior?: string;
    statusNovo?: string;
    observacoes?: string;
    dadosAlterados?: Record<string, any>;
  }): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      dataHora: new Date().toISOString(),
      userId: params.userId,
      userEmail: params.userEmail,
      userRole: params.userRole,
      entidadeTipo: params.entidadeTipo,
      entidadeId: params.entidadeId,
      acao: params.acao,
      statusAnterior: params.statusAnterior,
      statusNovo: params.statusNovo,
      observacoes: params.observacoes,
      dadosAlterados: params.dadosAlterados,
    };

    this.auditStore.push(entry);
    console.log(`[AuditService.log] Log registrado:`, entry);
    return entry;
  }

  /**
   * Busca registros de auditoria por entidade ou usuário
   */
  async getAuditLogs(filter?: { entidadeTipo?: string; entidadeId?: string; userId?: string }): Promise<AuditLogEntry[]> {
    return this.auditStore.filter((entry) => {
      if (filter?.entidadeTipo && entry.entidadeTipo !== filter.entidadeTipo) return false;
      if (filter?.entidadeId && entry.entidadeId !== filter.entidadeId) return false;
      if (filter?.userId && entry.userId !== filter.userId) return false;
      return true;
    });
  }
}

export const auditService = new AuditService();
