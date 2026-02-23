package com.antigravity.core.domain.model

/**
 * Entidade que agrupa uma coleção ordenada de mídias.
 */
data class Playlist(
    val id: String,
    val name: String,
    val version: Long, // Versionamento para detecção de updates
    val items: List<MediaItem>,
    val isEmergency: Boolean = false, // Prioridade de Conteúdo (Spec Section 10)
    // Professional Display settings
    val orientation: String = "landscape",
    val resolution: String = "16x9",
    // Professional Player Logic
    val heartbeatIntervalSeconds: Int = 60,
    val seamlessTransition: Boolean = true,
    val cacheNextMedia: Boolean = true
) {
    fun isValid(): Boolean {
        return items.isNotEmpty()
    }
}
