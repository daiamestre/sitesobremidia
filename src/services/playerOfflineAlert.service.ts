/**
 * SOBRE MÍDIA — ARQUITETURA DE TELEMETRIA E ALERTAS DE PLAYER OFFLINE
 * 
 * NOTA: Esta classe encapsula a lógica estrutural e o modelo de escalonamento para alertas
 * de Players sem alterar nenhuma funcionalidade do Player ou do hardware de exibição.
 */

export type PlayerOfflineEvent = 'PLAYER_OFFLINE' | 'PLAYER_ONLINE' | 'PLAYER_OFFLINE_ESCALATED';

export type EscalationLevel = 1 | 2 | 3 | 4; // 1: Operador, 2: Cliente/Unidade, 3: Representante, 4: Admin

export interface PlayerOfflineIncident {
  incidentId: string;
  playerId: string;
  screenId: string;
  screenCode: string;
  screenName: string;
  unidadeId?: string;
  clienteId?: string;
  representanteId?: string;
  lastCommunicationAt: string;
  offlineDurationMinutes: number;
  escalationLevel: EscalationLevel;
  notificationStatus: 'PENDING' | 'NOTIFIED' | 'ESCALATED' | 'RESOLVED';
  lastNotificationAt?: string;
}

export class PlayerOfflineAlertService {
  /**
   * Prepara o objeto de incidente ao detectar ausência de batimento sem disparar spams
   */
  createIncidentRecord(playerId: string, screenCode: string, screenName: string): PlayerOfflineIncident {
    return {
      incidentId: `inc-${crypto.randomUUID()}`,
      playerId,
      screenId: '',
      screenCode,
      screenName,
      lastCommunicationAt: new Date().toISOString(),
      offlineDurationMinutes: 15,
      escalationLevel: 1,
      notificationStatus: 'PENDING',
    };
  }

  /**
   * Determina se o incidente deve ser escalado com base na tolerância
   */
  shouldEscalate(incident: PlayerOfflineIncident, toleranceMinutes: number = 30): boolean {
    return incident.offlineDurationMinutes >= toleranceMinutes && incident.escalationLevel < 4;
  }

  /**
   * Eleva o nível de escalonamento
   */
  escalateLevel(incident: PlayerOfflineIncident): PlayerOfflineIncident {
    const nextLevel = Math.min(incident.escalationLevel + 1, 4) as EscalationLevel;
    return {
      ...incident,
      escalationLevel: nextLevel,
      notificationStatus: 'ESCALATED',
      lastNotificationAt: new Date().toISOString(),
    };
  }
}

export const playerOfflineAlertService = new PlayerOfflineAlertService();
