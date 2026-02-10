package com.antigravity.core.domain.model

/**
 * Entidade que agrupa uma coleção ordenada de mídias.
 */
data class Playlist(
    val id: String,
    val name: String,
    val version: Long, // Versionamento para detecção de updates
    val items: List<MediaItem>,
    val isEmergency: Boolean = false // Prioridade de Conteúdo (Spec Section 10)
) {
    fun isValid(): Boolean {
        return items.isNotEmpty()
    }
}
