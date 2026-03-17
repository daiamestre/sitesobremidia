package com.antigravity.player.util

/**
 * [O SILENCIADOR DE REDE]
 * Garante que a GPU e o Rádio Wi-Fi da TV Box fiquem 100% livres
 * milissegundos antes do Android tentar ler o buffer de vídeo 4K 
 * para gerar o Screenshot ao Dashboard.
 */
object ScreenshotCoordinator {
    @Volatile
    var isHeartbeatPaused = false
}
