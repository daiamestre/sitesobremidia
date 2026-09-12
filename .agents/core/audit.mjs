/**
 * SOBRE MÍDIA AI Engineering System — Runtime Audit Trail & Observability
 * Registro estruturado, persistente, append-only e consultável de todas as ações operacionais.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAuditTrailEvent, deepFreeze } from './contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auditDir = path.resolve(__dirname, '..', 'memory', 'audit');
const auditLogFile = path.join(auditDir, 'audit_trail.jsonl');

export class AuditTrailLogger {
  constructor(logFilePath = auditLogFile) {
    this.logFilePath = logFilePath;
    this.inMemoryEvents = [];
    this._ensureDirectory();
  }

  _ensureDirectory() {
    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Registra um evento de auditoria operacional no audit trail.
   */
  recordEvent({
    event_type,
    task_id,
    execution_id = 'SYSTEM',
    agent_id = 'SYSTEM',
    skill_id = null,
    action = null,
    permission_decision = null,
    evidence = [],
    handoff_id = null,
    status = 'INFO',
    error = null,
    duration_ms = 0,
    metadata = {}
  }) {
    const event = {
      event_id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      event_type,
      task_id,
      execution_id,
      agent_id,
      skill_id,
      action,
      permission_decision,
      evidence: Array.isArray(evidence) ? evidence : (evidence ? [evidence] : []),
      handoff_id,
      status,
      error,
      duration_ms,
      metadata
    };

    const errors = validateAuditTrailEvent(event);
    if (errors.length > 0) {
      throw new Error(`[AUDIT TRAIL ERROR]: Evento inválido: ${errors.join(', ')}`);
    }

    const frozenEvent = deepFreeze(event);
    this.inMemoryEvents.push(frozenEvent);

    try {
      this._ensureDirectory();
      fs.appendFileSync(this.logFilePath, JSON.stringify(frozenEvent) + '\n', 'utf8');
    } catch {
      // Falha silenciosa de persistência em disco não deve derrubar o runtime em memória
    }

    return frozenEvent;
  }

  getEventsForTask(taskId) {
    if (!taskId) return [];
    return this.inMemoryEvents.filter(e => e.task_id === taskId);
  }

  getEventsForExecution(executionId) {
    if (!executionId) return [];
    return this.inMemoryEvents.filter(e => e.execution_id === executionId);
  }

  getEventsByType(eventType) {
    if (!eventType) return [];
    return this.inMemoryEvents.filter(e => e.event_type === eventType);
  }

  listEvents(limit = 100) {
    return this.inMemoryEvents.slice(-limit);
  }

  clear() {
    this.inMemoryEvents = [];
    if (fs.existsSync(this.logFilePath)) {
      try {
        fs.unlinkSync(this.logFilePath);
      } catch {
        // Ignora se não for possível deletar
      }
    }
  }
}

export const auditLogger = new AuditTrailLogger();
