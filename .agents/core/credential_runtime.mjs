/**
 * SOBRE MÍDIA AI Engineering System — Persistent Deploy Credential Runtime
 *
 * Provê infraestrutura canônica, segura e persistente para resolução em memória
 * de credenciais de deploy (Vercel, Supabase), isoladas do repositório de código,
 * nunca versionadas e estritamente auditadas.
 *
 * Fluxo Canônico:
 * USER CONFIGURA CREDENCIAL UMA VEZ
 *   ↓
 * CREDENTIAL STORE / ENVIRONMENT SEGURO (HKCU\Environment / User Profile)
 *   ↓
 * ProductionLifecycle solicita credencial
 *   ↓
 * PermissionEngine autoriza uso
 *   ↓
 * DeployManager recebe credencial em memória (CredentialLease)
 *   ↓
 * Deploy real
 *   ↓
 * Credencial NÃO é persistida no projeto
 *   ↓
 * Credencial NÃO entra em Git
 *   ↓
 * Credencial NÃO aparece em logs / evidence (Sanitizer)
 *   ↓
 * Lease destruído após uso
 */

import { spawnSync } from 'child_process';
import { deepFreeze } from './contracts.mjs';
import { PermissionEngine } from './permissions.mjs';

/**
 * 1. Sanitizador e Redator de Credenciais
 * Garante que nenhum token/secret apareça em logs, terminal, relatórios ou evidências.
 */
export class CredentialSanitizer {
  static redact(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/vcp_[a-zA-Z0-9_\-]+/g, '[REDACTED_VERCEL_TOKEN]')
      .replace(/vck_[a-zA-Z0-9_\-]+/g, '[REDACTED_VERCEL_TOKEN]')
      .replace(/sbp_[a-zA-Z0-9_\-]+/g, '[REDACTED_SUPABASE_KEY]')
      .replace(/ey[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]+/g, '[REDACTED_JWT]');
  }
}

/**
 * 2. Credential Lease (Empréstimo em Memória)
 * Wrapper efêmero para uso pontual e autorizado em processos de deploy.
 */
export class CredentialLease {
  constructor({ provider, purpose, token, caller }) {
    this._provider = String(provider);
    this._purpose = String(purpose);
    this._token = String(token);
    this._caller = String(caller);
    this._lease_id = `LEASE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this._created_at = new Date().toISOString();
    this._destroyed = false;
  }

  get provider() { return this._provider; }
  get purpose() { return this._purpose; }
  get lease_id() { return this._lease_id; }
  get caller() { return this._caller; }
  get is_active() { return !this._destroyed && Boolean(this._token); }

  /**
   * Fornece o token estritamente para o subprocesso autorizado.
   */
  getToken() {
    if (this._destroyed || !this._token) {
      throw new Error(`CredentialLease '${this._lease_id}' já foi destruído ou revogado.`);
    }
    return this._token;
  }

  /**
   * Retorna representação mascarada segura.
   */
  getMaskedToken() {
    return '***[PROTECTED]***';
  }

  /**
   * Retorna metadata não-sensível para gravação segura em relatórios e evidências.
   */
  toSafeMetadata() {
    return deepFreeze({
      provider: this._provider,
      purpose: this._purpose,
      lease_id: this._lease_id,
      caller: this._caller,
      is_available: true,
      masked_token: this.getMaskedToken(),
      created_at: this._created_at,
      status: this._destroyed ? 'DESTROYED' : 'ACTIVE'
    });
  }

  /**
   * Destrói a referência em memória após a conclusão do deploy.
   */
  destroy() {
    this._token = null;
    this._destroyed = true;
  }
}

/**
 * 3. Credential Store (Armazenamento Persistente no Ambiente do Usuário)
 * Reside fora do projeto: no Windows User Environment (HKCU\Environment) e
 * no ambiente do Antigravity (~/.gemini/antigravity).
 */
export class CredentialStore {
  static _cache = new Map();

  /**
   * Resolve o nome da variável de ambiente para o provider.
   */
  static getEnvVarName(provider) {
    const p = String(provider).toLowerCase();
    if (p === 'vercel') return 'VERCEL_TOKEN';
    if (p === 'supabase') return 'SUPABASE_ACCESS_TOKEN';
    return null;
  }

  /**
   * Consulta o valor do token do ambiente de forma segura.
   * Ordem de busca:
   * 1. Cache em memória da sessão
   * 2. Windows User Registry (HKCU\Environment) — fonte canônica persistente entre sessões, reinicializações e projetos.
   * 3. process.env (fallback caso não esteja no registro)
   */
  static getRawToken(provider) {
    const p = String(provider).toLowerCase();
    if (this._cache.has(p) && this._cache.get(p)) {
      return this._cache.get(p);
    }

    const varName = this.getEnvVarName(p);
    if (!varName) return null;

    // A) Consultar registro de usuário do Windows (HKCU\Environment) — prioritário para evitar stale process.env
    if (process.platform === 'win32') {
      try {
        const regRes = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', varName], {
          encoding: 'utf8',
          timeout: 5000
        });
        if (regRes.status === 0 && regRes.stdout) {
          const match = regRes.stdout.match(new RegExp(`${varName}\\s+REG_SZ\\s+(.*)`));
          if (match && match[1] && match[1].trim()) {
            const val = match[1].trim();
            // Sincroniza process.env e cache em memória
            process.env[varName] = val;
            this._cache.set(p, val);
            return val;
          }
        }
      } catch (err) {
        // Ignora silenciosamente se o comando falhar
      }
    }

    // B) Fallback para process.env
    if (process.env[varName] && String(process.env[varName]).trim().length > 0) {
      const val = String(process.env[varName]).trim();
      this._cache.set(p, val);
      return val;
    }

    return null;
  }

  /**
   * Verifica se o ambiente possui a credencial sem expor o token.
   */
  static hasCredential(provider) {
    const token = this.getRawToken(provider);
    return Boolean(token && token.length > 5);
  }

  /**
   * Configura persistentemente a credencial no ambiente do usuário (fora do projeto).
   */
  static setPersistentCredential(provider, token) {
    const p = String(provider).toLowerCase();
    const varName = this.getEnvVarName(p);
    if (!varName || !token) return false;

    const trimmed = String(token).trim();
    this._cache.set(p, trimmed);

    if (process.platform === 'win32') {
      try {
        const setRes = spawnSync(
          'powershell',
          ['-NoProfile', '-Command', `[Environment]::SetEnvironmentVariable('${varName}', '${trimmed}', 'User')`],
          { encoding: 'utf8', timeout: 8000 }
        );
        return setRes.status === 0;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Limpa o cache da sessão.
   */
  static clearCache() {
    this._cache.clear();
  }
}

/**
 * 4. Credential Resolver (Fachada Canônica do Runtime de Credenciais)
 */
export class CredentialResolver {
  /**
   * Resolve uma credencial sob governança estrita de permissão e escopo.
   *
   * @param {object} params
   * @param {string} params.provider - 'vercel' | 'supabase'
   * @param {string} params.purpose - Finalidade autorizada (ex.: 'production_deploy')
   * @param {string} params.caller - Nome da classe/agente solicitante
   * @returns {object} { success: boolean, lease?: CredentialLease, status?: string, reason?: string }
   */
  static resolveCredential({ provider, purpose = 'production_deploy', caller = 'ProductionLifecycle' }) {
    // 1. Verificação de permissão e escopo
    const permCheck = PermissionEngine.checkCredentialAccess(caller, provider, purpose);
    if (!permCheck.allowed) {
      return deepFreeze({
        success: false,
        status: 'PERMISSION_DENIED',
        reason: permCheck.reason || 'Acesso negado à credencial.'
      });
    }

    // 2. Resolução do token persistente fora do projeto
    const token = CredentialStore.getRawToken(provider);
    if (!token) {
      return deepFreeze({
        success: false,
        status: 'BLOCKED_EXTERNAL',
        reason: `Credencial persistente para '${provider}' não está disponível no ambiente do usuário (HKCU\\Environment ou variável de ambiente ausente).`
      });
    }

    // 3. Emissão de Lease efêmero em memória
    const lease = new CredentialLease({
      provider,
      purpose,
      token,
      caller
    });

    return {
      success: true,
      lease,
      safe_metadata: lease.toSafeMetadata()
    };
  }
}
