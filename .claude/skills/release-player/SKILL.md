---
name: release-player
description: Gerar e publicar uma nova versão do Player Android do SOBRE MÍDIA (APK de produção, release no GitHub, R2 e OTA para as telas), inclusive o APK debug. Usar quando mudar código em native-android-player/ ou o usuário pedir APK/versão nova.
---

# Release do Player Android — SOBRE MÍDIA

## 1. Versão
- Em `native-android-player/app/build.gradle.kts`, suba `versionCode` (+1) e `versionName` (`"5.x.y-MicroGate"`).
- Se o servidor passar a mandar algo novo para o Player, use o padrão W11/W12: uma função `fn_*_suportado_no_aparelho` que só entrega a novidade a partir da versão nova. Aparelho antigo nunca recebe o que não sabe desenhar.

## 2. Compilar e testar (Git Bash)
```
cd native-android-player
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"   # caminho Windows; NÃO usar MSYS_NO_PATHCONV aqui
./gradlew testDebugUnitTest -q          # testes JVM de todos os módulos
./gradlew :app:assembleRelease :app:assembleDebug -q
```
- Resultado dos testes: `app/build/test-results/testDebugUnitTest/*.xml` (some `tests=` e `failures=`).
- Saída padrão, sempre esta pasta: `app/build/outputs/apk/release/app-release.apk` e `.../debug/app-debug.apk`.
- Se o banco local (Room) mudar, suba a versão em `cache-manager/.../cache/db/PlayerDatabase.kt` **com migração** (`ALTER TABLE ... ADD COLUMN`). Nunca depender do `fallbackToDestructiveMigration`, que apaga o cache das telas.

## 3. Canário (obrigatório antes do OTA)
- Emulador: `adb` fica em `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe` (use `MSYS_NO_PATHCONV=1`). Instalar com `adb install -r -t <apk>`.
- Teste de desenho sem login: testes em `app/src/androidTest` rodados com `am instrument -w -e class <Classe> com.antigravity.player.test/androidx.test.runner.AndroidJUnitRunner`. Não use o `connectedAndroidTest` do Gradle: ele desinstala o app.
- O Player em si pede login. Você **não** digita senha: peça ao proprietário para testar o APK no aparelho e confirmar.

## 4. Publicar (depois do canário)
```
node scripts/ops/publicar-player.mjs "Notas da versão em português"
```
O script confere a versão, que o APK não é depurável e o certificado `95a973c3…`. Depois cria a release no GitHub, copia para o R2 pelo workflow `publish-player-apk.yml`, confere o hash público e registra em `app_releases` (OTA). As telas atualizam no próximo início do app ou em até 12 h; sem Device Owner, o instalador pede um toque.

## 5. Registrar
Ledger `docs/engineering/FINDINGS_LEDGER.md`: versão, código da versão, SHA-256 do APK de produção e do debug, e prova.
