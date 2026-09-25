package com.antigravity.core.util

import com.antigravity.core.domain.model.MediaType

/**
 * Duracao efetiva de exibicao (segundos) vinda do painel (`playlist_items.duration`).
 * - Imagem/widget/link: nunca 0 ou negativa (piscava e pulava); cai no padrao de 10 s.
 * - Video: 0 significa "video inteiro" (o motor usa o menor entre a duracao configurada e a real).
 */
object PlaybackDuration {
    const val DEFAULT_SECONDS = 10L

    fun effectiveSeconds(type: MediaType, rawSeconds: Long): Long = when {
        rawSeconds > 0L -> rawSeconds
        type == MediaType.VIDEO || type == MediaType.STREAM_HLS || type == MediaType.STREAM_RTSP -> 0L
        else -> DEFAULT_SECONDS
    }
}
