package com.antigravity.cache.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "playlist")
data class CachedPlaylist(
    @PrimaryKey val id: String,
    val name: String,
    val version: Long,
    val isEmergency: Boolean,
    
    // Professional Settings (Cache)
    val orientation: String = "landscape",
    val resolution: String = "16x9",
    val heartbeatIntervalSeconds: Int = 60,
    val seamlessTransition: Boolean = true,
    val cacheNextMedia: Boolean = true
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
    val orderIndex: Int,
    val startTime: String? = null,
    val endTime: String? = null,
    val daysOfWeek: String? = null
)

@Entity(tableName = "play_logs")
data class CachedPlayLog(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val mediaId: String,
    val durationMs: Long,
    val startedAt: Long,
    val status: String = "completed",
    val signature: String? = null // SHA-256(screenId + mediaId + startedAt + SECRET)
)

/**
 * [OFFLINE BUFFER] Estrutura requerida para precisão cirúrgica nas estatísticas.
 * Utilizada pelo PlaybackBufferManager para garantir conformidade com o Supabase.
 */
@Entity(tableName = "offline_playback_logs")
data class OfflinePlaybackLog(
    @PrimaryKey(autoGenerate = true) 
    val id: Long = 0,
    
    val screen_id: String,
    val media_id: String,
    val duration: Int,
    val started_at: String // Formato ISO 8601 (Ex: 2026-02-13T15:27:45Z)
)
