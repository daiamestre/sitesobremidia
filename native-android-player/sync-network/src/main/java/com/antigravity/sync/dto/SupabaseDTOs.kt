@file:OptIn(kotlinx.serialization.InternalSerializationApi::class)
package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RpcResponseDTO(
    val status: String,
    val data: DeviceRemoteDTO? = null
)

@Serializable
data class DeviceRemoteDTO(
    val id: String,
    val name: String? = null,
    @SerialName("custom_id") val customId: String? = null,
    @SerialName("screen_token") val screenToken: String? = null,
    @SerialName("playlist_id") val playlistId: String? = null,
    @SerialName("current_playlist_id") val currentPlaylistId: String? = null,
    @SerialName("version_signature") val versionSignature: String? = null,
    val orientation: String? = "landscape",
    val resolution: String? = "16x9",
    @SerialName("playlists") val playlist: PlaylistRemoteDTO? = null
) {
    val playlists: PlaylistRemoteDTO? get() = playlist
}

@Serializable
data class PlaylistRemoteDTO(
    val id: String,
    val name: String,
    @SerialName("playlist_resolution") val playlistResolution: String? = null,
    @SerialName("resolution") val resolutionFallback: String? = null,
    @SerialName("audio_enabled") val audioEnabled: Boolean = false,
    @SerialName("playlist_items") val items: List<RemotePlaylistItemDTO> = emptyList()
)

@Serializable
data class RemotePlaylistItemDTO(
    val id: String,
    val position: Int = 0,
    val duration: Long = 10000,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("end_time") val endTime: String? = null,
    @SerialName("days_of_week") val daysOfWeek: String? = null,
    
    // Objetos aninhados (Joins do Supabase)
    @SerialName("media") val media: MediaRemoteDTO? = null,
    @SerialName("widget") val widget: WidgetRemoteDTO? = null,
    @SerialName("external_link") val externalLink: RemoteExternalLink? = null,
    
    // Campo auxiliar para o seu Repository injetar o caminho local após o download
    var localPath: String? = null 
)

@Serializable
data class MediaRemoteDTO(
    val id: String,
    val name: String,
    @SerialName("file_url") val fileUrl: String,
    @SerialName("file_hash") val fileHash: String? = null,
    @SerialName("file_type") val mediaType: String? = "video"
)

@Serializable
data class WidgetRemoteDTO(
    val id: String,
    val name: String? = null,
    @SerialName("widget_type") val widgetType: String? = null,
    @SerialName("type") val typeProperty: String? = null,
    @SerialName("config") val configRaw: kotlinx.serialization.json.JsonElement? = null,
    val configuration: kotlinx.serialization.json.JsonElement? = null
) {
    val type: String
        get() = widgetType ?: typeProperty ?: "clock"

    @kotlinx.serialization.InternalSerializationApi
    val configJson: String?
        get() = configuration?.toString() ?: configRaw?.toString()
}
