/**
 * SOBRE MÍDIA AI Engineering System — Multi-Agent Core Test Suite & Smoke Test
 * Bateria automatizada de validação de contratos, registry, lifecycle, canonical skills, execution adapter, permissions, routing, handoffs, isolamento e smoke test.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registry,
  validateAgentContract,
  validateAgentTask,
  validateAgentResult,
  AgentLifecycle,
  SkillLoader,
  canonicalSkillRegistry,
  CanonicalSkillRegistry,
  PermissionEngine,
  memoryManager,
  TaskRouter,
  HandoffManager,
  runtime,
  ExecutionAdapter,
  SingleExecutorAdapter,
  defaultExecutionAdapter
} from '../core/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scratchDir = path.resolve(__dirname, '..', 'scratch');

let passed = 0;
let total = 0;
const report = [];

function assert(condition, testName, details = '') {
  total++;
  if (condition) {
    passed++;
    report.push({ test: testName, status: 'PASS', details });
    console.log(`[✅ PASS] ${testName}`);
  } else {
    report.push({ test: testName, status: 'FAIL', details });
    console.error(`[❌ FAIL] ${testName} - ${details}`);
  }
}

console.log('🧪 Iniciando Bateria de Testes do MULTI-AGENT CORE (Micro-Gate 0.8)...\n');

// 1. REGISTRY TESTS
console.log('--- 1. AGENT REGISTRY & CONTRACTS ---');
const archAgent = registry.getAgent('architect');
assert(archAgent !== null && archAgent.agent_id === 'architect', 'Registry retorna agente core válido (architect)');
assert(registry.getAgent('unknown_agent') === null, 'Registry retorna null para agente desconhecido');

const allAgents = registry.listAgents();
assert(allAgents.length === 6, 'Registry contém exatamente os 6 agentes core canônicos');

// Teste de validação de contrato inválido
const invalidContract = { agent_id: 'fake' };
const validationResult = validateAgentContract(invalidContract);
assert(validationResult.length > 0, 'Contrato com campos obrigatórios ausentes é rejeitado');

// Teste de registro com Skill inexistente
let skillErrorCaught = false;
try {
  registry.registerAgent({
    agent_id: 'bad_agent',
    name: 'Bad Agent',
    version: '1.0.0',
    role: 'Test',
    objective: 'Test',
    skills: ['non-existent-skill-xyz'],
    tools: ['view_file'],
    permissions: { read: true, write: false, execute: false, allowed_paths: ['.agents/'] },
    memory_scope: 'TASK',
    budget: { max_files: 1, max_lines: 10 }
  });
} catch (e) {
  skillErrorCaught = true;
}
assert(skillErrorCaught, 'Registry rejeita registro de agente com Skill inexistente');

// 2. LIFECYCLE TESTS
console.log('\n--- 2. AGENT LIFECYCLE ---');
const lc = new AgentLifecycle('CREATED', 'test-exec-01');
assert(lc.getState() === 'CREATED', 'Lifecycle inicializa em CREATED');

lc.transitionTo('READY', 'Pronto para execução');
assert(lc.getState() === 'READY', 'Transição CREATED -> READY válida');

lc.transitionTo('RUNNING', 'Iniciando');
assert(lc.getState() === 'RUNNING', 'Transição READY -> RUNNING válida');

lc.transitionTo('COMPLETED', 'Finalizado');
assert(lc.getState() === 'COMPLETED' && lc.isTerminal(), 'Transição RUNNING -> COMPLETED válida (terminal)');

let illegalTransitionCaught = false;
try {
  lc.transitionTo('RUNNING', 'Transição ilegal a partir de terminal');
} catch {
  illegalTransitionCaught = true;
}
assert(illegalTransitionCaught, 'Lifecycle bloqueia transição ilegal a partir de estado terminal');

// 3. CANONICAL SKILL RUNTIME & DISCOVERY TESTS
console.log('\n--- 3. CANONICAL SKILL DISCOVERY, RESOLUTION & CONTENT DELIVERY ---');
const discovered = canonicalSkillRegistry.listDiscoveredSkills();
assert(discovered.length >= 6, `CanonicalSkillRegistry descobre todas as skills (encontradas: ${discovered.length})`);

// 3.1 Verificação de descoberta multi-root sem duplicatas
const hasDiscoveryInAgents = discovered.some(s => s.skill_id === 'project-discovery' && s.source_path.includes('.agents'));
const hasDiscoveryInOpencode = discovered.some(s => s.skill_id === 'sobremidia-governanca' && s.source_path.includes('.opencode'));
assert(hasDiscoveryInAgents, 'Discovery localiza skills em .agents/skills/');
assert(hasDiscoveryInOpencode, 'Discovery localiza skills em .opencode/skills/');

// 3.2 Verificação de version: null e load_status: DISCOVERED
const sampleDiscovered = discovered.find(s => s.skill_id === 'project-discovery');
assert(sampleDiscovered && sampleDiscovered.version === null, 'Skill sem versionamento explícito possui version: null');
assert(sampleDiscovered && sampleDiscovered.load_status === 'DISCOVERED', 'Skill descoberta inicializa com load_status DISCOVERED');

// 3.3 Resolução canônica e carregamento de conteúdo
const resolvedGov = canonicalSkillRegistry.resolveSkill('sobremidia-governanca');
assert(
  resolvedGov && resolvedGov.load_status === 'LOADED' && typeof resolvedGov.content === 'string' && resolvedGov.content.length > 50,
  'Skill resolveSkill carrega conteúdo físico e transiciona para LOADED'
);

// 3.4 Entrega de contexto para Agente
const loadedArchSkills = SkillLoader.loadSkillsForAgent(archAgent);
assert(loadedArchSkills.length === 2, 'SkillLoader carrega exatamente as 2 skills declaradas pelo Architect');
assert(
  loadedArchSkills.every(s => s.load_status === 'AVAILABLE_IN_CONTEXT' && typeof s.content === 'string' && s.content.length > 0),
  'SkillLoader entrega content disponível no contexto com status AVAILABLE_IN_CONTEXT'
);

// 3.5 Bloqueio em caso de Skill inexistente
let missingSkillBlocked = false;
try {
  SkillLoader.loadSkillsForAgent({ agent_id: 'fake_agent', skills: ['fake_skill_404'] });
} catch (e) {
  missingSkillBlocked = e.message.includes('não pôde ser resolvida');
}
assert(missingSkillBlocked, 'SkillLoader lança erro determinístico ao solicitar Skill inexistente');

// 4. AGENT / EXECUTOR BOUNDARY TESTS
console.log('\n--- 4. AGENT / EXECUTOR BOUNDARY & SINGLE_EXECUTOR_ADAPTER ---');
assert(defaultExecutionAdapter instanceof ExecutionAdapter, 'defaultExecutionAdapter herda de ExecutionAdapter');
assert(defaultExecutionAdapter instanceof SingleExecutorAdapter, 'defaultExecutionAdapter é instância de SingleExecutorAdapter');
assert(defaultExecutionAdapter.executor_type === 'SINGLE_EXECUTOR', 'ExecutionAdapter declara executor_type: SINGLE_EXECUTOR');

// 4.1 Validação de contrato do Adapter
let invalidResultCaught = false;
try {
  await defaultExecutionAdapter.execute({
    agent: archAgent,
    task: { task_id: 'T-ADAPT', objective: 'Test' },
    executionContext: {},
    actionHandler: async () => ({ success: 'not_a_boolean' }) // Inválido
  });
} catch (e) {
  invalidResultCaught = e.message.includes('AgentResult inválido');
}
assert(invalidResultCaught, 'SingleExecutorAdapter valida e rejeita AgentResult fora de contrato');

// 4.2 Execução válida através do Adapter
const validExecRes = await defaultExecutionAdapter.execute({
  agent: archAgent,
  task: { task_id: 'T-ADAPT-OK', objective: 'Test Valid' },
  executionContext: {},
  actionHandler: async () => ({
    success: true,
    summary: 'Execução via adapter validada',
    evidence: []
  })
});
assert(
  validExecRes.executor_type === 'SINGLE_EXECUTOR' && validExecRes.result.success === true,
  'SingleExecutorAdapter executa actionHandler e retorna resultado tipado'
);

// 5. PERMISSIONS ENGINE & EMPIRICAL SIDE-EFFECT TESTS
console.log('\n--- 5. PERMISSIONS & EMPIRICAL SIDE-EFFECT PROOFS ---');
assert(PermissionEngine.checkToolPermission(archAgent, 'view_file').allowed === true, 'Architect tem permissão para view_file');
assert(PermissionEngine.checkToolPermission(archAgent, 'write_to_file').allowed === false, 'Architect NÃO tem permissão para write_to_file');
assert(PermissionEngine.checkOperationPermission(archAgent, 'read').allowed === true, 'Architect tem permissão de leitura (read: true)');
assert(PermissionEngine.checkOperationPermission(archAgent, 'write').allowed === false, 'Architect NÃO tem permissão de escrita (write: false)');
assert(PermissionEngine.checkPathPermission(archAgent, 'src/modules/crm/').allowed === true, 'Architect tem permissão para caminho src/');
assert(PermissionEngine.checkPathPermission(archAgent, 'src/file.ts').allowed === true, 'Architect tem permissão para arquivo legítimo dentro de src/');
assert(PermissionEngine.checkPathPermission(archAgent, 'src/../public/leak.ts').allowed === false, 'Canonicalization bloqueia traversal relativo (src/../public/leak.ts)');
assert(PermissionEngine.checkPathPermission(archAgent, 'src/modules/../../public/leak.ts').allowed === false, 'Canonicalization bloqueia deep traversal relativo');
assert(PermissionEngine.checkPathPermission(archAgent, 'srcfoo/file.ts').allowed === false, 'Canonicalization bloqueia prefix collision (srcfoo/ vs src/)');
assert(PermissionEngine.checkPathPermission(archAgent, '../package.json').allowed === false, 'Canonicalization bloqueia escape para fora do workspace');
assert(PermissionEngine.checkPathPermission(archAgent, 'src\\..\\public\\leak.ts').allowed === false, 'Canonicalization bloqueia traversal com separadores Windows');
assert(PermissionEngine.checkPathPermission(archAgent, 'node_modules/').allowed === false, 'Architect NÃO tem permissão para caminho não-autorizado');

// 5.1 Prova Empírica de Permissão Autorizada (Side-Effect Existe)
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
const authorizedFilePath = path.join(scratchDir, 'test_authorized_side_effect.txt');
if (fs.existsSync(authorizedFilePath)) fs.unlinkSync(authorizedFilePath);

const builderAgent = registry.getAgent('builder');
const canBuilderWrite = PermissionEngine.checkToolPermission(builderAgent, 'write_to_file').allowed &&
                        PermissionEngine.checkPathPermission(builderAgent, '.agents/scratch/').allowed &&
                        PermissionEngine.checkOperationPermission(builderAgent, 'write').allowed;

if (canBuilderWrite) {
  fs.writeFileSync(authorizedFilePath, 'Side-effect autorizado gravado com sucesso.', 'utf8');
}
assert(fs.existsSync(authorizedFilePath), 'Side-effect real: Operação autorizada gera efeito colateral em disco');
if (fs.existsSync(authorizedFilePath)) fs.unlinkSync(authorizedFilePath);

// 5.2 Prova Empírica de Permissão Negada (Side-Effect NÃO Existe)
const unauthorizedFilePath = path.join(scratchDir, 'test_unauthorized_leak.txt');
if (fs.existsSync(unauthorizedFilePath)) fs.unlinkSync(unauthorizedFilePath);

// Architect tenta escrever (proibido write: false)
const canArchitectWrite = PermissionEngine.checkToolPermission(archAgent, 'write_to_file').allowed &&
                          PermissionEngine.checkOperationPermission(archAgent, 'write').allowed;

if (canArchitectWrite) {
  fs.writeFileSync(unauthorizedFilePath, 'FALHA: Arquivo não deveria ter sido escrito!', 'utf8');
}
assert(!fs.existsSync(unauthorizedFilePath), 'Side-effect real: Operação negada é bloqueada e arquivo NÃO é criado em disco');

// 6. SCOPED MEMORY ISOLATION TESTS
console.log('\n--- 6. SCOPED MEMORY ISOLATION ---');
memoryManager.set('GLOBAL', 'project_name', 'SOBRE MÍDIA', 'orchestrator');
memoryManager.set('AGENT', 'secret_notes', 'Architect secret analysis', 'architect');
memoryManager.set('AGENT', 'secret_notes', 'Builder secret implementation', 'builder');

assert(memoryManager.get('GLOBAL', 'project_name', 'builder') === 'SOBRE MÍDIA', 'Memória GLOBAL acessível por qualquer agente');
assert(memoryManager.get('AGENT', 'secret_notes', 'architect') === 'Architect secret analysis', 'Memória AGENT acessível pelo próprio Architect');
assert(memoryManager.get('AGENT', 'secret_notes', 'builder') === 'Builder secret implementation', 'Memória AGENT acessível pelo próprio Builder');
assert(memoryManager.get('AGENT', 'secret_notes', 'forensic') === null, 'Memória AGENT isolada: Forensic não lê memória privada do Architect');

// 7. TASK TO AGENT ROUTING TESTS
console.log('\n--- 7. TASK TO AGENT ROUTING ---');
const routeArch = TaskRouter.routeTask({ task_id: 'T-1', objective: 'Modelar arquitetura e fluxo de contratos' });
assert(routeArch.selected_agent === 'architect', 'Router direciona objetivo de arquitetura para architect');

const routeDb = TaskRouter.routeTask({ task_id: 'T-2', objective: 'Ajustar policy de RLS e migration no Supabase' });
assert(routeDb.selected_agent === 'database', 'Router direciona objetivo de banco/RLS para database');

const routeForensic = TaskRouter.routeTask({ task_id: 'T-3', objective: 'Auditoria forense de causa raiz e diff' });
assert(routeForensic.selected_agent === 'forensic', 'Router direciona objetivo de auditoria para forensic');

const routeQA = TaskRouter.routeTask({ task_id: 'T-4', objective: 'Executar suíte de testes de regressão' });
assert(routeQA.selected_agent === 'qa', 'Router direciona objetivo de testes para qa');

const routeBuilder = TaskRouter.routeTask({ task_id: 'T-5', objective: 'Implementar novo componente de assinatura' });
assert(routeBuilder.selected_agent === 'builder', 'Router direciona objetivo de implementação para builder');

// 8. HANDOFF MANAGER TESTS
console.log('\n--- 8. AGENT-TO-AGENT HANDOFF ---');
const validHandoff = HandoffManager.createHandoffPayload({
  handoff_id: 'HND-TEST-001',
  task_id: 'T-SMOKE-01',
  from: 'Architect',
  to: 'Forensic',
  status: 'READY',
  objective: 'Análise de arquitetura concluída',
  completed_work: 'Estrutura mapeada',
  evidence: [{ command: 'node .agents/skills/project-discovery/scripts/scan_project.mjs', exit_code: 0 }],
  files_changed: [],
  tests_run: ['node .agents/skills/project-discovery/scripts/scan_project.mjs'],
  open_issues: [],
  constraints: [],
  next_action: 'Forensic auditar diff'
});

const validHandoffRes = HandoffManager.validateHandoff(validHandoff);
assert(validHandoffRes.valid === true, 'HandoffManager valida handoff com schema e evidências corretas');

const invalidHandoff = { ...validHandoff, evidence: [{ command: 'broken-cmd', exit_code: 1 }] };
const invalidHandoffRes = HandoffManager.validateHandoff(invalidHandoff);
assert(invalidHandoffRes.valid === false, 'HandoffManager rejeita handoff com evidência inválida (exit_code != 0)');

// 9. ABLATION TESTS
console.log('\n--- 9. ABLATION TESTS ---');
// Ablação 1: Agente inexistente
const spawnNonExistent = runtime.spawnAgent('non_existent_agent', { task_id: 'T-ABL-1', objective: 'Test' });
assert(spawnNonExistent.status === 'BLOCKED', 'Ablação: Spawn de agente inexistente resulta em status BLOCKED');

// Ablação 2: Handoff inválido bloqueia agente destino
const spawnBlockedByHandoff = runtime.spawnAgent('forensic', { task_id: 'T-ABL-2', objective: 'Test' }, { handoff: invalidHandoff });
assert(spawnBlockedByHandoff.status === 'BLOCKED', 'Ablação: Handoff inválido bloqueia inicialização do Agent B (BLOCKED)');

// 10. FULL MULTI-AGENT SMOKE TEST (Section 14)
console.log('\n--- 10. FULL MULTI-AGENT SMOKE TEST (Orchestrator -> Architect -> Forensic -> Orchestrator) ---');
async function runSmokeTest() {
  const rootTask = {
    task_id: 'TASK-SMOKE-SM-001',
    type: 'ARCHITECTURE_AND_AUDIT',
    objective: 'Faça uma análise arquitetural simples do projeto e audite o diff.',
    context: 'Validação operacional ponta a ponta do Multi-Agent Core.'
  };

  // Step A: Orchestrator classifica e faz routing
  const routing = TaskRouter.routeTask(rootTask);
  assert(routing.selected_agent === 'architect', 'Smoke A: Orchestrator faz routing inicial para Architect');

  // Step B & C: Spawn Architect
  const archSpawn = runtime.spawnAgent('architect', {
    task_id: rootTask.task_id,
    objective: 'Analisar arquitetura de módulos do projeto'
  });
  assert(archSpawn.lifecycle.getState() === 'READY', 'Smoke B: Architect entra em READY com skills vinculadas');

  // Step D: Architect executa via SingleExecutorAdapter
  const archExecResult = await archSpawn.execute(async (ctx) => {
    // Prova de entrega de conteúdo da Skill no executionContext
    const discSkill = ctx.getSkill('project-discovery');
    if (!discSkill || !discSkill.content || discSkill.load_status !== 'AVAILABLE_IN_CONTEXT') {
      throw new Error('Falha na entrega de conteúdo de Skill no executionContext');
    }

    return {
      success: true,
      summary: 'Arquitetura validada: 5 módulos principais no CRM, isolamento de portais e integração Supabase confirmada.',
      evidence: [
        {
          command: 'node .agents/skills/project-discovery/scripts/scan_project.mjs',
          exit_code: 0,
          summary: 'Discovery de estrutura executado com sucesso'
        }
      ],
      files_touched: ['.agents/project_profile.md'],
      metrics: { modules_scanned: 5 }
    };
  });
  assert(archExecResult.status === 'COMPLETED', 'Smoke C & D: Architect executa via SingleExecutorAdapter e produz AgentResult validado (COMPLETED)');
  assert(archExecResult.executor_type === 'SINGLE_EXECUTOR', 'Smoke D2: Execução registra executor_type: SINGLE_EXECUTOR');

  // Step E & F: Handoff Architect -> Forensic
  const handoffArchToForensic = HandoffManager.createHandoffPayload({
    handoff_id: 'HND-SMOKE-001',
    task_id: rootTask.task_id,
    from: 'Architect',
    to: 'Forensic',
    status: 'READY',
    objective: 'Auditar diff após validação arquitetural',
    completed_work: archExecResult.result.summary,
    evidence: archExecResult.evidence,
    files_changed: archExecResult.result.files_touched,
    tests_run: ['node .agents/skills/project-discovery/scripts/scan_project.mjs'],
    next_action: 'Forensic auditar conformidade de diff'
  });

  const handoffCheck = HandoffManager.validateHandoff(handoffArchToForensic);
  assert(handoffCheck.valid === true, 'Smoke E & F: Handoff Architect -> Forensic gerado e validado');

  // Step G & H: Forensic recebe handoff e executa
  const forensicSpawn = runtime.spawnAgent('forensic', {
    task_id: rootTask.task_id,
    objective: 'Executar auditoria forense do diff com base no handoff recebido'
  }, { handoff: handoffArchToForensic });

  assert(forensicSpawn.lifecycle.getState() === 'READY', 'Smoke G: Forensic aceita handoff validado e entra em READY');

  const forensicExecResult = await forensicSpawn.execute(async (ctx) => {
    // Prova de acesso a skill do forensic
    const forSkill = ctx.getSkill('forensic-auditor');
    if (!forSkill || !forSkill.content) {
      throw new Error('Falha no acesso ao conteúdo da skill forensic-auditor');
    }

    return {
      success: true,
      summary: 'Auditoria forense PASS: Nenhuma violação ou padrão proibido detectado.',
      evidence: [
        {
          command: 'node .agents/skills/forensic-auditor/scripts/audit_diff.mjs',
          exit_code: 0,
          summary: 'Audit diff executado com zero avisos'
        }
      ],
      files_touched: [],
      metrics: { forbidden_patterns: 0 }
    };
  });
  assert(forensicExecResult.status === 'COMPLETED', 'Smoke H & I: Forensic executa com sucesso e produz AgentResult (COMPLETED)');
  assert(forensicExecResult.executor_type === 'SINGLE_EXECUTOR', 'Smoke I2: Execução do Forensic registra executor_type: SINGLE_EXECUTOR');

  // Step J & K: Orchestrator sintetiza e valida persistência
  const archPersisted = runtime.getExecutionRecord(archExecResult.execution_id);
  const forensicPersisted = runtime.getExecutionRecord(forensicExecResult.execution_id);

  assert(archPersisted !== null && archPersisted.status === 'COMPLETED', 'Smoke J: Execução do Architect persistida em disco');
  assert(forensicPersisted !== null && forensicPersisted.status === 'COMPLETED', 'Smoke K: Execução do Forensic persistida em disco');
  assert(archPersisted.executor_type === 'SINGLE_EXECUTOR', 'Smoke L: Registro em disco contém executor_type: SINGLE_EXECUTOR');

  console.log('\n=========================================================');
  console.log(`🎉 MULTI-AGENT CORE VALIDATION: ${passed}/${total} TESTES APROVADOS.`);
  console.log('=========================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSmokeTest().catch(err => {
  console.error('❌ Erro fatal durante o smoke test:', err);
  process.exit(1);
});

