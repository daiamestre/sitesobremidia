---
name: android-player-engineering
version: 1.0.0
description: Governed Android engineering, autonomous Gradle builds, Player architecture, ExoPlayer media engine, and local Room cache management.
dependencies:
  - sobremidia-domain
capabilities:
  - ANDROID_ENGINEERING
  - GRADLE_BUILD
  - EXOPLAYER_MANAGEMENT
actions:
  - discover_android_environment
  - build_android_apk
  - inspect_player_codebase
---

# Skill: Android Player Engineering

## Objetivo
Prover aos agentes do SOBRE MÍDIA AI Engineering System a capacidade de inspecionar, modificar, compilar e empacotar o Player Android nativo de forma governada e reproduzível, sem depender de intervenção manual no Android Studio.

## Diretrizes de Execução
1. **Descoberta de Ambiente:** Utilizar sempre o JDK e o Android SDK reais do sistema (ex: `C:\Program Files\Android\Android Studio\jbr` e `C:\Users\...\AppData\Local\Android\Sdk`).
2. **Build Reproduzível:** Executar `./gradlew assembleDebug` ou `./gradlew assembleRelease` no diretório `native-android-player`.
3. **Preservação de Core:** O ExoPlayer Media3, os algoritmos de decodificação e o schema do banco Room são estruturas protegidas. Qualquer alteração deve ser cirúrgica e justificada.
4. **Captura de Evidências:** Ao final de cada build, extrair e registrar o caminho do APK, tamanho em bytes, hash SHA-256, `versionCode` e `versionName`.
