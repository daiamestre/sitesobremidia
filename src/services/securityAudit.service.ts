import { supabase } from '@/integrations/supabase/client';

export type SecurityEventType = 
  | 'LOGIN_FAILED'
  | 'LOGIN_SUCCESS'
  | 'LOGOUT'
  | 'REPRESENTATIVE_APPROVED'
  | 'PASSWORD_CHANGED'
  | 'ACCESS_DENIED';

export interface SecurityLogEntry {
  id?: string;
  event_type: SecurityEventType;
  user_email?: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, any>;
  timestamp: string;
}

class SecurityAuditService {
  private inMemoryLogs: SecurityLogEntry[] = [];

  /**
   * Registra evento de segurança no banco de dados (tabela security_logs) e no buffer de observabilidade
   */
  async logEvent(eventType: SecurityEventType, payload: {
    userEmail?: string;
    userId?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    const entry: SecurityLogEntry = {
      event_type: eventType,
      user_email: payload.userEmail,
      user_id: payload.userId,
      details: payload.details || {},
      timestamp: new Date().toISOString(),
      user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server/Vitest',
    };

    this.inMemoryLogs.push(entry);
    console.info(`[SecurityAudit] [${eventType}]`, entry);

    try {
      await supabase
        .from('security_logs')
        .insert({
          event_type: entry.event_type,
          user_email: entry.user_email || null,
          user_id: entry.user_id || null,
          user_agent: entry.user_agent,
          details: entry.details,
          created_at: entry.timestamp,
        });
    } catch (err) {
      console.warn('[SecurityAudit] Não foi possível persistir log no Supabase:', err);
    }
  }

  /**
   * Consulta logs de segurança para relatórios e auditorias no NOC/Admin
   */
  async getLogs(eventTypeFilter?: SecurityEventType): Promise<SecurityLogEntry[]> {
    try {
      let query = supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (eventTypeFilter) {
        query = query.eq('event_type', eventTypeFilter);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return this.inMemoryLogs.filter(e => !eventTypeFilter || e.event_type === eventTypeFilter);
      }
      return data as any;
    } catch {
      return this.inMemoryLogs.filter(e => !eventTypeFilter || e.event_type === eventTypeFilter);
    }
  }

  /**
   * Retorna os logs gravados em memória durante execuções de testes de segurança
   */
  getInMemoryLogs(): SecurityLogEntry[] {
    return [...this.inMemoryLogs];
  }

  clearInMemoryLogs(): void {
    this.inMemoryLogs = [];
  }
}

export const securityAuditService = new SecurityAuditService();
