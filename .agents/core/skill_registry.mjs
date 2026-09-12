/**
 * SOBRE MÍDIA AI Engineering System — Canonical Skill Registry & Resolver
 * Descoberta unificada, resolução determinística e entrega de conteúdo de Skills.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');

export const CANONICAL_SKILL_ROOTS = [
  path.resolve(workspaceRoot, '.agents', 'skills'),
  path.resolve(workspaceRoot, '.opencode', 'skills')
];

export class CanonicalSkillRegistry {
  constructor(roots = CANONICAL_SKILL_ROOTS) {
    this.roots = roots;
    this.discoveredSkills = new Map();
    this.discoverSkills();
  }

  /**
   * Varre todas as raízes canônicas e descobre todas as Skills disponíveis.
   * Não duplica Skills: a primeira raiz em ordem de prioridade tem precedência.
   */
  discoverSkills() {
    this.discoveredSkills.clear();

    for (const rootPath of this.roots) {
      if (!fs.existsSync(rootPath)) continue;

      const entries = fs.readdirSync(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillId = entry.name;
          // Prevenção de duplicação: se já descoberto em raiz anterior, preserva
          if (this.discoveredSkills.has(skillId)) continue;

          const skillDocPath = path.join(rootPath, skillId, 'SKILL.md');
          if (fs.existsSync(skillDocPath)) {
            const rawContent = fs.readFileSync(skillDocPath, 'utf8');
            const metadata = this._parseFrontmatter(rawContent, skillId);

            this.discoveredSkills.set(skillId, {
              skill_id: skillId,
              name: metadata.name,
              version: metadata.version, // null se não houver versionamento explícito
              description: metadata.description,
              dependencies: metadata.dependencies || [],
              status: metadata.status || 'AVAILABLE',
              source_path: skillDocPath,
              content: null,
              load_status: 'DISCOVERED'
            });
          }
        }
      }
    }

    return Array.from(this.discoveredSkills.values());
  }

  setSkillStatus(skillId, status) {
    if (!this.hasSkill(skillId)) {
      return false;
    }
    const skill = this.discoveredSkills.get(skillId);
    skill.status = status;
    return true;
  }

  getSkillStatus(skillId) {
    if (!this.hasSkill(skillId)) return null;
    return this.discoveredSkills.get(skillId).status || 'AVAILABLE';
  }

  isSkillExecutable(skillId) {
    if (!this.hasSkill(skillId)) return false;
    const status = this.getSkillStatus(skillId);
    return status !== 'DISABLED' && status !== 'DEPRECATED' && status !== 'RETIRED';
  }


  /**
   * Extrai frontmatter de forma rigorosa.
   * Se 'version' não for declarada explicitamente, define version: null (sem inventar versões).
   */
  _parseFrontmatter(rawContent, fallbackId) {
    let name = fallbackId;
    let version = null;
    let description = '';

    if (rawContent.startsWith('---')) {
      const parts = rawContent.split('---');
      if (parts.length >= 3) {
        const frontmatter = parts[1];
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

        if (nameMatch) name = nameMatch[1].trim();
        if (versionMatch) version = versionMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
      }
    }

    return { name, version, description };
  }

  hasSkill(skillId) {
    if (!this.discoveredSkills.has(skillId)) {
      this.discoverSkills(); // Re-scan se não encontrado
    }
    return this.discoveredSkills.has(skillId);
  }

  getSkillSummary(skillId) {
    if (!this.hasSkill(skillId)) return null;
    return this.discoveredSkills.get(skillId);
  }

  listDiscoveredSkills() {
    return Array.from(this.discoveredSkills.values());
  }

  /**
   * Resolução canônica de uma Skill:
   * Valida existência, lê o conteúdo físico e transiciona status para 'LOADED'.
   */
  resolveSkill(skillId) {
    if (!this.hasSkill(skillId)) {
      return null;
    }

    const discovered = this.discoveredSkills.get(skillId);
    if (!fs.existsSync(discovered.source_path)) {
      return null;
    }

    const content = fs.readFileSync(discovered.source_path, 'utf8');

    return {
      skill_id: discovered.skill_id,
      name: discovered.name,
      version: discovered.version,
      description: discovered.description,
      source_path: discovered.source_path,
      content: content,
      load_status: 'LOADED'
    };
  }

  /**
   * Resolve e entrega o contexto de todas as Skills declaradas por um agente.
   * Lança erro explícito se qualquer Skill declarada for inexistente (bloqueando o agente).
   */
  resolveSkillsForAgent(agent) {
    if (!agent || !Array.isArray(agent.skills)) {
      throw new Error(`[SKILL RESOLVER ERROR]: Agente inválido ou lista de skills ausente.`);
    }

    const skillContexts = [];

    for (const skillId of agent.skills) {
      const resolved = this.resolveSkill(skillId);
      if (!resolved) {
        throw new Error(
          `[SKILL RESOLVER ERROR]: Skill '${skillId}' declarada pelo agente '${agent.agent_id}' não pôde ser resolvida em nenhuma raiz canônica [${this.roots.join(', ')}].`
        );
      }

      skillContexts.push({
        skill_id: resolved.skill_id,
        name: resolved.name,
        version: resolved.version,
        description: resolved.description,
        source_path: resolved.source_path,
        doc_path: resolved.source_path, // compatibilidade com código existente
        content: resolved.content,
        load_status: 'AVAILABLE_IN_CONTEXT',
        loaded_at: new Date().toISOString()
      });
    }

    return skillContexts;
  }
}

export const canonicalSkillRegistry = new CanonicalSkillRegistry();
