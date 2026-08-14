import { supabase } from '@/integrations/supabase/client';
import { AuditLogEntry } from '../types/audit.types';
import { CrmRole } from '../types/rbac.types';

export class AuditService {
  /**
   * Registra um log de auditoria no banco de dados (auditoria_logs)
   * e mantém compatibilidade com a interface local (auditStore).
   */
  async log(params: {
    userId: string;
    userEmail: string;
    userRole: CrmRole;
    empresaOperadoraId?: string;
    entidadeTipo: string;
    entidadeId: string;
    acao: string;
    statusAnterior?: string;
    statusNovo?: string;
    observacoes?: string;
    dadosAlterados?: Record<string, any>;
  }): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: `AUD-${crypto.randomUUID()}`,
      dataHora: new Date().toISOString(),
      userId: params.userId,
      userEmail: params.userEmail,
      userRole: params.userRole,
      entidadeTipo: params.entidadeTipo as AuditLogEntry['entidadeTipo'],
      entidadeId: params.entidadeId,
      acao: params.acao,
      statusAnterior: params.statusAnterior,
      statusNovo: params.statusNovo,
      observacoes: params.observacoes,
      dadosAlterados: params.dadosAlterados,
    };

    // Persiste no banco de dados (fire-and-forget, não bloqueia o fluxo principal)
    try {
      const { error } = await supabase.from('auditoria_logs').insert({
        empresa_operadora_id: params.empresaOperadoraId || null,
        usuario_id: params.userId,
        usuario_email: params.userEmail,
        usuario_role: params.userRole,
        entidade_tipo: params.entidadeTipo,
        entidade_id: params.entidadeId,
        acao: params.acao,
        status_anterior: params.statusAnterior || null,
        status_novo: params.statusNovo || null,
        valor_novo: params.dadosAlterados ? JSON.stringify(params.dadosAlterados) : null,
        observacoes: params.observacoes || null,
      });
      if (error) {
        console.error('[AuditService] Erro ao persistir auditoria:', error);
      }
    } catch (err) {
      console.error('[AuditService] Falha ao persistir auditoria:', err);
    }

    console.log(`[AuditService.log] Log registrado:`, entry);
    return entry;
  }

  /**
   * Busca registros de auditoria por entidade ou usuário (do Supabase)
   */
  async getAuditLogs(filter?: {
    entidadeTipo?: string;
    entidadeId?: string;
    userId?: string;
    empresaOperadoraId?: string;
  }): Promise<AuditLogEntry[]> {
    try {
      let query = supabase
        .from('auditoria_logs')
        .select('*')
        .order('data_hora', { ascending: false })
        .limit(200);

      if (filter?.entidadeTipo) query = query.eq('entidade_tipo', filter.entidadeTipo);
      if (filter?.entidadeId) query = query.eq('entidade_id', filter.entidadeId);
      if (filter?.userId) query = query.eq('usuario_id', filter.userId);
      if (filter?.empresaOperadoraId) query = query.eq('empresa_operadora_id', filter.empresaOperadoraId);

      const { data, error } = await query;
      if (error) {
        console.error('[AuditService] Erro ao buscar auditoria:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: `AUD-${row.id}`,
        dataHora: row.data_hora,
        userId: row.usuario_id,
        userEmail: row.usuario_email,
        userRole: row.usuario_role as CrmRole,
        entidadeTipo: row.entidade_tipo,
        entidadeId: row.entidade_id,
        acao: row.acao,
        statusAnterior: row.status_anterior,
        statusNovo: row.status_novo,
        observacoes: row.observacoes,
        dadosAlterados: row.valor_novo ? JSON.parse(row.valor_novo) : undefined,
      }));
    } catch (err) {
      console.error('[AuditService] Falha ao buscar auditoria:', err);
      return [];
    }
  }
}

export const auditService = new AuditService();
