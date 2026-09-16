# MEMÓRIA OPERACIONAL PERMANENTE: ARQUITETURA E ENGENHARIA DO ANDROID PLAYER

> **Repositório de Conhecimento Canônico dos Agentes SOBRE MÍDIA**  
> **Arquivo:** `.agents/memory/player_architecture_baseline.md`  
> **Finalidade:** Fornecer aos agentes de IA todo o conhecimento estrutural, arquitetural, de build, de release e de governança do Player Android, eliminando a necessidade de redescobrir a infraestrutura.

---

## 1. ARQUITETURA GERAL DO PLAYER ANDROID NATIVO

O Player Android do SOBRE MÍDIA está localizado no diretório `/native-android-player` e é construído em Kotlin moderno com arquitetura modular:

```
native-android-player/
├── app/                  # UI, Activities, Kiosk Launcher, Receivers e OTA Manager
├── cache-manager/        # Gerenciamento de arquivos locais, integridade SHA-256 e política LRU
├── core-player/          # Engine do ExoPlayer (Media3), transição atômica e loops contínuos
├── media-engine/         # Decodificação de imagem/vídeo/widgets e adaptação de aspect ratio
└── sync-network/         # Cliente Supabase, RPCs, telemetria, autenticação e DTOs
```

### Tecnologias-Chave:
- **Linguagem & Runtime:** Kotlin 1.9+, Java 17 compatibility, Android SDK 34 (`compileSdk = 34`, `minSdk = 23`).
- **Engine de Vídeo:** `androidx.media3:media3-exoplayer:1.2.1` e `media3-ui`.
- **Persistência Local:** Room Database (`androidx.room:room-runtime:2.6.1`).
- **Conectividade:** Supabase Kotlin Client (`io.github.jan-tennert.supabase:postgrest-kt`).
- **Background Tasks:** Kotlin Coroutines (`Dispatchers.IO`) e WorkManager.

---

## 2. PROCESSO DE BUILD AUTÔNOMO VIA GRADLE

O sistema executa compilações de forma 100% autônoma através do Gradle Wrapper sem depender do Android Studio:

- **Comando de Compilação:**  
  `./gradlew assembleDebug` (ou `assembleRelease` para produção).
- **Ambiente de Build:**
  - JDK: `C:\Program Files\Android\Android Studio\jbr` (Java 21).
  - Android SDK: `C:\Users\Jairan Santos\AppData\Local\Android\Sdk`.
  - Android Platforms: `android-34`, `android-36`.
  - Build Tools: `34.0.0`, `35.0.0`, `36.1.0`.
- **VersionCode Monotônico:**
  Calculado via variável de ambiente `VERSION_CODE` (CI) -> contagem de commits git (`git rev-list --count HEAD`) -> epoch incremental (segundos desde 2024-01-01).

---

## 3. PROCESSO DE ASSINATURA E SEGURANÇA CRIPTOGRÁFICA

- **Configuração:** `native-android-player/keystore.properties` (arquivo estritamente gitignorado).
- **Keystore de Produção:** `sobre-midia-production.jks` (algoritmo RSA 4096-bit).
- **Pinning de Certificado:** `OTA_RELEASE_CERT_SHA256` embutido no `BuildConfig` do app.
- **Proteção:** As senhas nunca são impressas em logs ou evidências, respeitando o `CredentialSanitizer`.

---

## 4. CONCEITO DE CANARY DEVICE E HOMOLOGAÇÃO REALISTA

Nenhum release pode ser propagado para todos os dispositivos em campo sem passar por validação no **Canary Device**:
1. **Ambiente:** Dispositivo de teste dedicado ou emulador configurado com backend de produção/staging controlado.
2. **Ciclo de Homologação Canary:**
   - Boot e inicialização do app.
   - Reivindicação exclusiva de tela (`get_player_playlist_for_screen`).
   - Download completo das mídias reais.
   - Reprodução no ExoPlayer sem frames pretos.
   - Envio bem-sucedido de heartbeat de telemetria.
   - Desconexão de rede (teste de resiliência offline mantendo playback do cache local).
   - Reconexão de rede (reconciliação atômica de nova playlist).
3. **Barreira:** Se qualquer etapa do Canary falhar, a `PlayerReleaseAuthority` emite **RELEASE_BLOCKED**.

---

## 5. CAPACIDADE OTA E MODO SILENCIOSO

- **Descoberta:** O Player consulta a tabela `app_releases` periodicamente ou recebe comando via Realtime.
- **Validação Prévia:**
  - Compara `version_code` (rejeita downgrade).
  - Baixa APK em background mantendo a playlist atual rodando.
  - Calcula o SHA-256 do arquivo baixado e compara com o manifest oficial.
- **Instalação:**
  - Em dispositivos configurados como **Device Owner**, invoca `PackageInstaller.SessionParams` com `params.setRequireUserAction(USER_ACTION_NOT_REQUIRED)` (Android 12+ / API 31+).
  - Em dispositivos comuns, abre o instalador do sistema através de `FileProvider`.
- **Rollback:** Se o hash SHA-256 divergir ou a instalação falhar, o arquivo corrompido é imediatamente excluído do disco e o Player permanece na versão estável anterior sem interromper o playback.

---

## 6. MODOS DE FALHA CONHECIDOS E CAUSAS-RAIZ (HISTÓRICO)

1. **`DEVICE_ALREADY_BOUND`:**
   - Causa: Uma tela permaneceu vinculada ao identificador de outro hardware no Supabase.
   - Solução canônica: O operador autenticado autoriza a desvinculação através do diálogo "Transferir Tela" na `ScreenSelectionActivity`, invocando a RPC `admin_unpair_screen`.
2. **Tela Preta no Troca de Playlist:**
   - Causa: Deletar mídias antigas antes de baixar as novas.
   - Solução canônica: Atualização atômica (`Download New -> Validate -> Ready -> Atomic Switch`).
3. **Crash por JSON Incompatível:**
   - Causa: Adição de campo obrigatório ou mudança de tipo no backend sem atualizar o app.
   - Solução canônica: Mapeamento defensivo com `ignoreUnknownKeys = true` e campos com valores padrão.
