package com.antigravity.core.domain.model

enum class MediaType {
    VIDEO, IMAGE, WEB_WIDGET, EXTERNAL_LINK, STREAM_RTSP, STREAM_HLS
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
    val orderIndex: Int,
    // Enterprise Scheduling
    val startTime: String? = null, // "HH:mm"
    val endTime: String? = null,   // "HH:mm"
    val daysOfWeek: String? = null, // "1,2,3,4,5" (Seg-Sex)
    val transitionEffect: String? = "crossfade"
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
