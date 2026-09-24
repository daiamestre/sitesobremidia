package com.antigravity.player.util

import com.antigravity.core.domain.model.Playlist

/**
 * Decisões de fluxo do Player extraídas do MainActivity para serem testáveis na JVM.
 * Sem dependência de Android: nenhuma decisão aqui altera UI, playback ou sessão por conta própria.
 */
object PlayerFlowPolicy {

    /** Nome da tela de sincronização. */
    const val SYNC_SCREEN_TITLE = "Sincronizando Mídias"

    /** Texto exibido quando a sincronização termina. */
    const val SYNC_DONE_TEXT = "Mídias sincronizadas"

    /** Tempo mínimo em que "Mídias sincronizadas" fica visível antes de a mídia assumir a tela. */
    const val SYNC_DONE_MIN_VISIBLE_MS = 1500L

    enum class SyncErrorAction { REAUTH, SELECT_SCREEN, RETRY }

    private val HTTP_401 = Regex("""(?<!\d)401(?!\d)""")
    private val DOWNLOAD_COUNTER = Regex("""Sincronizando: (\d+) de (\d+)""")

    /**
     * Decide o que fazer com uma falha de sync SEM cache local.
     * Só o que é comprovadamente permanente tira o usuário da tela: sessão expirada de verdade
     * ou tela removida do painel. Um "404" qualquer (ex.: arquivo de mídia) ou um número que
     * contenha "401" NÃO expulsa ninguém: o player tenta de novo.
     */
    fun classifySyncError(message: String?): SyncErrorAction {
        val m = message.orEmpty()
        return when {
            m.contains("JWT expired", ignoreCase = true) || HTTP_401.containsMatchIn(m) ->
                SyncErrorAction.REAUTH
            m.contains("[PERMANENT]", ignoreCase = true) ||
                m.contains("Tela não encontrada", ignoreCase = true) -> SyncErrorAction.SELECT_SCREEN
            else -> SyncErrorAction.RETRY
        }
    }

    /** Texto que o usuário pode ver abaixo do nome da tela de sincronização. */
    fun sanitizeSyncProgress(raw: String?): String {
        if (raw == null) return ""
        DOWNLOAD_COUNTER.matchEntire(raw)?.let { return "${it.groupValues[1]} de ${it.groupValues[2]}" }
        if (raw.startsWith("Mídias prontas")) return SYNC_DONE_TEXT
        return "" // qualquer outro texto interno (aguarde, erro, bloqueio, etapas) não é exibido
    }

    /** Quanto ainda falta para "Mídias sincronizadas" cumprir o tempo mínimo de exibição. */
    fun remainingDoneVisibilityMs(doneShownAtMs: Long, nowMs: Long): Long =
        if (doneShownAtMs <= 0L) 0L else maxOf(0L, SYNC_DONE_MIN_VISIBLE_MS - (nowMs - doneShownAtMs))

    /** Assinatura do que efetivamente define a reprodução (ordem, duração, agenda, config). */
    fun playlistSignature(playlist: Playlist?): String? {
        if (playlist == null) return null
        return buildString {
            append(playlist.id).append('|').append(playlist.orientation).append('|')
                .append(playlist.audioEnabled).append('|').append(playlist.seamlessTransition).append('|')
                .append(playlist.cacheNextMedia).append('|').append(playlist.heartbeatIntervalSeconds)
            playlist.items.forEach {
                append('#').append(it.id).append(':').append(it.hash).append(':').append(it.orderIndex)
                    .append(':').append(it.durationSeconds).append(':').append(it.type)
                    .append(':').append(it.startTime).append(':').append(it.endTime)
                    .append(':').append(it.daysOfWeek).append(':').append(it.remoteUrl)
            }
        }
    }

    /**
     * Um sync bem-sucedido deve reiniciar o laço de reprodução?
     * Só quando não há laço ativo ou quando ESTE sync mudou a playlist. Reiniciar sem mudança
     * cortava a mídia em exibição a cada ciclo de 60 s.
     */
    fun shouldRestartPlaybackLoop(before: String?, after: String?, loopActive: Boolean): Boolean =
        after != null && (!loopActive || before != after)
    /** Entradas de sessão como o runtime deve enxergá-las ao projetar a superfície. */
    data class SessionInputs(val stateName: String?, val accessToken: String?, val userId: String?)

    /**
     * O estado de sessão do SessionManager só sai de UNKNOWN no 1o sync bem-sucedido, e o token em memória
     * some quando o processo renasce (watchdog/OS). Se a tela já foi escolhida neste aparelho
     * (saved_screen_id só existe após login + seleção e é apagado quando a sessão realmente expira), a sessão
     * local é válida: projetar "não autenticado" fecharia o player e mandaria o usuário ao Login.
     */
    fun effectiveSessionInputs(stateName: String?, accessToken: String?, userId: String?, savedScreenId: String?): SessionInputs {
        val screen = userId?.takeIf { it.isNotBlank() } ?: savedScreenId?.takeIf { it.isNotBlank() }
            ?: return SessionInputs(stateName, accessToken, userId) // sem tela escolhida: Login / Seleção continuam valendo

        val name = stateName?.trim()?.uppercase()
        val notConfirmedYet = name == null || name == "UNKNOWN" || name == "INITIALIZING" || name == "AUTHENTICATING"
        return SessionInputs(
            stateName = if (notConfirmedYet) "AUTHORIZED" else stateName, // SUSPENDED/REVOKED/etc. seguem intactos
            accessToken = if (accessToken.isNullOrBlank()) LOCAL_SESSION else accessToken,
            userId = userId?.takeIf { it.isNotBlank() } ?: screen
        )
    }

    /** Marcador de "sessão local válida" só para classificar a superfície; nunca é usado em rede. */
    private const val LOCAL_SESSION = "LOCAL_SESSION"
    /**
     * O timer de segurança do SyncGuard (25 s) pode soltar a tela de sincronização? Só quando já existe mídia
     * pronta. Antes soltava sempre: numa 1ª sincronização com vídeos grandes a tela de "Sincronizando" sumia
     * no meio do download e aparecia o logo sobre fundo preto.
     */
    fun keepSyncScreenLocked(uiState: com.antigravity.player.ui.PlayerUIState): Boolean =
        uiState != com.antigravity.player.ui.PlayerUIState.PLAYING

    /**
     * Orientação física do player (ActivityInfo.SCREEN_ORIENTATION_*) ou null para não travar.
     * Signage: a playlist manda. Em celular/tablet a tela fica TRAVADA na orientação da playlist e não gira
     * com o sensor. Em TV (sem sensor) nada é forçado, salvo comando explícito do painel (rotate_*).
     */
    fun physicalOrientationLock(canonicalOrientation: String?, isTelevision: Boolean, forcedByPanel: Boolean): Int? {
        if (isTelevision && !forcedByPanel) return null
        return when (canonicalOrientation) {
            "portrait" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            "landscape" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            else -> null
        }
    }

    /**
     * "Reiniciar Player": o mesmo comando pode chegar por Realtime e por polling, e o processo é recriado no meio.
     * O id do último reinício atendido fica em SharedPreferences (sobrevive ao reinício); repetido = ignorado.
     */
    fun shouldRunRestart(commandId: String?, lastHandledId: String?): Boolean =
        !commandId.isNullOrBlank() && commandId != lastHandledId

    /** "Atualizar Player": o painel só recebe "executed" se a sincronização realmente aconteceu. */
    fun updateAck(syncSucceeded: Boolean, error: String?): Pair<String, String?> =
        if (syncSucceeded) "executed" to null
        else "failed" to ("Falha ao atualizar o player: " + (error?.takeIf { it.isNotBlank() } ?: "sem conexão ou sem resposta do servidor"))

    /** Como o canvas (toda a tela do player) deve ser desenhado: tamanho, rotação e deslocamento. */
    data class CanvasTransform(val width: Int, val height: Int, val rotation: Float, val translationX: Float, val translationY: Float)

    /** Rotação (graus, horário) aplicada ao canvas da TV quando a playlist não casa com a tela física. */
    const val TV_CANVAS_ROTATION = 90f

    /**
     * TV Box / Smart TV: 16x9 = TV deitada; 9x16 = TV virada em pé (totem). A TV ignora pedido de orientação
     * do app, então quando a orientação da playlist não bate com a tela física o player gira o canvas 90°
     * e ele ocupa a tela inteira (sem faixas) para quem olha a TV virada. null = desenhar normal.
     */
    fun tvCanvasTransform(isTelevision: Boolean, canonicalOrientation: String?, displayWidth: Int, displayHeight: Int): CanvasTransform? {
        if (!isTelevision || displayWidth <= 0 || displayHeight <= 0) return null
        val panelIsLandscape = displayWidth >= displayHeight
        val playlistIsLandscape = canonicalOrientation != "portrait"
        // Tela física já casa com a playlist (inclusive TV Box que obedeceu ao pedido de orientação): nada a girar.
        if (panelIsLandscape == playlistIsLandscape) return null
        // Canvas lógico com os lados trocados, girado 90° em torno do próprio centro e centralizado no painel.
        val w = displayHeight
        val h = displayWidth
        return CanvasTransform(
            width = w,
            height = h,
            rotation = TV_CANVAS_ROTATION,
            translationX = (displayWidth - w) / 2f,
            translationY = (displayHeight - h) / 2f
        )
    }
}
