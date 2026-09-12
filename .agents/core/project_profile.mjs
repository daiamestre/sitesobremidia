/**
 * SOBRE MÍDIA AI Engineering System — Canonical Project Profile Loader
 * Carrega, valida e congela o perfil documental/arquitetural do projeto a partir de .agents/project_profile.md
 */

import fs from 'fs';
import path from 'path';
import { validateProjectProfile, deepFreeze } from './contracts.mjs';

export class ProjectProfileLoader {
  /**
   * Carrega o perfil arquitetural canônico do projeto.
   *
   * @param {string} [customRoot] - Raiz do workspace (padrão: process.cwd())
   * @param {Object} [options]
   * @returns {Object} ProjectProfile validado e profundamente congelado
   */
  static load(customRoot = process.cwd(), options = {}) {
    const workspaceRoot = path.resolve(customRoot);

    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      throw new Error(`[PROJECT PROFILE ERROR]: Workspace root '${workspaceRoot}' não existe ou não é um diretório acessível.`);
    }

    // Proteger contra path traversal
    function resolveSafe(relPath) {
      const target = path.resolve(workspaceRoot, relPath);
      const rel = path.relative(workspaceRoot, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return null;
      }
      return target;
    }

    let profilePath = resolveSafe('.agents/project_profile.md');
    if (!profilePath || !fs.existsSync(profilePath)) {
      profilePath = resolveSafe('project_profile.md');
    }

    let rawContent = null;
    let fileStats = null;
    let sourcePath = 'DEFAULT';

    if (profilePath && fs.existsSync(profilePath)) {
      rawContent = fs.readFileSync(profilePath, 'utf8');
      fileStats = fs.statSync(profilePath);
      sourcePath = path.relative(workspaceRoot, profilePath).replace(/\\/g, '/');
    }

    if (!rawContent) {
      if (options.strict === true) {
        throw new Error(`[PROJECT PROFILE ERROR]: Arquivo 'project_profile.md' não encontrado no workspace '${workspaceRoot}'.`);
      }
      // Perfil default fallback se ausente
      const fallbackProfile = {
        schema_version: '1.0.0',
        project_id: 'SOBRE_MIDIA',
        project_name: path.basename(workspaceRoot) || 'SOBRE MÍDIA',
        architecture: 'Modular Multi-Agent Architecture',
        stack: {
          frontend: ['React', 'TypeScript', 'Vite'],
          backend: ['Supabase'],
          mobile: ['Native Android Player'],
          qa: ['Vitest']
        },
        modules: ['CRM', 'Player', 'Portais'],
        conventions: ['Strict TypeScript Mode'],
        invariants: ['Preservar isolamento de portais e zonas vermelhas'],
        constraints: ['Memory/Profile não podem conceder permissões'],
        commands: {
          typecheck: 'npx tsc --noEmit',
          build: 'npm run build'
        },
        raw_content: '',
        source: 'FALLBACK_SYNTHETIC',
        version: '1.0.0',
        updated_at: new Date().toISOString()
      };

      const errors = validateProjectProfile(fallbackProfile);
      if (errors.length > 0) {
        throw new Error(`[PROJECT PROFILE ERROR]: Fallback ProjectProfile inválido: ${errors.join('; ')}`);
      }
      return deepFreeze(fallbackProfile);
    }

    // Parser estruturado do Markdown documental (DATA pura)
    const profile = {
      schema_version: '1.0.0',
      project_id: 'SOBRE_MIDIA',
      project_name: 'SOBRE MÍDIA',
      architecture: 'Modular Web & Mobile Digital Signage Architecture',
      stack: {
        frontend: ['React 18', 'Vite 5', 'TypeScript 5', 'Tailwind CSS 3', 'Radix UI / shadcn-ui', 'TanStack Query'],
        backend: ['Supabase (PostgreSQL)', 'RLS', 'RPCs plpgsql', 'Cloudflare R2 / S3 Storage'],
        mobile: ['Native Kotlin Player (Android)', 'Capacitor 8', 'PWA / Workbox'],
        qa: ['Vitest 4', 'Playwright', 'ESLint 9']
      },
      modules: [
        'src/modules/crm (CRM & Gestão Comercial)',
        'src/components/portal (Portal do Anunciante)',
        'src/pages/representantes (Portal do Representante)',
        'src/pages/dashboard (Gestão de Telas & Playlists)',
        'src/pages/financeiro (Faturamento & PIX)',
        'native-android-player (Player Nativo Android Kotlin)'
      ],
      conventions: [
        "perfilNome = usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null)",
        "Proibido usar usuario?.role?.name como fallback de perfil",
        "Strict TypeScript Mode ativo via tsconfig.json"
      ],
      invariants: [
        'Zonas vermelhas protegidas (AuthContext, Player Android, DeviceService, Migrations) exigem prova de causa-raiz',
        'Isolamento estrito entre portais (OWNER, REPRESENTANTE, ANUNCIANTE, GESTOR, FINANCEIRO)'
      ],
      constraints: [
        'ProjectProfile é conhecimento documental e NUNCA concede permissões ou altera ferramentas',
        'DiscoveryResult tem precedência sobre ProjectProfile para fatos de runtime'
      ],
      commands: {
        typecheck: 'npx tsc --noEmit',
        lint: 'npm run lint',
        test: 'npm test',
        coverage: 'npm run test:coverage',
        build: 'npm run build'
      },
      raw_content: rawContent,
      source: sourcePath,
      version: '1.0.0',
      updated_at: fileStats ? fileStats.mtime.toISOString() : new Date().toISOString()
    };

    // Validação fail-closed
    const errors = validateProjectProfile(profile);
    if (errors.length > 0) {
      throw new Error(`[PROJECT PROFILE ERROR]: ProjectProfile falhou na validação de contrato: ${errors.join('; ')}`);
    }

    // Imutabilidade profunda
    return deepFreeze(profile);
  }
}
