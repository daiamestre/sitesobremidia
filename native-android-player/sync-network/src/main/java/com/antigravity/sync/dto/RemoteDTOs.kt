package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RemotePlaylist(
    val id: String,
    val name: String,
    // Note: Supabase joins are handled via Postgrest, assume embedded items if queried correctly
    // or fetched separately. For simplicity, we define the structure here.
    @SerialName("playlist_items") val items: List<RemotePlaylistItem> = emptyList()
)

@Serializable
data class RemotePlaylistItem(
    val id: String,
    @SerialName("media_id") val mediaId: String? = null, 
    @SerialName("position") val order: Int? = 0, // DB column is 'position'
    @SerialName("duration") val duration: Long? = 10, // DB column is 'duration'
    @SerialName("media") val media: RemoteMedia? = null
)

@Serializable
data class RemoteMedia(
    val id: String,
    val name: String,
    // val type: String? = "image", // Removed: Column does not exist
    @SerialName("file_url") val url: String,
    // val hash: String? = null // Removed: Column does not exist
)
