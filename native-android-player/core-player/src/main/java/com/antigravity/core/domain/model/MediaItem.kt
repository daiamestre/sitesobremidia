package com.antigravity.core.domain.model

enum class MediaType {
    VIDEO, IMAGE, WEB_WIDGET, STREAM_RTSP, STREAM_HLS
}

/**
 * Entidade que representa um item de mídia agnóstico de plataforma.
 * Conforme Spec Section 5 (Tipos de Mídia).
 */
data class MediaItem(
    val id: String,
    val name: String,
    val type: MediaType,
    val durationSeconds: Long,
    val remoteUrl: String, // URL Original (Supabase/CDN)
    val localPath: String?, // Caminho no FileSystem local (null se não baixado)
    val hash: String, // SHA-256 para integridade
    val order: Int
) {
    fun isPlayableOffline(): Boolean {
        // Streams nunca são offline-safe por definição, mas têm fallback
        return if (type == MediaType.STREAM_RTSP || type == MediaType.STREAM_HLS) {
            false
        } else {
            !localPath.isNullOrEmpty()
        }
    }
}
