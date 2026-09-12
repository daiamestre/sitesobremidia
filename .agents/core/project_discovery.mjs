/**
 * SOBRE MÍDIA AI Engineering System — Canonical Project Discovery Engine
 * Realiza varredura física, determinística e segura do workspace, produzindo
 * um DiscoveryResult validado e profundamente congelado com evidências criptográficas.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  validateDiscoveryResult,
  deepFreeze
} from './contracts.mjs';

function computeSha256(content) {
  if (content === null || content === undefined) return '';
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export class ProjectDiscovery {
  /**
   * Executa a descoberta física do projeto em um workspaceRoot determinado.
   *
   * @param {string} [customRoot] - Caminho raiz do projeto (padrão: process.cwd())
   * @returns {Object} DiscoveryResult canônico validado e congelado
   */
  static discover(customRoot = process.cwd()) {
    const projectRoot = path.resolve(customRoot);
    if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
      throw new Error(`[PROJECT DISCOVERY ERROR]: Workspace root '${projectRoot}' não existe ou não é um diretório acessível.`);
    }
    const warnings = [];
    const evidenceList = [];

    // Helper seguro para checagem de existência e contenção
    function resolveSafe(relPath) {
      const target = path.resolve(projectRoot, relPath);
      // Garante contenção dentro do projectRoot
      const rel = path.relative(projectRoot, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return null; // Fora do workspace
      }
      return target;
    }

    function safeExists(relPath) {
      const fullPath = resolveSafe(relPath);
      if (!fullPath) return false;
      try {
        return fs.existsSync(fullPath);
      } catch {
        return false;
      }
    }

    function safeReadFile(relPath) {
      const fullPath = resolveSafe(relPath);
      if (!fullPath) return null;
      try {
        if (!fs.existsSync(fullPath)) return null;
        return fs.readFileSync(fullPath, 'utf8');
      } catch {
        return null;
      }
    }

    function safeReadJson(relPath) {
      const raw = safeReadFile(relPath);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function addEvidence(factPath, sourceFile, observedKey, observedValue) {
      const raw = safeReadFile(sourceFile);
      const hash = raw ? computeSha256(raw) : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      evidenceList.push({
        fact_path: factPath,
        source_file: sourceFile.replace(/\\/g, '/'),
        source_hash: hash,
        observed_key: String(observedKey),
        observed_value: typeof observedValue === 'object' ? JSON.stringify(observedValue) : String(observedValue)
      });
    }

    // 1. MANIFESTS & IDENTITY
    const pkgRaw = safeReadFile('package.json');
    let pkg = null;
    let pkgMalformed = false;
    if (pkgRaw !== null) {
      try {
        pkg = JSON.parse(pkgRaw);
      } catch {
        pkgMalformed = true;
        warnings.push("Arquivo 'package.json' corrompido ou malformado (JSON inválido).");
      }
    }

    const projectName = pkg?.name || path.basename(projectRoot) || 'UNKNOWN';
    const projectVersion = pkg?.version || '0.0.0';
    let projectStage = 'UNKNOWN';
    if (pkg?.version && pkg.version.startsWith('0.0')) {
      projectStage = 'DEVELOPMENT';
    } else if (pkg?.version) {
      projectStage = 'HOMOLOGATION';
    }

    if (pkgRaw) {
      addEvidence('project_identity.name', 'package.json', 'name', projectName);
      addEvidence('project_identity.version', 'package.json', 'version', projectVersion);
    }

    // 2. REPOSITORY / VCS
    const hasGit = safeExists('.git');
    let gitBranch = null;
    let gitHead = null;
    let gitIsClean = null;

    if (hasGit) {
      const headFile = safeReadFile('.git/HEAD');
      if (headFile) {
        const headTrimmed = headFile.trim();
        if (headTrimmed.startsWith('ref: refs/heads/')) {
          gitBranch = headTrimmed.replace('ref: refs/heads/', '');
          const branchRefFile = safeReadFile(`.git/refs/heads/${gitBranch}`);
          if (branchRefFile) {
            gitHead = branchRefFile.trim();
          }
        } else if (/^[a-f0-9]{40}$/i.test(headTrimmed)) {
          gitHead = headTrimmed;
        }
      }
      addEvidence('repository.vcs', '.git', 'directory', 'git');
    }

    // 3. PACKAGE MANAGER DETECTION (STRICT CONFLICT RESOLUTION)
    const lockfileCandidates = [
      { file: 'package-lock.json', name: 'npm' },
      { file: 'pnpm-lock.yaml', name: 'pnpm' },
      { file: 'yarn.lock', name: 'yarn' },
      { file: 'bun.lockb', name: 'bun' }
    ];

    const foundLockfiles = lockfileCandidates.filter(c => safeExists(c.file));
    let pmName = 'UNKNOWN';
    let pmStatus = 'NOT_FOUND';
    let pmLockfile = null;

    if (foundLockfiles.length === 0) {
      pmStatus = 'NOT_FOUND';
      pmName = pkg ? 'npm' : 'UNKNOWN';
      pmLockfile = null;
      if (pkg) {
        warnings.push('Nenhum lockfile encontrado no workspace. Assumindo npm como fallback.');
      }
    } else if (foundLockfiles.length === 1) {
      pmStatus = 'CANONICAL';
      pmName = foundLockfiles[0].name;
      pmLockfile = foundLockfiles[0].file;
      addEvidence('package_manager.name', pmLockfile, 'lockfile', pmName);
    } else {
      pmStatus = 'CONFLICT';
      pmName = 'UNKNOWN';
      pmLockfile = foundLockfiles.map(f => f.file).sort().join(', ');
      warnings.push(`Múltiplos lockfiles detectados no workspace (${pmLockfile}). Status de package manager em CONFLICT.`);
      for (const lf of foundLockfiles) {
        addEvidence('package_manager.conflict', lf.file, 'conflicting_lockfile', lf.name);
      }
    }

    // 4. COMMAND DISCOVERY
    const commands = {
      dev: pkg?.scripts?.dev ? 'npm run dev' : 'npm run dev',
      build: pkg?.scripts?.build ? 'npm run build' : 'npm run build',
      test: pkg?.scripts?.test ? 'npm test' : 'npm test',
      typecheck: pkg?.scripts?.typecheck ? 'npm run typecheck' : (safeExists('tsconfig.json') ? 'npx tsc --noEmit' : 'npm run typecheck'),
      lint: pkg?.scripts?.lint ? 'npm run lint' : 'npm run lint'
    };

    if (pkg?.scripts) {
      for (const [cmdKey, cmdVal] of Object.entries(pkg.scripts)) {
        if (['dev', 'build', 'test', 'lint'].includes(cmdKey)) {
          addEvidence(`commands.${cmdKey}`, 'package.json', `scripts.${cmdKey}`, cmdVal);
        }
      }
    }

    // 5. STACK DISCOVERY
    const stack = {
      runtime: pkgRaw !== null ? 'Node.js / Web' : 'UNKNOWN',
      language: safeExists('tsconfig.json') ? 'TypeScript' : (pkgRaw !== null ? 'JavaScript' : 'UNKNOWN'),
      framework: 'UNKNOWN',
      bundler: 'UNKNOWN',
      styling: 'UNKNOWN',
      database: 'UNKNOWN',
      mobile: 'None',
      testing: {
        unit: 'None',
        e2e: 'None'
      },
      linting: 'None'
    };

    if (safeExists('tsconfig.json')) {
      addEvidence('stack.language', 'tsconfig.json', 'file_presence', 'TypeScript');
    }

    if (pkg) {
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      // Framework
      if (allDeps.react) {
        stack.framework = 'React';
        addEvidence('stack.framework', 'package.json', 'dependencies.react', allDeps.react);
      } else if (allDeps.vue) {
        stack.framework = 'Vue';
        addEvidence('stack.framework', 'package.json', 'dependencies.vue', allDeps.vue);
      } else if (allDeps.next) {
        stack.framework = 'Next.js';
        addEvidence('stack.framework', 'package.json', 'dependencies.next', allDeps.next);
      } else if (allDeps['@angular/core']) {
        stack.framework = 'Angular';
        addEvidence('stack.framework', 'package.json', 'dependencies.@angular/core', allDeps['@angular/core']);
      } else if (allDeps.svelte) {
        stack.framework = 'Svelte';
        addEvidence('stack.framework', 'package.json', 'dependencies.svelte', allDeps.svelte);
      } else {
        stack.framework = 'Vanilla / Other';
      }

      // Bundler
      if (allDeps.vite || safeExists('vite.config.ts') || safeExists('vite.config.js')) {
        stack.bundler = 'Vite';
        addEvidence('stack.bundler', safeExists('vite.config.ts') ? 'vite.config.ts' : 'package.json', 'vite', allDeps.vite || 'config');
      } else if (allDeps.webpack) {
        stack.bundler = 'Webpack';
        addEvidence('stack.bundler', 'package.json', 'dependencies.webpack', allDeps.webpack);
      } else {
        stack.bundler = 'Other';
      }

      // Styling
      if (allDeps.tailwindcss || safeExists('tailwind.config.js') || safeExists('tailwind.config.ts')) {
        stack.styling = 'Tailwind CSS';
        addEvidence('stack.styling', 'package.json', 'dependencies.tailwindcss', allDeps.tailwindcss || 'config');
      } else {
        stack.styling = 'CSS';
      }

      // Database Client
      if (allDeps['@supabase/supabase-js'] || safeExists('supabase')) {
        stack.database = 'Supabase PostgreSQL';
        addEvidence('stack.database', safeExists('supabase') ? 'supabase' : 'package.json', 'supabase', allDeps['@supabase/supabase-js'] || 'dir');
      } else if (allDeps.prisma || safeExists('prisma')) {
        stack.database = 'Prisma';
        addEvidence('stack.database', 'package.json', 'dependencies.prisma', allDeps.prisma || 'dir');
      } else {
        stack.database = 'Other';
      }

      // Mobile
      if (safeExists('native-android-player')) {
        stack.mobile = 'Native Android Kotlin';
        addEvidence('stack.mobile', 'native-android-player', 'directory', 'Kotlin Module');
      } else if (allDeps['@capacitor/core']) {
        stack.mobile = 'Capacitor';
        addEvidence('stack.mobile', 'package.json', 'dependencies.@capacitor/core', allDeps['@capacitor/core']);
      } else {
        stack.mobile = 'None';
      }

      // Testing Unit
      if (allDeps.vitest) {
        stack.testing.unit = 'Vitest';
        addEvidence('stack.testing.unit', 'package.json', 'devDependencies.vitest', allDeps.vitest);
      } else if (allDeps.jest) {
        stack.testing.unit = 'Jest';
        addEvidence('stack.testing.unit', 'package.json', 'devDependencies.jest', allDeps.jest);
      }

      // Testing E2E
      if (allDeps['@playwright/test'] || safeExists('playwright.config.ts')) {
        stack.testing.e2e = 'Playwright';
        addEvidence('stack.testing.e2e', 'package.json', 'devDependencies.@playwright/test', allDeps['@playwright/test'] || 'config');
      } else if (allDeps.cypress) {
        stack.testing.e2e = 'Cypress';
        addEvidence('stack.testing.e2e', 'package.json', 'devDependencies.cypress', allDeps.cypress);
      }

      // Linting
      if (allDeps.eslint || safeExists('eslint.config.js')) {
        stack.linting = 'ESLint';
        addEvidence('stack.linting', 'package.json', 'devDependencies.eslint', allDeps.eslint || 'config');
      }
    }

    // 6. DATABASE DISCOVERY
    const hasSupabaseDir = safeExists('supabase');
    const hasMigrationsDir = safeExists('supabase/migrations');
    let migrationsCount = 0;

    if (hasMigrationsDir) {
      const fullMigPath = resolveSafe('supabase/migrations');
      try {
        const files = fs.readdirSync(fullMigPath);
        migrationsCount = files.filter(f => f.endsWith('.sql')).length;
        addEvidence('database.migrations_count', 'supabase/migrations', 'sql_files_count', migrationsCount);
      } catch {
        migrationsCount = 0;
      }
    }

    const database = {
      provider: (hasSupabaseDir || pkg?.dependencies?.['@supabase/supabase-js']) ? 'Supabase' : 'None',
      migrations_dir: hasMigrationsDir ? 'supabase/migrations' : null,
      migrations_count: migrationsCount,
      has_rls: 'UNKNOWN' // Conservador: não faz query no banco em tempo de scan
    };

    // 7. DEPLOYMENT DISCOVERY (LOCAL ARTIFACTS ONLY)
    const detectedConfigs = [];
    if (safeExists('vercel.json') || safeExists('.vercel')) {
      detectedConfigs.push('vercel');
      addEvidence('deployment.detected_configs', 'vercel.json', 'config_file', 'vercel');
    }
    if (safeExists('wrangler.toml')) {
      detectedConfigs.push('cloudflare');
      addEvidence('deployment.detected_configs', 'wrangler.toml', 'config_file', 'cloudflare');
    }
    if (safeExists('Dockerfile') || safeExists('docker-compose.yml')) {
      detectedConfigs.push('docker');
      addEvidence('deployment.detected_configs', 'Dockerfile', 'config_file', 'docker');
    }
    if (safeExists('.github/workflows')) {
      detectedConfigs.push('github_actions');
      addEvidence('deployment.detected_configs', '.github/workflows', 'directory', 'github_actions');
    }
    detectedConfigs.sort();

    const deployment = {
      detected_configs: detectedConfigs
    };

    // 8. RULES DISCOVERY
    const hasAgentsMd = safeExists('AGENTS.md');
    const hasRulesDir = safeExists('.agents/rules');
    const protectedZones = [
      'src/contexts/AuthContext.tsx',
      'native-android-player/',
      'src/services/DeviceService.ts',
      'src/services/MediaCacheService.ts',
      'supabase/migrations/'
    ];

    if (hasAgentsMd) {
      addEvidence('rules.has_agents_md', 'AGENTS.md', 'file_presence', true);
    }
    if (hasRulesDir) {
      addEvidence('rules.has_rules_dir', '.agents/rules', 'directory_presence', true);
    }

    const rules = {
      has_agents_md: hasAgentsMd,
      has_rules_dir: hasRulesDir,
      protected_zones: protectedZones.sort()
    };

    // 9. STATUS DETERMINATION
    let status = 'DISCOVERED';
    if (pkgMalformed) {
      status = 'BLOCKED';
    } else if (!pkg) {
      status = 'PARTIAL';
      warnings.push("Manifesto 'package.json' ausente. Descoberta concluída em modo PARTIAL.");
    } else if (evidenceList.length === 0) {
      status = 'PARTIAL';
    }

    // 10. MANIFEST CHECKSUM (COMBINED DETERMINISTIC HASH)
    const manifestPieces = [];
    if (pkgRaw) manifestPieces.push(pkgRaw);
    for (const lf of foundLockfiles) {
      const rawLf = safeReadFile(lf.file);
      if (rawLf) manifestPieces.push(rawLf);
    }
    const tsconfigRaw = safeReadFile('tsconfig.json');
    if (tsconfigRaw) manifestPieces.push(tsconfigRaw);

    const manifestChecksum = manifestPieces.length > 0
      ? computeSha256(manifestPieces.join('||'))
      : null;

    // 11. ORDENAÇÃO DETERMINÍSTICA DE EVIDÊNCIAS E WARNINGS
    evidenceList.sort((a, b) => a.fact_path.localeCompare(b.fact_path) || a.source_file.localeCompare(b.source_file));
    warnings.sort();

    // 12. MONTAGEM DO CONTRATO
    const rawResult = {
      schema_version: '1.0.0',
      project_identity: {
        name: projectName,
        version: projectVersion,
        stage: projectStage
      },
      root: {
        project_root: projectRoot.replace(/\\/g, '/'),
        workspace_root: projectRoot.replace(/\\/g, '/')
      },
      repository: {
        vcs: hasGit ? 'git' : 'none',
        branch: gitBranch,
        head_commit: gitHead,
        is_clean: gitIsClean
      },
      stack,
      package_manager: {
        name: pmName,
        lockfile: pmLockfile,
        status: pmStatus
      },
      commands,
      database,
      deployment,
      rules,
      status,
      evidence: evidenceList,
      warnings,
      manifest_checksum: manifestChecksum,
      discovered_at: new Date().toISOString()
    };

    // 13. VALIDAÇÃO FAIL-CLOSED
    const errors = validateDiscoveryResult(rawResult);
    if (errors.length > 0) {
      throw new Error(`[PROJECT DISCOVERY CONTRACT ERROR]: DiscoveryResult falhou na validação de contrato: ${errors.join('; ')}`);
    }

    // 14. DEEP FREEZE APÓS VALIDAÇÃO
    return deepFreeze(rawResult);
  }
}

export class DiscoveryPolicy {
  /**
   * Tipos de tarefas canônicos que realizam operações no projeto e exigem discovery.
   */
  static PROJECT_AWARE_TYPES = [
    'IMPLEMENTATION',
    'ARCHITECTURE',
    'DATABASE',
    'FORENSIC',
    'QA',
    'FEATURE',
    'BUGFIX',
    'AUDIT',
    'REFACTOR',
    'BUILD',
    'SECURITY',
    'TEST',
    'DEPLOYMENT',
    'HOTFIX',
    'MIGRATION',
    'OPTIMIZATION',
    'ARCHITECTURE_AND_AUDIT'
  ];

  /**
   * Tipos de tarefas puramente conceituais ou textuais que não exigem discovery.
   */
  static NON_PROJECT_TYPES = [
    'NON_PROJECT',
    'CONCEPTUAL',
    'TEXT_ONLY',
    'CONVERSATION',
    'GENERAL',
    'GENERAL_ORCHESTRATION'
  ];

  /**
   * Determina deterministicamente se uma tarefa requer Discovery do projeto.
   *
   * @param {Object} task
   * @returns {boolean}
   */
  static isProjectAware(task) {
    if (!task || typeof task !== 'object') return false;

    // 1. Flag booleana explícita na tarefa (precedência máxima)
    if (typeof task.is_project_aware === 'boolean') {
      return task.is_project_aware;
    }
    if (typeof task.requires_discovery === 'boolean') {
      return task.requires_discovery;
    }

    // 2. Tipo explícito de tarefa (case-insensitive)
    if (task.type && typeof task.type === 'string') {
      const normType = task.type.toUpperCase().trim();
      if (this.NON_PROJECT_TYPES.includes(normType)) return false;
      if (this.PROJECT_AWARE_TYPES.includes(normType)) return true;
    }
    if (task.task_type && typeof task.task_type === 'string') {
      const normTaskType = task.task_type.toUpperCase().trim();
      if (this.NON_PROJECT_TYPES.includes(normTaskType)) return false;
      if (this.PROJECT_AWARE_TYPES.includes(normTaskType)) return true;
    }

    // 3. Presença explícita de workspace_root ou target_paths
    if (task.workspace_root || (Array.isArray(task.target_paths) && task.target_paths.length > 0)) {
      return true;
    }

    // 4. Default: Tarefas no sistema operam sobre o workspace por padrão
    return true;
  }

  /**
   * Avalia a política e retorna objeto detalhado de decisão.
   *
   * @param {Object} task
   * @returns {{ required: boolean, reason: string }}
   */
  static evaluate(task) {
    const required = this.isProjectAware(task);
    return {
      required,
      reason: required
        ? `Tarefa '${task?.task_id || 'UNKNOWN'}' classificada como PROJECT-AWARE. Discovery é obrigatório.`
        : `Tarefa '${task?.task_id || 'UNKNOWN'}' classificada como NON-PROJECT. Discovery dispensado.`
    };
  }
}

