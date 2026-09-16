# SOBRE MÍDIA — PLAYER GOLDEN BASELINE

> **Status:** CANONICAL BASELINE  
> **Última Atualização:** 2026-09-16  
> **Governança:** `AGENTS.md` (Regras 8, 13 e 14)  
> **Objetivo:** Registrar formalmente todos os 16 comportamentos funcionais essenciais do Android Player que NUNCA podem sofrer regressão.

---

## Matriz de Comportamentos Essenciais do Player (Golden Baseline)

| # | Fase Funcional | Comportamento Esperado Não-Negociável | Proteção de Regressão |
|---|---|---|---|
| **1** | **BOOT & LAUNCHER** | O app inicia automaticamente no boot do dispositivo (`BOOT_COMPLETED`), restaura flags de Kiosk/Immersive Mode (`SYSTEM_UI_FLAG_FULLSCREEN`, `HIDE_NAVIGATION`), oculta status bars e ativa `FLAG_KEEP_SCREEN_ON`. | Nunca exigir toque na tela após reinicialização; nunca cair na home do Android. |
| **2** | **AUTH / SESSION** | O dispositivo utiliza tokens persistentes de sessão (`device_token` ou credenciais salvas em Room/SharedPreferences). Revalida JWT sem expor segredos. | Se expirar token em modo offline, não deslogar ou travar a tela. |
| **3** | **HARDWARE PAIRING** | Gera hash de identidade único e imutável de hardware (`deviceIdentityHash`). Realiza binding exclusivo com a tela no backend via `get_player_playlist_for_screen`. | Impede colisão entre dois aparelhos para a mesma tela (`DEVICE_ALREADY_BOUND`). |
| **4** | **SCREEN DISCOVERY & TRANSFER** | Operador autenticado pode listar telas disponíveis. Se a tela estiver vinculada a outro aparelho antigo, permite desvinculação governada via `admin_unpair_screen` e reatribuição legítima. | Elimina o bloqueio sem saída no diálogo de seleção de tela. |
| **5** | **PLAYLIST FETCH** | Consulta Supabase RPC `get_player_playlist_for_screen(identifier, deviceId)` periodicamente (polling ou realtime channel) recebendo payload estruturado com itens ordenados. | Payload é validado contra schema antes de ser propagado para o engine. |
| **6** | **PLAYLIST PARSE** | Desserialização segura do JSON (`DeviceRemoteDTO`, `PlaylistRemoteDTO`, `PlaylistItemRemoteDTO`). Tratamento robusto de nulos e defaults defensivos. | Um item de mídia malformado nunca derruba o parser ou aborta os demais itens. |
| **7** | **MEDIA SYNC & PRE-CACHE** | O `MediaDownloader` realiza download assíncrono em background para o cache local do disco (`context.filesDir` ou cache externo). | Download ocorre em coroutines de background; ExoPlayer continua tocando a mídia atual. |
| **8** | **LOCAL CACHE INTEGRITY** | Entidades persistidas em banco Room (`ScreenEntity`, `PlaylistEntity`, `MediaEntity`). O cache sobrevive a reinicializações completas do hardware. | Se o disco encher, política de eviction baseada em LRU expurga itens que não constam na playlist ativa. |
| **9** | **PLAYBACK ENGINE (EXOPLAYER)** | ExoPlayer configurado para transições contínuas sem tela preta (black frame). Suporte a vídeo (MP4/H.264/H.265), imagens (WebP/JPEG/PNG) e web widgets com looping infinito. | Áudio em mute por padrão para sinalização digital de varejo; loop nunca trava ou congela no último frame. |
| **10** | **HEARTBEAT & TELEMETRY** | Envio periódico (a cada 30s ou 60s) de telemetria via RPC `report_device_heartbeat` (temperatura, memória, storage, playlist_version, status de reprodução). | Falha no envio de telemetria é silenciosa e não interfere na reprodução de mídia. |
| **11** | **PROOF OF PLAY** | Registro local de cada exibição de anúncio (mídia ID, timestamp, duração efetiva, tela ID). Envio em lote (batch) para auditoria e cobrança de anunciantes. | Armazenamento persistente local com garantia contra perda de dados em caso de reboot. |
| **12** | **REMOTE COMMANDS** | Processamento de comandos remotos recebidos do painel central (`REBOOT`, `RELOAD_PLAYLIST`, `CLEAR_CACHE`, `SCREENSHOT`, `UPDATE_PLAYER`). | Comandos desconhecidos são ignorados; comandos críticos exigem autorização criptográfica. |
| **13** | **OFFLINE SURVIVAL** | Desconexão total de Wi-Fi / Ethernet não afeta a reprodução. O player detecta ausência de rede e mantém o loop ativo a partir do cache local Room/disco. | Zero mensagens de erro na tela; zero telas pretas para o público da loja. |
| **14** | **ONLINE RECONCILIATION** | Ao restabelecer a conectividade, o player sincroniza logs de Proof of Play, checa novas versões de playlist e reconcilia o estado de forma atômica. | Nunca deletar a playlist local funcional antes que a nova esteja totalmente baixada e validada. |
| **15** | **ERROR RECOVERY (FAIL-CLOSED)** | Em caso de arquivo de vídeo corrompido, o player captura `PlaybackException`, avança para o próximo item da fila e notifica erro em telemetria. | Se toda a playlist falhar, exibe fallback institucional padrão da SOBRE MÍDIA em vez de crashar. |
| **16** | **SILENT OTA UPDATE** | Verificação de novas versões em `app_releases`. Download em background, validação estrita de SHA-256 e assinatura, instalação silenciosa via `PackageInstaller` (`USER_ACTION_NOT_REQUIRED`). | Se o hash divergir ou download falhar, o APK é excluído e a versão atual continua ativa. |
