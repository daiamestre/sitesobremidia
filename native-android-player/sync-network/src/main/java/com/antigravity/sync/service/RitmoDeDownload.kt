package com.antigravity.sync.service

/**
 * F-189 — ritmo dos downloads de mídia. Sem dependência de Android (testado na JVM).
 */
object RitmoDeDownload {
    /** TV Box fraca (ex.: MXQ 4K, Cortex-A7): ~1,5 MB/s = um vídeo de 14 MB em ~10 s, sem engasgar o vídeo no ar. */
    const val LIMITE_TV_BOX_FRACA = 1_500_000L

    /** Quanto esperar agora para a média ficar dentro do limite (0 = seguir). Sem limite (<= 0), nunca espera. */
    fun esperaMs(bytesLidos: Long, decorridoMs: Long, limiteBytesPorSegundo: Long): Long {
        if (limiteBytesPorSegundo <= 0L || bytesLidos <= 0L) return 0L
        val deveriaTerLevadoMs = bytesLidos * 1000L / limiteBytesPorSegundo
        return (deveriaTerLevadoMs - decorridoMs).coerceIn(0L, 1_000L)
    }
}
