# SOBRE MÍDIA — PLAYER COMPATIBILITY MATRIX

> **Status:** CANONICAL MATRIX  
> **Última Atualização:** 2026-09-16  
> **Governança:** `AGENTS.md` (Regras 8, 13 e 14)  
> **Objetivo:** Estabelecer a matriz de compatibilidade entre o Backend Supabase, versões de RPCs, versões do Player Android nativo, níveis de API do sistema operacional e capacidades de hardware.

---

## Matriz de Compatibilidade Operacional

| Componente | Versão Suportada | Versão Mínima | Status | Observações / Contratos |
|---|---|---|---|---|
| **Backend Supabase** | PostgreSQL 15+ | PostgreSQL 14 | **ACTIVE** | RLS e RPCs estruturadas |
| **RPC Playlist** | `v2` (com Device Exclusivity) | `v1` | **ACTIVE** | Requer `p_identifier` e `p_device_id` |
| **RPC Unpair** | `admin_unpair_screen` | `admin_unpair_screen` | **ACTIVE** | Permite transferência de hardware |
| **Player Android APK** | `v1.2.0` (versionCode >= 513) | `v1.0.0` (versionCode 120) | **ACTIVE** | Suporte a ExoPlayer Media3 + Room |
| **Android OS** | Android 7.0 até 14 (API 24 - 34) | Android 6.0 (API 23) | **ACTIVE** | Universal APK (ARM64, ARMv7, x86_64) |
| **JDK de Compilação** | OpenJDK 21 (Android Studio JBR) | OpenJDK 17 | **ACTIVE** | `compileSdk = 34`, `targetCompatibility = 17` |
| **Gradle Wrapper** | Gradle 8.2+ / AGP 8.2.2 | Gradle 8.0 | **ACTIVE** | Compilação autônoma via CLI |
| **Silent OTA** | Android 12+ (API 31+) Device Owner | Android 8+ (API 26+) Device Owner | **ACTIVE** | Requer `USER_ACTION_NOT_REQUIRED` |
| **Fallback OTA** | Qualquer Android (API 24+) | API 23 | **COMPATIBLE** | Inicia instalador de sistema via FileProvider |
| **Offline Cache** | Room DB 2.6+ & Disk Storage | SQLite nativo | **ACTIVE** | Persistência atômica de playlist e mídias |

---

## Classes de Dispositivos e Requisitos Físicos

| Classe de Hardware | Exemplos | Suporte | Modo Recomendado |
|---|---|---|---|
| **Android TV Box Dedicado** | Tanix TX6, X96 Max+, Xiaomi TV Box S | **TOTAL** | Device Owner (Kiosk Fullscreen + OTA Silencioso) |
| **Smart TV com Android TV / Google TV** | TCL, Sony, Philips | **TOTAL** | Device Owner ou App Padrão de Inicialização |
| **Tablets de Balcão / Displays Totem** | Samsung Galaxy Tab A, Positivo | **TOTAL** | Kiosk Mode com Immersive Sticky e Screen Pinning |
| **Emulador Android / Test Rig** | Android Virtual Device (AVD x86_64) | **HOMOLOGAÇÃO** | Canary Testing & Verificação de Pipeline de Build |
