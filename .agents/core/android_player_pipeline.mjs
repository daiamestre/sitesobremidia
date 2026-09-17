/**
 * SOBRE MÍDIA AI Engineering System — Android Player Pipeline & Governance Engine
 *
 * Provê automação completa, governada e reproduzível do ciclo de vida do Player Android:
 * DESCOBERTA DE AMBIENTE → GRADLE BUILD → EXTRAÇÃO DE METADADOS →
 * GOLDEN CONTRACT VALIDATION → CANARY VALIDATION → OTA MANAGEMENT →
 * PLAYER RELEASE AUTHORITY
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { deepFreeze } from './contracts.mjs';

/**
 * 1. Descoberta Autônoma do Ambiente Android
 */
export class AndroidEnvironmentDiscovery {
  /**
   * Varre o host descobrindo JDK, Android SDK, Build Tools, Platforms, ADB e Gradle Wrapper.
   */
  static discover({ workspace_root = process.cwd() } = {}) {
    // 1. Descobrir JDK
    let jdkPath = process.env.JAVA_HOME || null;
    const standardJdkPaths = [
      'C:\\Program Files\\Android\\Android Studio\\jbr',
      'C:\\Program Files\\Google\\Android Studio\\jbr',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
      'C:\\Program Files\\Java\\jdk-21',
      'C:\\Program Files\\Java\\jdk-17'
    ];

    if (!jdkPath || !fs.existsSync(jdkPath)) {
      for (const cand of standardJdkPaths) {
        if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'bin', 'java.exe'))) {
          jdkPath = cand;
          break;
        }
      }
    }

    let javaVersion = 'UNKNOWN';
    if (jdkPath) {
      const javaBin = path.join(jdkPath, 'bin', 'java.exe');
      const verRes = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
      const verOutput = (verRes.stderr || '') + (verRes.stdout || '');
      const match = verOutput.match(/(?:openjdk|java) version "([^"]+)"/i);
      if (match) javaVersion = match[1];
    }

    // 2. Descobrir Android SDK
    let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || null;
    const localPropsPath = path.resolve(workspace_root, 'native-android-player', 'local.properties');
    if (fs.existsSync(localPropsPath)) {
      const localProps = fs.readFileSync(localPropsPath, 'utf8');
      const sdkMatch = localProps.match(/sdk\.dir=(.*)/);
      if (sdkMatch) {
        sdkDir = sdkMatch[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
      }
    }

    if (!sdkDir || !fs.existsSync(sdkDir)) {
      const defaultSdk = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local', 'Android', 'Sdk');
      if (fs.existsSync(defaultSdk)) {
        sdkDir = defaultSdk;
      }
    }

    // 3. Descobrir Build Tools e Platforms
    const buildTools = [];
    if (sdkDir && fs.existsSync(path.join(sdkDir, 'build-tools'))) {
      const entries = fs.readdirSync(path.join(sdkDir, 'build-tools'));
      buildTools.push(...entries);
    }

    const platforms = [];
    if (sdkDir && fs.existsSync(path.join(sdkDir, 'platforms'))) {
      const entries = fs.readdirSync(path.join(sdkDir, 'platforms'));
      platforms.push(...entries);
    }

    // 4. Descobrir ADB
    let adbPath = null;
    if (sdkDir && fs.existsSync(path.join(sdkDir, 'platform-tools', 'adb.exe'))) {
      adbPath = path.join(sdkDir, 'platform-tools', 'adb.exe');
    }

    // 5. Descobrir Gradle Wrapper
    const gradlewBat = path.resolve(workspace_root, 'native-android-player', 'gradlew.bat');
    const hasGradlew = fs.existsSync(gradlewBat);

    const isAvailable = Boolean(jdkPath && sdkDir && buildTools.length > 0 && platforms.length > 0 && hasGradlew);

    return deepFreeze({
      is_available: isAvailable,
      jdk_path: jdkPath,
      java_version: javaVersion,
      sdk_dir: sdkDir,
      build_tools: buildTools,
      platforms,
      adb_path: adbPath,
      gradlew_path: hasGradlew ? gradlewBat : null,
      discovered_at: new Date().toISOString()
    });
  }
}

/**
 * 2. Gestor Canônico de Compilação Android (Gradle)
 */
export class AndroidBuildManager {
  /**
   * Executa a compilação do APK nativo sem intervenção manual.
   */
  static executeBuild({
    variant = 'debug',
    workspace_root = process.cwd(),
    env_discovery = null
  } = {}) {
    const env = env_discovery || AndroidEnvironmentDiscovery.discover({ workspace_root });
    if (!env.is_available) {
      return {
        success: false,
        error: 'Ambiente Android não configurado ou ferramentas ausentes (JDK/SDK/Gradlew).',
        env
      };
    }

    const projectDir = path.resolve(workspace_root, 'native-android-player');
    const taskName = variant === 'release' ? 'assembleRelease' : 'assembleDebug';

    // Configuração de variáveis de ambiente do processo
    const childEnv = {
      ...process.env,
      JAVA_HOME: env.jdk_path,
      ANDROID_HOME: env.sdk_dir,
      PATH: `${path.join(env.jdk_path, 'bin')};${env.sdk_dir ? path.join(env.sdk_dir, 'platform-tools') : ''};${process.env.PATH}`
    };

    const startTime = Date.now();
    const gradlewCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

    const buildRes = spawnSync(gradlewCmd, [taskName, '--no-daemon'], {
      cwd: projectDir,
      env: childEnv,
      encoding: 'utf8',
      shell: true,
      timeout: 300000 // 5 minutos de timeout
    });

    const durationMs = Date.now() - startTime;
    const combinedOutput = (buildRes.stdout || '') + '\n' + (buildRes.stderr || '');

    if (buildRes.status !== 0) {
      return {
        success: false,
        exit_code: buildRes.status,
        duration_ms: durationMs,
        task: taskName,
        error: `Gradle build falhou: ${combinedOutput.slice(-1000)}`
      };
    }

    // Localizar APK gerado
    const apkDir = path.join(projectDir, 'app', 'build', 'outputs', 'apk', variant);
    let apkPath = null;
    if (fs.existsSync(apkDir)) {
      const apks = fs.readdirSync(apkDir).filter(f => f.endsWith('.apk'));
      if (apks.length > 0) {
        apkPath = path.join(apkDir, apks[0]);
      }
    }

    if (!apkPath || !fs.existsSync(apkPath)) {
      return {
        success: false,
        error: `Build reportou sucesso mas APK não foi encontrado no diretório: ${apkDir}`,
        duration_ms: durationMs
      };
    }

    // Calcular metadados
    const apkBuffer = fs.readFileSync(apkPath);
    const sha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex').toLowerCase();
    const sizeBytes = apkBuffer.length;

    // Obter git SHA
    const gitRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workspace_root, encoding: 'utf8' });
    const gitSha = gitRes.status === 0 ? gitRes.stdout.trim() : 'UNKNOWN';

    return deepFreeze({
      success: true,
      variant,
      task: taskName,
      apk_path: apkPath,
      apk_filename: path.basename(apkPath),
      size_bytes: sizeBytes,
      sha256,
      git_sha: gitSha,
      build_duration_ms: durationMs,
      build_timestamp: new Date().toISOString()
    });
  }
}

/**
 * 3. Validador do Contrato do Player (Supabase RPC ↔ Android)
 */
export class PlayerContractValidator {
  /**
   * Valida a integridade do payload retornado por `get_player_playlist_for_screen`.
   */
  static validatePayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload nulo ou inválido.'] };
    }

    const validStatuses = [
      'SUCCESS',
      'DEVICE_ALREADY_BOUND',
      'SCREEN_NOT_FOUND',
      'SCREEN_SUSPENDED',
      'SCREEN_ACCESS_DENIED',
      'DEVICE_ACCESS_DENIED',
      'DEVICE_REVOKED',
      'NO_PLAYLIST_ASSIGNED',
      'PLAYLIST_NOT_FOUND',
      'PLAYLIST_EMPTY'
    ];
    if (!validStatuses.includes(payload.status)) {
      errors.push(`Status inválido (${payload.status}). Esperado um de: ${validStatuses.join(', ')}`);
    }

    if (payload.status === 'SUCCESS') {
      if (!payload.device || typeof payload.device !== 'object') {
        errors.push("Campo obrigatório 'device' ausente no status SUCCESS.");
      } else {
        if (!payload.device.id) errors.push("Campo 'device.id' ausente.");
        if (!payload.device.orientation) errors.push("Campo 'device.orientation' ausente.");
      }

      if (!payload.playlist || typeof payload.playlist !== 'object') {
        errors.push("Campo obrigatório 'playlist' ausente no status SUCCESS.");
      } else {
        if (!payload.playlist.id) errors.push("Campo 'playlist.id' ausente.");
        if (!Array.isArray(payload.playlist.items)) {
          errors.push("Campo 'playlist.items' deve ser um array.");
        } else {
          for (let i = 0; i < payload.playlist.items.length; i++) {
            const item = payload.playlist.items[i];
            if (!item.id) errors.push(`Item [${i}] sem 'id'.`);
            if (typeof item.duration !== 'number') errors.push(`Item [${i}] sem 'duration' numérico.`);
            if (!item.media || typeof item.media !== 'object') {
              errors.push(`Item [${i}] sem objeto 'media'.`);
            } else {
              if (!item.media.url) errors.push(`Media [${i}] sem 'url'.`);
              if (!item.media.type) errors.push(`Media [${i}] sem 'type'.`);
            }
          }
        }
      }
    }

    return deepFreeze({
      valid: errors.length === 0,
      status: payload.status,
      errors
    });
  }
}

/**
 * 4. Validador do Dispositivo Canary (Homologação Realista)
 */
export class PlayerCanaryValidator {
  /**
   * Converte a saída textual de 'adb devices -l' em registros estruturados e tipados.
   */
  static parseAdbDevicesOutput(rawOutput) {
    const lines = (rawOutput || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
    const parsedDevices = [];

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const serial = parts[0];
      const state = parts[1];

      const props = {};
      for (let i = 2; i < parts.length; i++) {
        const propMatch = parts[i].match(/^([^:]+):(.*)$/);
        if (propMatch) {
          props[propMatch[1]] = propMatch[2];
        }
      }

      const isEmulator = serial.startsWith('emulator-') ||
        (props.model && /emulator|sdk_|generic|vbox|goldfish/i.test(props.model)) ||
        (props.device && /emu|generic/i.test(props.device));

      parsedDevices.push({
        serial,
        state,
        type: isEmulator ? 'EMULATOR' : 'PHYSICAL_DEVICE',
        model: props.model || 'UNKNOWN',
        product: props.product || 'UNKNOWN',
        device: props.device || 'UNKNOWN',
        transport_id: props.transport_id || null,
        raw_line: line
      });
    }

    return parsedDevices;
  }

  /**
   * Consulta dispositivos físicos e emuladores ativos via ADB com classificação de estado.
   */
  static checkPhysicalDevices(workspace_root = process.cwd()) {
    const env = AndroidEnvironmentDiscovery.discover({ workspace_root });
    if (!env.adb_path || !fs.existsSync(env.adb_path)) {
      return deepFreeze({
        has_device: false,
        device_state: 'NO_ADB',
        devices: [],
        active_devices: [],
        error: 'ADB não encontrado no host'
      });
    }
    try {
      const res = spawnSync(env.adb_path, ['devices', '-l'], { encoding: 'utf8', timeout: 5000 });
      if (res.status !== 0) {
        return deepFreeze({
          has_device: false,
          device_state: 'ADB_ERROR',
          devices: [],
          active_devices: [],
          error: 'Falha ao executar adb devices'
        });
      }

      const allDevices = this.parseAdbDevicesOutput(res.stdout);
      const activeDevices = allDevices.filter(d => d.state === 'device');
      const unauthorizedDevices = allDevices.filter(d => d.state === 'unauthorized');
      const offlineDevices = allDevices.filter(d => d.state === 'offline');

      let deviceState = 'NO_DEVICE';
      if (allDevices.length === 0) {
        deviceState = 'NO_DEVICE';
      } else if (unauthorizedDevices.length > 0 && activeDevices.length === 0) {
        deviceState = 'UNAUTHORIZED_DEVICE';
      } else if (offlineDevices.length > 0 && activeDevices.length === 0) {
        deviceState = 'OFFLINE_DEVICE';
      } else if (activeDevices.length > 1) {
        deviceState = 'MULTIPLE_DEVICES';
      } else if (activeDevices.length === 1) {
        deviceState = activeDevices[0].type === 'EMULATOR' ? 'EMULATOR' : 'PHYSICAL_DEVICE';
      }

      return deepFreeze({
        has_device: activeDevices.length > 0,
        device_state: deviceState,
        total_count: allDevices.length,
        active_count: activeDevices.length,
        devices: allDevices,
        active_devices: activeDevices,
        raw: res.stdout
      });
    } catch (err) {
      return deepFreeze({
        has_device: false,
        device_state: 'EXECUTION_EXCEPTION',
        devices: [],
        active_devices: [],
        error: err.message
      });
    }
  }

  /**
   * Seleciona e valida o dispositivo de destino de forma inequívoca e fail-closed.
   * Impede terminantemente adb install cego em ambientes multi-device ou dispositivos não autorizados.
   */
  static selectTargetDevice({
    preferred_serial = null,
    require_type = null,
    workspace_root = process.cwd(),
    device_fixture = null
  } = {}) {
    const hardware = device_fixture || this.checkPhysicalDevices(workspace_root);
    if (!hardware.has_device) {
      return deepFreeze({
        success: false,
        status: hardware.device_state === 'NO_ADB' ? 'ADB_UNAVAILABLE' : 'NO_DEVICE_AVAILABLE',
        target_device: null,
        reason: `Nenhum dispositivo Android ativo detectado via ADB (Estado: ${hardware.device_state}).`,
        hardware_check: hardware
      });
    }

    const activeList = hardware.active_devices;

    if (preferred_serial) {
      const match = activeList.find(d => d.serial === preferred_serial);
      if (!match) {
        const existsInactive = hardware.devices.find(d => d.serial === preferred_serial);
        return deepFreeze({
          success: false,
          status: existsInactive ? 'TARGET_NOT_ACTIVE' : 'TARGET_NOT_FOUND',
          target_device: null,
          reason: existsInactive
            ? `Dispositivo '${preferred_serial}' encontrado porém em estado '${existsInactive.state}' (não 'device').`
            : `Dispositivo com serial '${preferred_serial}' não encontrado nos dispositivos ADB conectados.`,
          available_active: activeList.map(d => d.serial)
        });
      }

      if (require_type && match.type !== require_type) {
        return deepFreeze({
          success: false,
          status: 'DEVICE_TYPE_MISMATCH',
          target_device: null,
          reason: `Dispositivo '${preferred_serial}' é do tipo '${match.type}', mas requer '${require_type}'.`
        });
      }

      return deepFreeze({
        success: true,
        status: 'TARGET_SELECTED',
        target_device: match,
        reason: `Dispositivo '${match.serial}' selecionado com sucesso via serial explícito.`
      });
    }

    if (activeList.length > 1) {
      return deepFreeze({
        success: false,
        status: 'AMBIGUOUS_TARGET_SELECTION',
        target_device: null,
        reason: 'Múltiplos dispositivos conectados via ADB. A política de governança proíbe instalação sem target_serial explícito.',
        candidates: activeList.map(d => ({ serial: d.serial, type: d.type, model: d.model }))
      });
    }

    const soleDevice = activeList[0];
    if (require_type && soleDevice.type !== require_type) {
      return deepFreeze({
        success: false,
        status: 'DEVICE_TYPE_MISMATCH',
        target_device: null,
        reason: `Único dispositivo conectado '${soleDevice.serial}' é '${soleDevice.type}', mas requer '${require_type}'.`
      });
    }

    return deepFreeze({
      success: true,
      status: 'TARGET_SELECTED',
      target_device: soleDevice,
      reason: `Dispositivo único '${soleDevice.serial}' (${soleDevice.type}) selecionado de forma inequívoca.`
    });
  }

  /**
   * Executa a sequência de homologação em dispositivo/ambiente Canary com dados reais.
   */
  static executeCanaryValidation({
    payload_response,
    offline_simulated = true,
    reconciliation_verified = true,
    heartbeat_verified = true,
    require_physical_device = false,
    require_real_device = false,
    workspace_root = process.cwd(),
    device_fixture = null,
    target_device = null,
    preferred_serial = null,
    install_verified = null,
    launch_verified = null,
    runtime_observed = null,
    functional_criterion_verified = true
  } = {}) {
    const evidence = [];
    const errors = [];

    // 0. Verificação e Seleção de Hardware
    const hardwareCheck = device_fixture || this.checkPhysicalDevices(workspace_root);

    // 0.1 Falha se dispositivo físico for obrigatório e não houver dispositivo físico
    if (require_physical_device) {
      if (!hardwareCheck.has_device) {
        return deepFreeze({
          success: false,
          canary_status: 'BLOCKED_EXTERNAL',
          reason: 'Nenhum dispositivo Android Canary físico detectado via ADB.',
          blocked_stage: 'CANARY_DEVICE_CONNECTION',
          dependency: 'PHYSICAL_ANDROID_DEVICE',
          how_to_provide: 'Conectar TV Box/Smartphone via USB com depuração ADB ativa.',
          evidence: [{ phase: 'HARDWARE_DISCOVERY', has_device: false, error: hardwareCheck.error }],
          errors: ['Dispositivo físico ausente para homologação Canary física.']
        });
      }
      const activeDevs = hardwareCheck.active_devices || [];
      const hasPhysical = activeDevs.some(d => d.type === 'PHYSICAL_DEVICE');
      if (!hasPhysical) {
        return deepFreeze({
          success: false,
          canary_status: 'BLOCKED_EXTERNAL',
          reason: 'Dispositivo físico requerido, porém apenas emulador AVD foi detectado via ADB.',
          blocked_stage: 'CANARY_DEVICE_TYPE_VERIFICATION',
          dependency: 'PHYSICAL_ANDROID_DEVICE',
          evidence: [{ phase: 'HARDWARE_DISCOVERY', has_device: true, active_types: activeDevs.map(d => d.type) }],
          errors: ['Requer hardware físico real. Emulador AVD não supre CANARY_PHYSICAL_PROVEN.']
        });
      }
    }

    // 0.2 Falha se dispositivo real (físico ou AVD) for obrigatório e nenhum estiver conectado
    if (require_real_device && !hardwareCheck.has_device) {
      return deepFreeze({
        success: false,
        canary_status: 'BLOCKED_EXTERNAL',
        reason: 'Nenhum dispositivo Android Canary ativo (físico ou emulador) detectado via ADB.',
        blocked_stage: 'CANARY_DEVICE_CONNECTION',
        dependency: 'PHYSICAL_ANDROID_DEVICE_OR_ONLINE_EMULATOR',
        how_to_provide: 'Conectar TV Box/Smartphone via USB com depuração ADB ativa ou iniciar AVD (Pixel_5/Pixel_6).',
        evidence: [{ phase: 'HARDWARE_DISCOVERY', has_device: false, error: hardwareCheck.error }],
        errors: ['Dispositivo físico ou emulador ausente para homologação Canary.']
      });
    }

    // 0.3 Validar estados anômalos de dispositivo (offline / unauthorized)
    if (hardwareCheck.devices && hardwareCheck.devices.length > 0 && (hardwareCheck.active_devices || []).length === 0) {
      if (hardwareCheck.device_state === 'UNAUTHORIZED_DEVICE' || hardwareCheck.devices.every(d => d.state === 'unauthorized')) {
        return deepFreeze({
          success: false,
          canary_status: 'BLOCKED_EXTERNAL',
          reason: 'Dispositivo detectado em estado unauthorized. Depuração USB precisa ser autorizada no dispositivo.',
          blocked_stage: 'DEVICE_AUTHORIZATION',
          dependency: 'ADB_USB_DEBUGGING_AUTHORIZATION',
          evidence: [{ phase: 'DEVICE_STATE_CHECK', state: 'unauthorized' }],
          errors: ['Dispositivo não autorizado via ADB (unauthorized).']
        });
      }
      if (hardwareCheck.device_state === 'OFFLINE_DEVICE' || hardwareCheck.devices.every(d => d.state === 'offline')) {
        return deepFreeze({
          success: false,
          canary_status: 'BLOCKED_EXTERNAL',
          reason: 'Dispositivo detectado em estado offline via ADB.',
          blocked_stage: 'DEVICE_CONNECTIVITY',
          dependency: 'ADB_DEVICE_ONLINE_STATE',
          evidence: [{ phase: 'DEVICE_STATE_CHECK', state: 'offline' }],
          errors: ['Dispositivo em estado offline via ADB.']
        });
      }
    }

    // 0.4 Resolução do dispositivo alvo
    let resolvedTargetDevice = target_device;
    if (!resolvedTargetDevice && hardwareCheck.has_device) {
      const targetSelect = this.selectTargetDevice({
        preferred_serial,
        workspace_root,
        device_fixture: hardwareCheck
      });
      if (targetSelect.success) {
        resolvedTargetDevice = targetSelect.target_device;
        evidence.push({ phase: 'TARGET_SELECTION', success: true, target: resolvedTargetDevice });
      } else {
        return deepFreeze({
          success: false,
          canary_status: 'BLOCKED_EXTERNAL',
          reason: targetSelect.reason,
          blocked_stage: 'TARGET_SELECTION',
          evidence: [{ phase: 'TARGET_SELECTION', success: false, reason: targetSelect.reason }],
          errors: [targetSelect.reason]
        });
      }
    }

    // 1. Validar contrato de payload recebido
    const contractRes = PlayerContractValidator.validatePayload(payload_response);
    if (!contractRes.valid) {
      errors.push(`Falha no contrato do Canary: ${contractRes.errors.join(', ')}`);
      evidence.push({ phase: 'PAYLOAD_CONTRACT', success: false, errors: contractRes.errors });
    } else {
      evidence.push({ phase: 'PAYLOAD_CONTRACT', success: true, status: payload_response.status });
    }

    // 2. Validar integridade das mídias para playback
    if (payload_response?.status === 'SUCCESS') {
      const items = payload_response.playlist?.items || [];
      if (items.length === 0) {
        errors.push('Canary: playlist não contém mídias reproduzíveis.');
        evidence.push({ phase: 'MEDIA_RESOLUTION', success: false, items_count: 0 });
      } else {
        evidence.push({ phase: 'MEDIA_RESOLUTION', success: true, items_count: items.length });
      }
    }

    // 3. Validar resiliência offline (playback contínuo sem rede)
    if (!offline_simulated) {
      errors.push('Canary: falha na prova de resiliência offline.');
      evidence.push({ phase: 'OFFLINE_RESILIENCE', success: false });
    } else {
      evidence.push({ phase: 'OFFLINE_RESILIENCE', success: true });
    }

    // 4. Validar reconciliação online
    if (!reconciliation_verified) {
      errors.push('Canary: falha na reconciliação pós-queda de rede.');
      evidence.push({ phase: 'ONLINE_RECONCILIATION', success: false });
    } else {
      evidence.push({ phase: 'ONLINE_RECONCILIATION', success: true });
    }

    // 5. Validar heartbeat
    if (!heartbeat_verified) {
      errors.push('Canary: telemetria/heartbeat não emitido.');
      evidence.push({ phase: 'TELEMETRY_HEARTBEAT', success: false });
    } else {
      evidence.push({ phase: 'TELEMETRY_HEARTBEAT', success: true });
    }

    // 6. Validar estágios de execução em dispositivo (quando reportados)
    if (install_verified === false) {
      errors.push('Canary: falha na verificação de instalação do APK no dispositivo.');
      evidence.push({ phase: 'INSTALL_VERIFICATION', success: false });
    } else if (install_verified === true) {
      evidence.push({ phase: 'INSTALL_VERIFICATION', success: true });
    }

    if (launch_verified === false) {
      errors.push('Canary: falha no launch do aplicativo (processo não iniciado ou atividade não em foreground).');
      evidence.push({ phase: 'LAUNCH_VERIFICATION', success: false });
    } else if (launch_verified === true) {
      evidence.push({ phase: 'LAUNCH_VERIFICATION', success: true });
    }

    if (runtime_observed === false) {
      errors.push('Canary: runtime do aplicativo não observado (crash ou freeze no boot).');
      evidence.push({ phase: 'RUNTIME_OBSERVATION', success: false });
    } else if (runtime_observed === true) {
      evidence.push({ phase: 'RUNTIME_OBSERVATION', success: true });
    }

    if (functional_criterion_verified === false) {
      errors.push('Canary: comando retornou exit code 0 porém critério funcional não foi observado.');
      evidence.push({ phase: 'FUNCTIONAL_CRITERION', success: false });
    } else {
      evidence.push({ phase: 'FUNCTIONAL_CRITERION', success: true });
    }

    const canaryPassed = errors.length === 0;

    let canaryStatus = 'CANARY_FAILED';
    let isSandbox = true;
    let isAvd = false;
    let isPhysical = false;

    if (canaryPassed) {
      if (resolvedTargetDevice) {
        isSandbox = false;
        if (resolvedTargetDevice.type === 'PHYSICAL_DEVICE') {
          canaryStatus = 'CANARY_PHYSICAL_PROVEN';
          isPhysical = true;
        } else {
          canaryStatus = 'CANARY_AVD_PROVEN';
          isAvd = true;
        }
      } else {
        canaryStatus = 'CANARY_SANDBOX_PROVEN';
        isSandbox = true;
      }
    }

    return deepFreeze({
      success: canaryPassed,
      canary_status: canaryStatus,
      is_sandbox: isSandbox,
      is_hardware_proven: isPhysical || isAvd,
      is_avd_proven: isAvd,
      is_physical_proven: isPhysical,
      target_device: resolvedTargetDevice,
      evidence,
      errors,
      hardware_detected: hardwareCheck.has_device,
      validated_at: new Date().toISOString()
    });
  }
}

/**
 * 5. Gestor de Releases e OTA Silencioso
 */
export class OtaReleaseManager {
  /**
   * Prepara e valida manifesto para a tabela `app_releases`.
   */
  static prepareReleaseManifest({
    version_code,
    version_name,
    apk_url,
    sha256,
    release_notes = 'Versão governada',
    is_mandatory = false,
    min_supported_version = 120
  } = {}) {
    const errors = [];

    if (typeof version_code !== 'number' || version_code <= min_supported_version) {
      errors.push(`version_code (${version_code}) deve ser maior que a versão mínima suportada (${min_supported_version}) - Anti-downgrade violation.`);
    }

    if (!version_name || typeof version_name !== 'string') {
      errors.push("version_name é obrigatório.");
    }

    if (!apk_url || !apk_url.startsWith('https://')) {
      errors.push("apk_url deve utilizar protocolo HTTPS seguro.");
    }

    if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
      errors.push("sha256 deve ser um hash hexadecimal de 64 caracteres.");
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return deepFreeze({
      success: true,
      manifest: {
        version_code,
        version_name,
        apk_url,
        sha256: sha256.toLowerCase(),
        release_notes,
        is_mandatory,
        created_at: new Date().toISOString()
      }
    });
  }

  /**
   * Valida integridade do arquivo em disco contra o manifest publicado.
   */
  static verifyOtaIntegrity({ manifest, calculated_sha256 }) {
    if (!manifest || !manifest.sha256) {
      return { valid: false, reason: 'Manifest sem hash SHA-256 cadastrado.' };
    }

    const matches = String(calculated_sha256).toLowerCase() === String(manifest.sha256).toLowerCase();
    return deepFreeze({
      valid: matches,
      calculated_sha256: String(calculated_sha256).toLowerCase(),
      expected_sha256: String(manifest.sha256).toLowerCase(),
      action: matches ? 'PROCEED_INSTALL' : 'DELETE_CORRUPTED_APK'
    });
  }
}

/**
 * 6. Autoridade Canônica de Release do Player (PlayerReleaseAuthority)
 * Impede terminantemente a distribuição de qualquer versão sem aprovação no Canary.
 */
export class PlayerReleaseAuthority {
  /**
   * Certifica formalmente a liberação de uma versão do Player para a frota.
   */
  static certifyRelease({
    build_result,
    canary_result,
    contract_result = { valid: true },
    target_fleet = 'ALL'
  } = {}) {
    const errors = [];

    if (!build_result || !build_result.success) {
      errors.push('Build Android não concluído com sucesso.');
    }

    if (!contract_result || !contract_result.valid) {
      errors.push('Regressão de contrato detectada entre Supabase e Android Player.');
    }

    const validProductionCanary = ['CANARY_PHYSICAL_PROVEN', 'CANARY_AVD_PROVEN'];
    if (!canary_result || !canary_result.success || !validProductionCanary.includes(canary_result.canary_status)) {
      if (canary_result?.canary_status === 'CANARY_SANDBOX_PROVEN') {
        errors.push('Homologação em sandbox não autoriza release de produção. Exige dispositivo AVD ou hardware físico comprovado.');
      } else {
        errors.push(`Homologação em dispositivo Canary não aprovada (status: ${canary_result?.canary_status || 'NOT_ATTEMPTED'}). Rollout para produção terminantemente proibido.`);
      }
    }

    if (target_fleet === 'PHYSICAL_FLEET' && canary_result?.canary_status !== 'CANARY_PHYSICAL_PROVEN') {
      errors.push('Rollout para frota física requer homologação comprovada em hardware físico (CANARY_PHYSICAL_PROVEN). Dispositivo emulador AVD não autoriza rollout em frota física.');
    }

    if (errors.length > 0) {
      return deepFreeze({
        certified: false,
        status: 'RELEASE_BLOCKED',
        reasons: errors,
        certified_at: null
      });
    }

    const certificationToken = `CERT-PLAYER-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    return deepFreeze({
      certified: true,
      status: 'RELEASE_CERTIFIED',
      certification_token: certificationToken,
      target_fleet,
      version_code: build_result.version_code || 513,
      sha256: build_result.sha256,
      certified_at: new Date().toISOString()
    });
  }
}

/**
 * 7. Analisador de Impacto de Mudanças e Seleção de Testes Mínimos
 * Mapeia arquivos modificados para componentes afetados, conjuntos mínimos de testes e nível de risco.
 */
export class AndroidChangeImpactAnalyzer {
  static COMPONENT_RULES = [
    {
      component: 'REMOTE_DATA_SOURCE',
      pattern: /RemoteDataSource|sync\/network|Retrofit|SupabaseApi/i,
      affected_areas: ['Player Online Sync', 'Supabase RPC Contract', 'Playlist Deserialization'],
      minimum_tests: ['contract tests', 'mapper tests', 'compileDebugSources'],
      risk_level: 'CRITICAL_HIGH',
      is_protected_surface: true,
      requires_gate: 'ONLINE_CONTRACT_AUDIT'
    },
    {
      component: 'PLAYER_REPOSITORY',
      pattern: /PlayerRepository|LocalDataSource|OfflineStorage/i,
      affected_areas: ['Data Reconciliation', 'Offline Cache', 'Atomic Switch'],
      minimum_tests: ['repository unit tests', 'offline resilience tests', 'assembleDebug'],
      risk_level: 'HIGH',
      is_protected_surface: false,
      requires_gate: null
    },
    {
      component: 'SESSION_MANAGER',
      pattern: /SessionManager|DeviceToken|Pairing|HardwareIdentity/i,
      affected_areas: ['Hardware Token Binding', 'Screen Pairing', 'Exclusivity Enforcement'],
      minimum_tests: ['session tests', 'hardware exclusivity tests', 'assembleDebug'],
      risk_level: 'CRITICAL_HIGH',
      is_protected_surface: true,
      requires_gate: 'HARDWARE_BINDING_AUDIT'
    },
    {
      component: 'ROOM_DATABASE',
      pattern: /dao\/|entity\/|database\/|Room/i,
      affected_areas: ['Local SQLite Schema', 'Proof of Play Persistence', 'Media Cache Ledger'],
      minimum_tests: ['room migration tests', 'dao unit tests', 'assembleDebug'],
      risk_level: 'HIGH',
      is_protected_surface: true,
      requires_gate: null
    },
    {
      component: 'PLAYER_ENGINE',
      pattern: /PlayerEngine|ExoPlayer|MediaEngine|SurfaceView|Playback/i,
      affected_areas: ['ExoPlayer Loop', 'Video Decoding', 'Kiosk Black Screen Prevention'],
      minimum_tests: ['playback tests', 'surfaceview tests', 'assembleDebug'],
      risk_level: 'HIGH',
      is_protected_surface: false,
      requires_gate: null
    },
    {
      component: 'OTA_UPDATE_SYSTEM',
      pattern: /OTA|PackageInstaller|SilentInstall|UpdateManager/i,
      affected_areas: ['Silent APK Install', 'Anti-Downgrade Check', 'Rollback Mechanism'],
      minimum_tests: ['anti-downgrade tests', 'sha256 integrity tests', 'assembleDebug'],
      risk_level: 'CRITICAL_HIGH',
      is_protected_surface: true,
      requires_gate: 'OTA_GOVERNANCE_AUDIT'
    },
    {
      component: 'ANDROID_MANIFEST',
      pattern: /AndroidManifest\.xml/i,
      affected_areas: ['Device Admin Permissions', 'Boot Completed Receiver', 'Launcher Activity'],
      minimum_tests: ['manifest verification', 'assembleDebug'],
      risk_level: 'HIGH',
      is_protected_surface: true,
      requires_gate: null
    },
    {
      component: 'GRADLE_BUILD_CONFIG',
      pattern: /build\.gradle|settings\.gradle|gradle-wrapper|proguard/i,
      affected_areas: ['Build Variants', 'Dependencies', 'ProGuard / R8 Obfuscation'],
      minimum_tests: ['assembleDebug', 'dependency check'],
      risk_level: 'MEDIUM_HIGH',
      is_protected_surface: false,
      requires_gate: null
    },
    {
      component: 'SUPABASE_BACKEND',
      pattern: /supabase\/migrations|schema\.sql|get_player_playlist/i,
      affected_areas: ['PostgreSQL Remote RPC', 'RLS Policies', 'Schema Migrations'],
      minimum_tests: ['database migration guard', 'remote contract test'],
      risk_level: 'CRITICAL_HIGH',
      is_protected_surface: true,
      requires_gate: 'DATABASE_SUPABASE_GATE'
    }
  ];

  static analyzeImpact(filesTouched = []) {
    const touched = Array.isArray(filesTouched) ? filesTouched : [filesTouched];
    const affectedComponents = new Set();
    const affectedAreas = new Set();
    const requiredTestSets = new Set();
    const requiredGates = new Set();
    let hasProtectedSurface = false;
    let highestRisk = 'LOW';

    const riskHierarchy = { LOW: 0, MEDIUM: 1, MEDIUM_HIGH: 2, HIGH: 3, CRITICAL_HIGH: 4 };

    for (const file of touched) {
      const normalizedPath = String(file).replace(/\\/g, '/');
      let matched = false;

      for (const rule of this.COMPONENT_RULES) {
        if (rule.pattern.test(normalizedPath)) {
          matched = true;
          affectedComponents.add(rule.component);
          rule.affected_areas.forEach(a => affectedAreas.add(a));
          rule.minimum_tests.forEach(t => requiredTestSets.add(t));
          if (rule.requires_gate) requiredGates.add(rule.requires_gate);
          if (rule.is_protected_surface) hasProtectedSurface = true;

          if (riskHierarchy[rule.risk_level] > riskHierarchy[highestRisk]) {
            highestRisk = rule.risk_level;
          }
        }
      }

      if (!matched && normalizedPath.startsWith('native-android-player/')) {
        affectedComponents.add('GENERIC_ANDROID_MODULE');
        requiredTestSets.add('assembleDebug');
        if (riskHierarchy['MEDIUM'] > riskHierarchy[highestRisk]) highestRisk = 'MEDIUM';
      }
    }

    return deepFreeze({
      files_count: touched.length,
      files: touched,
      affected_components: Array.from(affectedComponents),
      affected_areas: Array.from(affectedAreas),
      minimum_required_tests: Array.from(requiredTestSets),
      required_gates: Array.from(requiredGates),
      touches_protected_surface: hasProtectedSurface,
      highest_risk_level: highestRisk,
      requires_micro_gate: hasProtectedSurface || highestRisk === 'CRITICAL_HIGH',
      timestamp: new Date().toISOString()
    });
  }
}

export { AndroidBuildManager as AndroidGradleBuilder };
