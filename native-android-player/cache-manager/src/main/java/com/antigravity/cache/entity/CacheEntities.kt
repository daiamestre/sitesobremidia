package com.antigravity.cache.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.antigravity.core.domain.model.MediaItem
import com.antigravity.core.domain.model.MediaType
import com.antigravity.core.domain.model.Playlist

@Entity(tableName = "playlist")
data class CachedPlaylist(
    @PrimaryKey val id: String,
    val name: String,
    val version: Long,
    val isEmergency: Boolean
)

@Entity(tableName = "media_item")
data class CachedMediaItem(
    @PrimaryKey val id: String,
    val playlistId: String, // Foreign Key relation logically
    val name: String,
    val type: String,
    val durationSeconds: Long,
    val remoteUrl: String,
    val localPath: String?,
    val hash: String,
    val orderIndex: Int
)

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
        orderIndex = order // Assuming MediaItem has 'order'
    )
}

fun CachedPlaylist.toDomain(items: List<CachedMediaItem>): Playlist {
    return Playlist(
        id = id,
        name = name,
        version = version,
        isEmergency = isEmergency,
        items = items.map { it.toDomain() }.sortedBy { it.order }
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
        order = orderIndex
    )
}
