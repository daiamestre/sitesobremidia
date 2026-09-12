/**
 * SOBRE MÍDIA AI Engineering System — Skill Binding & Loader
 * Carregamento seguro, resolução canônica e isolamento de Skills autorizadas por agente.
 */

import { canonicalSkillRegistry } from './skill_registry.mjs';

export class SkillLoader {
  static loadSkillsForAgent(agent) {
    return canonicalSkillRegistry.resolveSkillsForAgent(agent);
  }
}

