---
name: player-regression-forensics
version: 1.0.0
description: Forensic analysis, root cause diagnosis, hardware binding validation, and contract integrity for Android Player.
dependencies:
  - forensic-auditor
  - sobremidia-domain
capabilities:
  - PLAYER_FORENSICS
  - HARDWARE_BINDING_AUDIT
actions:
  - audit_player_regression
  - verify_hardware_exclusivity
---

# Skill: Player Regression Forensics

## Objetivo
Diagnosticar e comprovar formalmente a causa raiz de quaisquer falhas de integração entre o sistema central (Supabase, RPCs, CRM) e o Player Android nativo.

## Protocolo de Investigação
1. **Comprovação de Sintoma:** Reproduzir a falha através de testes de integração ou chamadas RPC diretas.
2. **Auditoria de Hardware Binding:** Inspecionar o valor de `screens.bound_device_id` e a resposta da RPC `get_player_playlist_for_screen` (`DEVICE_ALREADY_BOUND`, `SCREEN_NOT_FOUND`).
3. **Validação de DTOs:** Comparar o schema JSON emitido pelo backend com as classes de dados DTO em `com.antigravity.sync.dto`.
4. **Garantia de Não-Regressão:** Executar o Golden Test suite para assegurar que a correção cirúrgica não afete outros módulos.
