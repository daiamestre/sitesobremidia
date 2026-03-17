package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DeviceRemoteDTO(
    val id: String,
    @SerialName("current_playlist_id") val currentPlaylistId: String?,
    @SerialName("version_signature") val versionSignature: String?,
    @SerialName("playlists") val playlist: PlaylistRemoteDTO? = null
)

@Serializable
data class PlaylistRemoteDTO(
    val id: String,
    val name: String,
    @SerialName("playlist_items") val items: List<RemotePlaylistItemDTO> = emptyList()
)

@Serializable
data class RemotePlaylistItemDTO(
    val id: String,
    val position: Int,
    val duration: Long,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("days_of_week") val daysOfWeek: String? = null,
    
    // Objetos aninhados (Joins do Supabase)
    @SerialName("medias") val media: MediaRemoteDTO? = null,
    @SerialName("widgets") val widget: WidgetRemoteDTO? = null,
    
    // Campo auxiliar para o seu Repository injetar o caminho local após o download
    var localPath: String? = null 
)

@Serializable
data class MediaRemoteDTO(
    val id: String,
    val name: String,
    @SerialName("file_url") val fileUrl: String,
    @SerialName("file_hash") val fileHash: String,
    @SerialName("media_type") val mediaType: String // 'video' ou 'image'
)

@Serializable
data class WidgetRemoteDTO(
    val id: String,
    val type: String, // 'clock', 'weather', etc.
    val configuration: String? // JSON string com as configs do widget
)
