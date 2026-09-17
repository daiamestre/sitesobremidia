# PERFIL CANÔNICO DO ANDROID PLAYER — SOBRE MÍDIA

> **Documento Canônico de Descoberta, Compilação, Homologação e Operação Autônoma do Player Android Nativo.**
> Fonte de verdade para o Antigravity e para os agentes do SOBRE MÍDIA AI Engineering System.

---

## 1. LOCALIZAÇÃO E ESTRUTURA DO PROJETO

- **Workspace Root:** `c:\Users\Jairan Santos\Downloads\SITECODIGOSOBREMIDIA\sobremidiadesigner-main`
- **Android Project Root:** `native-android-player/`
- **Gradle Root:** `native-android-player/`
- **Settings Gradle:** `native-android-player/settings.gradle.kts`
- **Root Build Gradle:** `native-android-player/build.gradle.kts`
- **App Module Root:** `native-android-player/app/`
- **App Module Build:** `native-android-player/app/build.gradle.kts`
- **AndroidManifest:** `native-android-player/app/src/main/AndroidManifest.xml`
- **Kotlin Source Root:** `native-android-player/app/src/main/java/com/antigravity/player/`
- **Resources Root:** `native-android-player/app/src/main/res/`
- **Package / Application ID:** `com.antigravity.player`
- **Main / Launcher Activity:** `com.antigravity.player.MainActivity`
- **Device Admin Receiver:** `com.antigravity.player.receiver.AdminReceiver`
- **OTA Install Receiver:** `com.antigravity.player.receiver.OTAInstallReceiver`
- **Boot Receiver:** `com.antigravity.player.receiver.BootReceiver`

---

## 2. ARQUITETURA E STACK TECNOLÓGICA

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Linguagem** | Kotlin 1.9.22 / JVM 21 | Código nativo do Player |
| **Engine de Mídia** | AndroidX Media3 ExoPlayer 1.3.1 | Decodificação contínua de vídeo/áudio em SurfaceView |
| **Persistência Local** | AndroidX Room (SQLite) | Cache offline de playlists, proof-of-play e telemetria |
| **Comunicação / Sync** | Retrofit 2.9.0 + OkHttp 4.12.0 | Consumo direto da RPC `get_player_playlist_for_screen` |
| **Gerenciamento de Sessão**| EncryptedSharedPreferences | Armazenamento seguro de `device_token` e `screen_id` |
| **Distribuição e Atualização**| Android PackageInstaller (Silent OTA) | Instalação silenciosa sem interrupção de playback |
| **Kiosk & Device Owner** | Android DevicePolicyManager | Proteção contra desligamento da interface e bloqueio de UI |

---

## 3. CONTRATO DE COMPILAÇÃO (GRADLE BUILD CONTRACT)

- **Gradle Wrapper:** `native-android-player/gradlew.bat` (Windows) / `native-android-player/gradlew` (Linux/macOS)
- **Versão do Gradle:** 8.4 (via gradle-wrapper.properties)
- **JDK Requerido:** OpenJDK 21 LTS (ex: `C:\Program Files\Android\Android Studio\jbr`)
- **Android SDK:** `C:\Users\Jairan Santos\AppData\Local\Android\Sdk`
- **Compile SDK:** 34 (Android 14)
- **Min SDK:** 24 (Android 7.0 Nougat)
- **Target SDK:** 34

### Tarefas Canônicas de Build:
```bash
# Compilar variante Debug (desenvolvimento / canary)
cd native-android-player && .\gradlew.bat assembleDebug

# Compilar variante Release (distribuição / OTA)
cd native-android-player && .\gradlew.bat assembleRelease

# Apenas verificar sintaxe e compilação de código Kotlin
cd native-android-player && .\gradlew.bat compileDebugSources
```

### Localização dos Artefatos Gerados:
- **Debug APK:** `native-android-player/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK:** `native-android-player/app/build/outputs/apk/release/app-release.apk`

---

## 4. CONTRATO DE TESTES E SELEÇÃO DE SUÍTES

| Tipo de Mudança | Suíte Mínima Obrigatória | Tarefa Gradle / Script |
|---|---|---|
| `RemoteDataSource.kt` ou Sync | Contract Tests + Mapper Tests + Compile | `node .agents/scripts/test_player_contract_drift.mjs` |
| `PlayerRepositoryImpl.kt` ou Cache | Repository Tests + Offline Resilience | `node .agents/scripts/test_android_player_system.mjs` |
| `SessionManager.kt` ou Token | Session Tests + Hardware Binding Security | `node .agents/scripts/test_android_player_system.mjs` |
| `Room Database / DAO` | Migration Tests + Schema Integrity | `.\gradlew.bat testDebugUnitTest` |
| `PlayerEngine.kt` ou ExoPlayer | Playback Tests + SurfaceView Tests | `.\gradlew.bat testDebugUnitTest` |
| `OTA / Silent Update` | Anti-Downgrade Tests + SHA-256 Check | `node .agents/scripts/test_android_player_system.mjs` |
| `UI / XML Layout` | Manifest / Resource Lint + Assemble | `.\gradlew.bat assembleDebug` |

---

## 5. ADB E GOVERNANÇA DE DISPOSITIVOS (DEVICE GOVERNANCE)

### 5.1 Descoberta de Dispositivos:
O runtime utiliza `adb devices -l` para identificar o estado da frota:
```bash
adb devices -l
```

### 5.2 Classificação de Estados:
- **`NO_DEVICE`**: Nenhum dispositivo físico ou emulador conectado.
- **`EMULATOR`**: Serial prefixado com `emulator-` ou modelo virtual (`sdk_gphone64`, `generic`).
- **`PHYSICAL_DEVICE`**: Dispositivo físico de hardware real (TV Box, Dongle, Smartphone).
- **`MULTIPLE_DEVICES`**: Mais de um dispositivo conectado com status `device`.
- **`UNAUTHORIZED_DEVICE`**: Dispositivo conectado aguardando confirmação RSA do usuário (`unauthorized`).
- **`OFFLINE_DEVICE`**: Dispositivo sem resposta ADB (`offline`).

### 5.3 Regra de Seleção de Target (Fail-Closed Target Selection):
- É **estritamente proibido** executar `adb install` indiscriminado ou sem flag de serial (`-s <serial>`) quando houver mais de um dispositivo conectado (`AMBIGUOUS_TARGET_SELECTION`).
- A instalação em produção exige que o serial seja explicitamente fornecido ou que haja exatamente um dispositivo aprovado.
- Dispositivos `unauthorized` ou `offline` **nunca** recebem comandos de execução ou instalação.

---

## 6. PROTOCOLO CANARY (HOMOLOGAÇÃO REALISTA)

Antes de qualquer promoção para produção:
1. **Target Selection:** Selecionar dispositivo Canary ativo e autorizado.
2. **Build Verificado:** `assembleDebug` concluído com hash SHA-256 e tamanho extraídos.
3. **Instalação:** `adb -s <serial> install -r app-debug.apk`.
4. **Boot e Reivindicação:** `adb -s <serial> shell am start -n com.antigravity.player/.MainActivity`.
5. **Playback e Mídia:** Confirmação de playback ininterrupto via ExoPlayer (`STATE_READY`).
6. **Resiliência Offline:** Simulação de queda de rede (`adb shell svc wifi disable / svc data disable`) — reprodução deve continuar sem tela preta.
7. **Reconciliação Online:** Retorno da rede (`adb shell svc wifi enable`) — telemetria transmitida e novas mídias baixadas atomicamente.
8. **Condição Sem Hardware:** Se nenhum dispositivo Canary ou emulador estiver online, o resultado do Canary deve ser formalmente reportado como `CANARY = NOT PROVABLE` (nunca simular ou falsificar aprovação).

---

## 7. ÁREAS E ESTRUTURAS PROTEGIDAS (FAIL-CLOSED)

As seguintes estruturas são consideradas críticas e exigem **MICRO-GATE específico** para qualquer modificação:
1. `native-android-player/app/src/main/java/com/antigravity/player/data/remote/RemoteDataSource.kt` (Contrato online com Supabase)
2. `native-android-player/app/src/main/java/com/antigravity/player/data/repository/PlayerRepositoryImpl.kt` (Troca atômica de playlist)
3. `native-android-player/app/src/main/java/com/antigravity/player/security/SessionManager.kt` (Identidade e token de hardware)
4. `native-android-player/app/src/main/java/com/antigravity/player/data/local/` (Schema do banco Room)
5. `native-android-player/app/src/main/AndroidManifest.xml` (Permissões críticas, Boot e Kiosk)
6. `docs/PLAYER_CONTRACT.md` e `docs/PLAYER_GOLDEN_BASELINE.md` (Documentos canônicos)

---

## 8. COMANDOS E PADRÕES ESTRITAMENTE PROIBIDOS

1. `git reset --hard` / `git clean -fd` / `git clean -f` (Destruição de histórico ou arquivos não comitados)
2. `git add -A` / `git add .` (Staging indiscriminado — exige lista explícita de arquivos)
3. `git checkout -- .` / `git restore .` (Descarte cego de modificações)
4. `adb install` sem especificar target quando houver múltiplos dispositivos.
5. Deletar a playlist atual do Player antes da nova estar completamente baixada e pronta para exibição (Tela Preta).
6. Alterar a assinatura da RPC `get_player_playlist_for_screen` sem migração aditiva e homologação nos clientes.
