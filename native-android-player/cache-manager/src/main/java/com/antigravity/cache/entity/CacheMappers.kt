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
        cacheNextMedia = this.cacheNextMedia
    )
}

fun MediaItem.toCache(playlistId: String): CachedMediaItem {
    return CachedMediaItem(
        id = this.id,
        playlistId = playlistId,
        name = this.name,
        type = this.type.name,
        durationSeconds = this.durationSeconds,
        remoteUrl = this.remoteUrl,
        localPath = this.localPath,
        hash = this.hash,
        orderIndex = this.orderIndex,
        startTime = this.startTime,
        endTime = this.endTime,
        daysOfWeek = this.daysOfWeek
    )
}

// --- Cache -> Domain ---

fun CachedPlaylist.toDomain(items: List<CachedMediaItem>): Playlist {
    return Playlist(
        id = this.id,
        name = this.name,
        version = this.version,
        items = items.map { it.toDomain() },
        isEmergency = this.isEmergency,
        orientation = this.orientation,
        resolution = this.resolution,
        heartbeatIntervalSeconds = this.heartbeatIntervalSeconds,
        seamlessTransition = this.seamlessTransition,
        cacheNextMedia = this.cacheNextMedia
    )
}

fun CachedMediaItem.toDomain(): MediaItem {
    return MediaItem(
        id = this.id,
        name = this.name,
        type = try { MediaType.valueOf(this.type) } catch (e: Exception) { MediaType.VIDEO },
        durationSeconds = this.durationSeconds,
        remoteUrl = this.remoteUrl,
        localPath = this.localPath,
        hash = this.hash,
        orderIndex = this.orderIndex,
        startTime = this.startTime,
        endTime = this.endTime,
        daysOfWeek = this.daysOfWeek
    )
}
