# Player Android — referência rápida

Consolidado de `.agents/memory/player_architecture_baseline.md` e das lições do `FINDINGS_LEDGER`. Leia só quando a tarefa envolver o Player. O perfil completo está em `docs/ANDROID_PLAYER_PROFILE.md`.

## Módulos (`native-android-player/`)
| Módulo | O que faz |
|---|---|
| `app/` | Telas (`ui/ScreenSelectionActivity.kt`, pareamento e "Transferir Tela"), widgets nativos (`widget/*`, `util/NativeWidgetEngine.kt`), OTA (`util/OTAUpdateManager.kt`, `receiver/OTAInstallReceiver.kt`), rodízio de pastas (`util/RodizioDePastas.kt`) |
| `core-player/` | ExoPlayer (Media3), troca atômica da playlist (`usecase/SyncPlaylistUseCase.kt`), estado de sincronização |
| `cache-manager/` | Arquivos locais, integridade SHA-256, limpeza LRU, banco local Room (`cache/db/PlayerDatabase.kt`) |
| `media-engine/` | Imagem, vídeo, widgets e proporção |
| `sync-network/` | Supabase: RPCs, DTOs (`dto/*`), heartbeat, login |

Kotlin, `compileSdk 34`, `minSdk 23`, Media3 1.2.1, Room 2.6.1, Supabase Kotlin (postgrest-kt).

## Versão e assinatura
- `app/build.gradle.kts`: `versionCode = VERSION_CODE ?: 555`, `versionName = VERSION_NAME ?: "5.6.8-MicroGate"`. Suba os dois valores padrão a cada versão.
- Assinatura: `keystore.properties` + `sobre-midia-production.jks` (fora do git). O certificado de produção começa com `95a973c3…` e fica fixado no `BuildConfig` (`OTA_RELEASE_CERT_SHA256`).
- JDK: `C:/Program Files/Android/Android Studio/jbr`. SDK: `%LOCALAPPDATA%/Android/Sdk`.

## OTA
- O Player consulta `app_releases`, recusa versão menor ou igual (sem downgrade) e baixa em segundo plano **sem parar a reprodução**.
- Confere o SHA-256 (64 hex) e instala. Com Device Owner é silencioso; nos demais aparelhos, pelo instalador do sistema.
- Hash diferente ou falha na instalação: o arquivo é apagado e o Player fica na versão atual.

## Canário (antes de todo OTA)
Abrir o app, entrar na tela, baixar as mídias reais, reproduzir sem tela preta e mandar heartbeat. Depois tirar a rede (continua pelo cache) e devolver a rede (a playlist nova entra de forma atômica).

## Modos de falha conhecidos
| Sintoma | Causa | Solução certa |
|---|---|---|
| `DEVICE_ALREADY_BOUND` | Tela presa a outro aparelho | "Transferir Tela" na `ScreenSelectionActivity` (RPC `admin_unpair_screen`) |
| Tela preta ao trocar playlist | Apagar mídias antes de baixar as novas | Baixar → validar → trocar de uma vez |
| Crash por JSON novo | Campo novo obrigatório ou tipo mudado no servidor | DTO com `ignoreUnknownKeys` e valores padrão. Novidade só para versão nova (padrão W11/W12 `fn_*_suportado_no_aparelho`) |
| Cache das telas apagado após atualizar | Room mudou sem migração (`fallbackToDestructiveMigration`) | Subir a versão do Room **com** `Migration` (`ALTER TABLE ADD COLUMN`) |
| Prévia diferente da tela | Tamanhos em px na web | Web só com `cqmin`, igual ao `NativeWidgetEngine` |
