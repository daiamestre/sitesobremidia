/**
 * SOBRE MÍDIA AI Engineering System — Autonomous Android Governance Test Suite
 *
 * Valida o fechamento dos gaps P0/P1:
 * 1. Skill Runtime dispatching Android skills com captura de evidências reais.
 * 2. ADB parsing estruturado e Target Device Selection fail-closed.
 * 3. Change Impact Analysis determinístico e seleção de suíte mínima.
 * 4. Git Guard e High-Risk Governance contra mass staging e perda de dados.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  AndroidEnvironmentDiscovery,
  AndroidBuildManager,
  PlayerContractValidator,
  PlayerCanaryValidator,
  OtaReleaseManager,
  PlayerReleaseAuthority,
  AndroidChangeImpactAnalyzer
} from '../core/android_player_pipeline.mjs';

import { skillRuntime, SkillRuntime } from '../core/skill_runtime.mjs';
import { HighRiskGovernance } from '../core/governance.mjs';
import { registry } from '../core/registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  ✅ ${message}`);
}

async function runTests() {
  console.log('=================================================================');
  console.log('TEST SUITE: AUTONOMOUS ANDROID GOVERNANCE & PIPELINE INTEGRITY');
  console.log('=================================================================\n');

  // ---------------------------------------------------------------------------
  // BLOCO 1: SKILL RUNTIME DISPATCH DE SKILLS ANDROID REAIS
  // ---------------------------------------------------------------------------
  console.log('>>> BLOCO 1: Skill Runtime Dispatch & Evidências Reais');

  // 1.1 android-player-engineering: discover_android_environment
  const execContext1 = {
    taskId: 'TASK-TEST-001',
    executionId: 'EXEC-TEST-001',
    agentId: 'android_engineer',
    workspaceRoot,
    securityLevel: 'LEVEL_2'
  };

  const discoveryRes = await skillRuntime.executeSkill({
    skill_id: 'android-player-engineering',
    agent_id: 'android_engineer',
    task_id: 'TASK-TEST-001',
    execution_id: 'EXEC-TEST-001',
    action: 'discover_android_environment',
    input: {},
    targetWorkspace: workspaceRoot,
    executionContext: execContext1
  });

  assert(discoveryRes.success === true, 'android-player-engineering:discover_android_environment executa com sucesso');
  assert(discoveryRes.output?.is_available === true, 'Ambiente Android host foi descoberto e está disponível');
  assert(discoveryRes.output?.java_version?.includes('21'), 'JDK descoberto é a versão 21');
  assert(discoveryRes.evidence?.length > 0, 'Evidência física produzida pelo dispatch da skill');
  assert(discoveryRes.evidence[0].command === 'android-player-engineering:discover_android_environment', 'Comando de evidência fiel');

  // 1.2 android-player-engineering: inspect_player_codebase
  const inspectRes = await skillRuntime.executeSkill({
    skill_id: 'android-player-engineering',
    agent_id: 'android_engineer',
    task_id: 'TASK-TEST-002',
    execution_id: 'EXEC-TEST-002',
    action: 'inspect_player_codebase',
    input: {},
    targetWorkspace: workspaceRoot,
    executionContext: {
      taskId: 'TASK-TEST-002',
      executionId: 'EXEC-TEST-002',
      agentId: 'android_engineer',
      workspaceRoot,
      securityLevel: 'LEVEL_2'
    }
  });

  assert(inspectRes.success === true, 'android-player-engineering:inspect_player_codebase executa com sucesso');
  assert(inspectRes.output?.has_player === true, 'Diretório native-android-player detectado');
  assert(inspectRes.output?.has_main_activity === true, 'MainActivity.kt detectada');
  assert(inspectRes.output?.is_complete === true, 'Estrutura completa do Player validada');

  // 1.3 device-canary-validation: run_canary_homologation
  const canaryRes = await skillRuntime.executeSkill({
    skill_id: 'device-canary-validation',
    agent_id: 'android_engineer',
    task_id: 'TASK-TEST-003',
    execution_id: 'EXEC-TEST-003',
    action: 'run_canary_homologation',
    input: {
      payload_response: {
        status: 'SUCCESS',
        device: { id: 'test-device-uuid', orientation: 'LANDSCAPE' },
        playlist: {
          id: 'test-playlist-uuid',
          items: [{ id: 'item-1', duration: 15, media: { url: 'https://r2.sobremidia.com/vid.mp4', type: 'video' } }]
        }
      },
      require_physical_device: false
    },
    targetWorkspace: workspaceRoot,
    executionContext: {
      taskId: 'TASK-TEST-003',
      executionId: 'EXEC-TEST-003',
      agentId: 'android_engineer',
      workspaceRoot,
      securityLevel: 'LEVEL_2'
    }
  });

  assert(canaryRes.success === true, 'device-canary-validation:run_canary_homologation executa com sucesso');
  assert(['CANARY_AVD_PROVEN', 'CANARY_SANDBOX_PROVEN', 'CANARY_PHYSICAL_PROVEN'].includes(canaryRes.output?.canary_status), 'Canary status aprovado com classificação formal');

  // 1.4 ota-release-management: publish_ota_manifest
  const otaRes = await skillRuntime.executeSkill({
    skill_id: 'ota-release-management',
    agent_id: 'android_engineer',
    task_id: 'TASK-TEST-004',
    execution_id: 'EXEC-TEST-004',
    action: 'publish_ota_manifest',
    input: {
      version_code: 514,
      version_name: '5.1.4-governed',
      apk_url: 'https://r2.sobremidia.com/releases/player-514.apk',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    targetWorkspace: workspaceRoot,
    executionContext: {
      taskId: 'TASK-TEST-004',
      executionId: 'EXEC-TEST-004',
      agentId: 'android_engineer',
      workspaceRoot,
      securityLevel: 'LEVEL_2'
    }
  });

  assert(otaRes.success === true, 'ota-release-management:publish_ota_manifest gera manifesto válido');
  assert(otaRes.output?.manifest?.version_code === 514, 'Version code 514 preservado no manifesto');

  // 1.5 player-regression-forensics: audit_player_regression
  const forensicRes = await skillRuntime.executeSkill({
    skill_id: 'player-regression-forensics',
    agent_id: 'android_engineer',
    task_id: 'TASK-TEST-005',
    execution_id: 'EXEC-TEST-005',
    action: 'audit_player_regression',
    input: {
      payload: {
        status: 'DEVICE_REVOKED',
        error: 'Dispositivo revogado pela administração'
      }
    },
    targetWorkspace: workspaceRoot,
    executionContext: {
      taskId: 'TASK-TEST-005',
      executionId: 'EXEC-TEST-005',
      agentId: 'android_engineer',
      workspaceRoot,
      securityLevel: 'LEVEL_2'
    }
  });

  assert(forensicRes.success === true, 'player-regression-forensics:audit_player_regression valida status canônico');
  assert(forensicRes.output?.valid === true, 'Status DEVICE_REVOKED reconhecido como válido no contrato');

  console.log('✅ BLOCO 1 PASS: Todas as 4 skills Android despacham ações reais com evidência física.\n');

  // ---------------------------------------------------------------------------
  // BLOCO 2: ADB PARSER & TARGET DEVICE SELECTION GOVERNANCE
  // ---------------------------------------------------------------------------
  console.log('>>> BLOCO 2: ADB Parser & Target Device Selection Governance');

  // 2.1 Parser com emulador e dispositivo físico
  const mockAdbOutput = `List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64x transport_id:1
RF8M1234567            device product:greatqlte model:SM_N950F device:greatqlte transport_id:2
192.168.1.100:5555     unauthorized transport_id:3
OLDDEVICE001           offline transport_id:4
`;

  const parsed = PlayerCanaryValidator.parseAdbDevicesOutput(mockAdbOutput);
  assert(parsed.length === 4, 'Parser ADB processou todos os 4 dispositivos');
  assert(parsed[0].type === 'EMULATOR', 'emulator-5554 classificado como EMULATOR');
  assert(parsed[0].state === 'device', 'emulator-5554 está em estado device');
  assert(parsed[1].type === 'PHYSICAL_DEVICE', 'RF8M1234567 classificado como PHYSICAL_DEVICE');
  assert(parsed[1].model === 'SM_N950F', 'Modelo do dispositivo físico extraído corretamente');
  assert(parsed[2].state === 'unauthorized', 'Dispositivo não autorizado classificado corretamente');
  assert(parsed[3].state === 'offline', 'Dispositivo offline classificado corretamente');

  // 2.2 Target Selection: Condição 1 — Ausência de dispositivo → Bloqueio fail-closed
  const emptyCheck = PlayerCanaryValidator.selectTargetDevice({
    workspace_root: workspaceRoot,
    device_fixture: { has_device: false, device_state: 'NO_DEVICE', devices: [], active_devices: [] }
  });
  assert(emptyCheck.success === false, 'Condição 1: Ausência de dispositivos bloqueia target selection fail-closed');
  assert(['NO_DEVICE_AVAILABLE', 'NO_ADB'].includes(emptyCheck.status), 'Condição 1: Status NO_DEVICE_AVAILABLE retornado para ausência de hardware');

  // Criar fixture com múltiplos dispositivos
  const multiFixture = {
    has_device: true,
    device_state: 'MULTIPLE_DEVICES',
    devices: parsed,
    active_devices: parsed.filter(d => d.state === 'device')
  };

  // 2.3 Target Selection: Condição 2 — Múltiplos dispositivos sem preferência → Bloqueio (ambiguidade proibida)
  const multiCheck = PlayerCanaryValidator.selectTargetDevice({ device_fixture: multiFixture });
  assert(multiCheck.success === false, 'Condição 2: Múltiplos dispositivos sem serial explícito bloqueia com AMBIGUOUS_TARGET_SELECTION');
  assert(multiCheck.status === 'AMBIGUOUS_TARGET_SELECTION', 'Condição 2: Status AMBIGUOUS_TARGET_SELECTION confirmado');

  // 2.4 Target Selection: Condição 3 — Serial válido → Seleção inequívoca
  const validCheck = PlayerCanaryValidator.selectTargetDevice({
    preferred_serial: 'RF8M1234567',
    device_fixture: multiFixture
  });
  assert(validCheck.success === true, 'Condição 3: Serial válido seleciona dispositivo com sucesso');
  assert(validCheck.status === 'TARGET_SELECTED', 'Condição 3: Status TARGET_SELECTED confirmado');
  assert(validCheck.target_device?.serial === 'RF8M1234567', 'Condição 3: Target device serial coincide com o solicitado');

  // 2.5 Target Selection: Condição 4 — Tipo incompatível → Bloqueio
  const typeMismatchCheck = PlayerCanaryValidator.selectTargetDevice({
    preferred_serial: 'emulator-5554',
    require_type: 'PHYSICAL_DEVICE',
    device_fixture: multiFixture
  });
  assert(typeMismatchCheck.success === false, 'Condição 4: Tipo divergente (EMULATOR vs PHYSICAL_DEVICE) bloqueia com DEVICE_TYPE_MISMATCH');
  assert(typeMismatchCheck.status === 'DEVICE_TYPE_MISMATCH', 'Condição 4: Status DEVICE_TYPE_MISMATCH confirmado');

  // 2.6 Target Selection: Condição 5 — Serial inexistente → Bloqueio
  const notFoundCheck = PlayerCanaryValidator.selectTargetDevice({
    preferred_serial: 'NON_EXISTENT_SERIAL_999',
    device_fixture: multiFixture
  });
  assert(notFoundCheck.success === false, 'Condição 5: Serial inexistente bloqueia com TARGET_NOT_FOUND');
  assert(notFoundCheck.status === 'TARGET_NOT_FOUND', 'Condição 5: Status TARGET_NOT_FOUND confirmado');

  // 2.7 Target Selection: Condição Extra — Dispositivo em estado offline/unauthorized → Bloqueio
  const inactiveCheck = PlayerCanaryValidator.selectTargetDevice({
    preferred_serial: '192.168.1.100:5555',
    device_fixture: multiFixture
  });
  assert(inactiveCheck.success === false, 'Condição 6: Dispositivo unauthorized bloqueia com TARGET_NOT_ACTIVE');
  assert(inactiveCheck.status === 'TARGET_NOT_ACTIVE', 'Condição 6: Status TARGET_NOT_ACTIVE confirmado');

  console.log('✅ BLOCO 2 PASS: Classificação ADB e todas as 6 condições de Target Device Selection comprovadas.\n');

  // ---------------------------------------------------------------------------
  // BLOCO 3: CHANGE IMPACT ANALYZER & TEST SELECTION
  // ---------------------------------------------------------------------------
  console.log('>>> BLOCO 3: Change Impact Analyzer & Test Selection Matrix');

  // Cenário A: Alteração no RemoteDataSource
  const impactA = AndroidChangeImpactAnalyzer.analyzeImpact([
    'native-android-player/app/src/main/java/com/antigravity/player/data/remote/RemoteDataSource.kt'
  ]);
  assert(impactA.affected_components.includes('REMOTE_DATA_SOURCE'), 'Detectou componente REMOTE_DATA_SOURCE');
  assert(impactA.touches_protected_surface === true, 'RemoteDataSource marcado como superfície protegida');
  assert(impactA.highest_risk_level === 'CRITICAL_HIGH', 'Nível de risco CRITICAL_HIGH atribuído');
  assert(impactA.minimum_required_tests.includes('contract tests'), 'Exige contract tests');
  assert(impactA.required_gates.includes('ONLINE_CONTRACT_AUDIT'), 'Exige gate ONLINE_CONTRACT_AUDIT');

  // Cenário B: Alteração no SessionManager
  const impactB = AndroidChangeImpactAnalyzer.analyzeImpact([
    'native-android-player/app/src/main/java/com/antigravity/player/security/SessionManager.kt'
  ]);
  assert(impactB.affected_components.includes('SESSION_MANAGER'), 'Detectou componente SESSION_MANAGER');
  assert(impactB.required_gates.includes('HARDWARE_BINDING_AUDIT'), 'Exige gate HARDWARE_BINDING_AUDIT');

  // Cenário C: Alteração no AndroidManifest
  const impactC = AndroidChangeImpactAnalyzer.analyzeImpact([
    'native-android-player/app/src/main/AndroidManifest.xml'
  ]);
  assert(impactC.affected_components.includes('ANDROID_MANIFEST'), 'Detectou componente ANDROID_MANIFEST');
  assert(impactC.touches_protected_surface === true, 'AndroidManifest marcado como protegido');

  // Cenário D: Alteração em arquivo genérico do player
  const impactD = AndroidChangeImpactAnalyzer.analyzeImpact([
    'native-android-player/app/src/main/java/com/antigravity/player/ui/SampleView.kt'
  ]);
  assert(impactD.affected_components.includes('GENERIC_ANDROID_MODULE'), 'Detectou módulo genérico Android');
  assert(impactD.highest_risk_level === 'MEDIUM', 'Risco médio atribuído');
  assert(impactD.touches_protected_surface === false, 'Não toca superfície protegida');

  console.log('✅ BLOCO 3 PASS: Matriz determinística de impacto e seleção de testes comprovada.\n');

  // ---------------------------------------------------------------------------
  // BLOCO 4: GIT GOVERNANCE & HIGH-RISK PROTECTION
  // ---------------------------------------------------------------------------
  console.log('>>> BLOCO 4: Git Governance & High-Risk Interceptor');

  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git add -A') === true, 'git add -A classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git add .') === true, 'git add . classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git checkout -- .') === true, 'git checkout -- . classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git restore .') === true, 'git restore . classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git reset --hard') === true, 'git reset --hard classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git clean -fd') === true, 'git clean -fd classificado como alto risco');
  assert(HighRiskGovernance.isHighRiskOperation('EXEC_COMMAND', 'git status') === false, 'git status é operação segura');

  console.log('✅ BLOCO 4 PASS: Regras de Git Governance impedem mass staging e perdas de dados.\n');

  console.log('=================================================================');
  console.log(`🎉 SUCESSO COMPLETO: ${passedTests}/${totalTests} ASSERÇÕES APROVADAS!`);
  console.log('O SOBRE MÍDIA AI Engineering System possui fundação autônoma');
  console.log('e governada fechada para operar o Android Player.');
  console.log('=================================================================\n');
}

runTests().catch(err => {
  console.error('FATAL TEST SUITE ERROR:', err);
  process.exit(1);
});
