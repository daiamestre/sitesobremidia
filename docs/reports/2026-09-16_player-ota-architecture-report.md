# RELATÓRIO TÉCNICO: ARQUITETURA OTA (OVER-THE-AIR) SILENCIOSA DO PLAYER ANDROID

> **Data:** 2026-09-16  
> **Sistema:** SOBRE MÍDIA Platform  
> **Componente:** OTA Update Engine & Android PackageInstaller  
> **Status:** AUDITADO, IMPLEMENTADO E HOMOLOGADO

---

### 1. QUAL MECANISMO DE ATUALIZAÇÃO SERÁ USADO?
O mecanismo principal utiliza o **Android `PackageInstaller` Session API** em modo **Device Owner**, com o parâmetro `USER_ACTION_NOT_REQUIRED` (disponível a partir do Android 12 / API 31+). Para dispositivos em versões anteriores do Android com privilégio de Device Owner, utiliza o `PackageInstaller` com receiver silencioso. Para dispositivos que não operem como Device Owner, é ativado o modo fallback com acionamento do instalador do sistema via `FileProvider` (`Intent.ACTION_VIEW`).

### 2. POR QUE É COMPATÍVEL COM OS APARELHOS?
A frota de dispositivos físicos da SOBRE MÍDIA consiste primordialmente em Android TV Boxes (ex: Tanix, X96, Xiaomi) e Smart TVs rodando Android 7.0 a 14 (API 24 a 34). O `PackageInstaller` é uma API padrão do Android Open Source Project (AOSP), presente em 100% dos aparelhos Android, sem depender dos Google Play Services.

### 3. COMO O APK É CONSTRUÍDO?
A compilação é realizada via linha de comando pelo Gradle Wrapper:
```bash
./gradlew assembleRelease
```
O build é reproduzível e gera um Universal APK (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) com ProGuard/R8 habilitados para otimização e redução de tamanho. O `versionCode` é monotônico e crescente no tempo.

### 4. COMO É ASSINADO?
O APK de produção é assinado com o keystore oficial da SOBRE MÍDIA (`sobre-midia-production.jks`, RSA 4096-bit), utilizando esquemas de assinatura V1, V2 e V3. As credenciais são carregadas através de `keystore.properties` (gitignorado) integrado ao `CredentialRuntime`. O certificado possui hash de pinning fixado no `BuildConfig` do aplicativo.

### 5. ONDE É PUBLICADO?
O arquivo APK é hospedado em Cloudflare R2 / Supabase Storage com entrega HTTPS pública segura, e o manifesto correspondente é registrado na tabela `app_releases` do banco de dados com os campos: `version_code`, `version_name`, `apk_url`, `sha256`, `release_notes` e `is_mandatory`.

### 6. COMO O PLAYER DESCOBRE A ATUALIZAÇÃO?
O Player realiza polling periódico (ou escuta canal Realtime do Supabase) consultando a tabela `app_releases` ordenando por `version_code DESC LIMIT 1`. Se `version_code > local_version_code`, uma nova atualização elegível é identificada.

### 7. COMO BAIXA?
O download é executado assincronamente através de coroutines (`Dispatchers.IO`) pelo `MediaDownloader` diretamente para o diretório privado do aplicativo (`context.filesDir/ota/update.apk`).

### 8. COMO VERIFICA?
Antes de qualquer tentativa de instalação, o arquivo passa por:
1. **Verificação de tamanho de arquivo:** Confirmação de que o download foi concluído sem truncamento.
2. **Validação Criptográfica de Integridade:** Cálculo do SHA-256 do arquivo em disco via `MessageDigest("SHA-256")`. O hash calculado deve ser idêntico ao registrado no manifest `app_releases.sha256`. Se o hash não bater, o arquivo é imediatamente apagado.
3. **Verificação de Assinatura do Certificado:** O certificado contido no APK é inspecionado para garantir equivalência com a chave de produção oficial da SOBRE MÍDIA.

### 9. COMO INSTALA?
O `OTAUpdateManager` abre uma sessão no `PackageInstaller`:
```kotlin
val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
}
val sessionId = packageInstaller.createSession(params)
// stream do APK para a sessão e commit silencioso
```

### 10. COMO PRESERVA A PLAYLIST ATIVA?
Durante todo o processo de download (que pode demorar minutos em conexões lentas) e verificação criptográfica, o ExoPlayer **nunca é pausado ou fechado**. O playback de vídeos e imagens continua normalmente em loop. Apenas no momento exato do commit da instalação o sistema operacional atualiza o binário.

### 11. COMO REINICIA?
Ao término da instalação pelo sistema operacional, o receiver de boot e de substituição de pacote (`MY_PACKAGE_REPLACED`) do aplicativo é disparado pelo Android, reiniciando o serviço e trazendo a tela do Player diretamente para o modo Kiosk Immersivo sem necessidade de toque na tela.

### 12. COMO VERIFICA SAÚDE E COMO FAZ ROLLBACK?
1. **Health Check:** Nos primeiros 60 segundos após o boot da nova versão, o Player deve carregar a playlist, iniciar o ExoPlayer e enviar com sucesso o heartbeat de telemetria para o Supabase com o novo `version_code`.
2. **Rollback Automático:** Caso o aplicativo sofra um crash imediato (boot loop) ou não consiga carregar mídias, o watchdog nativo ou o comando central emite uma ordem de rollback. Se o download ou verificação do APK falhar, o arquivo corrompido é sumariamente excluído e o Player permanece rodando na versão anterior sem impacto para o anunciante.
