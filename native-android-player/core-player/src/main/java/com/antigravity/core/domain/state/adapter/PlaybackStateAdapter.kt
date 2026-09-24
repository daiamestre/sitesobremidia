package com.antigravity.core.domain.state.adapter

import com.antigravity.core.domain.renderer.RendererState
import com.antigravity.core.domain.state.PlaybackState

/**
 * Adapter somente de leitura para o Eixo de Playback.
 * Converte RendererState e metadados de mídia para o PlaybackState canônico.
 * Não comanda o player, não possui estado mutável e não executa chamadas operacionais.
 */
object PlaybackStateAdapter {

    /**
     * Converte o estado abstrato do MediaRenderer em PlaybackState canônico.
     */
    fun adapt(
        rendererState: RendererState,
        mediaId: String? = null,
        mediaType: String? = null,
        durationMs: Long = 0L,
        isPreBuffer: Boolean = false
    ): PlaybackState {
        return when (rendererState) {
            is RendererState.IDLE -> PlaybackState.Idle
            is RendererState.ENDED -> PlaybackState.Idle
            is RendererState.PREPARING -> PlaybackState.Preparing(
                mediaId = mediaId,
                isPreBuffer = isPreBuffer
            )
            is RendererState.PLAYING -> {
                if (!mediaId.isNullOrBlank()) {
                    PlaybackState.Playing(
                        mediaId = mediaId,
                        mediaType = mediaType ?: "UNKNOWN",
                        durationMs = durationMs
                    )
                } else {
                    PlaybackState.Preparing(mediaId = null, isPreBuffer = false)
                }
            }
            is RendererState.ERROR -> PlaybackState.ErrorFallback(
                reason = rendererState.reason
            )
        }
    }

    /**
     * Mapeia os estados numéricos do ExoPlayer (STATE_IDLE=1, STATE_BUFFERING=2, STATE_READY=3, STATE_ENDED=4)
     * e o flag isPlaying para o PlaybackState canônico.
     */
    fun adaptExoPlayerState(
        playbackState: Int,
        isPlaying: Boolean,
        mediaId: String? = null,
        mediaType: String? = null,
        durationMs: Long = 0L,
        errorMessage: String? = null
    ): PlaybackState {
        if (!errorMessage.isNullOrBlank()) {
            return PlaybackState.ErrorFallback(errorMessage)
        }
        return when (playbackState) {
            1 -> PlaybackState.Idle // Player.STATE_IDLE
            2 -> PlaybackState.Preparing(mediaId = mediaId, isPreBuffer = false) // Player.STATE_BUFFERING
            3 -> { // Player.STATE_READY
                if (isPlaying && !mediaId.isNullOrBlank()) {
                    PlaybackState.Playing(
                        mediaId = mediaId,
                        mediaType = mediaType ?: "UNKNOWN",
                        durationMs = durationMs
                    )
                } else if (isPlaying) {
                    PlaybackState.Preparing(mediaId = null, isPreBuffer = false)
                } else {
                    PlaybackState.Idle
                }
            }
            4 -> PlaybackState.Idle // Player.STATE_ENDED
            else -> PlaybackState.Idle
        }
    }
}
