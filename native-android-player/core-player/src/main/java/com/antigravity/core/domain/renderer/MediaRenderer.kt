package com.antigravity.core.domain.renderer

import com.antigravity.core.domain.model.MediaItem
import kotlinx.coroutines.flow.Flow

/**
 * Contrato Abstrato de Renderização.
 * O Core não sabe o que é ExoPlayer ou WebView. Ele só sabe "Renderize isso".
 */
interface MediaRenderer {
    fun prepare(mediaItem: MediaItem)
    fun preparePlaylist(items: List<MediaItem>)
    fun play()
    fun pause()
    fun stop()
    fun getPlaybackState(): Flow<RendererState>
}

sealed class RendererState {
    object IDLE : RendererState()
    object PREPARING : RendererState()
    object PLAYING : RendererState()
    object ENDED : RendererState()
    data class ERROR(val reason: String) : RendererState()
}
