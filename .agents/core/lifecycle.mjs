/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Lifecycle
 * Máquina de estados determinística e controle rigoroso de transições.
 */

import { VALID_LIFECYCLE_STATES } from './contracts.mjs';

const ALLOWED_TRANSITIONS = {
  CREATED: ['READY', 'BLOCKED', 'FAILED'],
  READY: ['RUNNING', 'BLOCKED', 'FAILED'],
  RUNNING: ['WAITING', 'COMPLETED', 'FAILED', 'BLOCKED'],
  WAITING: ['RUNNING', 'FAILED', 'BLOCKED'],
  COMPLETED: [], // Estado terminal
  FAILED: ['READY'], // Permite retry explícito
  BLOCKED: ['READY', 'FAILED'] // Permite desbloqueio explícito
};

export class AgentLifecycle {
  constructor(initialState = 'CREATED', entityId = 'anonymous') {
    if (!VALID_LIFECYCLE_STATES.includes(initialState)) {
      throw new Error(`[LIFECYCLE ERROR]: Estado inicial inválido '${initialState}'.`);
    }
    this.entityId = entityId;
    this.currentState = initialState;
    this.history = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        reason: 'Estado inicial criado'
      }
    ];
  }

  getState() {
    return this.currentState;
  }

  getHistory() {
    return [...this.history];
  }

  transitionTo(nextState, reason = '') {
    if (!VALID_LIFECYCLE_STATES.includes(nextState)) {
      throw new Error(`[LIFECYCLE ERROR]: Estado de destino inválido '${nextState}'.`);
    }

    const allowed = ALLOWED_TRANSITIONS[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(
        `[LIFECYCLE ERROR]: Transição ilegal de '${this.currentState}' para '${nextState}' na entidade '${this.entityId}'. Permitidas: [${allowed.join(', ')}].`
      );
    }

    this.currentState = nextState;
    this.history.push({
      state: nextState,
      timestamp: new Date().toISOString(),
      reason: reason || `Transição para ${nextState}`
    });

    return this.currentState;
  }

  isTerminal() {
    return this.currentState === 'COMPLETED';
  }
}
