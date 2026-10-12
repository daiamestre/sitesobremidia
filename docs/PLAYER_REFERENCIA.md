# Player Android — referência rápida

Consolidado de `.agents/memory/player_architecture_baseline.md` e das lições do `FINDINGS_LEDGER`. Leia só quando a tarefa envolver o Player. O perfil completo está em `docs/ANDROID_PLAYER_PROFILE.md`.

## Módulos (`native-android-player/`)
| Módulo | O que faz |
|---|---|
| `app/` | Telas (`ui/ScreenSelectionActivity.kt`, pareamento: o mesmo login vale em vários aparelhos, cada tela fica em um aparelho VIVO por vez — tela cujo aparelho está há mais de 10 min sem sinal volta a ficar livre, F-184; o aparelho pode trocar a própria tela), widgets nativos (`widget/*`, `util/NativeWidgetEngine.kt`), OTA (`util/OTAUpdateManager.kt`, `receiver/OTAInstallReceiver.kt`), rodízio de pastas (`util/RodizioDePastas.kt`) |
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
- O Player pergunta a versão mais nova pela função pública `get_latest_app_release()` (não precisa de login) **ao abrir o aplicativo** e a cada 15 minutos (`util/OtaCycle.kt`); recusa versão menor ou igual (sem downgrade) e baixa em segundo plano **sem parar a reprodução**. Pelo painel: comando `update_app`.
- Confere o SHA-256 (64 hex) e instala. Com Device Owner é silencioso; nos demais aparelhos o Android pede um toque em "Instalar" (o Player não cobre o instalador por 3 minutos) e, se faltar a permissão "instalar apps desconhecidos", o Player abre a tela do Android onde ela é ligada.
- **Aviso na tela** (`util/OtaStatus.kt`, faixa `ota_banner`): baixando N%, instalando, "confirme a instalação", "ative Permitir desta fonte", "Aplicativo atualizado para a versão X", falha.
- Depois de trocado, o aplicativo reabre sozinho (`BootReceiver` + `MY_PACKAGE_REPLACED`).
- Ensaio no emulador: `androidTest/OtaInstalacaoTest.kt` com um APK de `VERSION_CODE` maior.
- Hash diferente ou falha na instalação: o arquivo é apagado e o Player fica na versão atual.

## Reinício do motor e giro (F-186)
- Reiniciar o motor de vídeo é SEMPRE `reiniciarMotorDeVideo()` (para o laço, `recreate()` nos dois players, religa as PlayerViews, recomeça o laço). Nunca `release()` + `startSyncAndPlay()`: deixa tela preta com registro de exibição normal.
- Aparelho que ignora o pedido de girar: a decisão fica em `player_prefs` (`giro_por_software`) e o quadro abre girado antes do vídeo. Bancada: `files/ignorar_pedido_de_giro` (só debug) + `adb shell wm size 1280x720`.
- Canário é no APK de PRODUÇÃO, com login por senha da conta de teste e religando o aparelho (`adb reboot`), olhando a TELA (captura), não só o registro.

## Vigia da imagem (F-187)
- `MainActivity.vigiarImagem()` roda a cada 2 s e garante o resultado: mídia no ar APARECE (regras em `PlayerFlowPolicy.acaoDoVigia`).
- `util/SaudeDaReproducao.kt` é a verdade enviada no sinal de vida (`playing` só com o vigia confirmando; senão `sem_reproducao` + causa em `status_note`). O painel lê por `fn_telas_sem_reproducao()`.
- Bancada (debug): `run-as com.antigravity.player touch files/ensaio_tela_presa` provoca a tela presa uma vez.

## Canário (antes de todo OTA)
Abrir o app, entrar na tela, baixar as mídias reais, reproduzir sem tela preta e mandar heartbeat. Depois tirar a rede (continua pelo cache) e devolver a rede (a playlist nova entra de forma atômica).

## Modos de falha conhecidos
| Sintoma | Causa | Solução certa |
|---|---|---|
| `DEVICE_ALREADY_BOUND` | Tela presa a outro aparelho (ou aparelho ainda preso a outra tela) | O Player volta à escolha de tela com o aviso (`PlayerFlowPolicy.AVISO_TELA_EM_USO`). Liberar: painel > Telas > Desvincular aparelho (RPC `admin_unpair_screen`); o próprio aparelho troca de tela pela lista (RPC `player_unpair_screen`). O Player não toma mais a tela de outro aparelho |
| Tela preta ao trocar playlist | Apagar mídias antes de baixar as novas | Baixar → validar → trocar de uma vez |
| Crash por JSON novo | Campo novo obrigatório ou tipo mudado no servidor | DTO com `ignoreUnknownKeys` e valores padrão. Novidade só para versão nova (padrão W11/W12 `fn_*_suportado_no_aparelho`) |
| Cache das telas apagado após atualizar | Room mudou sem migração (`fallbackToDestructiveMigration`) | Subir a versão do Room **com** `Migration` (`ALTER TABLE ADD COLUMN`) |
| Prévia diferente da tela | Tamanhos em px na web | Web só com `cqmin`, igual ao `NativeWidgetEngine` |
