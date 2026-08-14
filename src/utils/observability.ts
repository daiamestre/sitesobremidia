export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

export interface StructuredLog {
  id: string;
  correlationId: string;
  timestamp: string;
  level: LogLevel;
  category: 'CRM' | 'CONTRATOS' | 'PI' | 'PRODUCAO' | 'AGENDAMENTO' | 'PLAYER' | 'NOC';
  message: string;
  details?: Record<string, any>;
}

class ObservabilityManager {
  private logs: StructuredLog[] = [];

  logStructuredEvent(
    category: StructuredLog['category'],
    level: LogLevel,
    message: string,
    correlationId?: string,
    details?: Record<string, any>
  ): StructuredLog {
    const log: StructuredLog = {
      id: `log-${crypto.randomUUID()}`,
      correlationId: correlationId || `corr-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: details || {},
    };

    this.logs.push(log);
    console.log(`[NOC OBSERVABILITY] [${log.level}] [${log.category}] [Corr: ${log.correlationId}] ${log.message}`);
    return log;
  }

  correlateEvents(correlationId: string): StructuredLog[] {
    return this.logs.filter((l) => l.correlationId === correlationId);
  }

  getRecentLogs(limit: number = 50): StructuredLog[] {
    return this.logs.slice(-limit);
  }
}

export const observability = new ObservabilityManager();
