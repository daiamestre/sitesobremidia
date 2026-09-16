---
name: device-canary-validation
version: 1.0.0
description: Realistic canary device verification, end-to-end playback testing, offline cache resilience, and staged rollout safety.
dependencies:
  - sobremidia-domain
capabilities:
  - CANARY_VALIDATION
  - OFFLINE_RESILIENCE_TESTING
actions:
  - run_canary_homologation
  - verify_offline_playback
  - reconcile_online_state
---

# Skill: Device Canary Validation

## Objetivo
Garantir que nenhuma versão nova do Player Android chegue a dispositivos de produção sem prévia homologação funcional em dispositivo Canary com dados reais de backend, telas e mídias.

## Critérios de Aprovação Canary
1. **Boot e Reivindicação:** Dispositivo inicializa e assume a tela no Supabase com sucesso.
2. **Carga e Resolução de Mídia:** Download das mídias reais da playlist concluído com hashes íntegros.
3. **Reprodução Contínua:** ExoPlayer entra em estado `STATE_READY` e executa o loop programado.
4. **Resiliência Offline:** Ao simular corte de internet, a reprodução permanece ativa utilizando o cache local em disco/Room.
5. **Reconciliação Online:** No retorno da rede, logs de telemetria/proof-of-play são transmitidos e atualizações de playlist são absorvidas atomicamente.
