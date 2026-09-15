/**
 * SOBRE MÍDIA AI Engineering System — Canonical Skill Registry & Resolver
 * Descoberta unificada, resolução determinística, catálogo de ações e entrega de conteúdo de Skills.
 *
 * POLÍTICA DE RAÍZES E PRECEDÊNCIA:
 * 1. Raiz Canônica Primária: `.agents/skills` (Precedência 1 - Autoridade de Engenharia)
 * 2. Raiz de Compatibilidade: `.opencode/skills` (Precedência 2 - Legado/Governança Mestre)
 *
 * POLÍTICA DE COLISÃO:
 * A primeira raiz na ordem de prioridade tem precedência absoluta. Se uma skill de mesmo
 * identificador existir em ambas as raízes, a versão de `.agents/skills` é preservada e
 * a versão de `.opencode/skills` é ignorada sem duplicação silenciosa.
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
              version: metadata.version,
              description: metadata.description,
              dependencies: metadata.dependencies || [],
              capabilities: metadata.capabilities || [],
              actions: metadata.actions || [],
              status: metadata.status || 'AVAILABLE',
              source_path: skillDocPath,
              source_root: rootPath,
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
   * Extrai frontmatter de forma rigorosa e descobre catálogo de ações e capacidades declaradas.
   */
  _parseFrontmatter(rawContent, fallbackId) {
    let name = fallbackId;
    let version = null;
    let description = '';
    const actions = [];
    const capabilities = [];
    const dependencies = [];

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

        // Extrair actions declaradas no YAML (formato array inline ou lista de itens)
        const actionsInlineMatch = frontmatter.match(/^actions:\s*\[(.*)\]/m);
        if (actionsInlineMatch) {
          const actList = actionsInlineMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean);
          actions.push(...actList);
        } else {
          const actionsBlockMatch = frontmatter.match(/^actions:\s*\n((?:\s*-\s*.+\n?)+)/m);
          if (actionsBlockMatch) {
            const lines = actionsBlockMatch[1].split('\n');
            for (const line of lines) {
              const itemMatch = line.match(/^\s*-\s*(?:name:\s*)?([a-zA-Z0-9_\-]+)/);
              if (itemMatch && itemMatch[1]) {
                actions.push(itemMatch[1].trim());
              }
            }
          }
        }

        // Extrair capabilities declaradas no YAML
        const capsMatch = frontmatter.match(/^capabilities:\s*\[(.*)\]/m);
        if (capsMatch) {
          const capsList = capsMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean);
          capabilities.push(...capsList);
        }
      }
    }

    // Se nenhuma action foi declarada no frontmatter, inferir dos cabeçalhos do documento markdown
    if (actions.length === 0) {
      const headerMatches = rawContent.matchAll(/^(?:###|##)\s+(?:[0-9]+\.\s+)?([a-zA-Z0-9_\-]+)/gm);
      for (const m of headerMatches) {
        const actName = m[1].toLowerCase().replace(/-/g, '_');
        if (!['sumario', 'checklist', 'regras', 'ciclo'].includes(actName) && !actions.includes(actName)) {
          actions.push(actName);
        }
      }
    }

    return { name, version, description, actions, capabilities, dependencies };
  }

  hasSkill(skillId) {
    if (!this.discoveredSkills.has(skillId)) {
      this.discoverSkills();
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
   * Alias de conveniência canônica para listDiscoveredSkills().
   */
  listSkills() {
    return this.listDiscoveredSkills();
  }

  /**
   * Retorna todas as actions conhecidas/declaradas para uma skill.
   */
  getSkillActions(skillId) {
    const summary = this.getSkillSummary(skillId);
    return summary ? summary.actions : [];
  }

  /**
   * Retorna todas as skills que possuem determinada capacidade associada.
   */
  getSkillsByCapability(capability) {
    return this.listDiscoveredSkills().filter(s =>
      Array.isArray(s.capabilities) && s.capabilities.includes(capability)
    );
  }

  /**
   * Verifica se uma action está declarada na skill.
   */
  isActionDeclared(skillId, actionName) {
    const actions = this.getSkillActions(skillId);
    return actions.includes(actionName);
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
      actions: discovered.actions,
      capabilities: discovered.capabilities,
      source_path: discovered.source_path,
      source_root: discovered.source_root,
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
        actions: resolved.actions,
        capabilities: resolved.capabilities,
        source_path: resolved.source_path,
        doc_path: resolved.source_path,
        content: resolved.content,
        load_status: 'AVAILABLE_IN_CONTEXT',
        loaded_at: new Date().toISOString()
      });
    }

    return skillContexts;
  }
}

export const canonicalSkillRegistry = new CanonicalSkillRegistry();
