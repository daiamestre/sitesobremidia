---
name: ota-release-management
version: 1.0.0
description: Silent Over-The-Air (OTA) distribution, anti-downgrade validation, SHA-256 integrity, PackageInstaller sessions, and rollback governance.
dependencies:
  - sobremidia-domain
capabilities:
  - OTA_MANAGEMENT
  - ROLLBACK_GOVERNANCE
actions:
  - publish_ota_manifest
  - verify_ota_integrity
  - execute_silent_install
  - trigger_player_rollback
---

# Skill: OTA Release Management

## Objetivo
Governar a distribuição, verificação, instalação silenciosa e rollback de novas versões do aplicativo Android Player através do pipeline OTA oficial da SOBRE MÍDIA.

## Regras de Governança
1. **Monotonicidade:** Somente releases com `version_code > local_version_code` são elegíveis para instalação.
2. **Integridade de Hash:** O hash SHA-256 do APK baixado deve ser idêntico ao campo `sha256` registrado em `app_releases`. Em caso de divergência, o arquivo corrompido deve ser apagado e a instalação cancelada imediatamente (fail-closed).
3. **Reprodução Ininterrupta:** O download e a validação do APK devem ocorrer em segundo plano sem pausar o ExoPlayer.
4. **Instalação Silenciosa:** Em dispositivos Device Owner, utilizar `USER_ACTION_NOT_REQUIRED` via `PackageInstaller` para evitar intervenção física do usuário na tela.
5. **Rollback:** Se o dispositivo falhar no health check pós-boot, abortar rollout e reverter para a versão estável anterior.
