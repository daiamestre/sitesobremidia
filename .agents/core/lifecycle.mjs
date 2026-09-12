/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Lifecycle
 * Máquina de estados determinística e controle rigoroso de transições.
 */

import {
  VALID_LIFECYCLE_STATES,
  VALID_TASK_LIFECYCLE_STATES,
  VALID_SKILL_LIFECYCLE_STATES
} from './contracts.mjs';

const ALLOWED_AGENT_TRANSITIONS = {
  CREATED: ['READY', 'BLOCKED', 'FAILED'],
  READY: ['RUNNING', 'BLOCKED', 'FAILED'],
  RUNNING: ['WAITING', 'COMPLETED', 'FAILED', 'BLOCKED'],
  WAITING: ['RUNNING', 'FAILED', 'BLOCKED'],
  COMPLETED: [], // Estado terminal
  FAILED: ['READY'], // Permite retry explícito
  BLOCKED: ['READY', 'FAILED'] // Permite desbloqueio explícito
};

const ALLOWED_TASK_TRANSITIONS = {
  RECEIVED: ['NORMALIZED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  NORMALIZED: ['ROUTED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  ROUTED: ['PLANNED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  PLANNED: ['EXECUTING', 'BLOCKED', 'FAILED', 'CANCELLED'],
  EXECUTING: ['HANDOFF', 'COMPLETING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  HANDOFF: ['EXECUTING', 'COMPLETING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  COMPLETING: ['COMPLETED', 'FAILED', 'BLOCKED'],
  COMPLETED: [], // Estado terminal imutável
  FAILED: ['RECEIVED', 'NORMALIZED', 'PLANNED'], // Retryable explicitamente
  BLOCKED: ['NORMALIZED', 'ROUTED', 'PLANNED', 'EXECUTING', 'FAILED', 'CANCELLED'],
  CANCELLED: [] // Estado terminal imutável
};

const ALLOWED_SKILL_TRANSITIONS = {
  DISCOVERED: ['REGISTERED', 'DISABLED', 'DEPRECATED'],
  REGISTERED: ['VALIDATED', 'DISABLED', 'DEPRECATED'],
  VALIDATED: ['ENABLED', 'DISABLED', 'DEPRECATED'],
  ENABLED: ['AVAILABLE', 'EXECUTABLE', 'DISABLED', 'DEPRECATED'],
  AVAILABLE: ['EXECUTABLE', 'DISABLED', 'DEPRECATED'],
  EXECUTABLE: ['AVAILABLE', 'DISABLED', 'DEPRECATED', 'RETIRED'],
  DISABLED: ['ENABLED', 'DEPRECATED', 'RETIRED'],
  DEPRECATED: ['RETIRED', 'DISABLED'],
  RETIRED: [] // Estado terminal
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

    const allowed = ALLOWED_AGENT_TRANSITIONS[this.currentState] || [];
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

export class TaskLifecycle {
  constructor(initialState = 'RECEIVED', taskId = 'anonymous_task') {
    if (!VALID_TASK_LIFECYCLE_STATES.includes(initialState)) {
      throw new Error(`[TASK LIFECYCLE ERROR]: Estado inicial inválido '${initialState}'.`);
    }
    this.taskId = taskId;
    this.currentState = initialState;
    this.history = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        reason: 'Tarefa recebida no intake'
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
    if (!VALID_TASK_LIFECYCLE_STATES.includes(nextState)) {
      throw new Error(`[TASK LIFECYCLE ERROR]: Estado de destino inválido '${nextState}'.`);
    }

    const allowed = ALLOWED_TASK_TRANSITIONS[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(
        `[TASK LIFECYCLE ERROR]: Transição ilegal de '${this.currentState}' para '${nextState}' na tarefa '${this.taskId}'. Permitidas: [${allowed.join(', ')}].`
      );
    }

    this.currentState = nextState;
    this.history.push({
      state: nextState,
      timestamp: new Date().toISOString(),
      reason: reason || `Transição da tarefa para ${nextState}`
    });

    return this.currentState;
  }

  isTerminal() {
    return this.currentState === 'COMPLETED' || this.currentState === 'CANCELLED';
  }
}

export class SkillLifecycle {
  constructor(initialState = 'DISCOVERED', skillId = 'anonymous_skill') {
    if (!VALID_SKILL_LIFECYCLE_STATES.includes(initialState)) {
      throw new Error(`[SKILL LIFECYCLE ERROR]: Estado inicial inválido '${initialState}'.`);
    }
    this.skillId = skillId;
    this.currentState = initialState;
    this.history = [
      {
        state: initialState,
        timestamp: new Date().toISOString(),
        reason: 'Skill descoberta no registry'
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
    if (!VALID_SKILL_LIFECYCLE_STATES.includes(nextState)) {
      throw new Error(`[SKILL LIFECYCLE ERROR]: Estado de destino inválido '${nextState}'.`);
    }

    const allowed = ALLOWED_SKILL_TRANSITIONS[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(
        `[SKILL LIFECYCLE ERROR]: Transição ilegal de '${this.currentState}' para '${nextState}' na skill '${this.skillId}'. Permitidas: [${allowed.join(', ')}].`
      );
    }

    this.currentState = nextState;
    this.history.push({
      state: nextState,
      timestamp: new Date().toISOString(),
      reason: reason || `Transição da skill para ${nextState}`
    });

    return this.currentState;
  }

  isExecutable() {
    return this.currentState === 'EXECUTABLE' || this.currentState === 'AVAILABLE' || this.currentState === 'ENABLED';
  }

  isTerminal() {
    return this.currentState === 'RETIRED';
  }
}

