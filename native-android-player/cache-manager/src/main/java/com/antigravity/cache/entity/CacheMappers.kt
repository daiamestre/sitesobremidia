package com.antigravity.cache.entity

import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist

/**
 * Extension functions to map between Domain models and Cache entities.
 */

// --- Domain -> Cache ---

fun Playlist.toCache(): CachedPlaylist {
    return CachedPlaylist(
        id = this.id,
        name = this.name,
        version = this.version,
        isEmergency = this.isEmergency,
        orientation = this.orientation,
        resolution = this.resolution,
        heartbeatIntervalSeconds = this.heartbeatIntervalSeconds,
        seamlessTransition = this.seamlessTransition,
        cacheNextMedia = this.cacheNextMedia,
        audioEnabled = this.audioEnabled
    )
}

/**
 * A MESMA mídia pode aparecer várias vezes na playlist (ordem/horários diferentes). Como `CachedMediaItem.id` é a chave
 * primária e é o id da mídia, a segunda ocorrência sobrescrevia a primeira (playlist de 3 itens virava 2, com a ordem
 * e a duração erradas). A 1ª ocorrência mantém o id puro (compatível com caches/arquivos existentes); as demais recebem
 * "id~N". Domínio, arquivos, logs e downloads continuam usando o id puro da mídia.
 */
const val DUPLICATE_ID_SEPARATOR = "~"

fun cacheRowId(mediaId: String, occurrence: Int): String =
    if (occurrence == 0) mediaId else "$mediaId$DUPLICATE_ID_SEPARATOR$occurrence"

fun String.toMediaId(): String = substringBefore(DUPLICATE_ID_SEPARATOR)

fun List<MediaItem>.toCacheRows(playlistId: String): List<CachedMediaItem> {
    val seen = HashMap<String, Int>()
    return map { item ->
        val occurrence = seen.merge(item.id, 1, Int::plus)!! - 1
        item.toCache(playlistId).copy(id = cacheRowId(item.id, occurrence))
    }
}

fun MediaItem.toCache(playlistId: String): CachedMediaItem {
    return CachedMediaItem(
        id = this.id,
        playlistId = playlistId,
        name = this.name,
        type = this.type.name,
        media_type = this.type.name.lowercase(),
        durationSeconds = this.durationSeconds,
        remoteUrl = this.remoteUrl,
        localPath = this.localPath,
        hash = this.hash,
        file_hash = this.hash,
        orderIndex = this.orderIndex,
        startTime = this.startTime,
        endTime = this.endTime,
        daysOfWeek = this.daysOfWeek
    )
}

// --- Cache -> Domain ---

fun CachedPlaylist.toDomain(items: List<CachedMediaItem>): Playlist {
    val playlistOrientation = when (this.resolution.lowercase().trim()) {
        "9x16", "9:16", "portrait", "vertical" -> "portrait"
        "16x9", "16:9", "landscape", "horizontal" -> "landscape"
        else -> this.orientation
    }
    return Playlist(
        id = this.id,
        name = this.name,
        version = this.version,
        items = items.map { it.toDomain() },
        isEmergency = this.isEmergency,
        orientation = playlistOrientation,
        resolution = this.resolution,
        heartbeatIntervalSeconds = this.heartbeatIntervalSeconds,
        seamlessTransition = this.seamlessTransition,
        cacheNextMedia = this.cacheNextMedia,
        audioEnabled = this.audioEnabled
    )
}

fun CachedMediaItem.toDomain(): MediaItem {
    return MediaItem(
        id = this.id.toMediaId(),
        name = this.name,
        type = try { 
            val rawType = if (this.media_type != "video") this.media_type else this.type
            MediaType.valueOf(rawType.uppercase()) 
        } catch (e: Exception) { MediaType.VIDEO },
        durationSeconds = this.durationSeconds,
        remoteUrl = this.remoteUrl,
        localPath = this.localPath,
        hash = if (this.file_hash.isNotEmpty()) this.file_hash else this.hash,
        orderIndex = this.orderIndex,
        startTime = this.startTime,
        endTime = this.endTime,
        daysOfWeek = this.daysOfWeek
    )
}
