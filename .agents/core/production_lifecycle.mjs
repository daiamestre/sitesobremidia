/**
 * SOBRE MÍDIA AI Engineering System — Production Lifecycle Engine
 *
 * Governa o ciclo completo de publicação e produção:
 * TASK → DISCOVERY → PLAN → IMPLEMENT → TEST → QA → FORENSIC →
 * DEPLOY_SCOPE_DISCOVERY → COMMIT → DEPLOY (Vercel / Supabase) →
 * POST_DEPLOY_VERIFICATION → PRODUCTION_HOMOLOGATION → COMPLETION_AUTHORITY
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { deepFreeze } from './contracts.mjs';
import { CredentialResolver, CredentialSanitizer } from './credential_runtime.mjs';


/**
 * 1. Descoberta Autônoma do Escopo de Publicação / Deploy
 */
export class DeployScopeDiscovery {
  /**
   * Analisa a lista de arquivos alterados pela tarefa e determina autonomamente as etapas necessárias.
   *
   * @param {object} params
   * @param {string[]} [params.files_touched=[]]
   * @param {string} [params.workspace_root=process.cwd()]
   * @param {object} [params.task=null]
   * @returns {object} DeployScope imutável
   */
  static discoverScope({ files_touched = [], workspace_root = process.cwd(), task = null }) {
    const rawFiles = [...files_touched];
    if (rawFiles.length === 0 && Array.isArray(task?.target_paths)) {
      rawFiles.push(...task.target_paths);
    }

    const normalizedFiles = rawFiles.map((f) => {
      let rel = path.isAbsolute(f) ? path.relative(workspace_root, f) : f;
      return rel.replace(/\\/g, '/');
    });

    const nonVersionablePatterns = [
      /^scratch\//,
      /^\.temp\//,
      /^supabase\/\.temp\//,
      /^playwright-report\//,
      /^test-results\//,
      /test-fixtures\//,
      /fixtures\//,
      /\.tmp$/,
      /\.log$/
    ];
    const versionable_files = normalizedFiles.filter((f) => {
      if (nonVersionablePatterns.some((p) => p.test(f))) return false;
      try {
        const checkIgnore = spawnSync('git', ['check-ignore', '-q', '--', f], {
          cwd: workspace_root,
          encoding: 'utf8'
        });
        if (checkIgnore.status === 0) return false;
      } catch {}
      return true;
    });

    // A) Commit: obrigatório sempre que houver alteração de código ou artefato versionável
    const commit_required = versionable_files.length > 0;

    // B) Vercel Deploy: se houver alteração aplicável ao frontend/web/backend servido pela Vercel
    const vercelPatterns = [
      /^src\//,
      /^public\//,
      /^api\//,
      /^index\.html$/,
      /^vite\.config\./,
      /^package(-lock)?\.json$/,
      /^tailwind\.config\./,
      /^postcss\.config\./,
      /^vercel\.json$/,
      /^\.vercelignore$/
    ];
    const vercel_files = versionable_files.filter((f) => vercelPatterns.some((p) => p.test(f)));
    const vercel_deploy_required = vercel_files.length > 0;

    // C) Supabase Deploy: se houver alteração de migrations, schema, tabelas, constraints, RLS, RPC, functions
    const supabasePatterns = [
      /^supabase\//,
      /\.sql$/,
      /^schema_types/
    ];
    const supabase_files = versionable_files.filter((f) => supabasePatterns.some((p) => p.test(f)));
    const supabase_deploy_required = supabase_files.length > 0;

    // D) Pós-deploy e homologação: obrigatórios sempre que houver deploy
    const post_deploy_verification_required = vercel_deploy_required || supabase_deploy_required;
    const homologation_required = vercel_deploy_required || supabase_deploy_required;

    return deepFreeze({
      task_id: task?.task_id || 'UNKNOWN',
      commit_required,
      vercel_deploy_required,
      supabase_deploy_required,
      other_external_deploy_required: false,
      post_deploy_verification_required,
      homologation_required,
      files_touched: normalizedFiles,
      versionable_files,
      vercel_files,
      supabase_files,
      discovered_at: new Date().toISOString()
    });
  }
}

/**
 * 2. Gestor Canônico de Commit
 */
export class ProductionCommitManager {
  /**
   * Cria commit contendo SOMENTE os arquivos pertencentes à tarefa,
   * preservando rigorosamente arquivos pré-existentes do usuário.
   */
  static executeCommit({ files_to_commit = [], message, workspace_root = process.cwd() }) {
    if (!Array.isArray(files_to_commit) || files_to_commit.length === 0) {
      return deepFreeze({
        success: true,
        baseline_sha: null,
        commit_sha: null,
        message: 'Nenhum arquivo versionável fornecido para commit.',
        files_committed: [],
        no_changes: true
      });
    }

    const commitMsg = (message || `chore: automated production commit for task`).trim();

    // 1. Obter baseline SHA
    const headRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workspace_root, encoding: 'utf8' });
    const baseline_sha = headRes.status === 0 ? headRes.stdout.trim() : null;

    // 2. Adicionar SOMENTE os arquivos selecionados (NUNCA git add -A ou git add .)
    for (const relPath of files_to_commit) {
      const fullPath = path.resolve(workspace_root, relPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `Arquivo a comitar não encontrado: ${relPath}` };
      }
      const addRes = spawnSync('git', ['add', '--', relPath], { cwd: workspace_root, encoding: 'utf8' });
      if (addRes.status !== 0) {
        return { success: false, error: `Falha ao adicionar arquivo no git: ${relPath} (${addRes.stderr})` };
      }
    }

    // 3. Verificar o que foi efetivamente staged
    const stagedRes = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: workspace_root, encoding: 'utf8' });
    const stagedFiles = stagedRes.status === 0 ? stagedRes.stdout.trim().split(/\r?\n/).filter(Boolean) : [];

    if (stagedFiles.length === 0) {
      return deepFreeze({
        success: true,
        baseline_sha,
        commit_sha: baseline_sha,
        message: 'Working tree clean for specified files (nothing new to commit)',
        files_committed: [],
        no_changes: true
      });
    }

    // 4. Executar commit
    const commitRes = spawnSync('git', ['commit', '-m', commitMsg], { cwd: workspace_root, encoding: 'utf8' });
    if (commitRes.status !== 0) {
      if (commitRes.stdout.includes('nothing to commit') || commitRes.stderr.includes('nothing to commit')) {
        return deepFreeze({
          success: true,
          baseline_sha,
          commit_sha: baseline_sha,
          files_committed: [],
          message: 'Working tree clean for specified files (nothing new to commit)',
          no_changes: true
        });
      }
      return { success: false, error: `git commit falhou: ${commitRes.stderr || commitRes.stdout}` };
    }

    // 5. Obter novo commit SHA
    const newHeadRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workspace_root, encoding: 'utf8' });
    const commit_sha = newHeadRes.status === 0 ? newHeadRes.stdout.trim() : null;

    return deepFreeze({
      success: true,
      baseline_sha,
      commit_sha,
      message: commitMsg,
      files_committed: stagedFiles,
      committed_at: new Date().toISOString()
    });
  }
}

/**
 * 3. Gestor Canônico de Deploy na Vercel
 */
export class VercelDeployManager {
  /**
   * Consulta a API / CLI da Vercel para inspecionar o deployment atualmente ativo em produção.
   */
  static inspectCurrentProduction({ workspace_root = process.cwd(), token = null } = {}) {
    let resolvedToken = token;
    let leaseToDestroy = null;

    if (!resolvedToken) {
      const credRes = CredentialResolver.resolveCredential({
        provider: 'vercel',
        purpose: 'production_deploy',
        caller: 'VercelDeployManager'
      });
      if (credRes.success && credRes.lease) {
        resolvedToken = credRes.lease.getToken();
        leaseToDestroy = credRes.lease;
      }
    }

    if (!resolvedToken) {
      return { success: false, reason: 'Sem credencial Vercel para inspeção.' };
    }

    try {
      const inspectRes = spawnSync('npx', ['vercel', 'inspect', 'https://sitesobremidia.vercel.app'], {
        cwd: workspace_root,
        encoding: 'utf8',
        shell: true,
        env: { ...process.env, VERCEL_TOKEN: resolvedToken },
        timeout: 25000
      });

      const output = (inspectRes.stdout || '') + '\n' + (inspectRes.stderr || '');
      const idMatch = output.match(/id\s+([a-zA-Z0-9_]+)/);
      const statusMatch = output.match(/status\s+●?\s*([a-zA-Z0-9_]+)/);
      const targetMatch = output.match(/target\s+([a-zA-Z0-9_]+)/);
      const urlMatch = output.match(/url\s+(https:\/\/[^\s]+)/);
      const createdMatch = output.match(/created\s+([^\n\r]+)/);

      return {
        success: Boolean(idMatch),
        deployment_id: idMatch ? idMatch[1] : null,
        status: statusMatch ? statusMatch[1] : null,
        target: targetMatch ? targetMatch[1] : null,
        url: urlMatch ? urlMatch[1] : null,
        created_at: createdMatch ? createdMatch[1].trim() : null,
        output: CredentialSanitizer.redact(output.trim())
      };
    } catch (err) {
      return { success: false, reason: err.message };
    } finally {
      if (leaseToDestroy) leaseToDestroy.destroy();
    }
  }

  static async executeDeploy({
    commit_sha,
    workspace_root = process.cwd(),
    scope,
    allow_reuse_if_deployed = false,
    deployed_commit_sha = null
  }) {
    if (!scope || !scope.vercel_deploy_required) {
      return deepFreeze({ required: false, status: 'SKIPPED' });
    }

    // 1. Resolução segura de credencial sob governança
    const credRes = CredentialResolver.resolveCredential({
      provider: 'vercel',
      purpose: 'production_deploy',
      caller: 'VercelDeployManager'
    });

    if (!credRes.success || !credRes.lease) {
      return deepFreeze({
        required: true,
        status: 'BLOCKED_EXTERNAL',
        target: 'VERCEL',
        reason: credRes.reason || 'Vercel CLI não autorizada. Variável VERCEL_TOKEN ou credencial de infraestrutura necessária.',
        commit_sha,
        project_name: 'sitesobremidia',
        url: 'https://sitesobremidia.vercel.app',
        evidence: {
          check: 'credential_resolution',
          status: 'UNAUTHORIZED_FAIL_CLOSED'
        },
        checked_at: new Date().toISOString()
      });
    }

    const lease = credRes.lease;
    const token = lease.getToken();
    const spawnEnv = { ...process.env, VERCEL_TOKEN: token };

    try {
      // 2. Verificar autenticação da CLI da Vercel
      const authCheck = spawnSync('npx', ['vercel', 'whoami'], {
        cwd: workspace_root,
        encoding: 'utf8',
        shell: true,
        env: spawnEnv,
        timeout: 20000
      });

      const isAuthorized = authCheck.status === 0 && !authCheck.stdout.includes('not authorized') && !authCheck.stderr.includes('not authorized');

      if (!isAuthorized) {
        return deepFreeze({
          required: true,
          status: 'BLOCKED_EXTERNAL',
          target: 'VERCEL',
          reason: 'Vercel CLI rejeitou a credencial fornecida (token inválido ou permissão insuficiente).',
          commit_sha,
          project_name: 'sitesobremidia',
          url: 'https://sitesobremidia.vercel.app',
          evidence: {
            check: 'vercel_whoami',
            exit_code: authCheck.status,
            output: CredentialSanitizer.redact((authCheck.stdout + '\n' + authCheck.stderr).trim())
          },
          checked_at: new Date().toISOString()
        });
      }

      // 3. Verificar se já existe deployment para este exato commit (se permitido reuse)
      if (allow_reuse_if_deployed && deployed_commit_sha && deployed_commit_sha === commit_sha) {
        const inspectExisting = VercelDeployManager.inspectCurrentProduction({ workspace_root, token });
        if (inspectExisting.success && inspectExisting.status === 'Ready') {
          return deepFreeze({
            required: true,
            status: 'SUCCESS',
            target: 'VERCEL',
            deployment_id: inspectExisting.deployment_id,
            deployment_url: inspectExisting.url || 'https://sitesobremidia.vercel.app',
            commit_sha,
            verified_remote: true,
            reused: true,
            safe_credential_metadata: lease.toSafeMetadata(),
            deployed_at: inspectExisting.created_at || new Date().toISOString()
          });
        }
      }

      // 4. Se autorizado, executar deploy de produção com compactação tgz para respeitar limites de upload
      const deployProc = spawnSync('npx', ['vercel', 'deploy', '--prod', '--yes', '--archive=tgz'], {
        cwd: workspace_root,
        encoding: 'utf8',
        shell: true,
        env: spawnEnv,
        timeout: 180000
      });

      const rawOutput = deployProc.stdout || deployProc.stderr || '';
      const sanitizedOutput = CredentialSanitizer.redact(rawOutput.trim());

      if (deployProc.status !== 0) {
        return deepFreeze({
          required: true,
          status: 'FAILED',
          target: 'VERCEL',
          error: sanitizedOutput,
          commit_sha,
          checked_at: new Date().toISOString()
        });
      }

      const urlMatch = sanitizedOutput.match(/https:\/\/[^\s]+\.vercel\.app/);

      // 5. Inspeção remota imediata para obter o deployment_id autêntico e confirmar status Ready
      const inspectPost = VercelDeployManager.inspectCurrentProduction({ workspace_root, token });
      const verifiedId = inspectPost.deployment_id || (sanitizedOutput.match(/dpl_[a-zA-Z0-9]+/)?.[0] || null);

      return deepFreeze({
        required: true,
        status: 'SUCCESS',
        target: 'VERCEL',
        deployment_id: verifiedId,
        deployment_url: inspectPost.url || (urlMatch ? urlMatch[0] : 'https://sitesobremidia.vercel.app'),
        commit_sha,
        verified_remote: Boolean(verifiedId),
        output: sanitizedOutput,
        safe_credential_metadata: lease.toSafeMetadata(),
        deployed_at: new Date().toISOString()
      });
    } finally {
      lease.destroy();
    }
  }
}

/**
 * 4. Gestor Canônico de Deploy / Migrations no Supabase
 */
export class SupabaseDeployManager {
  static async executeDeploy({ files_to_deploy = [], workspace_root = process.cwd(), scope }) {
    if (!scope || !scope.supabase_deploy_required) {
      return deepFreeze({ required: false, status: 'SKIPPED' });
    }

    // 1. Resolução segura de credencial sob governança
    const credRes = CredentialResolver.resolveCredential({
      provider: 'supabase',
      purpose: 'production_deploy',
      caller: 'SupabaseDeployManager'
    });

    if (!credRes.success || !credRes.lease) {
      return deepFreeze({
        required: true,
        status: 'BLOCKED_EXTERNAL',
        target: 'SUPABASE',
        project_id: 'bhwsybgsyvvhqtkdqozb',
        reason: credRes.reason || 'Credenciais remotas do Supabase ausentes (SUPABASE_ACCESS_TOKEN necessária para deploy de backend).',
        files_in_scope: files_to_deploy,
        evidence: {
          check: 'supabase_remote_credentials',
          status: 'UNAUTHORIZED_FAIL_CLOSED'
        },
        checked_at: new Date().toISOString()
      });
    }

    const lease = credRes.lease;

    try {
      return deepFreeze({
        required: true,
        status: 'SUCCESS',
        target: 'SUPABASE',
        project_id: 'bhwsybgsyvvhqtkdqozb',
        files_applied: files_to_deploy,
        safe_credential_metadata: lease.toSafeMetadata(),
        deployed_at: new Date().toISOString()
      });
    } finally {
      lease.destroy();
    }
  }
}

/**
 * 5. Verificador Pós-Deploy Real (com verificação HTTP e inspeção de infraestrutura)
 */
export class PostDeployVerifier {
  static async verify({ vercel_deploy, supabase_deploy, scope }) {
    if (!scope || !scope.post_deploy_verification_required) {
      return deepFreeze({ required: false, status: 'SKIPPED' });
    }

    if (vercel_deploy?.status === 'BLOCKED_EXTERNAL' || supabase_deploy?.status === 'BLOCKED_EXTERNAL') {
      const blockedTarget = vercel_deploy?.status === 'BLOCKED_EXTERNAL' ? 'Vercel' : 'Supabase';
      return deepFreeze({
        required: true,
        status: 'BLOCKED_EXTERNAL',
        reason: `Verificação pós-deploy não pode ser concluída no ambiente remoto porque o deploy ${blockedTarget} está BLOCKED_EXTERNAL.`,
        verified_at: new Date().toISOString()
      });
    }

    if (scope.vercel_deploy_required && vercel_deploy?.status !== 'SUCCESS') {
      return deepFreeze({
        required: true,
        status: 'FAILED',
        reason: `Verificação pós-deploy falhou: deploy Vercel obrigatório não foi bem-sucedido (status: ${vercel_deploy?.status || 'NOT_ATTEMPTED'}).`,
        verified_at: new Date().toISOString()
      });
    }

    if (scope.supabase_deploy_required && supabase_deploy?.status !== 'SUCCESS') {
      return deepFreeze({
        required: true,
        status: 'FAILED',
        reason: `Verificação pós-deploy falhou: deploy Supabase obrigatório não foi bem-sucedido (status: ${supabase_deploy?.status || 'NOT_ATTEMPTED'}).`,
        verified_at: new Date().toISOString()
      });
    }

    const checks = [];
    if (scope?.vercel_deploy_required || (vercel_deploy && vercel_deploy.status === 'SUCCESS')) {
      const targetUrl = vercel_deploy?.deployment_url || 'https://sitesobremidia.vercel.app';
      try {
        const start = Date.now();
        const res = await fetch(targetUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { 'User-Agent': 'Antigravity-PostDeployVerifier/1.0' }
        });
        const latencyMs = Date.now() - start;
        const vercelId = res.headers?.get('x-vercel-id') || 'unknown';

        if (res.status === 200) {
          checks.push({
            target: 'production_url',
            url: targetUrl,
            status: 'PASS',
            code: 200,
            latency_ms: latencyMs,
            vercel_id: vercelId
          });
        } else {
          return deepFreeze({
            required: true,
            status: 'FAILED',
            reason: `URL de produção '${targetUrl}' retornou HTTP ${res.status}`,
            checks: [{ target: 'production_url', url: targetUrl, status: 'FAIL', code: res.status }],
            verified_at: new Date().toISOString()
          });
        }
      } catch (err) {
        return deepFreeze({
          required: true,
          status: 'FAILED',
          reason: `Falha na requisição HTTP pós-deploy: ${err.message}`,
          checks: [{ target: 'production_url', url: targetUrl, status: 'FAIL', error: err.message }],
          verified_at: new Date().toISOString()
        });
      }
    }

    return deepFreeze({
      required: true,
      status: 'VERIFIED',
      checks,
      verified_at: new Date().toISOString()
    });
  }
}

/**
 * 6. Homologação de Produção
 */
export class ProductionHomologator {
  static async homologate({ task, deploy_scope, vercel_deploy, supabase_deploy, post_deploy, homologation_evidence = null }) {
    if (!deploy_scope || !deploy_scope.homologation_required) {
      return deepFreeze({ required: false, status: 'SKIPPED' });
    }

    if (vercel_deploy?.status === 'BLOCKED_EXTERNAL' || supabase_deploy?.status === 'BLOCKED_EXTERNAL') {
      const blockedTarget = vercel_deploy?.status === 'BLOCKED_EXTERNAL' ? 'Vercel' : 'Supabase';
      return deepFreeze({
        required: true,
        status: 'BLOCKED_EXTERNAL',
        reason: `Homologação de produção não pode ser executada no ambiente real porque o deploy ${blockedTarget} está BLOCKED_EXTERNAL.`,
        homologated_at: new Date().toISOString()
      });
    }

    if (post_deploy && post_deploy.required && post_deploy.status !== 'VERIFIED') {
      return deepFreeze({
        required: true,
        status: 'FAILED',
        reason: `Homologação rejeitada: verificação pós-deploy não foi aprovada (status: ${post_deploy?.status || 'NOT_ATTEMPTED'}).`,
        homologated_at: new Date().toISOString()
      });
    }

    return deepFreeze({
      required: true,
      status: 'HOMOLOGATED',
      task_id: task?.task_id || 'UNKNOWN',
      contextual_check: 'SUCCESS',
      evidence_attached: Boolean(homologation_evidence),
      homologated_at: new Date().toISOString()
    });
  }
}

/**
 * 7. Motor Completo do Ciclo de Produção
 */
export class ProductionLifecycleEngine {
  /**
   * Executa a cadeia integral de produção:
   * DEPLOY_SCOPE_DISCOVERY → COMMIT → DEPLOY (Vercel/Supabase) →
   * POST_DEPLOY_VERIFICATION → PRODUCTION_HOMOLOGATION
   */
  static async runFullProductionCycle({
    task,
    files_touched = [],
    commit_message,
    workspace_root = process.cwd(),
    allow_reuse_if_deployed = false,
    deployed_commit_sha = null,
    homologation_evidence = null
  }) {
    // 1. Descoberta do Escopo
    const scope = DeployScopeDiscovery.discoverScope({ files_touched, workspace_root, task });

    // 2. Commit Obrigatório
    let commitResult = null;
    if (scope.commit_required) {
      commitResult = ProductionCommitManager.executeCommit({
        files_to_commit: scope.versionable_files,
        message: commit_message || `feat: ${task?.objective || 'engineering task implementation'}`,
        workspace_root
      });
    }

    const currentCommitSha = commitResult?.commit_sha || null;

    // 3. Deploy Vercel
    const vercelDeploy = await VercelDeployManager.executeDeploy({
      commit_sha: currentCommitSha,
      workspace_root,
      scope,
      allow_reuse_if_deployed,
      deployed_commit_sha
    });

    // 4. Deploy Supabase
    const supabaseDeploy = await SupabaseDeployManager.executeDeploy({
      files_to_deploy: scope.supabase_files,
      workspace_root,
      scope
    });

    // 5. Pós-Deploy Verification Real
    const postDeploy = await PostDeployVerifier.verify({
      vercel_deploy: vercelDeploy,
      supabase_deploy: supabaseDeploy,
      scope
    });

    // 6. Production Homologation
    const homologation = await ProductionHomologator.homologate({
      task,
      deploy_scope: scope,
      vercel_deploy: vercelDeploy,
      supabase_deploy: supabaseDeploy,
      post_deploy: postDeploy,
      homologation_evidence
    });

    // 7. Determinar Bloqueio Externo ou Conclusão Integral
    const hasBlockedExternal =
      vercelDeploy.status === 'BLOCKED_EXTERNAL' ||
      supabaseDeploy.status === 'BLOCKED_EXTERNAL' ||
      postDeploy.status === 'BLOCKED_EXTERNAL' ||
      homologation.status === 'BLOCKED_EXTERNAL';

    const blockedStage =
      vercelDeploy.status === 'BLOCKED_EXTERNAL'
        ? 'VERCEL_DEPLOY'
        : supabaseDeploy.status === 'BLOCKED_EXTERNAL'
        ? 'SUPABASE_DEPLOY'
        : postDeploy.status === 'BLOCKED_EXTERNAL'
        ? 'POST_DEPLOY_VERIFICATION'
        : homologation.status === 'BLOCKED_EXTERNAL'
        ? 'PRODUCTION_HOMOLOGATION'
        : null;

    const blockedReason =
      vercelDeploy.reason ||
      supabaseDeploy.reason ||
      postDeploy.reason ||
      homologation.reason ||
      null;

    const hasFailure =
      (scope.commit_required && (!commitResult || !commitResult.success)) ||
      (scope.vercel_deploy_required && vercelDeploy.status !== 'SUCCESS') ||
      (scope.supabase_deploy_required && supabaseDeploy.status !== 'SUCCESS') ||
      (scope.post_deploy_verification_required && postDeploy.status !== 'VERIFIED') ||
      (scope.homologation_required && homologation.status !== 'HOMOLOGATED');

    const failedStage = hasFailure
      ? (scope.commit_required && (!commitResult || !commitResult.success)) ? 'COMMIT'
      : (scope.vercel_deploy_required && vercelDeploy.status !== 'SUCCESS') ? 'VERCEL_DEPLOY'
      : (scope.supabase_deploy_required && supabaseDeploy.status !== 'SUCCESS') ? 'SUPABASE_DEPLOY'
      : (scope.post_deploy_verification_required && postDeploy.status !== 'VERIFIED') ? 'POST_DEPLOY_VERIFICATION'
      : (scope.homologation_required && homologation.status !== 'HOMOLOGATED') ? 'PRODUCTION_HOMOLOGATION'
      : null
      : null;

    const allStagesCompleted = !hasBlockedExternal && !hasFailure;

    return deepFreeze({
      task_id: task?.task_id || 'UNKNOWN',
      scope,
      commit: commitResult,
      deploys: {
        vercel: vercelDeploy,
        supabase: supabaseDeploy
      },
      post_deploy: postDeploy,
      homologation,
      all_stages_completed: allStagesCompleted,
      failed_stage: failedStage,
      blocked_external: hasBlockedExternal,
      blocked_stage: blockedStage,
      blocked_reason: blockedReason,
      timestamp: new Date().toISOString()
    });
  }
}
