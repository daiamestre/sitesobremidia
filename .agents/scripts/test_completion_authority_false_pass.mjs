/**
 * SOBRE MÍDIA AI Engineering System — False-Pass & Completion Authority Adversarial Regression Suite
 * FASE 18: 10 Casos Adversariais de Prevenção de False-Pass e Governança Fail-Closed
 */

import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PlayerCanaryValidator,
  PlayerReleaseAuthority,
  PlayerContractValidator
} from '../core/android_player_pipeline.mjs';
import {
  CompletionAuthority,
  COMPLETION_STATES
} from '../core/orchestrator.mjs';
import { SkillRuntime } from '../core/skill_runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');

async function runAdversarialSuite() {
  console.log('=================================================================');
  console.log('ADVERSARIAL TEST SUITE: HARDENING DA COMPLETION AUTHORITY & ANTI-FALSE-PASS');
  console.log('=================================================================\n');

  const validPayload = {
    status: 'SUCCESS',
    device: { id: 'dev-canary-001', orientation: 'landscape', bound_device_id: 'hash-canary-001' },
    playlist: {
      id: 'pl-canary-001',
      items: [
        { id: 'item-1', duration: 15, position: 1, media: { id: 'm-1', url: 'https://r2.sobremidia.com/media/video1.mp4', type: 'video' } }
      ]
    }
  };

  const skillRuntime = new SkillRuntime();

  // -------------------------------------------------------------
  // CASO 1: Sem dispositivo — run_canary_homologation não pode retornar PASS quando dispositivo real for exigido
  // -------------------------------------------------------------
  console.log('>>> CASO 1: Ausência de dispositivo quando dispositivo real for exigido');
  const emptyFixture = {
    has_device: false,
    device_state: 'NO_DEVICE',
    devices: [],
    active_devices: []
  };

  const case1Res = await skillRuntime.executeSkill({
    skill_id: 'device-canary-validation',
    agent_id: 'android_engineer',
    task_id: 'TASK-ADV-001',
    execution_id: 'EXEC-ADV-001',
    action: 'run_canary_homologation',
    input: {
      payload_response: validPayload,
      require_real_device: true,
      device_fixture: emptyFixture
    },
    targetWorkspace: workspaceRoot
  });

  assert(case1Res.success === false, 'Caso 1: Execução DEVE falhar quando dispositivo real for exigido e não houver dispositivo');
  assert(case1Res.output?.canary_status === 'BLOCKED_EXTERNAL', 'Caso 1: canary_status DEVE ser BLOCKED_EXTERNAL');
  assert(case1Res.evidence[0].exit_code !== 0, 'Caso 1: exit_code da evidência não pode ser 0');
  console.log('  ✅ CASO 1 PASS: Ausência de dispositivo em modo real bloqueia fail-closed com BLOCKED_EXTERNAL.\n');

  // -------------------------------------------------------------
  // CASO 2: Dispositivo OFFLINE — não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 2: Dispositivo em estado OFFLINE');
  const offlineFixture = {
    has_device: false,
    device_state: 'OFFLINE_DEVICE',
    devices: [{ serial: 'emulator-5554', state: 'offline', type: 'EMULATOR' }],
    active_devices: []
  };

  const case2Res = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: offlineFixture
  });

  assert(case2Res.success === false, 'Caso 2: Dispositivo offline DEVE falhar validação');
  assert(case2Res.canary_status === 'BLOCKED_EXTERNAL', 'Caso 2: canary_status DEVE ser BLOCKED_EXTERNAL');
  assert(case2Res.reason.includes('offline'), 'Caso 2: motivo de bloqueio deve citar estado offline');
  console.log('  ✅ CASO 2 PASS: Dispositivo offline bloqueado fail-closed.\n');

  // -------------------------------------------------------------
  // CASO 3: Dispositivo UNAUTHORIZED — não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 3: Dispositivo em estado UNAUTHORIZED');
  const unauthorizedFixture = {
    has_device: false,
    device_state: 'UNAUTHORIZED_DEVICE',
    devices: [{ serial: 'emulator-5554', state: 'unauthorized', type: 'EMULATOR' }],
    active_devices: []
  };

  const case3Res = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: unauthorizedFixture
  });

  assert(case3Res.success === false, 'Caso 3: Dispositivo unauthorized DEVE falhar validação');
  assert(case3Res.canary_status === 'BLOCKED_EXTERNAL', 'Caso 3: canary_status DEVE ser BLOCKED_EXTERNAL');
  assert(case3Res.reason.includes('unauthorized'), 'Caso 3: motivo de bloqueio deve citar estado unauthorized');
  console.log('  ✅ CASO 3 PASS: Dispositivo unauthorized bloqueado fail-closed.\n');

  // -------------------------------------------------------------
  // CASO 4: Install não executado / falhou — não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 4: Instalação do APK não executada / falhou');
  const activeAvdFixture = {
    has_device: true,
    device_state: 'EMULATOR',
    devices: [{ serial: 'emulator-5554', state: 'device', type: 'EMULATOR', model: 'Pixel_5' }],
    active_devices: [{ serial: 'emulator-5554', state: 'device', type: 'EMULATOR', model: 'Pixel_5' }]
  };

  const case4Res = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: activeAvdFixture,
    install_verified: false
  });

  assert(case4Res.success === false, 'Caso 4: Falha na verificação de instalação DEVE reprovar');
  assert(case4Res.canary_status === 'CANARY_FAILED', 'Caso 4: canary_status DEVE ser CANARY_FAILED');
  assert(case4Res.errors.some(e => e.includes('instalação')), 'Caso 4: erro deve citar falha de instalação');
  console.log('  ✅ CASO 4 PASS: Instalação não comprovada reprova validação.\n');

  // -------------------------------------------------------------
  // CASO 5: Launch não executado / falhou — não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 5: Launch do app não executado / falhou');
  const case5Res = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: activeAvdFixture,
    install_verified: true,
    launch_verified: false
  });

  assert(case5Res.success === false, 'Caso 5: Falha no launch DEVE reprovar');
  assert(case5Res.canary_status === 'CANARY_FAILED', 'Caso 5: canary_status DEVE ser CANARY_FAILED');
  assert(case5Res.errors.some(e => e.includes('launch')), 'Caso 5: erro deve citar falha de launch');
  console.log('  ✅ CASO 5 PASS: Launch não comprovado reprova validação.\n');

  // -------------------------------------------------------------
  // CASO 6: Runtime não observado (crash/freeze no boot) — não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 6: Runtime do Player não observado');
  const case6Res = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: activeAvdFixture,
    install_verified: true,
    launch_verified: true,
    runtime_observed: false
  });

  assert(case6Res.success === false, 'Caso 6: Runtime não observado DEVE reprovar');
  assert(case6Res.canary_status === 'CANARY_FAILED', 'Caso 6: canary_status DEVE ser CANARY_FAILED');
  assert(case6Res.errors.some(e => e.includes('runtime')), 'Caso 6: erro deve citar ausência de runtime');
  console.log('  ✅ CASO 6 PASS: Processo sem runtime observado reprova validação.\n');

  // -------------------------------------------------------------
  // CASO 7: Evidence incompleta — CompletionAuthority não pode retornar PASS
  // -------------------------------------------------------------
  console.log('>>> CASO 7: Evidência incompleta na CompletionAuthority');
  const incompleteTask = { task_id: 'TASK-ADV-INCOMPLETE' };
  const incompletePlan = {
    plan_id: 'PLAN-ADV-001',
    steps: [
      { step_id: 'S1', step_index: 1, agent_id: 'android_engineer' },
      { step_id: 'S2', step_index: 2, agent_id: 'android_engineer' }
    ]
  };
  const incompleteExec = [
    {
      step_id: 'S1',
      agent_id: 'android_engineer',
      task_id: 'TASK-ADV-INCOMPLETE',
      status: 'COMPLETED',
      result: { success: true },
      evidence: [{ command: 'adb install', exit_code: 0 }]
    },
    {
      step_id: 'S2',
      agent_id: 'android_engineer',
      task_id: 'TASK-ADV-INCOMPLETE',
      status: 'COMPLETED',
      result: { success: true },
      evidence: [] // VAZIO: Violação de evidência obrigatória
    }
  ];

  const case7Res = CompletionAuthority.validateCompletion({
    task: incompleteTask,
    plan: incompletePlan,
    executionResults: incompleteExec,
    handoffs: [{ from: 'android_engineer', to: 'android_engineer', task_id: 'TASK-ADV-INCOMPLETE', valid: true }]
  });

  assert(case7Res.completed === false, 'Caso 7: Tarefa com evidência ausente NÃO pode ser completada');
  assert(case7Res.status === 'BLOCKED', 'Caso 7: status deve ser BLOCKED');
  assert(case7Res.completion_state === 'INCOMPLETE', 'Caso 7: completion_state deve ser INCOMPLETE');
  console.log('  ✅ CASO 7 PASS: Evidência ausente em step bloqueia CompletionAuthority como INCOMPLETE.\n');

  // -------------------------------------------------------------
  // CASO 8: Resultado de sandbox não pode ser classificado como hardware real
  // -------------------------------------------------------------
  console.log('>>> CASO 8: Sandbox vs Hardware Real');
  const sandboxCanary = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: emptyFixture
  });

  assert(sandboxCanary.canary_status === 'CANARY_SANDBOX_PROVEN', 'Caso 8: Execução sem hardware deve ser CANARY_SANDBOX_PROVEN');
  assert(sandboxCanary.is_sandbox === true, 'Caso 8: is_sandbox deve ser true');
  assert(sandboxCanary.is_hardware_proven === false, 'Caso 8: is_hardware_proven deve ser false');

  const case8Release = PlayerReleaseAuthority.certifyRelease({
    build_result: { success: true, sha256: 'a'.repeat(64), version_code: 515 },
    canary_result: sandboxCanary,
    contract_result: { valid: true }
  });

  assert(case8Release.certified === false, 'Caso 8: Release Authority NUNCA pode certificar resultado de sandbox');
  assert(case8Release.status === 'RELEASE_BLOCKED', 'Caso 8: status deve ser RELEASE_BLOCKED');
  console.log('  ✅ CASO 8 PASS: Sandbox rigorosamente separado de hardware real e bloqueado para release.\n');

  // -------------------------------------------------------------
  // CASO 9: Comando retorna exit code 0 mas critério funcional não é observado
  // -------------------------------------------------------------
  console.log('>>> CASO 9: Exit code 0 com critério funcional falso');
  const case9Canary = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: activeAvdFixture,
    install_verified: true,
    launch_verified: true,
    runtime_observed: true,
    functional_criterion_verified: false // Exit code foi 0 mas funcionalidade não observada
  });

  assert(case9Canary.success === false, 'Caso 9: Critério funcional não atendido deve reprovar');
  assert(case9Canary.canary_status === 'CANARY_FAILED', 'Caso 9: canary_status DEVE ser CANARY_FAILED');

  const task9 = { task_id: 'TASK-ADV-EXIT0-FAIL' };
  const plan9 = { plan_id: 'PLAN-9', steps: [{ step_id: 'S1', step_index: 1, agent_id: 'android_engineer' }] };
  const exec9 = [{
    step_id: 'S1',
    agent_id: 'android_engineer',
    task_id: 'TASK-ADV-EXIT0-FAIL',
    status: 'COMPLETED',
    result: { success: true },
    evidence: [{ command: 'am start', exit_code: 0, functional_verified: false }] // Exit code 0 MAS functional_verified false
  }];

  const case9Comp = CompletionAuthority.validateCompletion({
    task: task9,
    plan: plan9,
    executionResults: exec9
  });

  assert(case9Comp.completed === false, 'Caso 9: Exit code 0 sem critério funcional não pode completar');
  assert(case9Comp.status === 'BLOCKED', 'Caso 9: CompletionAuthority deve bloquear');
  console.log('  ✅ CASO 9 PASS: Exit code 0 com critério funcional não observado bloqueia fail-closed.\n');

  // -------------------------------------------------------------
  // CASO 10: Todas as etapas obrigatórias executadas e comprovadas → PROVEN
  // -------------------------------------------------------------
  console.log('>>> CASO 10: Execução completa comprovada no AVD → PROVEN');
  const case10Canary = PlayerCanaryValidator.executeCanaryValidation({
    payload_response: validPayload,
    device_fixture: activeAvdFixture,
    install_verified: true,
    launch_verified: true,
    runtime_observed: true,
    offline_simulated: true,
    reconciliation_verified: true,
    heartbeat_verified: true,
    functional_criterion_verified: true
  });

  assert(case10Canary.success === true, 'Caso 10: Canary deve ser aprovado');
  assert(case10Canary.canary_status === 'CANARY_AVD_PROVEN', 'Caso 10: Status deve ser CANARY_AVD_PROVEN');
  assert(case10Canary.is_avd_proven === true, 'Caso 10: is_avd_proven deve ser true');
  assert(case10Canary.is_sandbox === false, 'Caso 10: is_sandbox deve ser false');

  const case10Release = PlayerReleaseAuthority.certifyRelease({
    build_result: { success: true, sha256: 'b'.repeat(64), version_code: 516 },
    canary_result: case10Canary,
    contract_result: { valid: true }
  });

  assert(case10Release.certified === true, 'Caso 10: Release Authority DEVE certificar');
  assert(case10Release.status === 'RELEASE_CERTIFIED', 'Caso 10: Status deve ser RELEASE_CERTIFIED');

  const task10 = { task_id: 'TASK-ADV-PROVEN' };
  const plan10 = { plan_id: 'PLAN-10', steps: [{ step_id: 'S1', step_index: 1, agent_id: 'android_engineer' }] };
  const exec10 = [{
    step_id: 'S1',
    agent_id: 'android_engineer',
    task_id: 'TASK-ADV-PROVEN',
    status: 'COMPLETED',
    result: { success: true },
    evidence: [{ command: 'adb install', exit_code: 0, functional_verified: true, observed: true }]
  }];

  const case10Lifecycle = {
    blocked_external: false,
    scope: { android_player_required: true, canary_verification_required: true },
    android_pipeline: {
      build: { success: true },
      canary: case10Canary,
      release_authority: case10Release
    }
  };

  const case10Comp = CompletionAuthority.validateCompletion({
    task: task10,
    plan: plan10,
    executionResults: exec10,
    production_lifecycle: case10Lifecycle
  });

  assert(case10Comp.completed === true, 'Caso 10: CompletionAuthority deve aprovar conclusão');
  assert(case10Comp.status === 'COMPLETED', 'Caso 10: status deve ser COMPLETED');
  assert(case10Comp.completion_state === 'PROVEN', 'Caso 10: completion_state DEVE ser PROVEN');
  console.log('  ✅ CASO 10 PASS: Cadeia completa comprovada atinge estado terminal PROVEN.\n');

  console.log('=================================================================');
  console.log('🎉 SUCESSO: TODOS OS 10 CASOS ADVERSARIAIS VALIDADOS COM ÊXITO!');
  console.log('A Completion Authority agora é fail-closed e imune a false-passes.');
  console.log('=================================================================\n');
}

runAdversarialSuite().catch(err => {
  console.error('FATAL ADVERSARIAL SUITE ERROR:', err);
  process.exit(1);
});
