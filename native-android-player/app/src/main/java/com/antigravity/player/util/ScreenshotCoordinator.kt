package com.antigravity.player.util

/**
 * [O SILENCIADOR DE REDE]
 * Garante que a GPU e o Rádio Wi-Fi da TV Box fiquem 100% livres
 * milissegundos antes do Android tentar ler o buffer de vídeo 4K 
 * para gerar o Screenshot ao Dashboard.
 */
object ScreenshotCoordinator {
    /** Teto da pausa: se a captura nunca voltar, o heartbeat retoma sozinho (senao o painel mostra OFFLINE). */
    const val MAX_PAUSE_MS = 20_000L

    @Volatile
    var clock: () -> Long = { System.currentTimeMillis() }

    @Volatile
    private var pausedAtMs = 0L

    var isHeartbeatPaused: Boolean
        get() {
            val at = pausedAtMs
            return at != 0L && clock() - at < MAX_PAUSE_MS
        }
        set(value) {
            pausedAtMs = if (value) clock() else 0L
        }
}
