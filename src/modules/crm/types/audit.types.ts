import { CrmRole } from './rbac.types';

export interface AuditLogEntry {
  id: string;
  dataHora: string; // ISO String
  userId: string;
  userEmail: string;
  userRole: CrmRole;
  entidadeTipo: 'contrato' | 'cliente' | 'empresa' | 'campanha' | 'financeiro' | 'usuario';
  entidadeId: string;
  acao: string;
  statusAnterior?: string;
  statusNovo?: string;
  ipAddress?: string;
  userAgent?: string;
  observacoes?: string;
  dadosAlterados?: Record<string, unknown>;
}
