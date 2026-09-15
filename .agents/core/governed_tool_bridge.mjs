/**
 * SOBRE MÍDIA AI Engineering System — Governed Tool Execution Bridge
 * Ponte canônica de execução de ferramentas sob governança estrita de permissões,
 * isolamento de caminhos, integridade de evidências e prevenção de operações destrutivas.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { registry } from './registry.mjs';
import { PermissionEngine } from './permissions.mjs';
import { highRiskGovernance, HighRiskGovernance } from './governance.mjs';
import { auditLogger } from './audit.mjs';
import { validateEvidence, deepFreeze, VALID_HIGH_RISK_OPERATIONS } from './contracts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultWorkspaceRoot = path.resolve(__dirname, '..', '..');
const gitGuardPath = path.resolve(__dirname, '..', 'scripts', 'git_guard.ps1');

/**
 * Validação de contrato para requisições de ferramentas governadas.
 */
export function validateToolRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object') {
    return ['Requisição de ferramenta nula ou não é um objeto.'];
  }

  if (!request.tool || typeof request.tool !== 'string') {
    errors.push("Campo obrigatório 'tool' ausente ou inválido.");
  }

  if (!request.agent_id || typeof request.agent_id !== 'string') {
    errors.push("Campo obrigatório 'agent_id' ausente ou inválido.");
  }

  if (!request.task_id || typeof request.task_id !== 'string') {
    errors.push("Campo obrigatório 'task_id' ausente ou inválido.");
  }

  if (!request.execution_id || typeof request.execution_id !== 'string') {
    errors.push("Campo obrigatório 'execution_id' ausente ou inválido.");
  }

  if (request.arguments !== undefined && (typeof request.arguments !== 'object' || request.arguments === null)) {
    errors.push("Campo 'arguments' deve ser um objeto.");
  }

  return errors;
}

export class GovernedToolBridge {
  constructor(agentRegistry = registry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Executa uma ferramenta solicitada pelo agente/LLM após validação rigorosa de toda a cadeia de governança.
   *
   * @param {object} request - Requisição de execução da ferramenta
   * @param {object} [executionContext] - Contexto de execução do agente
   * @param {object} [options={}] - Opções de execução adicionais
   * @returns {Promise<object>} Resultado da execução com evidências físicas
   */
  async executeGovernedTool(request, executionContext = null, options = {}) {
    const startedAt = new Date().toISOString();
    const reqErrors = validateToolRequest(request);

    if (reqErrors.length > 0) {
      return deepFreeze({
        success: false,
        tool: request?.tool || 'UNKNOWN',
        agent_id: request?.agent_id || 'UNKNOWN',
        task_id: request?.task_id || 'UNKNOWN',
        execution_id: request?.execution_id || 'UNKNOWN',
        target_path: null,
        output: null,
        evidence: [],
        files_touched: [],
        errors: [`Requisição de ferramenta inválida: ${reqErrors.join(', ')}`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }

    const { tool, agent_id, task_id, execution_id, arguments: args = {} } = request;
    const targetWs = request.workspace_root || executionContext?.task?.workspace_root || defaultWorkspaceRoot;
    const normWs = path.resolve(targetWs).replace(/\\/g, '/');

    // 1. Validar agente no Registry
    const agent = this.agentRegistry.getAgent(agent_id);
    if (!agent) {
      return deepFreeze({
        success: false,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: null,
        output: null,
        evidence: [],
        files_touched: [],
        errors: [`Agente '${agent_id}' não está registrado no AgentRegistry.`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }

    if (agent.status !== 'ACTIVE') {
      return deepFreeze({
        success: false,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: null,
        output: null,
        evidence: [],
        files_touched: [],
        errors: [`Agente '${agent_id}' não está ativo (status: ${agent.status}).`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }

    // 2. Validar permissão de ferramenta (Tool Permission)
    const toolPerm = PermissionEngine.checkToolPermission(agent, tool);
    if (!toolPerm.allowed) {
      return deepFreeze({
        success: false,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: null,
        output: null,
        evidence: [],
        files_touched: [],
        errors: [`Permissão de ferramenta negada pelo PermissionEngine: ${toolPerm.reason}`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }

    // 3. Determinar tipo de operação e caminho alvo
    let operationType = 'read';
    let rawPath = args.path || args.file_path || args.target_path || args.dir_path || null;

    if (tool === 'write_to_file' || tool === 'replace_file_content' || tool === 'multi_replace_file_content') {
      operationType = 'write';
    } else if (tool === 'run_command') {
      operationType = 'execute';
    } else {
      operationType = 'read';
    }

    // 4. Validar permissão da operação (Operation Permission)
    const opPerm = PermissionEngine.checkOperationPermission(agent, operationType);
    if (!opPerm.allowed) {
      return deepFreeze({
        success: false,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: rawPath,
        output: null,
        evidence: [],
        files_touched: [],
        errors: [`Permissão de operação '${operationType}' negada: ${opPerm.reason}`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }

    // 5. Validar confinamento de caminho (Path Permission) para ferramentas de arquivo
    if (rawPath) {
      const pathPerm = PermissionEngine.checkPathPermission(agent, rawPath, normWs);
      if (!pathPerm.allowed) {
        return deepFreeze({
          success: false,
          tool,
          agent_id,
          task_id,
          execution_id,
          target_path: rawPath,
          output: null,
          evidence: [],
          files_touched: [],
          errors: [`Permissão de caminho negada pelo PermissionEngine: ${pathPerm.reason}`],
          started_at: startedAt,
          completed_at: new Date().toISOString()
        });
      }
    }

    // 6. Validar High-Risk Governance
    const isHighRisk = (
      args.is_high_risk === true ||
      VALID_HIGH_RISK_OPERATIONS.includes(tool) ||
      HighRiskGovernance.isHighRiskOperation(operationType, rawPath || args.command || '')
    );

    if (isHighRisk) {
      if (!highRiskGovernance.canExecute(args.approval_request_id)) {
        return deepFreeze({
          success: false,
          tool,
          agent_id,
          task_id,
          execution_id,
          target_path: rawPath,
          output: null,
          evidence: [],
          files_touched: [],
          errors: [`[HIGH-RISK SECURITY VIOLATION]: Operação de alto risco bloqueada fail-closed. Solicitação de aprovação '${args.approval_request_id || 'NENHUMA'}' não autorizada.`],
          started_at: startedAt,
          completed_at: new Date().toISOString()
        });
      }
    }

    // 7. Validar PreToolGuard para comandos de shell
    if (tool === 'run_command' && args.command) {
      const commandLine = args.command || args.command_line;
      if (fs.existsSync(gitGuardPath)) {
        try {
          const guardRes = spawnSync('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            gitGuardPath,
            '-CommandToValidate',
            commandLine
          ], { encoding: 'utf8', timeout: 10000, windowsHide: true });

          if (guardRes.status === 1) {
            return deepFreeze({
              success: false,
              tool,
              agent_id,
              task_id,
              execution_id,
              target_path: null,
              output: null,
              evidence: [],
              files_touched: [],
              errors: [`[PRE-TOOL GUARD DENIED]: Comando '${commandLine}' bloqueado pela política de segurança do Git Guard.`],
              started_at: startedAt,
              completed_at: new Date().toISOString()
            });
          }
        } catch (guardErr) {
          return deepFreeze({
            success: false,
            tool,
            agent_id,
            task_id,
            execution_id,
            target_path: null,
            output: null,
            evidence: [],
            files_touched: [],
            errors: [`Falha na validação do PreToolGuard: ${guardErr.message}`],
            started_at: startedAt,
            completed_at: new Date().toISOString()
          });
        }
      }
    }

    // 8. Execução Física da Ferramenta sob Governança
    try {
      let output = null;
      const filesTouched = [];
      const evidence = [];

      // Resolvendo caminho absoluto seguro no workspace
      let absPath = null;
      if (rawPath) {
        absPath = path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(normWs, rawPath);
      }

      if (tool === 'write_to_file') {
        const content = args.content !== undefined ? args.content : (args.code_content || '');
        const parentDir = path.dirname(absPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(absPath, content, 'utf8');
        filesTouched.push(rawPath);
        output = {
          bytes_written: Buffer.byteLength(content, 'utf8'),
          path: rawPath,
          written: true
        };
        evidence.push({
          command: `tool:write_to_file:${rawPath}`,
          exit_code: 0,
          summary: `Arquivo '${rawPath}' gravado com sucesso com ${output.bytes_written} bytes`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        });
      } else if (tool === 'replace_file_content') {
        if (!fs.existsSync(absPath)) {
          throw new Error(`Arquivo não encontrado para substituição: ${rawPath}`);
        }
        const existingContent = fs.readFileSync(absPath, 'utf8');
        const targetContent = args.target_content || '';
        const replacementContent = args.replacement_content || '';

        if (!existingContent.includes(targetContent)) {
          throw new Error(`Conteúdo alvo '${targetContent}' não encontrado no arquivo '${rawPath}'.`);
        }
        const newContent = existingContent.replace(targetContent, replacementContent);
        fs.writeFileSync(absPath, newContent, 'utf8');
        filesTouched.push(rawPath);
        output = {
          path: rawPath,
          replaced: true
        };
        evidence.push({
          command: `tool:replace_file_content:${rawPath}`,
          exit_code: 0,
          summary: `Conteúdo substituído com sucesso no arquivo '${rawPath}'`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        });
      } else if (tool === 'view_file') {
        if (!fs.existsSync(absPath)) {
          throw new Error(`Arquivo não encontrado para leitura: ${rawPath}`);
        }
        const content = fs.readFileSync(absPath, 'utf8');
        output = {
          path: rawPath,
          content,
          lines: content.split('\n').length
        };
        evidence.push({
          command: `tool:view_file:${rawPath}`,
          exit_code: 0,
          summary: `Arquivo '${rawPath}' lido com sucesso (${output.lines} linhas)`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        });
      } else if (tool === 'list_dir') {
        const dirToRead = absPath || normWs;
        if (!fs.existsSync(dirToRead)) {
          throw new Error(`Diretório não encontrado: ${rawPath || '.'}`);
        }
        const entries = fs.readdirSync(dirToRead);
        output = {
          path: rawPath || '.',
          entries
        };
        evidence.push({
          command: `tool:list_dir:${rawPath || '.'}`,
          exit_code: 0,
          summary: `Diretório '${rawPath || '.'}' listado (${entries.length} itens)`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        });
      } else if (tool === 'run_command') {
        const cmd = args.command || args.command_line || 'echo ok';
        const cwd = args.cwd ? (path.isAbsolute(args.cwd) ? args.cwd : path.resolve(normWs, args.cwd)) : normWs;
        const execRes = spawnSync(cmd, {
          cwd,
          shell: true,
          encoding: 'utf8',
          timeout: args.timeout || 30000
        });
        output = {
          stdout: execRes.stdout || '',
          stderr: execRes.stderr || '',
          status: execRes.status
        };
        evidence.push({
          command: `tool:run_command:${cmd}`,
          exit_code: execRes.status === 0 ? 0 : (execRes.status || 1),
          summary: execRes.status === 0 ? `Comando executado com sucesso: ${cmd}` : `Comando falhou com código ${execRes.status}: ${execRes.stderr || cmd}`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        });
      }

      // Validar cada evidência gerada
      for (const ev of evidence) {
        const evErr = validateEvidence(ev);
        if (evErr.length > 0) {
          throw new Error(`Evidência inválida gerada pela ferramenta: ${evErr.join(', ')}`);
        }
      }

      const toolResult = deepFreeze({
        success: true,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: rawPath,
        output,
        evidence,
        files_touched: filesTouched,
        errors: [],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });

      try {
        auditLogger.recordEvent({
          event_type: 'TOOL_EXECUTED',
          task_id,
          execution_id,
          agent_id,
          metadata: {
            tool,
            target_path: rawPath,
            files_touched: filesTouched,
            evidence_count: evidence.length
          }
        });
      } catch {}

      return toolResult;
    } catch (err) {
      return deepFreeze({
        success: false,
        tool,
        agent_id,
        task_id,
        execution_id,
        target_path: rawPath,
        output: null,
        evidence: [{
          command: `tool:${tool}:${rawPath || ''}`,
          exit_code: 1,
          summary: `Falha na execução da ferramenta: ${err.message}`,
          task_id,
          execution_id,
          agent_id,
          workspace_root: normWs
        }],
        files_touched: [],
        errors: [`Exceção ao executar ferramenta governada '${tool}': ${err.message}`],
        started_at: startedAt,
        completed_at: new Date().toISOString()
      });
    }
  }
}

export const governedToolBridge = new GovernedToolBridge();

// CLI Support for direct invocation by Antigravity / external callers
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  async function runCli() {
    let rawInput = process.argv.slice(2).join(' ').trim();
    if (!rawInput) {
      // Read from stdin if available
      try {
        rawInput = fs.readFileSync(0, 'utf8').trim();
      } catch {}
    }
    if (!rawInput) {
      console.error(JSON.stringify({ success: false, errors: ['Payload de requisição JSON ausente. Forneça como argumento, arquivo ou stdin.'] }));
      process.exit(1);
    }

    try {
      let request;
      if (rawInput.endsWith('.json') && fs.existsSync(rawInput)) {
        request = JSON.parse(fs.readFileSync(rawInput, 'utf8'));
      } else {
        request = JSON.parse(rawInput);
      }
      const result = await governedToolBridge.executeGovernedTool(request);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error(JSON.stringify({ success: false, errors: [`Erro ao processar requisição: ${err.message}`] }));
      process.exit(1);
    }
  }

  runCli();
}


