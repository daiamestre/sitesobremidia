package com.antigravity.cache.mapper

import com.antigravity.cache.entity.CachedMediaItem
import com.antigravity.cache.entity.CachedPlaylist
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist

// Extension functions to map between Domain and Cache
fun Playlist.toCache(): CachedPlaylist {
    return CachedPlaylist(id, name, version, isEmergency)
}

fun MediaItem.toCache(playlistId: String): CachedMediaItem {
    return CachedMediaItem(
        id = id,
        playlistId = playlistId,
        name = name,
        type = type.name,
        durationSeconds = durationSeconds,
        remoteUrl = remoteUrl,
        localPath = localPath,
        hash = hash,
        orderIndex = orderIndex // Assuming MediaItem has 'orderIndex'
    )
}

fun CachedPlaylist.toDomain(items: List<CachedMediaItem>): Playlist {
    return Playlist(
        id = id,
        name = name,
        version = version,
        isEmergency = isEmergency,
        items = items.map { it.toDomain() }.sortedBy { it.orderIndex }
    )
}

fun CachedMediaItem.toDomain(): MediaItem {
    return MediaItem(
        id = id,
        name = name,
        type = MediaType.valueOf(type),
        durationSeconds = durationSeconds,
        remoteUrl = remoteUrl,
        localPath = localPath,
        hash = hash,
        orderIndex = orderIndex
    )
}
