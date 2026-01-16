# SobreMidia Native Player (Android)

Este diretório contém o projeto nativo Android Studio para o Player.

## Estrutura

- **Hospedeiro (Host)**: App Android Nativo (`app/src/main/java`)
- **Renderizador (Guest)**: App React (copiado de `../../dist` para `assets/www`)

## Como Abrir no Android Studio

1. Abra o **Android Studio**.
2. Selecione **File > Open**.
3. Navegue até esta pasta (`.../sobremidiadesigner-main/android`) e clique em OK.
4. Aguarde a sincronização do Gradle.

## Como Compilar e Rodar

### Pré-requisitos
1. Você deve ter o Node.js instalado.
2. Você deve ter gerado o build do React.

### Passo a Passo
1. No terminal (raiz do projeto web):
   ```bash
   npm install
   npm run build
   ```
2. No Android Studio:
   - Clique em **Run 'app'** (ícone de Play verde).
   - O Gradle irá automaticamente executar a tarefa `copyWebAssets` que copia o conteúdo de `dist/` para dentro do APK.

## Detalhes Técnicos

- **Modo Kiosk**: O `MainActivity` está configurado para `startLockTask()` (deve ser ativado manualmente ou via Device Owner).
- **Serviço 24/7**: O `PlayerService` inicia no boot e se mantém rodando (START_STICKY).
- **Bridge**: A comunicação entre JS e Kotlin é feita via `window.NativePlayer`.

### Bridge Interface
No JavaScript/React:
```javascript
// Obter ID do dispositivo
const id = window.NativePlayer.getDeviceId();

// Configuração
const config = JSON.parse(window.NativePlayer.getPlayerConfig());
```
