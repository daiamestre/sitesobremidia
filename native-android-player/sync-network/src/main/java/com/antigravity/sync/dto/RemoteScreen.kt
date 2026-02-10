package com.antigravity.sync.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RemoteScreen(
    val id: String,
    val name: String,
    @SerialName("playlist_id") val playlistId: String?,
    @SerialName("orientation") val orientation: String? = "landscape",
    @SerialName("status") val status: String? = null
)
