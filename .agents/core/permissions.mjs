/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Permissions Engine
 * Verificação de permissões e isolamento operacional por agente.
 */

import path from 'path';

export class PermissionEngine {
  static checkToolPermission(agent, toolName) {
    if (!agent || !Array.isArray(agent.tools)) {
      return { allowed: false, reason: 'Agente sem lista de ferramentas autorizadas.' };
    }

    if (!agent.tools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Agente '${agent.agent_id}' não possui permissão para utilizar a ferramenta '${toolName}'. Permitidas: [${agent.tools.join(', ')}].`
      };
    }

    return { allowed: true };
  }

  static checkPathPermission(agent, targetPath, workspaceRoot = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')) {
    if (!agent || !agent.permissions || !Array.isArray(agent.permissions.allowed_paths)) {
      return { allowed: false, reason: 'Agente sem lista de caminhos autorizados.' };
    }

    if (!targetPath || typeof targetPath !== 'string') {
      return { allowed: false, reason: 'Caminho alvo inválido ou vazio.' };
    }

    // 1. Normalizar separadores de barra invertida
    let cleanTarget = targetPath.replace(/\\/g, '/');

    // 2. Se for absoluto, resolver relativamente ao workspaceRoot
    if (path.isAbsolute(targetPath) || /^[a-zA-Z]:\//.test(cleanTarget)) {
      const normTargetAbs = path.normalize(targetPath).replace(/\\/g, '/');
      const normRoot = path.normalize(workspaceRoot).replace(/\\/g, '/');
      
      if (!normTargetAbs.toLowerCase().startsWith(normRoot.toLowerCase() + '/') && normTargetAbs.toLowerCase() !== normRoot.toLowerCase()) {
        return {
          allowed: false,
          reason: `Caminho absoluto '${targetPath}' fora do workspace autorizado para o agente '${agent.agent_id}'.`
        };
      }
      cleanTarget = normTargetAbs.slice(normRoot.length).replace(/^\/+/, '');
    }

    // 3. Resolver segmentos . e .. usando path.posix.normalize
    const canonicalTarget = path.posix.normalize(cleanTarget).replace(/^\/+/, '');

    // 4. Bloquear escape do root via traversal (.. ou ../)
    if (canonicalTarget.startsWith('../') || canonicalTarget === '..') {
      return {
        allowed: false,
        reason: `Caminho '${targetPath}' escapa do diretório raiz autorizado para o agente '${agent.agent_id}'.`
      };
    }

    // 5. Verificar contenção semântica estrita contra allowed_paths
    const isAllowed = agent.permissions.allowed_paths.some(p => {
      if (!p || typeof p !== 'string') return false;
      const cleanP = p.replace(/\\/g, '/');
      const canonicalP = path.posix.normalize(cleanP).replace(/^\/+/, '').replace(/\/+$/, '');
      
      // Correspondência exata (arquivo ou diretório raiz)
      if (canonicalTarget === canonicalP) return true;
      
      // Contenção estrita em subdiretório (garante '/' para evitar prefix collision como srcfoo)
      if (canonicalTarget.startsWith(canonicalP + '/')) return true;

      return false;
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Caminho '${targetPath}' fora dos diretórios autorizados para o agente '${agent.agent_id}'. Autorizados: [${agent.permissions.allowed_paths.join(', ')}].`
      };
    }

    return { allowed: true };
  }

  static checkOperationPermission(agent, operationType) { // 'read' | 'write' | 'execute'
    if (!agent || !agent.permissions) {
      return { allowed: false, reason: 'Agente sem objeto de permissões.' };
    }

    if (!agent.permissions[operationType]) {
      return {
        allowed: false,
        reason: `Operação do tipo '${operationType}' negada para o agente '${agent.agent_id}'.`
      };
    }

    return { allowed: true };
  }

  static checkCredentialAccess(caller, provider, purpose) {
    const authorizedCallers = [
      'VercelDeployManager',
      'SupabaseDeployManager',
      'ProductionLifecycle',
      'architect',
      'builder',
      'ProductionHomologator'
    ];
    const validProviders = ['vercel', 'supabase'];
    const validPurposes = ['production_deploy', 'preview_deploy', 'database_migration'];

    if (!caller || !authorizedCallers.includes(caller)) {
      return {
        allowed: false,
        reason: `Chamador '${caller}' não está autorizado a solicitar credenciais de infraestrutura.`
      };
    }

    if (!provider || !validProviders.includes(provider)) {
      return {
        allowed: false,
        reason: `Provider de credencial '${provider}' inválido ou não suportado.`
      };
    }

    if (!purpose || !validPurposes.includes(purpose)) {
      return {
        allowed: false,
        reason: `Finalidade de credencial '${purpose}' inválida para o provider '${provider}'.`
      };
    }

    return { allowed: true };
  }
}

